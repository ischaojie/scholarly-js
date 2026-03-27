import { ProxyAgent, type Dispatcher } from "undici";

export type ProxyMode =
  | "NONE"
  | "SINGLEPROXY"
  | "FREE_PROXIES"
  | "SCRAPERAPI"
  | "LUMINATI"
  | "TOR_EXTERNAL";

export interface ProxyRuntime {
  url: string;
  headers?: Record<string, string>;
  dispatcher?: Dispatcher;
  proxyId?: string;
}

export class MaxTriesExceededException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaxTriesExceededException";
  }
}

export class ProxyGenerator {
  proxy_mode: ProxyMode = "NONE";

  private singleProxy?: string;
  private freeProxies: string[] = [];
  private freeProxyIndex = 0;
  private dirtyFreeProxies = new Set<string>();

  private scraperApi?: {
    apiKey: string;
    countryCode?: string;
    premium?: boolean;
    render?: boolean;
  };

  private dispatcherCache = new Map<string, Dispatcher>();

  SingleProxy(http?: string, https?: string): boolean {
    const raw = https ?? http;
    if (!raw) return false;
    this.singleProxy = this.normalizeProxyUrl(raw);
    this.proxy_mode = "SINGLEPROXY";
    return true;
  }

  Luminati(usr: string, passwd: string, proxy_port: number): boolean {
    if (!usr || !passwd || !proxy_port) return false;
    const sessionId = Math.floor(Math.random() * 10_000_000);
    const proxy = `http://${usr}-session-${sessionId}:${passwd}@zproxy.lum-superproxy.io:${proxy_port}`;
    this.singleProxy = proxy;
    this.proxy_mode = "LUMINATI";
    return true;
  }

  Tor_External(tor_sock_port = 9050): boolean {
    // Compatibility shim; we treat Tor as a SOCKS proxy URL.
    this.singleProxy = `socks5://127.0.0.1:${tor_sock_port}`;
    this.proxy_mode = "TOR_EXTERNAL";
    return true;
  }

  async FreeProxies(timeout = 1): Promise<boolean> {
    this.proxy_mode = "FREE_PROXIES";

    const timeoutMs = Math.max(1, Math.floor(timeout * 1000));
    const endpoint =
      `https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http` +
      `&timeout=${timeoutMs}&country=all&ssl=all&anonymity=all`;

    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`Unable to fetch free proxies: HTTP ${response.status}`);
    }

    const body = await response.text();
    const proxies = body
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => this.normalizeProxyUrl(line));

    this.freeProxies = Array.from(new Set(proxies));
    this.freeProxyIndex = 0;
    this.dirtyFreeProxies.clear();

    if (this.freeProxies.length === 0) {
      throw new MaxTriesExceededException("No free proxies were returned by the provider.");
    }

    return true;
  }

  ScraperAPI(
    API_KEY: string,
    country_code?: string,
    premium = false,
    render = false,
  ): boolean {
    if (!API_KEY) {
      throw new Error("ScraperAPI API key is required.");
    }

    this.scraperApi = {
      apiKey: API_KEY,
      countryCode: country_code,
      premium,
      render,
    };
    this.proxy_mode = "SCRAPERAPI";
    return true;
  }

  has_proxy(): boolean {
    return this.proxy_mode !== "NONE";
  }

  getRuntime(targetUrl: string): ProxyRuntime {
    if (this.proxy_mode === "SCRAPERAPI" && this.scraperApi) {
      return this.buildScraperApiRuntime(targetUrl);
    }

    const proxy = this.pickProxy();
    if (!proxy) {
      return { url: targetUrl };
    }

    return {
      url: targetUrl,
      dispatcher: this.getDispatcher(proxy),
      proxyId: proxy,
    };
  }

  reportFailure(proxyId?: string): void {
    if (this.proxy_mode !== "FREE_PROXIES" || !proxyId) return;
    this.dirtyFreeProxies.add(proxyId);
    this.freeProxyIndex = (this.freeProxyIndex + 1) % Math.max(this.freeProxies.length, 1);
  }

  private buildScraperApiRuntime(targetUrl: string): ProxyRuntime {
    const cfg = this.scraperApi!;
    const params = new URLSearchParams({
      api_key: cfg.apiKey,
      url: targetUrl,
      retry_404: "true",
    });

    if (cfg.countryCode) params.set("country_code", cfg.countryCode);
    if (cfg.premium) params.set("premium", "true");
    if (cfg.render) params.set("render", "true");

    return {
      url: `http://api.scraperapi.com?${params.toString()}`,
      proxyId: "scraperapi",
    };
  }

  private pickProxy(): string | undefined {
    if (this.proxy_mode === "SINGLEPROXY" || this.proxy_mode === "LUMINATI" || this.proxy_mode === "TOR_EXTERNAL") {
      return this.singleProxy;
    }

    if (this.proxy_mode === "FREE_PROXIES") {
      const total = this.freeProxies.length;
      if (total === 0) return undefined;

      for (let i = 0; i < total; i += 1) {
        const idx = (this.freeProxyIndex + i) % total;
        const candidate = this.freeProxies[idx];
        if (!candidate || this.dirtyFreeProxies.has(candidate)) continue;
        this.freeProxyIndex = idx;
        return candidate;
      }

      this.dirtyFreeProxies.clear();
      return this.freeProxies[this.freeProxyIndex % total];
    }

    return undefined;
  }

  private getDispatcher(proxyUrl: string): Dispatcher {
    const cached = this.dispatcherCache.get(proxyUrl);
    if (cached) return cached;
    const dispatcher = new ProxyAgent(proxyUrl);
    this.dispatcherCache.set(proxyUrl, dispatcher);
    return dispatcher;
  }

  private normalizeProxyUrl(raw: string): string {
    if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("socks5://")) {
      return raw;
    }
    return `http://${raw}`;
  }
}
