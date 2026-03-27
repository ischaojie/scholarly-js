import { load } from "cheerio";
import { sleep, toAbsoluteUrl } from "./utils";
import type { ProxyGenerator } from "../proxy";

interface RequestOptions {
  timeoutMs: number;
  retries: number;
  userAgent: string;
  minDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_OPTIONS: RequestOptions = {
  timeoutMs: 15_000,
  retries: 4,
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  minDelayMs: 700,
  maxDelayMs: 1700,
};

export class ScholarHttp {
  private options: RequestOptions;
  private primaryProxy?: ProxyGenerator;
  private secondaryProxy?: ProxyGenerator;

  constructor(options: Partial<RequestOptions> = {}) {
    this.options = {
      timeoutMs: options.timeoutMs ?? DEFAULT_OPTIONS.timeoutMs,
      retries: options.retries ?? DEFAULT_OPTIONS.retries,
      userAgent: options.userAgent ?? DEFAULT_OPTIONS.userAgent,
      minDelayMs: options.minDelayMs ?? DEFAULT_OPTIONS.minDelayMs,
      maxDelayMs: options.maxDelayMs ?? DEFAULT_OPTIONS.maxDelayMs,
    };
  }

  setOptions(options: Partial<RequestOptions>): void {
    this.options = { ...this.options, ...options };
  }

  useProxy(primary: ProxyGenerator, secondary?: ProxyGenerator): void {
    this.primaryProxy = primary;
    this.secondaryProxy = secondary ?? primary;
  }

  async getPage(url: string, premium = false): Promise<string> {
    const absoluteUrl = toAbsoluteUrl(url);
    const prefersSecondary = absoluteUrl.includes("/citations?") && !premium;
    const managers = prefersSecondary
      ? [this.secondaryProxy, this.primaryProxy]
      : [this.primaryProxy];

    for (const manager of managers) {
      try {
        return await this.getPageWithProxy(absoluteUrl, manager);
      } catch {
        if (manager === managers.at(-1)) {
          throw new Error(`Failed to fetch page: ${absoluteUrl}`);
        }
      }
    }

    throw new Error(`Failed to fetch page: ${absoluteUrl}`);
  }

  async getSoup(url: string) {
    const html = await this.getPage(url);
    return load(html.replace(/\u00a0/g, " "));
  }

  private async getPageWithProxy(
    absoluteUrl: string,
    manager?: ProxyGenerator,
  ): Promise<string> {
    let attempt = 0;
    while (attempt <= this.options.retries) {
      if (attempt > 0) {
        const backoff = Math.min(6000, 600 * 2 ** attempt);
        await sleep(backoff);
      }

      await sleep(this.randomDelay(this.options.minDelayMs, this.options.maxDelayMs));

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
      const proxyRuntime = manager ? await manager.getRuntime(absoluteUrl) : undefined;
      const requestUrl = proxyRuntime?.url ?? absoluteUrl;

      try {
        const init: RequestInit & { dispatcher?: unknown } = {
          redirect: "follow",
          signal: controller.signal,
          headers: {
            "user-agent": this.options.userAgent,
            "accept-language": "en-US,en;q=0.9",
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            ...(proxyRuntime?.headers ?? {}),
          },
        };

        if (proxyRuntime?.dispatcher) {
          init.dispatcher = proxyRuntime.dispatcher;
        }

        const response = await fetch(requestUrl, init);

        if (response.status === 403 || response.status === 429 || response.status === 503) {
          manager?.reportFailure(proxyRuntime?.proxyId);
          attempt += 1;
          continue;
        }

        if (!response.ok) {
          manager?.reportFailure(proxyRuntime?.proxyId);
          throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        if (this.hasCaptcha(html)) {
          manager?.reportFailure(proxyRuntime?.proxyId);
          throw new Error("Google Scholar returned captcha page");
        }
        return html;
      } catch (err) {
        manager?.reportFailure(proxyRuntime?.proxyId);
        if (attempt >= this.options.retries) {
          throw err;
        }
        attempt += 1;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new Error("Failed to fetch page");
  }

  private hasCaptcha(html: string): boolean {
    return ["gs_captcha_ccl", "recaptcha", "captcha-form"].some((id) =>
      html.includes(`id=\"${id}\"`),
    );
  }

  private randomDelay(min: number, max: number): number {
    if (max <= min) return min;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
