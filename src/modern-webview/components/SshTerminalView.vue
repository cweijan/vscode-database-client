<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, ref } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import UiButton from "./UiButton.vue";
import UiInput from "./UiInput.vue";

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const command = ref("");
const output = ref("");
const status = ref("Connecting…");
let dataSubscription: BridgeDisposable | undefined;
let readySubscription: BridgeDisposable | undefined;
let closeSubscription: BridgeDisposable | undefined;
let errorSubscription: BridgeDisposable | undefined;

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function send(): void {
  const value = command.value;
  if (!value.trim()) return;
  bridge?.emit("input", value.endsWith("\n") ? value : `${value}\n`);
  command.value = "";
}

onMounted(() => {
  dataSubscription = bridge?.on("data", (content) => { output.value += text(content); });
  readySubscription = bridge?.on("ready", (content) => {
    status.value = `Connected${content && typeof content === "object" && "connection" in content
      ? ` to ${text((content as { connection?: unknown }).connection)}`
      : ""}.`;
  });
  closeSubscription = bridge?.on("close", () => { status.value = "Terminal closed."; });
  errorSubscription = bridge?.on("error", (content) => { status.value = text(content) || "Terminal request failed."; });
  bridge?.emit("initTerminal");
});

onBeforeUnmount(() => {
  dataSubscription?.dispose();
  readySubscription?.dispose();
  closeSubscription?.dispose();
  errorSubscription?.dispose();
  bridge?.emit("closeTerminal");
});
</script>

<template>
  <section
    class="route-workspace ssh-terminal-view"
    data-route="sshTerminal"
  >
    <header class="route-workspace__header">
      <div>
        <h1>SSH terminal</h1>
        <p class="route-workspace__subline">
          {{ status }}
        </p>
      </div>
      <UiButton
        type="button"
        variant="default"
        @click="output = ''"
      >
        Clear
      </UiButton>
    </header>

    <pre class="ssh-terminal-view__output">{{ output || "Waiting for terminal output…" }}</pre>
    <div class="route-workbench__toolbar">
      <UiInput
        v-model="command"
        label="Command"
        placeholder="ls -la"
      />
      <UiButton
        type="button"
        @click="send"
      >
        Send
      </UiButton>
    </div>
  </section>
</template>
