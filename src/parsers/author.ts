import { load } from "cheerio";
import { ScholarHttp } from "../internal/http";
import { cleanText, decodeOnClickUrl, getUrlParam, parseIntSafe } from "../internal/utils";
import type { Author, FillAuthorOptions, Publication } from "../types";
import { PublicationParser } from "./publication";

const ALL_SECTIONS = ["basics", "indices", "counts", "coauthors", "publications"] as const;

export class AuthorParser {
  private readonly publicationParser: PublicationParser;

  constructor(private readonly http: ScholarHttp) {
    this.publicationParser = new PublicationParser(http);
  }

  parseSearchAuthor(rowHtml: string): Author {
    const $ = load(`<div id="root">${rowHtml}</div>`);

    const profileLink = $("h3 a, .gs_ai_name a").first();
    const href = profileLink.attr("href") ?? "";
    const scholarId = getUrlParam(href, "user") ?? "";

    const email = cleanText($(".gs_ai_eml").first().text());
    const citedText = cleanText($(".gs_ai_cby").first().text());

    const author: Author = {
      container_type: "Author",
      source: "SEARCH_AUTHOR_SNIPPETS",
      scholar_id: scholarId,
      filled: [],
      name: cleanText(profileLink.text()),
      affiliation: cleanText($(".gs_ai_aff").first().text()) || undefined,
      interests: $("a.gs_ai_one_int")
        .toArray()
        .map((x) => cleanText($(x).text()))
        .filter(Boolean),
      url_picture: scholarId
        ? `https://scholar.google.com/citations?view_op=medium_photo&user=${scholarId}`
        : undefined,
    };

    if (email) {
      author.email_domain = email.replace(/^Verified email at\s*/i, "@");
    }

    const citedNum = parseIntSafe(citedText);
    if (citedNum != null) {
      author.citedby = citedNum;
    }

    return author;
  }

  createAuthorFromId(scholarId: string): Author {
    return {
      container_type: "Author",
      source: "AUTHOR_PROFILE_PAGE",
      scholar_id: scholarId,
      filled: [],
    };
  }

  async fill(author: Author, options: FillAuthorOptions = {}): Promise<Author> {
    const sortby = options.sortby ?? "citedby";
    const publicationLimit = options.publication_limit ?? 0;
    const sections = options.sections?.length ? options.sections : [...ALL_SECTIONS];

    const sortFlag = sortby === "year" ? "&view_op=list_works&sortby=pubdate" : "";
    const $ = await this.http.getSoup(`/citations?hl=en&user=${author.scholar_id}${sortFlag}`);

    for (const section of sections) {
      if (section === "basics") {
        this.fillBasics($, author);
      } else if (section === "indices") {
        this.fillIndices($, author);
      } else if (section === "counts") {
        this.fillCounts($, author);
      } else if (section === "coauthors") {
        await this.fillCoauthors($, author);
      } else if (section === "publications") {
        await this.fillPublications($, author, sortFlag, publicationLimit);
      }

      if (!author.filled.includes(section)) {
        author.filled.push(section);
      }
    }

    return author;
  }

  private fillBasics($: ReturnType<typeof load>, author: Author): void {
    author.name = cleanText($("#gsc_prf_in").first().text()) || author.name;

    const pic = $("#gsc_prf_pup-img").first().attr("src");
    if (pic && !pic.includes("avatar_scholar")) {
      author.url_picture = pic;
    }

    const affiliationNode = $("div.gsc_prf_il").first();
    const affiliation = cleanText(affiliationNode.text());
    if (affiliation) author.affiliation = affiliation;

    const orgHref = affiliationNode.find("a").first().attr("href");
    const orgId = orgHref ? parseIntSafe(getUrlParam(orgHref, "org")) : undefined;
    if (orgId != null) author.organization = orgId;

    author.interests = $("a.gsc_prf_inta")
      .toArray()
      .map((x) => cleanText($(x).text()))
      .filter(Boolean);

    const email = cleanText($("#gsc_prf_ivh.gsc_prf_il").first().text());
    if (email && email !== "No verified email") {
      const domain = email.split(" ").at(-1);
      if (domain) author.email_domain = `@${domain}`;
    }

    const homepage = $("a.gsc_prf_ila").first().attr("href");
    if (homepage) author.homepage = homepage;

    const indexNodes = $("td.gsc_rsb_std").toArray();
    const cited = indexNodes[0] ? parseIntSafe(cleanText($(indexNodes[0]).text())) : undefined;
    if (cited != null) author.citedby = cited;
  }

