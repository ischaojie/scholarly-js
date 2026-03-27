# scholarly-js

[English](./README.md) | [简体中文](./README.zh-CN.md) | 日本語

`scholarly-js` は、Google Scholar の著者・論文メタデータを取得するための TypeScript ライブラリです。Python の [scholarly](https://github.com/scholarly-python-package/scholarly) に着想を得ています。

> 注意: Google Scholar には厳しい自動化対策があります。高頻度アクセスは CAPTCHA や IP ブロックの原因になります。

## インストール

```bash
npm install scholarly-js
```

## クイックスタート

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

## プロキシ（ProxyGenerator）

Python `scholarly` と同様に、`ProxyGenerator` を作成して `scholarly` に注入できます。

```ts
import { ProxyGenerator, scholarly } from "scholarly-js";

const pg = new ProxyGenerator();
pg.ScraperAPI(process.env.SCRAPER_API_KEY!);
// ほかの方式:
// pg.SingleProxy("http://user:pass@host:port");
// await pg.FreeProxies();
// pg.Luminati("user", "pass", 22225);
// pg.Tor_External(9050);

scholarly.use_proxy(pg);
```

`use_proxy(primary, secondary)` でデュアルプロキシにも対応しています。`/citations` は secondary を優先し、それ以外は primary を使います。
プロキシ設定は Node 実行環境向けです。ブラウザ専用ビルドでは `use_proxy()` を呼ばないでください。

## コア API

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

`search_author`、`search_pubs`、`search_single_pub`、`search_citedby`、`citedby` など、Python 風エイリアスも提供しています。

## Python scholarly との違い

- プロキシ機能（`ProxyGenerator`）は実装済みですが、一部は互換目的の実装です（例: Tor 内部プロセス管理は未実装）。
- Author に対する `fill()` は `basics / indices / counts / coauthors / publications` をサポートします。
- 検索・引用 API は `AsyncGenerator` ベースです。

## ローカル開発

```bash
npm run check
```

ビルド成果物は `dist/` に出力されます。

