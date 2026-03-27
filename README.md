# scholarly-js

`scholarly-js` 是一个基于 TypeScript 的 Google Scholar 抓取库，参考了 Python 项目 [scholarly](https://github.com/scholarly-python-package/scholarly) 的核心接口风格。

> 注意：Google Scholar 对自动化请求有严格限制，频繁请求可能触发验证码或 IP 封禁。请控制请求频率，并自行评估合规风险。

## 安装

```bash
npm install scholarly-js
```

## 快速开始

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

## 代理（ProxyGenerator）

与 Python `scholarly` 一样，可以先创建 `ProxyGenerator` 再注入到 `scholarly`：

```ts
import { ProxyGenerator, scholarly } from "scholarly-js";

const pg = new ProxyGenerator();
pg.ScraperAPI(process.env.SCRAPER_API_KEY!);
// 也支持：
// pg.SingleProxy("http://user:pass@host:port");
// await pg.FreeProxies();
// pg.Luminati("user", "pass", 22225);
// pg.Tor_External(9050);

scholarly.use_proxy(pg);
```

`use_proxy(primary, secondary)` 也支持双代理模式，语义与 Python 版一致：`/citations` 相关请求优先走 secondary，其余走 primary。

## API 对照（核心）

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

同时提供 Python 风格别名：如 `search_author`、`search_pubs`、`search_single_pub`、`search_citedby`、`citedby` 等。

## 主要差异（相对 Python scholarly）

- 目前未实现 Python 版的代理生成器生态（如 `ProxyGenerator`）。
- `fill()` 对 Author 支持的 section 为：`basics / indices / counts / coauthors / publications`。
- `citedBy` 和搜索接口采用 `AsyncGenerator`（`for await ... of` 或 `iterator.next()`）。

## 本地开发

```bash
npm run check
```

构建产物输出在 `dist/`。

## GitHub Actions 自动发布 npm

项目已内置：

- `.github/workflows/ci.yml`：PR/Push 到 `main` 时执行 `npm run check`
- `.github/workflows/release.yml`：Push 到 `main` 时，若 `package.json` 里的版本还未发布到 npm，则自动发布

你只需要在 GitHub 仓库配置 Secret：

- `NPM_TOKEN`：npm access token（建议使用 Automation token）

发布规则：

1. 修改 `package.json` 的 `version`（例如 `0.1.0` -> `0.1.1`）
2. 合并到 `main`
3. Action 会检查 `npm view <name>@<version>` 是否存在
4. 若不存在则执行 `npm publish --access public --provenance`
