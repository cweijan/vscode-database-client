export type DocumentationTheme = "light" | "dark";

export function buildDocumentationUrl(
  host: string,
  language: string,
  theme: DocumentationTheme,
): string {
  const normalizedHost = host.trim().replace(/\/+$/, "");
  if (!normalizedHost) return "";

  const themeQuery = `?theme=${theme}`;
  return language.toLowerCase() === "zh-cn"
    ? `${normalizedHost}/docs/#/zh/${themeQuery}`
    : `${normalizedHost}/docs/${themeQuery}`;
}
