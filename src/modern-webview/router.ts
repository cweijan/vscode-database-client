import {
  createMemoryHistory,
  createRouter,
  type RouteRecordRaw,
} from "vue-router";

import RouteLayout from "./components/RouteLayout.vue";
import ConnectionView from "./components/ConnectionView.vue";
import ConsoleView from "./components/ConsoleView.vue";
import DesignView from "./components/DesignView.vue";
import ResultView from "./components/ResultView.vue";
import RouteWorkbench from "./components/RouteWorkbench.vue";
import type { WebviewRouteName } from "./routeRegistry";
export {
  normalizeRouteName,
  routeDescriptor,
  routeFromPath,
  routeLocation,
  routePath,
  WEBVIEW_ROUTES,
} from "./routeRegistry";
export type { WebviewRouteName } from "./routeRegistry";

function surfaceRoute(
  path: string,
  name: WebviewRouteName,
): RouteRecordRaw {
  return {
    path,
    name,
    component: RouteWorkbench,
    props: { routeName: name },
  };
}

export function createWebviewRouter() {
  const routes: RouteRecordRaw[] = [
    { path: "/connect", name: "connect", component: ConnectionView },
    surfaceRoute("/dbFileConnect", "dbFileConnect"),
    surfaceRoute("/parquet", "parquet"),
    surfaceRoute("/sqlite", "sqlite"),
    {
      path: "/",
      name: "main",
      component: RouteLayout,
      children: [
        { path: "result", name: "result", component: ResultView },
        surfaceRoute("manager", "manager"),
        surfaceRoute("es-status", "esStatus"),
        { path: "design", name: "design", component: DesignView },
        surfaceRoute("erDiagram", "erDiagram"),
        surfaceRoute("mock", "mock"),
      ],
    },
    surfaceRoute("/structDiff", "structDiff"),
    surfaceRoute("/keyView", "keyView"),
    surfaceRoute("/rabbitQueueView", "rabbitQueueView"),
    surfaceRoute("/forward", "forward"),
    surfaceRoute("/xterm", "xterm"),
    surfaceRoute("/sshTerminal", "sshTerminal"),
    surfaceRoute("/fileManager", "fileManager"),
    surfaceRoute("/sshStatus", "sshStatus"),
    surfaceRoute("/sshMonitor", "sshMonitor"),
    {
      path: "/center",
      name: "center",
      component: RouteLayout,
      children: [
        surfaceRoute("document", "document"),
        surfaceRoute("plan", "plan"),
        { path: "console", name: "console", component: ConsoleView },
        surfaceRoute("util", "util"),
        surfaceRoute("image", "image"),
      ],
    },
  ];

  return createRouter({
    history: createMemoryHistory(),
    routes,
  });
}
