export const HOST = "https://scholar.google.com";

export function toAbsoluteUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return `${HOST}${url.startsWith("/") ? "" : "/"}${url}`;
}

export function getUrlParam(value: string, key: string): string | undefined {
  try {
    const u = new URL(toAbsoluteUrl(value));
    return u.searchParams.get(key) ?? undefined;
  } catch {
    return undefined;
  }
}

export function cleanText(input: string): string {
  return input.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function parseIntSafe(input: string | undefined): number | undefined {
  if (!input) return undefined;
  const digits = input.replace(/[^\d]/g, "");
  if (!digits) return undefined;
  return Number.parseInt(digits, 10);
}

export function decodeOnClickUrl(onclick?: string): string | undefined {
  if (!onclick) return undefined;
  const match = onclick.match(/'([^']+)'/);
  if (!match) return undefined;
  const encoded = match[1];
  if (!encoded) return undefined;
  const escaped = encoded.replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
  return escaped;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
