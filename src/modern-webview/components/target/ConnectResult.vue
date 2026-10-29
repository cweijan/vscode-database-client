<script setup lang="ts">
import { readWebviewBootstrap } from "../../bootstrap";
import { connectResult } from "../../connectState";
import { createTranslator } from "../../i18n";

const translator = createTranslator(readWebviewBootstrap().language);
</script>

<template>
  <section>
    <blockquote
      v-if="connectResult.error"
      class="p-3 mb-2 panel error"
    >
      <section class="panel__text pl-4">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <span v-html="connectResult.errorMessage" />
      </section>
    </blockquote>
    <blockquote
      v-if="connectResult.success"
      class="p-3 mb-2 panel success"
    >
      <section class="panel__text">
        <div class="mr-5 inline-block pl-2">
          {{ translator.t("connect.success", "Connected") }}
        </div>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <span v-html="connectResult.successMessage" />
      </section>
    </blockquote>
  </section>
</template>
