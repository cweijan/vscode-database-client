import {
  createMemoryHistory,
  createRouter,
  type RouteRecordRaw,
} from "vue-router";

import RouteLayout from "./components/RouteLayout.vue";
import ConnectionView from "./components/ConnectionView.vue";
import DatabaseFileView from "./components/DatabaseFileView.vue";
import DesignView from "./components/DesignView.vue";
import ElasticsearchStatusView from "./components/ElasticsearchStatusView.vue";
import ForwardView from "./components/ForwardView.vue";
import ImageView from "./components/ImageView.vue";
import ManagerView from "./components/ManagerView.vue";
import LokiLogView from "./components/LokiLogView.vue";
import ParquetView from "./components/ParquetView.vue";
import PlanView from "./components/PlanView.vue";
import RabbitQueueView from "./components/RabbitQueueView.vue";
import RedisView from "./components/RedisView.vue";
import RemoteFileManagerView from "./components/RemoteFileManagerView.vue";
import ResultView from "./components/ResultView.vue";
import SqliteView from "./components/SqliteView.vue";
import SshStatusView from "./components/SshStatusView.vue";
import SshMonitorView from "./components/SshMonitorView.vue";
import SshTerminalView from "./components/SshTerminalView.vue";
import StructureDiffView from "./components/StructureDiffView.vue";
import SettingsView from "./components/SettingsView.vue";
import UtilView from "./components/UtilView.vue";
export {
  normalizeRouteName,
  routeDescriptor,
  routeFromPath,
  routeLocation,
  routePath,
  WEBVIEW_ROUTES,
} from "./routeRegistry";
export type { WebviewRouteName } from "./routeRegistry";

export function createWebviewRouter() {
  const routes: RouteRecordRaw[] = [
    { path: "/connect", name: "connect", component: ConnectionView },
    { path: "/dbFileConnect", name: "dbFileConnect", component: DatabaseFileView },
    { path: "/parquet", name: "parquet", component: ParquetView },
    { path: "/sqlite", name: "sqlite", component: SqliteView },
    {
      path: "/",
      name: "main",
      component: RouteLayout,
      children: [
        { path: "result", name: "result", component: ResultView },
        { path: "manager", name: "manager", component: ManagerView },
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
    { path: "/lokiLog", name: "lokiLog", component: LokiLogView },
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
        { path: "plan", name: "plan", component: PlanView },
        { path: "console", name: "console", component: SettingsView },
        { path: "util", name: "util", component: UtilView },
        { path: "image", name: "image", component: ImageView },
      ],
    },
  ];

  return createRouter({
    history: createMemoryHistory(),
    routes,
  });
}
