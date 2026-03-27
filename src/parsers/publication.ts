import { load } from "cheerio";
import bibtexParse from "bibtex-parse-js";
import { ScholarHttp } from "../internal/http";
import {
  cleanText,
  getUrlParam,
  parseIntSafe,
  toAbsoluteUrl,
} from "../internal/utils";
import type { BibEntry, Publication, PublicationSource } from "../types";

export class PublicationParser {
  constructor(private readonly http: ScholarHttp) {}

  parsePublication(rowHtml: string, source: PublicationSource): Publication {
    const $ = load(`<div id="root">${rowHtml}</div>`);
    if (source === "AUTHOR_PUBLICATION_ENTRY") {
      return this.parseAuthorPublicationRow($);
    }
    return this.parseSearchPublicationRow($);
  }

  async fill(publication: Publication): Promise<Publication> {
    if (publication.filled) return publication;

    if (publication.source === "AUTHOR_PUBLICATION_ENTRY") {
      return this.fillFromAuthorView(publication);
    }

    if (publication.url_scholarbib) {
      const bibtexUrl = await this.resolveBibtexUrl(publication.url_scholarbib);
      if (bibtexUrl) {
        const bibtexRaw = await this.http.getPage(bibtexUrl);
        const parsed = bibtexParse.toJSON(bibtexRaw);
        const last = parsed.at(-1) as Record<string, unknown> | undefined;
        if (last) {
          publication.bib = {
            ...publication.bib,
            ...this.remapBib(last),
          };
        }
      }
    }

    publication.filled = true;
    return publication;
  }

  async bibtex(publication: Publication): Promise<string> {
    const filled = await this.fill(publication);
    const bib = { ...filled.bib } as BibEntry;
    const entryType = String(bib.pub_type ?? "article");
    const id = String(bib.bib_id ?? this.slugify(String(bib.title ?? "unknown")));
    const lines = [`@${entryType}{${id},`];

    for (const [key, value] of Object.entries(bib)) {
      if (key === "pub_type" || key === "bib_id" || value == null) continue;
      const v = Array.isArray(value) ? value.join(" and ") : String(value);
      lines.push(`  ${key} = {${v}},`);
    }

    lines.push("}");
    return lines.join("\n");
  }

  private parseAuthorPublicationRow($: ReturnType<typeof load>): Publication {
    const titleLink = $("a.gsc_a_at").first();
    const citedNode = $(".gsc_a_ac").first();
    const year = cleanText($(".gsc_a_h").first().text());
    const infoBlocks = $("div.gs_gray").toArray();

    const href = titleLink.attr("href") ?? "";
    const authorPubId = getUrlParam(href, "citation_for_view") ?? "";

    const publication: Publication = {
      container_type: "Publication",
      source: "AUTHOR_PUBLICATION_ENTRY",
      filled: false,
      bib: {
        title: cleanText(titleLink.text()),
        citation: infoBlocks[1] ? cleanText($(infoBlocks[1]!).text()) : "",
      },
      author_pub_id: authorPubId,
      num_citations: 0,
    };

    const citedLink = citedNode.find("a").first();
    const citedText = cleanText(citedLink.text()) || cleanText(citedNode.text());
    const count = parseIntSafe(citedText);
    if (count != null) {
      publication.num_citations = count;
      const citedHref = citedLink.attr("href");
      if (citedHref) {
        publication.citedby_url = citedHref;
        const cites = getUrlParam(citedHref, "cites");
        if (cites) publication.cites_id = cites.split(",");
      }
    }

    if (year) publication.bib.pub_year = year;
    return publication;
  }

  private parseSearchPublicationRow($: ReturnType<typeof load>): Publication {
    const root = $(".gs_r.gs_or.gs_scl, .gs_r.gs_or").first();
    const cid = root.attr("data-cid") ?? "";
    const rp = parseIntSafe(root.attr("data-rp")) ?? 0;

    const titleNode = $("h3.gs_rt").first().clone();
    titleNode.find("span.gs_ctu, span.gs_ctc").remove();
    const titleLink = titleNode.find("a").first();
    const title = cleanText(titleNode.text());

    const authorLine = cleanText($("div.gs_a").first().text());
    const authorHtml = $("div.gs_a").first().html() ?? "";

    const publication: Publication = {
      container_type: "Publication",
      source: "PUBLICATION_SEARCH_SNIPPET",
      filled: false,
      bib: {
        title,
        author: this.extractAuthors(authorLine),
      },
      gsrank: rp + 1,
      num_citations: 0,
      author_id: this.extractAuthorIds(authorHtml),
      url_scholarbib: cid
        ? `/scholar?q=info:${cid}:scholar.google.com/&output=cite&scirp=${rp}&hl=en`
        : undefined,
    };

    const parts = authorLine.split(" - ");
    if (parts.length <= 2) {
      publication.bib.venue = "NA";
      publication.bib.pub_year = "NA";
    } else {
      const venueParts = parts[1]!.split(",");
      const maybeYear = cleanText(venueParts.at(-1) ?? "");
      if (/^\d{4}$/.test(maybeYear)) {
        publication.bib.pub_year = maybeYear;
        publication.bib.venue = cleanText(venueParts.slice(0, -1).join(",")) || "NA";
      } else {
        publication.bib.pub_year = "NA";
        publication.bib.venue = cleanText(venueParts.join(",")) || "NA";
      }
    }

    const href = titleLink.attr("href");
    if (href) publication.pub_url = href;

    const abstract = cleanText($("div.gs_rs").first().text()).replace(/^Abstract\s*/i, "");
    if (abstract) publication.bib.abstract = abstract;

    $("div.gs_fl a").each((_, el) => {
      const text = cleanText($(el).text());
      const link = $(el).attr("href") ?? "";
      if (text.includes("Cited by")) {
        publication.num_citations = parseIntSafe(text) ?? 0;
        publication.citedby_url = link;
      }
      if (text.toLowerCase().includes("related articles")) {
        publication.url_related_articles = link;
      }
    });

    const eprint = $("div.gs_ggs.gs_fl a").first().attr("href");
    if (eprint) publication.eprint_url = eprint;

    return publication;
  }

