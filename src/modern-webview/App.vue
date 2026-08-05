<script setup lang="ts">
import { onBeforeUnmount, onMounted, provide, ref } from "vue";
import { useRouter } from "vue-router";

import {
  createWebviewBridge,
  WEBVIEW_BRIDGE_KEY,
  type BridgeDisposable,
} from "./bridge";
import { readWebviewBootstrap } from "./bootstrap";
import StatusBanner from "./components/StatusBanner.vue";
import { createTranslator } from "./i18n";
import { normalizeRouteName, routeLocation } from "./router";
import { WebviewStateStore } from "./state";

const bootstrap = readWebviewBootstrap();
const bridge = createWebviewBridge();
const router = useRouter();
const state = new WebviewStateStore(bridge);
if (Object.keys(bootstrap.state).length > 0 && !state.has("page")) {
  state.replace(bootstrap.state);
}
const translator = createTranslator(
  state.get("language", bootstrap.language),
);
const lastMessage = ref(translator.t("webview.waiting"));
const routeError = ref<string | undefined>();
let messageSubscription: BridgeDisposable | undefined;
let routeSubscription: BridgeDisposable | undefined;
let stateSubscription: BridgeDisposable | undefined;
const removeRouteHook = router.afterEach((route) => {
  const name = normalizeRouteName(route.name);
  if (name) {
    state.update("page", name);
    bridge.emit(`route-${name}`);
  }
});

provide(WEBVIEW_BRIDGE_KEY, bridge);

async function goToRoute(content: unknown): Promise<void> {
  const routeName = normalizeRouteName(content);
  const target = routeLocation(content);
  if (!target || !routeName) {
    routeError.value = `Unknown Webview route: ${String(content)}`;
    return;
  }
  routeError.value = undefined;
  if (router.currentRoute.value.name === routeName) {
    bridge.emit(`route-${routeName}`);
    return;
  }
  await router.push(target);
}

onMounted(() => {
  messageSubscription = bridge.onAny((_content, message) => {
    lastMessage.value = message.type;
  });
  routeSubscription = bridge.on("route", (content) => {
    void goToRoute(content);
  });
  stateSubscription = bridge.on("setState", (content) => {
    if (content && typeof content === "object") {
      state.replace(content as Record<string, unknown>);
    }
  });
  bridge.emit("init");
  void goToRoute(bootstrap.route ?? state.get("page", "main"));
});

onBeforeUnmount(() => {
  messageSubscription?.dispose();
  routeSubscription?.dispose();
  stateSubscription?.dispose();
  removeRouteHook();
  bridge.dispose();
});
</script>

<template>
  <main
    class="modern-shell"
    data-testid="modern-webview-shell"
  >
    <div class="modern-shell__diagnostics">
      <StatusBanner
        v-if="routeError"
        kind="error"
        :message="routeError"
      />
      <StatusBanner
        v-else
        :message="translator.t('webview.waiting', lastMessage)"
      />
      <output aria-live="polite">Last host message: {{ lastMessage }}</output>
    </div>
    <RouterView />
  </main>
</template>
