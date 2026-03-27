# scholarly-js

English | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

`scholarly-js` is a TypeScript library for retrieving Google Scholar author/publication metadata, inspired by Python [scholarly](https://github.com/scholarly-python-package/scholarly).

> Note: Google Scholar has strict anti-bot controls. High-frequency requests may trigger CAPTCHA or IP blocks. Use responsibly.

## Install

```bash
npm install scholarly-js
```

## Quick Start

```ts
import { scholarly } from "scholarly-js";

const authorIter = scholarly.searchAuthor("Geoffrey Hinton");
const firstAuthor = (await authorIter.next()).value;

if (firstAuthor) {
  const fullAuthor = await scholarly.fill(firstAuthor, {
    sections: ["basics", "indices", "publications"],
    publication_limit: 5,
  });

  console.log(fullAuthor.name, fullAuthor.hindex);
}

const pubIter = scholarly.searchPubs("attention is all you need", {
  sort_by: "relevance",
  year_low: 2017,
});

const firstPub = (await pubIter.next()).value;
if (firstPub) {
  const filledPub = await scholarly.fill(firstPub);
  const bibtex = await scholarly.bibtex(filledPub);
  console.log(bibtex);
}
```

## Proxy (ProxyGenerator)

Like Python `scholarly`, you can create a `ProxyGenerator` and inject it into `scholarly`:

```ts
import { ProxyGenerator, scholarly } from "scholarly-js";

const pg = new ProxyGenerator();
pg.ScraperAPI(process.env.SCRAPER_API_KEY!);
// Also supported:
// pg.SingleProxy("http://user:pass@host:port");
// await pg.FreeProxies();
// pg.Luminati("user", "pass", 22225);
// pg.Tor_External(9050);

scholarly.use_proxy(pg);
```

`use_proxy(primary, secondary)` also supports dual-proxy mode. `/citations` requests prefer secondary, others use primary.
Proxy configuration is Node-runtime oriented; do not call `use_proxy()` in browser-only builds.

## Core API

- `searchAuthor(name)`
- `searchAuthorId(id, filled?, options?)`
- `searchKeyword(keyword)`
- `searchKeywords(keywords)`
- `searchPubs(query, options?)`
- `searchPubsByCustomUrl(path)`
- `searchSinglePub(title, filled?)`
- `searchCitedBy(publicationId, options?)`
- `searchOrg(name)`
- `searchAuthorByOrganization(organizationId)`
- `useProxy(proxyGenerator, secondaryProxyGenerator?)`
- `use_proxy(proxyGenerator, secondaryProxyGenerator?)`
- `setRetries/set_retries`, `setTimeout/set_timeout`
- `fill(authorOrPublication, options?)`
- `citedBy(publication)`
- `getRelatedArticles(publication)`
- `bibtex(publication)`
- `pprint(entity)`

Python-style aliases are also available: `search_author`, `search_pubs`, `search_single_pub`, `search_citedby`, `citedby`, etc.

## Differences from Python scholarly

- Proxy ecosystem (`ProxyGenerator`) is implemented, but some features are compatibility-focused (for example Tor internal process management is not implemented).
- `fill()` for Author supports: `basics / indices / counts / coauthors / publications`.
- Search and citation APIs use `AsyncGenerator`.

## Local Development

```bash
npm run check
```

Build output is generated in `dist/`.

## GitHub Actions: npm Auto Publish

Included workflows:

- `.github/workflows/ci.yml`: runs `npm run check` on PR and push to `main`
- `.github/workflows/release.yml`: on push to `main`, publishes only when the package version does not already exist on npm

OIDC mode does not need `NPM_TOKEN`. Configure npm Trusted Publisher:

1. Open npm package settings
2. Open `Trusted publishers`
3. Choose GitHub provider and bind your repository + workflow (`release.yml`)
4. Save

Release flow:

1. Bump `package.json` version (`0.1.0` -> `0.1.1`)
2. Merge to `main`
3. Action checks whether `<name>@<version>` already exists on npm
4. If not, it runs `npm publish --access public --provenance`
