<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

import CenterView from "./CenterView.vue";
import MainView from "./MainView.vue";

const route = useRoute();
const isCenter = computed(() => route.path.startsWith("/center"));
</script>

<template>
  <section v-if="isCenter" class="center-layout">
    <CenterView />
    <main class="center-main">
      <RouterView v-if="route.name !== 'center'" />
    </main>
  </section>
  <section v-else class="route-layout">
    <MainView />
    <RouterView v-if="route.name !== 'main'" />
  </section>
</template>
