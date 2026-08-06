import {
  createMemoryHistory,
  createRouter,
  type RouteRecordRaw,
} from "vue-router";

import RouteLayout from "./components/RouteLayout.vue";
import ConnectionView from "./components/ConnectionView.vue";
import ConsoleView from "./components/ConsoleView.vue";
import DatabaseFileView from "./components/DatabaseFileView.vue";
import DesignView from "./components/DesignView.vue";
import ElasticsearchStatusView from "./components/ElasticsearchStatusView.vue";
import ForwardView from "./components/ForwardView.vue";
import ParquetView from "./components/ParquetView.vue";
import RabbitQueueView from "./components/RabbitQueueView.vue";
import RedisView from "./components/RedisView.vue";
import RemoteFileManagerView from "./components/RemoteFileManagerView.vue";
import ResultView from "./components/ResultView.vue";
import RouteWorkbench from "./components/RouteWorkbench.vue";
import SshStatusView from "./components/SshStatusView.vue";
import SshMonitorView from "./components/SshMonitorView.vue";
import SshTerminalView from "./components/SshTerminalView.vue";
import StructureDiffView from "./components/StructureDiffView.vue";
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
    { path: "/dbFileConnect", name: "dbFileConnect", component: DatabaseFileView },
    { path: "/parquet", name: "parquet", component: ParquetView },
    { path: "/sqlite", name: "sqlite", component: DatabaseFileView },
    {
      path: "/",
      name: "main",
      component: RouteLayout,
      children: [
        { path: "result", name: "result", component: ResultView },
        surfaceRoute("manager", "manager"),
        { path: "es-status", name: "esStatus", component: ElasticsearchStatusView },
        { path: "design", name: "design", component: DesignView },
        {
          path: "erDiagram",
          name: "erDiagram",
          component: () => import("./components/ErDiagramView.vue"),
        },
        {
          path: "mock",
          name: "mock",
          component: () => import("./components/MockView.vue"),
        },
      ],
    },
    { path: "/structDiff", name: "structDiff", component: StructureDiffView },
    { path: "/keyView", name: "keyView", component: RedisView },
    { path: "/rabbitQueueView", name: "rabbitQueueView", component: RabbitQueueView },
    { path: "/forward", name: "forward", component: ForwardView },
    {
      path: "/xterm",
      name: "xterm",
      component: () => import("./components/XtermView.vue"),
    },
    { path: "/sshTerminal", name: "sshTerminal", component: SshTerminalView },
    { path: "/fileManager", name: "fileManager", component: RemoteFileManagerView },
    { path: "/sshStatus", name: "sshStatus", component: SshStatusView },
    { path: "/sshMonitor", name: "sshMonitor", component: SshMonitorView },
    {
      path: "/center",
      name: "center",
      component: RouteLayout,
      children: [
        {
          path: "document",
          name: "document",
          component: () => import("./components/DocumentView.vue"),
        },
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
