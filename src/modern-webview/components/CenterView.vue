<script setup lang="ts">
import { computed, inject } from "vue";
import { useRoute, useRouter } from "vue-router";

import { WEBVIEW_BRIDGE_KEY } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import { createTranslator } from "../i18n";
import { targetLogoDark, targetLogoLight } from "../logoAssets";

interface CenterNavItem {
  readonly id: "util" | "image" | "console" | "plan";
  readonly label: string;
  readonly icon: string;
}

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const bootstrap = readWebviewBootstrap();
const translator = createTranslator(bootstrap.language);
const route = useRoute();
const router = useRouter();

const items = computed<CenterNavItem[]>(() => [
  {
    id: "util",
    label: translator.t("global.util", "Utilities"),
    icon: "codicon codicon-wand purple",
  },
  {
    id: "image",
    label: translator.t("util.imageTool", "Image tool"),
    icon: "codicon codicon-file-media blue",
  },
  {
    id: "console",
    label: translator.t("global.settings", "Settings"),
    icon: "codicon codicon-settings-gear",
  },
  {
    id: "plan",
    label: translator.t("global.plan", "Plan"),
    icon: "codicon codicon-package blue",
  },
]);

const userName = computed(() => {
  const user = bootstrap.state.user;
  if (!user || typeof user !== "object" || Array.isArray(user)) return "";
  const value = user as Record<string, unknown>;
  return String(value.nickName ?? value.name ?? value.email ?? "");
});

function navigate(item: CenterNavItem): void {
  bridge?.emit("routeChange", { page: item.id });
  void router.push({ name: item.id });
}

function openChangelog(): void {
  bridge?.emit(
    "open",
    "https://marketplace.visualstudio.com/items/cweijan.vscode-mysql-client2/changelog",
  );
}

function openLogin(): void {
  bridge?.emit("openLoginDialog");
}
</script>

<template>
  <div class="center-layout">
    <header class="navbar">
      <div class="navbar__inner">
        <a
          class="navbar__brand"
          href="#"
          @click.prevent="bridge?.emit('openSite', '/')"
        >
          <img
            class="logo logo-dark"
            :src="targetLogoDark"
            alt="Database Client"
          >
          <img
            class="logo logo-light"
            :src="targetLogoLight"
            alt="Database Client"
          >
        </a>
        <nav
          class="navbar__nav"
          role="navigation"
        >
          <button
            class="navbar__item navbar__item--external"
            type="button"
            @click="openChangelog"
          >
            <i
              class="codicon codicon-link-external navbar__icon"
              aria-hidden="true"
            />
            <span>{{ translator.t("global.changeLog", "Changelog") }}</span>
          </button>
          <button
            v-for="item in items"
            :key="item.id"
            class="navbar__item"
            :class="{ 'navbar__item--active': route.name === item.id }"
            type="button"
            @click="navigate(item)"
          >
            <i
              class="navbar__icon"
              :class="item.icon"
              aria-hidden="true"
            />
            <span>{{ item.label }}</span>
          </button>
        </nav>
        <div class="navbar__user">
          <button
            v-if="userName"
            class="navbar__item navbar__item--login"
            type="button"
            @click="openLogin"
          >
            <span class="navbar__avatar">{{ userName.slice(0, 1).toUpperCase() }}</span>
            <span>{{ userName }}</span>
          </button>
          <button
            v-else
            class="navbar__item navbar__item--login"
            type="button"
            @click="openLogin"
          >
            <i
              class="codicon codicon-account navbar__icon orange"
              aria-hidden="true"
            />
            <span>{{ translator.t("global.login", "Login") }}</span>
          </button>
        </div>
      </div>
    </header>
    <main class="center-main">
      <RouterView />
    </main>
  </div>
</template>
