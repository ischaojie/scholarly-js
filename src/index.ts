export { Scholarly } from "./client";
export { MaxTriesExceededException, ProxyGenerator } from "./proxy";
export type { ProxyMode, ProxyRuntime } from "./proxy";
export type {
  Author,
  AuthorSource,
  BibEntry,
  FillAuthorOptions,
  Publication,
  PublicationSource,
  ScholarlyOptions,
  SearchPubsOptions,
} from "./types";

import { Scholarly } from "./client";

export const scholarly = new Scholarly();
