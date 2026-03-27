declare module "bibtex-parse-js" {
  export interface BibtexJsonEntry {
    citationKey?: string;
    entryType?: string;
    [key: string]: unknown;
  }

  const api: {
    toJSON(input: string): BibtexJsonEntry[];
  };

  export default api;
}
