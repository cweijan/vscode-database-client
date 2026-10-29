<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, ref } from "vue";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { applyTerminalConfiguration } from "../terminalConfig";

interface XtermProps {
  readonly embedded?: boolean;
  readonly padding?: number;
}

const props = defineProps<XtermProps>();
const bridge = inject(WEBVIEW_BRIDGE_KEY);
const terminalContainer = ref<HTMLDivElement>();
const status = ref("Waiting for terminal configuration…");
const dbType = ref("SSH");
const terminal = ref<Terminal>();
const fitAddon = ref<FitAddon>();
const subscriptions: BridgeDisposable[] = [];
let resizeObserver: ResizeObserver | undefined;

function text(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value);
}

function fitTerminal(): void {
  if (!terminal.value || !fitAddon.value || !terminalContainer.value) return;
  if (terminalContainer.value.offsetParent === null) return;
  fitAddon.value.fit();
  bridge?.emit("resize", {
    cols: terminal.value.cols,
    rows: terminal.value.rows,
  });
}

function createTerminal(content: unknown): void {
  const config = content && typeof content === "object" ? content as Record<string, unknown> : {};
  dbType.value = text(config.dbType, dbType.value);
  if (terminal.value) {
    applyTerminalConfiguration(terminal.value, config);
    fitTerminal();
    return;
  }
  if (!terminalContainer.value) return;

  const instance = new Terminal({
    convertEol: true,
    cursorBlink: true,
    fontSize: 13,
    fontFamily: "var(--vscode-editor-font-family, ui-monospace, monospace)",
    theme: {
      background: "#00000000",
      foreground: "var(--vscode-terminal-foreground, #cccccc)",
      cursor: "var(--vscode-terminalCursor-foreground, #ffffff)",
    },
  });
  const fit = new FitAddon();
  instance.loadAddon(fit);
  instance.open(terminalContainer.value);
  terminal.value = instance;
  fitAddon.value = fit;
  applyTerminalConfiguration(instance, config);
  instance.onData((value) => bridge?.emit("data", value));
  instance.onResize(({ cols, rows }) => bridge?.emit("resize", { cols, rows }));
  fitTerminal();
  bridge?.emit("initTerminal", {
    cols: instance.cols,
    rows: instance.rows,
  });
  status.value = `Connecting to ${dbType.value}…`;
}

function clearTerminal(): void {
  terminal.value?.clear();
  terminal.value?.reset();
}

onMounted(() => {
  const terminalConfigSubscription = bridge?.on("terminalConfig", createTerminal);
  if (terminalConfigSubscription) subscriptions.push(terminalConfigSubscription);
  const dataSubscription = bridge?.on("data", (content) => terminal.value?.write(text(content)));
  if (dataSubscription) subscriptions.push(dataSubscription);
  const connectingSubscription = bridge?.on("connecting", (content) => {
    status.value = text(content, "Connecting…");
    terminal.value?.write(text(content));
  });
  if (connectingSubscription) subscriptions.push(connectingSubscription);
  const readySubscription = bridge?.on("ready", () => {
    status.value = `Connected · ${dbType.value}`;
    fitTerminal();
  });
  if (readySubscription) subscriptions.push(readySubscription);
  const errorSubscription = bridge?.on("error", (content) => {
    status.value = text(content, "Terminal request failed.");
    terminal.value?.write(`\r\n${status.value}\r\n`);
  });
  if (errorSubscription) subscriptions.push(errorSubscription);
  const closeSubscription = bridge?.on("close", () => {
    status.value = "Terminal closed.";
  });
  if (closeSubscription) subscriptions.push(closeSubscription);
  resizeObserver = typeof ResizeObserver === "undefined"
    ? undefined
    : new ResizeObserver(() => fitTerminal());
  if (resizeObserver && terminalContainer.value) resizeObserver.observe(terminalContainer.value);
  window.addEventListener("resize", fitTerminal);
  bridge?.emit("terminalConfig");
});

onBeforeUnmount(() => {
  bridge?.emit("closeTerminal");
  resizeObserver?.disconnect();
  window.removeEventListener("resize", fitTerminal);
  for (const subscription of subscriptions) subscription.dispose();
  terminal.value?.dispose();
  terminal.value = undefined;
  fitAddon.value = undefined;
});
</script>

<template>
  <section
    class="route-workspace xterm-view"
    :class="{ 'xterm-view--embedded': props.embedded }"
    data-route="xterm"
  >
    <header
      v-if="!props.embedded"
      class="route-workspace__header"
    >
      <div>
        <h1>Terminal</h1>
        <p class="route-workspace__subline">
          {{ dbType }} · {{ status }}
        </p>
      </div>
      <div class="route-workspace__actions">
        <VscButton
          type="default"
          @click="fitTerminal"
        >
          Fit
        </VscButton>
        <VscButton
          type="default"
          @click="clearTerminal"
        >
          Clear
        </VscButton>
      </div>
    </header>
    <div
      ref="terminalContainer"
      class="xterm-view__container"
      tabindex="0"
      aria-label="Terminal"
    />
  </section>
</template>