  private async fillFromAuthorView(publication: Publication): Promise<Publication> {
    if (!publication.author_pub_id) return publication;

    const $ = await this.http.getSoup(
      `/citations?hl=en&view_op=view_citation&citation_for_view=${publication.author_pub_id}`,
    );

    const title = cleanText($("#gsc_oci_title").first().text());
    if (title) publication.bib.title = title;

    const pubUrl = $("a.gsc_oci_title_link").first().attr("href");
    if (pubUrl) publication.pub_url = pubUrl;

    $("div.gs_scl").each((_, el) => {
      const key = cleanText($(el).find(".gsc_oci_field").first().text()).toLowerCase();
      const valueNode = $(el).find(".gsc_oci_value").first();
      const valueText = cleanText(valueNode.text());

      if (!key || !valueText) return;

      if (key === "authors" || key === "inventors") {
        publication.bib.author = valueText.split(",").map((x) => cleanText(x));
      } else if (key === "journal") {
        publication.bib.journal = valueText;
      } else if (key === "conference") {
        publication.bib.conference = valueText;
      } else if (key === "volume") {
        publication.bib.volume = valueText;
      } else if (key === "issue") {
        publication.bib.number = valueText;
      } else if (key === "pages") {
        publication.bib.pages = valueText;
      } else if (key === "publisher") {
        publication.bib.publisher = valueText;
      } else if (key === "publication date") {
        const year = valueText.match(/\b(19|20)\d{2}\b/)?.[0];
        if (year) publication.bib.pub_year = year;
      } else if (key === "description") {
        publication.bib.abstract = valueText.replace(/^Abstract\s*/i, "");
      } else if (key === "total citations") {
        const citedHref = valueNode.find("a").first().attr("href");
        if (citedHref) {
          publication.citedby_url = citedHref;
          const cites = getUrlParam(citedHref, "cites");
          if (cites) publication.cites_id = cites.split(",");
        }
      } else if (key === "scholar articles") {
        valueNode.find("a").each((__, link) => {
          if (cleanText($(link).text()).toLowerCase() === "related articles") {
            publication.url_related_articles =
              $(link).attr("href") ?? publication.url_related_articles;
          }
        });
      }
    });

    const years = $(".gsc_oci_g_t")
      .toArray()
      .map((x) => parseIntSafe(cleanText($(x).text())))
      .filter((x): x is number => x != null);

    const cites = $(".gsc_oci_g_al")
      .toArray()
      .map((x) => parseIntSafe(cleanText($(x).text())) ?? 0);

    const citeYears = $(".gsc_oci_g_a")
      .toArray()
      .map((x) => parseIntSafe(($(x).attr("href") ?? "").slice(-4)))
      .filter((x): x is number => x != null);

    if (years.length > 0) {
      const nonZero = new Map<number, number>();
      citeYears.forEach((year, idx) => nonZero.set(year, cites[idx] ?? 0));
      publication.cites_per_year = Object.fromEntries(
        years.map((year) => [year, nonZero.get(year) ?? 0]),
      );
    }

    const eprint = $("div.gsc_vcd_title_ggi a").first().attr("href");
    if (eprint) publication.eprint_url = eprint;

    publication.filled = true;
    return publication;
  }

  private async resolveBibtexUrl(citePageUrl: string): Promise<string | undefined> {
    const $ = await this.http.getSoup(citePageUrl);
    let bibHref: string | undefined;
    $("a.gs_citi").each((_, el) => {
      if (cleanText($(el).text()).toLowerCase() === "bibtex") {
        bibHref = $(el).attr("href");
      }
    });
    return bibHref ? toAbsoluteUrl(bibHref) : undefined;
  }

  private extractAuthors(authorInfo: string): string[] {
    const text = authorInfo.split(" - ")[0] ?? "";
    const authors: string[] = [];

    for (const raw of text.split(",")) {
      const item = cleanText(raw).replace(/…/g, "");
      if (!item) continue;
      if (/\d/.test(item)) continue;
      if (/Proceedings|Conference|Journal|Transactions|\(|\)|\[|\]/.test(item)) continue;
      authors.push(item);
    }

    return authors;
  }

  private extractAuthorIds(authorHtml: string): string[] {
    const html = authorHtml.split(" - ")[0] ?? "";
    return html
      .split(",")
      .map((frag) => frag.match(/\?user=(.*?)&amp;/)?.[1] ?? "");
  }

  private remapBib(entry: Record<string, unknown>): BibEntry {
    const mapped: Record<string, unknown> = { ...entry };

    if (mapped.ENTRYTYPE) {
      mapped.pub_type = mapped.ENTRYTYPE;
      delete mapped.ENTRYTYPE;
    }
    if (mapped.ID) {
      mapped.bib_id = mapped.ID;
      delete mapped.ID;
    }
    if (mapped.year) {
      mapped.pub_year = String(mapped.year);
      delete mapped.year;
    }
    if (typeof mapped.author === "string") {
      mapped.author = String(mapped.author)
        .split(" and ")
        .map((x) => cleanText(x));
    }

    return mapped as BibEntry;
  }

  private slugify(text: string): string {
    const out = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    return out || "citation";
  }
}
