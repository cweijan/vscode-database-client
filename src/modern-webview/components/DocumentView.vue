<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, ref } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import { buildDocumentationUrl, type DocumentationTheme } from "../document";

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const bootstrap = readWebviewBootstrap();
const frameSrc = ref("");
const errorMessage = ref("");
let resourceHostSubscription: BridgeDisposable | undefined;
let errorSubscription: BridgeDisposable | undefined;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

function currentTheme(): DocumentationTheme {
  return document.body.getAttribute("data-vscode-theme-kind") === "vscode-light"
    ? "light"
    : "dark";
}

function applyResourceHost(content: unknown): void {
  const payload = record(content);
  const host = typeof payload.host === "string" ? payload.host : "";
  const language = typeof payload.language === "string"
    ? payload.language
    : bootstrap.language;
  frameSrc.value = buildDocumentationUrl(host, language, currentTheme());
  errorMessage.value = frameSrc.value ? "" : "Documentation host is unavailable.";
}

function applyError(content: unknown): void {
  const payload = record(content);
  errorMessage.value = typeof payload.message === "string"
    ? payload.message
    : String(content ?? "Unable to load documentation.");
}

onMounted(() => {
  resourceHostSubscription = bridge?.on("resourceHost", applyResourceHost);
  errorSubscription = bridge?.on("error", applyError);
  bridge?.emit("resourceHost");
});

onBeforeUnmount(() => {
  resourceHostSubscription?.dispose();
  errorSubscription?.dispose();
});
</script>

<template>
  <section
    class="document-view"
    data-route="document"
  >
    <p
      v-if="errorMessage && !frameSrc"
      class="route-workspace__status"
      role="alert"
    >
      {{ errorMessage }}
    </p>
    <iframe
      v-if="frameSrc"
      class="document-view__frame"
      :src="frameSrc"
      title="Database Client documentation"
      referrerpolicy="no-referrer"
    />
  </section>
</template>