  private fillIndices($: ReturnType<typeof load>, author: Author): void {
    const values = $("td.gsc_rsb_std")
      .toArray()
      .map((x) => parseIntSafe(cleanText($(x).text())) ?? 0);

    author.citedby = values[0] ?? author.citedby;
    author.citedby5y = values[1] ?? 0;
    author.hindex = values[2] ?? 0;
    author.hindex5y = values[3] ?? 0;
    author.i10index = values[4] ?? 0;
    author.i10index5y = values[5] ?? 0;
  }

  private fillCounts($: ReturnType<typeof load>, author: Author): void {
    const years = $("span.gsc_g_t")
      .toArray()
      .map((x) => parseIntSafe(cleanText($(x).text())))
      .filter((x): x is number => x != null);

    const cites = Array.from({ length: years.length }, () => 0);

    $("a.gsc_g_a").each((_, el) => {
      const style = $(el).attr("style") ?? "";
      const idx = parseIntSafe(style.split(":").at(-1));
      const val = parseIntSafe(cleanText($(el).find("span.gsc_g_al").first().text())) ?? 0;
      if (idx != null && idx > 0 && idx <= cites.length) {
        cites[cites.length - idx] = val;
      }
    });

    author.cites_per_year = Object.fromEntries(years.map((year, i) => [year, cites[i] ?? 0]));
  }

  private async fillCoauthors($: ReturnType<typeof load>, author: Author): Promise<void> {
    const hasViewAll = $("button#gsc_coauth_opn").length > 0;
    let coauthors: Author[] = [];

    if (hasViewAll) {
      const listPage = await this.http.getSoup(
        `/citations?view_op=list_colleagues&hl=en&user=${author.scholar_id}`,
      );

      coauthors = listPage("div.gs_ai.gs_scl")
        .toArray()
        .map((node) => {
          const link = listPage(node).find("a").first().attr("href") ?? "";
          const scholarId = getUrlParam(link, "user") ?? "";
          return {
            container_type: "Author",
            source: "CO_AUTHORS_LIST",
            scholar_id: scholarId,
            filled: [],
            name: cleanText(listPage(node).find(".gs_ai_name").first().text()) || undefined,
            affiliation:
              cleanText(listPage(node).find(".gs_ai_aff").first().text()) || undefined,
          } as Author;
        });
    } else {
      coauthors = $("span.gsc_rsb_a_desc")
        .toArray()
        .map((node) => {
          const link = $(node).find("a").first().attr("href") ?? "";
          const scholarId = getUrlParam(link, "user") ?? "";
          return {
            container_type: "Author",
            source: "CO_AUTHORS_LIST",
            scholar_id: scholarId,
            filled: [],
            name: cleanText($(node).find('[tabindex="-1"]').first().text()) || undefined,
            affiliation: cleanText($(node).find(".gsc_rsb_a_ext").first().text()) || undefined,
          } as Author;
        });
    }

    author.coauthors = coauthors;
  }

  private async fillPublications(
    $: ReturnType<typeof load>,
    author: Author,
    sortFlag: string,
    publicationLimit: number,
  ): Promise<void> {
    const list: Publication[] = [];
    let page = $;
    let start = 0;

    while (true) {
      for (const row of page("tr.gsc_a_tr").toArray()) {
        const pub = this.publicationParser.parsePublication(
          page.html(row) ?? "",
          "AUTHOR_PUBLICATION_ENTRY",
        );
        list.push(pub);
        if (publicationLimit > 0 && list.length >= publicationLimit) {
          author.publications = list;
          return;
        }
      }

      const moreButton = page("button#gsc_bpf_more").first();
      if (!moreButton.length || moreButton.attr("disabled") != null) {
        break;
      }

      start += 100;
      page = await this.http.getSoup(
        `/citations?hl=en&user=${author.scholar_id}${sortFlag}&cstart=${start}&pagesize=100`,
      );
    }

    author.publications = list;
  }

  extractNextSearchPageUrl($: ReturnType<typeof load>): string | undefined {
    const nextButton = $("button.gsc_pgn_pnx").first();
    const onclick = nextButton.attr("onclick");
    const decoded = decodeOnClickUrl(onclick);
    return decoded;
  }
}
