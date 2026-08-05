<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import type {
  ErDiagramColumn,
  ErDiagramData,
  ErDiagramEdge,
  ErDiagramNode,
} from "../../modern/database/erDiagramService";
import UiButton from "./UiButton.vue";

interface LayoutNode {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

const CARD_WIDTH = 270;
const HEADER_HEIGHT = 42;
const ROW_HEIGHT = 29;
const GRID_X = 340;
const GRID_Y = 230;

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const bootstrap = readWebviewBootstrap();
const data = ref<ErDiagramData>({ nodes: [], edges: [] });
const filter = ref("");
const status = ref("");
let dataSubscription: BridgeDisposable | undefined;
let stateSubscription: BridgeDisposable | undefined;
let errorSubscription: BridgeDisposable | undefined;
let exportSubscription: BridgeDisposable | undefined;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value);
}

function parseColumn(value: unknown): ErDiagramColumn | undefined {
  const item = record(value);
  const name = text(item.name || item.column_name).trim();
  if (!name) return undefined;
  const nullable = item.nullable == null
    ? undefined
    : typeof item.nullable === "boolean"
      ? item.nullable
      : text(item.nullable).toUpperCase() !== "NO";
  return {
    name,
    type: text(item.type, "TEXT"),
    nullable,
    key: text(item.key).trim() || undefined,
    defaultValue: item.defaultValue == null ? undefined : text(item.defaultValue),
  };
}

function parseNode(value: unknown): ErDiagramNode | undefined {
  const item = record(value);
  const name = text(item.name).trim();
  if (!name) return undefined;
  const offset = record(item.offset);
  return {
    name,
    columns: (Array.isArray(item.columns) ? item.columns : [])
      .map(parseColumn)
      .filter((column): column is ErDiagramColumn => column !== undefined),
    offset: {
      x: Number.isFinite(Number(offset.x)) ? Number(offset.x) : 0,
      y: Number.isFinite(Number(offset.y)) ? Number(offset.y) : 0,
    },
    main: item.main === true,
  };
}

function parseEdge(value: unknown): ErDiagramEdge | undefined {
  const item = record(value);
  const from = text(item.from).trim();
  const target = text(item.target).trim();
  const fromColumns = text(item.fromColumns).trim();
  const targetColumns = text(item.targetColumns).trim();
  if (!from || !target || !fromColumns || !targetColumns) return undefined;
  return {
    from,
    fromColumns,
    target,
    targetColumns,
    constraintName: text(item.constraintName).trim() || undefined,
  };
}

function parseData(value: unknown): ErDiagramData {
  const item = record(value);
  return {
    nodes: (Array.isArray(item.nodes) ? item.nodes : [])
      .map(parseNode)
      .filter((node): node is ErDiagramNode => node !== undefined),
    edges: (Array.isArray(item.edges) ? item.edges : [])
      .map(parseEdge)
      .filter((edge): edge is ErDiagramEdge => edge !== undefined),
  };
}

function applyState(content: unknown): void {
  const item = record(content);
  if (item.erData) {
    data.value = parseData(item.erData);
  } else if (Array.isArray(item.nodes) || Array.isArray(item.edges)) {
    data.value = parseData(item);
  }
}

const visibleNodes = computed(() => {
  const query = filter.value.trim().toLocaleLowerCase();
  if (!query) return data.value.nodes;
  return data.value.nodes.filter((node) => node.name.toLocaleLowerCase().includes(query));
});

const visibleNames = computed(() => new Set(visibleNodes.value.map((node) => node.name)));
const visibleEdges = computed(() => data.value.edges.filter(
  (edge) => visibleNames.value.has(edge.from) && visibleNames.value.has(edge.target),
));

const layout = computed(() => {
  const nodes = data.value.nodes;
  const minX = nodes.length ? Math.min(...nodes.map((node) => node.offset.x)) : 0;
  const minY = nodes.length ? Math.min(...nodes.map((node) => node.offset.y)) : 0;
  const result = new Map<string, LayoutNode>();
  for (const node of nodes) {
    const height = HEADER_HEIGHT + Math.max(1, node.columns.length) * ROW_HEIGHT;
    result.set(node.name, {
      left: 24 + (node.offset.x - minX) * GRID_X,
      top: 24 + (node.offset.y - minY) * GRID_Y,
      width: CARD_WIDTH,
      height,
    });
  }
  return result;
});

const canvasWidth = computed(() => {
  const positions = [...layout.value.values()];
  return Math.max(720, ...positions.map((item) => item.left + item.width + 48));
});

const canvasHeight = computed(() => {
  const positions = [...layout.value.values()];
  return Math.max(420, ...positions.map((item) => item.top + item.height + 48));
});

function position(nodeName: string): LayoutNode {
  return layout.value.get(nodeName) || {
    left: 24,
    top: 24,
    width: CARD_WIDTH,
    height: HEADER_HEIGHT + ROW_HEIGHT,
  };
}

function edgePoint(nodeName: string, side: "from" | "target"): { x: number; y: number } {
  const item = position(nodeName);
  return {
    x: side === "from" ? item.left + item.width : item.left,
    y: item.top + item.height / 2,
  };
}

