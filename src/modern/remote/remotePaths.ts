export function normalizeRemotePath(value: unknown, fallback = "/"): string {
  const source = String(value ?? fallback).trim() || fallback;
  const segments: string[] = [];
  for (const segment of source.replaceAll("\\", "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.length > 0 ? `/${segments.join("/")}` : "/";
}

export function childRemotePath(parent: string, name: string): string {
  return normalizeRemotePath(`${parent}/${name}`);
}

export function parentRemotePath(value: string): string {
  const normalized = normalizeRemotePath(value);
  if (normalized === "/") return "/";
  const segments = normalized.split("/").filter(Boolean);
  segments.pop();
  return segments.length > 0 ? `/${segments.join("/")}` : "/";
}

export function boundRemotePath(value: unknown, root = "/"): string {
  const normalizedRoot = normalizeRemotePath(root);
  const normalized = normalizeRemotePath(value, normalizedRoot);
  if (normalizedRoot === "/") return normalized;
  return normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}/`)
    ? normalized
    : normalizedRoot;
}
