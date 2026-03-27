# scholarly-js

[English](./README.md) | 简体中文 | [日本語](./README.ja.md)

`scholarly-js` 是一个用于获取 Google Scholar 作者/论文元数据的 TypeScript 库，参考了 Python [scholarly](https://github.com/scholarly-python-package/scholarly) 的接口风格。

> 注意：Google Scholar 对自动化请求有严格限制。高频请求可能触发验证码或 IP 封禁，请合理控制频率。

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

和 Python `scholarly` 一样，可以先创建 `ProxyGenerator` 再注入到 `scholarly`：

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

`use_proxy(primary, secondary)` 支持双代理模式：`/citations` 请求优先走 secondary，其余请求走 primary。
代理配置面向 Node 运行时；在纯浏览器构建里不要调用 `use_proxy()`。

## 核心 API

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

同时提供 Python 风格别名：`search_author`、`search_pubs`、`search_single_pub`、`search_citedby`、`citedby` 等。

## 与 Python scholarly 的差异

- 已实现代理生态（`ProxyGenerator`），但部分能力是兼容实现（例如未实现 Tor 内部进程管理）。
- `fill()` 对 Author 支持：`basics / indices / counts / coauthors / publications`。
- 搜索与引用相关接口采用 `AsyncGenerator`。

## 本地开发

```bash
npm run check
```

构建产物输出在 `dist/`。

## GitHub Actions 自动发布 npm

内置工作流：

- `.github/workflows/ci.yml`：PR 和 push 到 `main` 时执行 `npm run check`
- `.github/workflows/release.yml`：push 到 `main` 时，仅当该版本尚未发布到 npm 才执行发布

OIDC 模式不需要 `NPM_TOKEN`。请在 npm 配置 Trusted Publisher：

1. 打开 npm 包设置
2. 打开 `Trusted publishers`
3. 选择 GitHub provider，绑定仓库和 workflow（`release.yml`）
4. 保存

发布流程：

1. 修改 `package.json` 版本号（如 `0.1.0` -> `0.1.1`）
2. 合并到 `main`
3. Action 检查 `<name>@<version>` 是否已存在于 npm
4. 若不存在则执行 `npm publish --access public --provenance`
