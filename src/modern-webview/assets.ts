export interface WebviewAssetResolver {
  resolve(relativePath: string): string;
}

export function createWebviewAssetResolver(
  baseUrl: string | URL = import.meta.url,
): WebviewAssetResolver {
  return {
    resolve(relativePath: string): string {
      return new URL(relativePath, baseUrl).toString();
    },
  };
}

const defaultResolver = createWebviewAssetResolver();

export function resolveWebviewAsset(relativePath: string): string {
  return defaultResolver.resolve(relativePath);
}
