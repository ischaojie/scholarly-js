export type AuthorSource =
  | "SEARCH_AUTHOR_SNIPPETS"
  | "AUTHOR_PROFILE_PAGE"
  | "CO_AUTHORS_LIST";

export type PublicationSource =
  | "AUTHOR_PUBLICATION_ENTRY"
  | "PUBLICATION_SEARCH_SNIPPET";

export interface BibEntry {
  title?: string;
  abstract?: string;
  author?: string[] | string;
  pub_year?: string;
  venue?: string;
  citation?: string;
  journal?: string;
  conference?: string;
  volume?: string;
  number?: string;
  pages?: string;
  publisher?: string;
  pub_type?: string;
  bib_id?: string;
  [key: string]: unknown;
}

export interface Publication {
  container_type: "Publication";
  source: PublicationSource;
  bib: BibEntry;
  filled: boolean;
  author_pub_id?: string;
  author_id?: string[];
  num_citations?: number;
  citedby_url?: string;
  cites_id?: string[];
  pub_url?: string;
  url_related_articles?: string;
  url_scholarbib?: string;
  url_add_sclib?: string;
  eprint_url?: string;
  gsrank?: number;
  cites_per_year?: Record<number, number>;
}

export interface Author {
  container_type: "Author";
  source: AuthorSource;
  scholar_id: string;
  filled: string[];
  name?: string;
  affiliation?: string;
  organization?: number;
  interests?: string[];
  email_domain?: string;
  homepage?: string;
  url_picture?: string;
  citedby?: number;
  citedby5y?: number;
  hindex?: number;
  hindex5y?: number;
  i10index?: number;
  i10index5y?: number;
  cites_per_year?: Record<number, number>;
  coauthors?: Author[];
  publications?: Publication[];
}

export interface SearchPubsOptions {
  patents?: boolean;
  citations?: boolean;
  year_low?: number;
  year_high?: number;
  sort_by?: "relevance" | "date";
  include_last_year?: "abstracts" | "everything";
  start_index?: number;
}

export interface FillAuthorOptions {
  sections?: Array<
    "basics" | "indices" | "counts" | "coauthors" | "publications"
  >;
  sortby?: "citedby" | "year";
  publication_limit?: number;
}

export interface ScholarlyOptions {
  timeoutMs?: number;
  retries?: number;
  userAgent?: string;
  minDelayMs?: number;
  maxDelayMs?: number;
}