function columnText(column: ErDiagramColumn): string {
  const nullable = column.nullable === false ? " NOT NULL" : "";
  const defaultValue = column.defaultValue ? ` = ${column.defaultValue}` : "";
  return `${column.type}${nullable}${defaultValue}`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function svgExport(): string {
  const lines = visibleEdges.value.map((edge) => {
    const from = edgePoint(edge.from, "from");
    const target = edgePoint(edge.target, "target");
    return `<line x1="${from.x}" y1="${from.y}" x2="${target.x}" y2="${target.y}" stroke="#6b7280" stroke-width="1.5" />`;
  }).join("");
  const cards = visibleNodes.value.map((node) => {
    const item = position(node.name);
    const rows = node.columns.map((column, index) =>
      `<text x="${item.left + 12}" y="${item.top + HEADER_HEIGHT + 20 + index * ROW_HEIGHT}" font-size="12">${escapeXml(`${column.key ? `${column.key} ` : ""}${column.name}: ${columnText(column)}`)}</text>`,
    ).join("");
    return `<rect x="${item.left}" y="${item.top}" width="${item.width}" height="${item.height}" rx="6" fill="#1f2937" stroke="#9ca3af" /><text x="${item.left + 12}" y="${item.top + 26}" fill="#ffffff" font-size="14" font-weight="600">${escapeXml(node.name)}</text>${rows}`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth.value}" height="${canvasHeight.value}" viewBox="0 0 ${canvasWidth.value} ${canvasHeight.value}"><rect width="100%" height="100%" fill="#111827" />${lines}${cards}</svg>`;
}

function exportDiagram(type: "svg" | "json"): void {
  const content = type === "svg" ? svgExport() : JSON.stringify(data.value, null, 2);
  bridge?.emit("exportImg", { type, data: content });
}

onMounted(() => {
  dataSubscription = bridge?.on("erData", (content) => {
    data.value = parseData(content);
    status.value = `${data.value.nodes.length} table(s), ${data.value.edges.length} relation(s).`;
  });
  stateSubscription = bridge?.on("setState", applyState);
  errorSubscription = bridge?.on("error", (content) => {
    status.value = text(record(content).message, "Unable to load ER diagram.");
  });
  exportSubscription = bridge?.on("exportSuccess", () => {
    status.value = "ER diagram exported.";
  });
  bridge?.init("erDiagram");
  applyState(bootstrap.state);
});

onBeforeUnmount(() => {
  dataSubscription?.dispose();
  stateSubscription?.dispose();
  errorSubscription?.dispose();
  exportSubscription?.dispose();
});
</script>

<template>
  <section
    class="route-workspace er-diagram-view"
    data-route="erDiagram"
  >
    <header class="route-workspace__header">
      <div>
        <h1>ER Diagram</h1>
        <p class="route-workspace__subline">
          Foreign-key relationships around the selected table.
        </p>
      </div>
      <div class="route-workspace__actions">
        <UiButton
          type="button"
          @click="bridge?.emit('refreshCache')"
        >
          Refresh
        </UiButton>
        <UiButton
          type="button"
          variant="default"
          @click="exportDiagram('svg')"
        >
          Export SVG
        </UiButton>
        <UiButton
          type="button"
          variant="default"
          @click="exportDiagram('json')"
        >
          Export JSON
        </UiButton>
      </div>
    </header>

    <div class="er-diagram-view__toolbar">
      <input
        v-model="filter"
        class="vsc-input"
        placeholder="Filter tables"
      >
      <span class="route-workspace__subline">
        {{ data.nodes.length }} table(s) · {{ data.edges.length }} relation(s)
      </span>
    </div>

    <p
      v-if="status"
      class="route-workspace__status"
    >
      {{ status }}
    </p>
    <p
      v-if="data.nodes.length === 0"
      class="route-workspace__empty"
    >
      No related tables were returned. The selected database may not expose foreign-key metadata.
    </p>
    <div
      v-else
      class="er-diagram-view__viewport"
    >
      <div
        class="er-diagram-view__canvas"
        :style="{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }"
      >
        <svg
          class="er-diagram-view__edges"
          :width="canvasWidth"
          :height="canvasHeight"
          aria-hidden="true"
        >
          <line
            v-for="edge in visibleEdges"
            :key="`${edge.from}:${edge.fromColumns}:${edge.target}:${edge.targetColumns}`"
            :x1="edgePoint(edge.from, 'from').x"
            :y1="edgePoint(edge.from, 'from').y"
            :x2="edgePoint(edge.target, 'target').x"
            :y2="edgePoint(edge.target, 'target').y"
            class="er-diagram-view__edge"
          />
        </svg>
        <article
          v-for="node in visibleNodes"
          :key="node.name"
          class="er-diagram-view__node"
          :class="{ 'er-diagram-view__node--main': node.main }"
          :style="{ left: `${position(node.name).left}px`, top: `${position(node.name).top}px` }"
        >
          <h2>{{ node.name }}</h2>
          <div
            v-for="column in node.columns"
            :key="column.name"
            class="er-diagram-view__column"
          >
            <span class="er-diagram-view__column-name">
              <span
                v-if="column.key"
                class="er-diagram-view__key"
              >{{ column.key }}</span>
              {{ column.name }}
            </span>
            <span class="er-diagram-view__column-type">{{ columnText(column) }}</span>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>
