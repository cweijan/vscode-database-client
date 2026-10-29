<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, ref } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import { buildDocumentationUrl, type DocumentationTheme } from "../document";

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const bootstrap = readWebviewBootstrap();
const frameSrc = ref("");
let resourceHostSubscription: BridgeDisposable | undefined;

function currentTheme(): DocumentationTheme {
  return document.body.getAttribute("data-vscode-theme-kind") === "vscode-light"
    ? "light"
    : "dark";
}

function applyResourceHost(content: unknown): void {
  if (!content || typeof content !== "object") return;
  const payload = content as { host?: unknown; language?: unknown };
  const host = typeof payload.host === "string" ? payload.host : "";
  const language = typeof payload.language === "string" ? payload.language : bootstrap.language;
  frameSrc.value = buildDocumentationUrl(host, language, currentTheme());
}

onMounted(() => {
  resourceHostSubscription = bridge?.on("resourceHost", applyResourceHost);
  bridge?.emit("resourceHost");
});

onBeforeUnmount(() => {
  resourceHostSubscription?.dispose();
});
</script>

<template>
  <div class="document-container">
    <iframe
      :src="frameSrc"
      title="description"
      style="width: 100%; height: 100%"
    />
  </div>
</template>
