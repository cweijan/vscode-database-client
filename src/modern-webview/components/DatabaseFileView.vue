<script setup lang="ts">
import { inject } from "vue";

import { WEBVIEW_BRIDGE_KEY } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import { createTranslator } from "../i18n";
import DatabaseFilePanel from "./DatabaseFilePanel.vue";

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const translator = createTranslator(readWebviewBootstrap().language);
</script>

<template>
  <div class="root-container flex mx-auto">
    <div class="connect-container max-lg:px-5">
      <header class="db-file-hero">
        <img
          src="icon.png"
          alt=""
          class="connect-logo"
          @click="bridge?.emit('openSite')"
        >
        <div class="db-file-hero__text">
          <h1>{{ translator.t("connect.title", "Database Client") }}</h1>
          <p>{{ translator.t("dbFile.description", "Connect a database file") }}</p>
        </div>
      </header>
      <DatabaseFilePanel />
    </div>
  </div>
</template>
