import type { RouteLocationRaw } from "vue-router";

export const WEBVIEW_ROUTES = [
  { path: "/connect", name: "connect" },
  { path: "/dbFileConnect", name: "dbFileConnect" },
  { path: "/parquet", name: "parquet" },
  { path: "/sqlite", name: "sqlite" },
  { path: "/result", name: "result" },
  { path: "/manager", name: "manager" },
  { path: "/es-status", name: "esStatus" },
  { path: "/design", name: "design" },
  { path: "/erDiagram", name: "erDiagram" },
  { path: "/mock", name: "mock" },
  { path: "/structDiff", name: "structDiff" },
  { path: "/keyView", name: "keyView" },
  { path: "/rabbitQueueView", name: "rabbitQueueView" },
  { path: "/forward", name: "forward" },
  { path: "/xterm", name: "xterm" },
  { path: "/sshTerminal", name: "sshTerminal" },
  { path: "/fileManager", name: "fileManager" },
  { path: "/sshStatus", name: "sshStatus" },
  { path: "/sshMonitor", name: "sshMonitor" },
  { path: "/center/document", name: "document" },
  { path: "/center/plan", name: "plan" },
  { path: "/center/console", name: "console" },
  { path: "/center/util", name: "util" },
  { path: "/center/image", name: "image" },
] as const;

export type WebviewRouteName =
  | (typeof WEBVIEW_ROUTES)[number]["name"]
  | "main"
  | "center";

const routeByName = new Map<string, (typeof WEBVIEW_ROUTES)[number]>(
  WEBVIEW_ROUTES.map((route) => [route.name, route]),
);

const routeByPath = new Map<string, (typeof WEBVIEW_ROUTES)[number]>(
  WEBVIEW_ROUTES.map((route) => [route.path, route]),
);

const routeAliases: Readonly<Record<string, WebviewRouteName>> = {
  status: "esStatus",
  redisStatus: "esStatus",
  terminal: "xterm",
};

export function normalizeRouteName(
  value: unknown,
): WebviewRouteName | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const candidate = value.replace(/^\//, "");
  if (candidate === "") {
    return "main";
  }
  if (routeByName.has(candidate)) {
    return candidate as WebviewRouteName;
  }
  return routeAliases[candidate];
}

export function routeLocation(value: unknown): RouteLocationRaw | undefined {
  const routeName = normalizeRouteName(value);
  if (!routeName) {
    return undefined;
  }
  const route =
    routeName === "main" || routeName === "center"
      ? undefined
      : routeByName.get(routeName);
  return route ? { name: route.name } : { name: routeName };
}

export function routePath(value: unknown): string | undefined {
  const routeName = normalizeRouteName(value);
  if (!routeName) {
    return undefined;
  }
  if (routeName === "main") {
    return "/";
  }
  if (routeName === "center") {
    return "/center";
  }
  return routeByName.get(routeName)?.path;
}

export function routeDescriptor(value: unknown) {
  const routeName = normalizeRouteName(value);
  if (!routeName) {
    return undefined;
  }
  return routeName === "main" || routeName === "center"
    ? { name: routeName, path: routePath(routeName) }
    : routeByName.get(routeName);
}

export function routeFromPath(path: string) {
  return routeByPath.get(path);
}
