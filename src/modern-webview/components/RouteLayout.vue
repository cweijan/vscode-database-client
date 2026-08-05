<script setup lang="ts">
import { useRoute } from "vue-router";

const route = useRoute();
</script>

<template>
  <section class="route-layout">
    <RouterView
      v-if="route.name !== 'main' && route.name !== 'center'"
    />
    <p
      v-else
      class="route-layout__empty"
    >
      Select a database-client view.
    </p>
  </section>
</template>
