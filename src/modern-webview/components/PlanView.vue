<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import UiInput from "./UiInput.vue";

interface CloudUser {
  email?: string;
  expireTime?: number | string;
  nickName?: string;
  token?: string;
  [key: string]: unknown;
}

interface LoginResult {
  errMsg?: string;
}

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const user = ref<CloudUser>();
const email = ref("");
const appName = ref("Database Client");
const syncKey = ref("");
const license = ref("");
const status = ref("");
const loginVisible = ref(false);
const login = reactive({ email: "", password: "" });
let subscriptions: BridgeDisposable[] = [];

const isPremium = computed(() => {
  const expireTime = Number(user.value?.expireTime);
  return Number.isFinite(expireTime) && expireTime > Date.now();
});

function applyUser(content: unknown): void {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    user.value = undefined;
    return;
  }
  user.value = content as CloudUser;
  email.value = String(user.value.email || email.value);
}

function messageText(content: unknown, fallback: string): string {
  if (content && typeof content === "object" && !Array.isArray(content)) {
    const message = (content as { message?: unknown }).message;
    if (message) return String(message);
  }
  return content ? String(content) : fallback;
}

function applyLoginResult(content: unknown): void {
  const result = content && typeof content === "object"
    ? content as LoginResult
    : {};
  status.value = result.errMsg || "Signed in successfully.";
  if (!result.errMsg) loginVisible.value = false;
}

function submitLogin(): void {
  status.value = "Signing in…";
  bridge?.emit("login", { email: login.email, password: login.password });
}

function activateLicense(): void {
  const value = license.value.trim();
  if (!value) {
    status.value = "Paste a license before activating it.";
    return;
  }
  status.value = "Activating license…";
  bridge?.emit("license", value);
}

function copyMachineId(): void {
  status.value = "Machine ID copied.";
  bridge?.emit("copyMachineId");
}

function openDocumentation(): void {
  bridge?.emit("openSite", "#/document");
}

function openPricing(): void {
  bridge?.emit("openSite", "pricing");
}

onMounted(() => {
  subscriptions = [
    bridge?.on("user", applyUser),
    bridge?.on("email", (content) => { email.value = String(content || ""); }),
    bridge?.on("appName", (content) => { appName.value = String(content || "Database Client"); }),
    bridge?.on("syncKey", (content) => { syncKey.value = String(content || ""); }),
    bridge?.on("boundLicense", () => { status.value = "License activated."; }),
    bridge?.on("loginRes", applyLoginResult),
    bridge?.on("error", (content) => { status.value = messageText(content, "Cloud operation failed."); }),
  ].filter((item): item is BridgeDisposable => Boolean(item));
  bridge?.init("plan");
});

onBeforeUnmount(() => {
  for (const subscription of subscriptions) subscription.dispose();
});
</script>

<template>
  <section
    class="route-workspace plan-view"
    data-route="plan"
  >
    <header class="route-workspace__header">
      <div>
        <h1>{{ appName }} Plan</h1>
        <p class="route-workspace__subline">
          Account and license management for the Database Client extension.
        </p>
      </div>
      <div class="route-workspace__actions">
        <VscButton
          v-if="!user"
          @click="loginVisible = !loginVisible"
        >
          {{ loginVisible ? "Close login" : "Login" }}
        </VscButton>
        <VscButton
          type="default"
          @click="openDocumentation"
        >
          Documentation
        </VscButton>
      </div>
    </header>

    <div class="plan-view__grid">
      <article class="plan-view__card">
        <h2>Free</h2>
        <p>Use the core database connection, query and tree features.</p>
        <p class="plan-view__value">
          {{ user ? (user.nickName || user.email || "Signed-in account") : "Not signed in" }}
        </p>
      </article>
      <article class="plan-view__card plan-view__card--premium">
        <h2>Premium</h2>
        <p>Unlock premium export, cloud and advanced productivity features.</p>
        <p class="plan-view__value">
          {{ isPremium ? "Active" : "Available to purchase" }}
        </p>
        <VscButton
          @click="openPricing"
        >
          View plans
        </VscButton>
      </article>
    </div>

    <form
      v-if="loginVisible"
      class="plan-view__panel"
      @submit.prevent="submitLogin"
    >
      <h2>Sign in</h2>
      <UiInput
        v-model="login.email"
        label="Email"
        type="email"
      />
      <UiInput
        v-model="login.password"
        label="Password"
        type="password"
      />
      <VscButton type="submit">
        Sign in
      </VscButton>
    </form>

    <section class="plan-view__panel">
      <div class="route-workspace__header">
        <div>
          <h2>Offline license</h2>
          <p class="route-workspace__subline">
            Activate a signed license on this VS Code machine.
          </p>
        </div>
        <VscButton
          type="default"
          @click="copyMachineId"
        >
          Copy machine ID
        </VscButton>
      </div>
      <textarea
        v-model="license"
        class="vsc-input plan-view__license"
        placeholder="Paste your license here"
        spellcheck="false"
      />
      <VscButton
        @click="activateLicense"
      >
        Activate
      </VscButton>
    </section>

    <p
      v-if="email || syncKey || status"
      class="route-workspace__status"
    >
      {{ status || (email ? `Account: ${email}` : `Sync key: ${syncKey || "not configured"}`) }}
    </p>
  </section>
</template>
