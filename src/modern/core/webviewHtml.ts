export interface WebviewHtmlRenderOptions {
  readonly cspSource: string;
  readonly nonce: string;
  readonly config: unknown;
  readonly resolveAsset: (relativePath: string) => string;
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderWebviewHtml(
  template: string,
  options: WebviewHtmlRenderOptions,
): string {
  const serializedConfig = escapeAttribute(JSON.stringify(options.config));
  const csp =
    "<meta http-equiv=\"Content-Security-Policy\" content=\"" +
    "default-src 'none'; " +
    "img-src " +
    options.cspSource +
    " data:; " +
    "font-src " +
    options.cspSource +
    " data:; " +
    "style-src " +
    options.cspSource +
    " 'unsafe-inline'; " +
    "frame-src http: https:; " +
    "connect-src " +
    options.cspSource +
    "; " +
    "script-src 'nonce-" +
    options.nonce +
    "' " +
    options.cspSource +
    ";\">";
  let html = template.replace("{{configs}}", serializedConfig);
  html = html.replace(
    /(<(?:script|link)\b[^>]+(?:src|href)=["'])\.\/([^"']+)(["'][^>]*>)/gi,
    (_match, prefix: string, asset: string, suffix: string) =>
      prefix + escapeAttribute(options.resolveAsset(asset)) + suffix,
  );
  html = html.replace(
    /<script(\s|>)/gi,
    '<script nonce="' + escapeAttribute(options.nonce) + '"$1',
  );
  return html.replace(/<head>/i, "<head>" + csp);
}
