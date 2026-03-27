import { AuthorParser } from "./parsers/author";
import { PublicationParser } from "./parsers/publication";
import { ScholarHttp } from "./internal/http";
import { cleanText, getUrlParam } from "./internal/utils";
import { ProxyGenerator } from "./proxy";
import type {
  Author,
  FillAuthorOptions,
  Publication,
  ScholarlyOptions,
  SearchPubsOptions,
} from "./types";

const KEYWORD_ILLEGAL = /[-: #(),;]+/g;

export class Scholarly {
  private readonly http: ScholarHttp;
  private readonly authorParser: AuthorParser;
  private readonly publicationParser: PublicationParser;

  constructor(options: ScholarlyOptions = {}) {
    this.http = new ScholarHttp(options);

    this.authorParser = new AuthorParser(this.http);
    this.publicationParser = new PublicationParser(this.http);
  }

  setRetries(retries: number): void {
    this.http.setOptions({ retries });
  }

  setTimeout(timeoutMs: number): void {
    this.http.setOptions({ timeoutMs });
  }

  setUserAgent(userAgent: string): void {
    this.http.setOptions({ userAgent });
  }

  useProxy(proxyGenerator: ProxyGenerator, secondaryProxyGenerator?: ProxyGenerator): void {
    this.http.useProxy(proxyGenerator, secondaryProxyGenerator);
  }

  async *searchAuthor(name: string): AsyncGenerator<Author, void, void> {
    let nextPath: string | undefined = `/citations?hl=en&view_op=search_authors&mauthors=${encodeURIComponent(
      name,
    )}`;

    while (nextPath) {
      const $ = await this.http.getSoup(nextPath);
      const rows = $("div.gsc_1usr").toArray();
      for (const row of rows) {
        const html = $.html(row) ?? "";
        yield this.authorParser.parseSearchAuthor(html);
      }

      nextPath = this.authorParser.extractNextSearchPageUrl($);
    }
  }

  async searchAuthorId(
    id: string,
    filled = false,
    options: Omit<FillAuthorOptions, "sections"> = {},
  ): Promise<Author> {
    const author = this.authorParser.createAuthorFromId(id);
    if (filled) {
      return this.authorParser.fill(author, options);
    }
    return this.authorParser.fill(author, { ...options, sections: ["basics"] });
  }

  async *searchKeyword(keyword: string): AsyncGenerator<Author, void, void> {
    const q = keyword.replace(KEYWORD_ILLEGAL, "_");
    const path = `/citations?hl=en&view_op=search_authors&mauthors=label:${encodeURIComponent(q)}`;
    yield* this.searchAuthorByCustomUrl(path);
  }

  async *searchKeywords(keywords: string[]): AsyncGenerator<Author, void, void> {
    const q = keywords
      .map((keyword) => keyword.replace(KEYWORD_ILLEGAL, "_"))
      .map((x) => `label:${encodeURIComponent(x)}`)
      .join("+");
    const path = `/citations?hl=en&view_op=search_authors&mauthors=${q}`;
    yield* this.searchAuthorByCustomUrl(path);
  }

  async *searchAuthorByCustomUrl(path: string): AsyncGenerator<Author, void, void> {
    let nextPath: string | undefined = path;

    while (nextPath) {
      const $ = await this.http.getSoup(nextPath);
      for (const row of $("div.gsc_1usr").toArray()) {
        yield this.authorParser.parseSearchAuthor($.html(row) ?? "");
      }
      nextPath = this.authorParser.extractNextSearchPageUrl($);
    }
  }

  async *searchPubs(query: string, options: SearchPubsOptions = {}): AsyncGenerator<Publication, void, void> {
    let nextPath: string | undefined = this.constructPubsUrl(
      `/scholar?hl=en&q=${encodeURIComponent(query)}`,
      options,
    );

    while (nextPath) {
      const $ = await this.http.getSoup(nextPath);
      const rows = $("div.gs_r.gs_or.gs_scl, div.gs_r.gs_or").toArray();

      for (const row of rows) {
        const html = $.html(row) ?? "";
        yield this.publicationParser.parsePublication(html, "PUBLICATION_SEARCH_SNIPPET");
      }

      const nextIcon = $(".gs_ico.gs_ico_nav_next").first();
      const nextHref = nextIcon.closest("a").attr("href");
      nextPath = nextHref;
    }
  }

  async *searchPubsByCustomUrl(path: string): AsyncGenerator<Publication, void, void> {
    let nextPath: string | undefined = path;

    while (nextPath) {
      const $ = await this.http.getSoup(nextPath);
      const rows = $("div.gs_r.gs_or.gs_scl, div.gs_r.gs_or").toArray();
      for (const row of rows) {
        yield this.publicationParser.parsePublication(
          $.html(row) ?? "",
          "PUBLICATION_SEARCH_SNIPPET",
        );
      }

      const nextIcon = $(".gs_ico.gs_ico_nav_next").first();
      nextPath = nextIcon.closest("a").attr("href");
    }
  }

  async searchSinglePub(pubTitle: string, filled = false): Promise<Publication | null> {
    const iterator = this.searchPubs(pubTitle);
    const first = await iterator.next();
    if (first.done || !first.value) return null;
    if (!filled) return first.value;
    return this.publicationParser.fill(first.value);
  }

  async fill(
    entity: Author | Publication,
    options: FillAuthorOptions = {},
  ): Promise<Author | Publication> {
    if (entity.container_type === "Author") {
      return this.authorParser.fill(entity, options);
    }
    return this.publicationParser.fill(entity);
  }

  async *citedBy(publication: Publication): AsyncGenerator<Publication, void, void> {
    const filled = publication.filled ? publication : await this.publicationParser.fill(publication);
    if (!filled.citedby_url) return;

    yield* this.searchPubsByCustomUrl(filled.citedby_url);
  }

  async getRelatedArticles(publication: Publication): Promise<AsyncGenerator<Publication, void, void> | null> {
    const filled = publication.filled ? publication : await this.publicationParser.fill(publication);
    if (!filled.url_related_articles) return null;
    return this.searchPubsByCustomUrl(filled.url_related_articles);
  }

  async bibtex(publication: Publication): Promise<string> {
    return this.publicationParser.bibtex(publication);
  }

  async searchOrg(name: string): Promise<Array<{ Organization: string; id: string }>> {
    const path = `/citations?hl=en&view_op=search_authors&mauthors=${encodeURIComponent(name)}`;
    const $ = await this.http.getSoup(path);

    return $("h3.gsc_inst_res")
      .toArray()
      .map((node) => {
        const link = $(node).find("a").first();
        const href = link.attr("href") ?? "";
        const id = getUrlParam(href, "org") ?? "";
        return {
          Organization: cleanText(link.text()),
          id,
        };
      })
      .filter((x) => x.Organization && x.id);
  }

  async *searchAuthorByOrganization(organizationId: number): AsyncGenerator<Author, void, void> {
    const path = `/citations?view_op=view_org&hl=en&org=${organizationId}`;
    yield* this.searchAuthorByCustomUrl(path);
  }

  private constructPubsUrl(baseUrl: string, options: SearchPubsOptions): string {
    const patents = options.patents ?? true;
    const citations = options.citations ?? true;
    const sortBy = options.sort_by ?? "relevance";
    const includeLastYear = options.include_last_year ?? "abstracts";
    const startIndex = options.start_index ?? 0;

    const params = new URLSearchParams();
    if (options.year_low != null) params.set("as_ylo", String(options.year_low));
    if (options.year_high != null) params.set("as_yhi", String(options.year_high));
    params.set("as_vis", String(1 - Number(citations)));
    params.set("as_sdt", `${1 - Number(patents)},33`);

    if (sortBy === "date") {
      params.set("scisbd", includeLastYear === "everything" ? "2" : "1");
    }

    if (startIndex > 0) params.set("start", String(startIndex));

    const sep = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${sep}${params.toString()}`;
  }

  searchCitedBy(
    publicationId: number | string,
    options: SearchPubsOptions = {},
  ): AsyncGenerator<Publication, void, void> {
    const path = this.constructPubsUrl(`/scholar?hl=en&cites=${publicationId}`, options);
    return this.searchPubsByCustomUrl(path);
  }

  pprint(entity: Author | Publication): string {
    return JSON.stringify(entity, null, 2);
  }

  // Python-style aliases for easier migration.
  search_author(name: string): AsyncGenerator<Author, void, void> {
    return this.searchAuthor(name);
  }

  search_author_id(
    id: string,
    filled = false,
    options: Omit<FillAuthorOptions, "sections"> = {},
  ): Promise<Author> {
    return this.searchAuthorId(id, filled, options);
  }

  search_keyword(keyword: string): AsyncGenerator<Author, void, void> {
    return this.searchKeyword(keyword);
  }

  search_keywords(keywords: string[]): AsyncGenerator<Author, void, void> {
    return this.searchKeywords(keywords);
  }

  search_pubs(
    query: string,
    options: SearchPubsOptions = {},
  ): AsyncGenerator<Publication, void, void> {
    return this.searchPubs(query, options);
  }

  search_pubs_custom_url(path: string): AsyncGenerator<Publication, void, void> {
    return this.searchPubsByCustomUrl(path);
  }

  search_single_pub(title: string, filled = false): Promise<Publication | null> {
    return this.searchSinglePub(title, filled);
  }

  search_citedby(
    publicationId: number | string,
    options: SearchPubsOptions = {},
  ): AsyncGenerator<Publication, void, void> {
    return this.searchCitedBy(publicationId, options);
  }

  search_org(name: string): Promise<Array<{ Organization: string; id: string }>> {
    return this.searchOrg(name);
  }

  search_author_by_organization(
    organizationId: number,
  ): AsyncGenerator<Author, void, void> {
    return this.searchAuthorByOrganization(organizationId);
  }

  citedby(publication: Publication): AsyncGenerator<Publication, void, void> {
    return this.citedBy(publication);
  }

  get_related_articles(
    publication: Publication,
  ): Promise<AsyncGenerator<Publication, void, void> | null> {
    return this.getRelatedArticles(publication);
  }

  use_proxy(proxyGenerator: ProxyGenerator, secondaryProxyGenerator?: ProxyGenerator): void {
    this.useProxy(proxyGenerator, secondaryProxyGenerator);
  }

  set_retries(retries: number): void {
    this.setRetries(retries);
  }

  set_timeout(timeoutMs: number): void {
    this.setTimeout(timeoutMs);
  }
}
