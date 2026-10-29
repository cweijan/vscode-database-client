import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";

import VscTable from "../../src/modern-webview/components/target/VscTable.vue";

const rows = [
  { id: 1, name: "alpha" },
  { id: 2, name: "beta" },
];

const columns = [
  { id: "name", type: "default", prop: "name", label: "Name", sortable: true },
  { id: "id", type: "default", prop: "id", label: "Id" },
];

const app = createSSRApp({
  render() {
    return h(VscTable, { data: rows, columns });
  },
});

const html = await renderToString(app);
if (!html.includes("vsc-table__row")) throw new Error("table rows were not rendered");
if (!html.includes("alpha")) throw new Error("cell values were not rendered");
if (!html.includes("vsc-table__sort-icon")) throw new Error("sort affordance was not rendered");
if (!html.includes("vsc-table__resize-handle")) throw new Error("resize handle was not rendered");
