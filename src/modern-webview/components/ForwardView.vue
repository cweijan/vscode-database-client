<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import UiButton from "./UiButton.vue";
import UiInput from "./UiInput.vue";
import UiSelect from "./UiSelect.vue";

type ForwardType = "Local" | "Remote" | "Dynamic";
type ForwardState = 0 | 1 | 2;

interface ForwardEntry {
  id?: string | number | null;
  name: string;
  type: ForwardType;
  autoStartUp: boolean;
  keepAlive: boolean;
  localHost: string;
  localPort: string;
  remoteHost: string;
  remotePort: string;
  state: ForwardState;
  loading: boolean;
}

interface ServerEntry {
  key: string;
  name: string;
  host: string;
  count: number;
}

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const bootstrap = readWebviewBootstrap();
const servers = ref<ServerEntry[]>([]);
const entries = ref<ForwardEntry[]>([]);
const selectedServerKey = ref(stringValue(bootstrap.state.serverKey));
const selectedServerName = ref(stringValue(bootstrap.state.name));
const showServerManager = ref(false);
const editorVisible = ref(false);
const status = ref("");
const error = ref("");
const editorError = ref("");
const editing = reactive<ForwardEntry>(createDraft());
const subscriptions: BridgeDisposable[] = [];

const selectedServer = computed(() =>
  servers.value.find((server) => server.key === selectedServerKey.value),
);

const selectedEntries = computed(() => entries.value);

const serverSummary = computed(() => {
  const server = selectedServer.value;
  if (server) return `${server.name} · ${server.host}`;
  return selectedServerName.value || selectedServerKey.value || "No SSH server selected";
});

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value);
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stateValue(value: unknown): ForwardState {
  if (value === 1 || value === "1" || value === "running") return 1;
  if (value === 2 || value === "2" || value === "alreadyUsed") return 2;
  return 0;
}

function forwardType(value: unknown): ForwardType {
  return value === "Remote" || value === "Dynamic" ? value : "Local";
}

function createDraft(): ForwardEntry {
  return {
    name: "",
    type: "Local",
    autoStartUp: false,
    keepAlive: true,
    localHost: "127.0.0.1",
    localPort: "",
    remoteHost: "127.0.0.1",
    remotePort: "",
    state: 0,
    loading: false,
  };
}

function normalizeEntry(value: unknown): ForwardEntry {
  const input = record(value);
  return {
    id: input.id as string | number | null | undefined,
    name: stringValue(input.name),
    type: forwardType(input.type),
    autoStartUp: booleanValue(input.autoStartUp, false),
    keepAlive: booleanValue(input.keepAlive, true),
    localHost: stringValue(input.localHost, "127.0.0.1"),
    localPort: stringValue(input.localPort),
    remoteHost: stringValue(input.remoteHost, "127.0.0.1"),
    remotePort: stringValue(input.remotePort),
    state: stateValue(input.state ?? input.status),
    loading: false,
  };
}

function normalizeServer(value: unknown): ServerEntry | undefined {
  const input = record(value);
  const key = stringValue(input.key);
  if (!key) return undefined;
  return {
    key,
    name: stringValue(input.name, key),
    host: stringValue(input.host),
    count: Number(input.count) || 0,
  };
}

function messageText(value: unknown, fallback = ""): string {
  const input = record(value);
  return stringValue(input.message ?? input.error ?? value, fallback);
}

function subscribe(type: string, handler: (content: unknown) => void): void {
  const subscription = bridge?.on(type, handler);
  if (subscription) subscriptions.push(subscription);
}

function emit(type: string, content?: unknown): void {
  bridge?.emit(type, content);
}

function reload(): void {
  error.value = "";
  emit("reloadForward");
}

function selectServer(key: string): void {
  selectedServerKey.value = key;
  const server = servers.value.find((item) => item.key === key);
  selectedServerName.value = server?.name || key;
  showServerManager.value = false;
  emit("selectServer", key);
}

function persistentEntry(entry: ForwardEntry): Record<string, unknown> {
  return {
    id: entry.id,
    name: entry.name,
    type: entry.type,
    autoStartUp: entry.autoStartUp,
    keepAlive: entry.keepAlive,
    localHost: entry.localHost,
    localPort: entry.localPort,
    remoteHost: entry.remoteHost,
    remotePort: entry.remotePort,
  };
}

function openNew(): void {
  Object.assign(editing, createDraft());
  editorError.value = "";
  editorVisible.value = true;
}

function openEdit(entry: ForwardEntry): void {
  Object.assign(editing, normalizeEntry(entry));
  editorError.value = "";
  editorVisible.value = true;
}

function closeEditor(): void {
  editorVisible.value = false;
  editorError.value = "";
}

function saveEditor(): void {
  if (!editing.localPort) {
    editorError.value = "Local port is required.";
    return;
  }
  if (editing.type !== "Dynamic" && !editing.remoteHost) {
    editorError.value = "Remote host is required for local and remote forwarding.";
    return;
  }
  if (editing.type !== "Dynamic" && !editing.remotePort) {
    editorError.value = "Remote port is required for local and remote forwarding.";
    return;
  }
  error.value = "";
  emit(editing.id == null ? "add" : "save", {
    info: persistentEntry(editing),
    serverKey: selectedServerKey.value,
  });
}

function patchEntry(entry: ForwardEntry): void {
  emit("patch", {
    info: persistentEntry(entry),
    serverKey: selectedServerKey.value,
  });
}

function startEntry(entry: ForwardEntry): void {
  entry.loading = true;
  emit("start", entry.id);
}

function stopEntry(entry: ForwardEntry): void {
  emit("stop", entry.id);
}

function removeEntry(entry: ForwardEntry): void {
  if (entry.id == null || !window.confirm(`Delete forwarding ${entry.name || routeText(entry)}?`)) {
    return;
  }
  emit("remove", { id: entry.id, serverKey: selectedServerKey.value });
}

function routeText(entry: ForwardEntry): string {
  const local = `${entry.localHost || "127.0.0.1"}:${entry.localPort || "*"}`;
  if (entry.type === "Dynamic") return `${local} · SOCKS5`;
  const remote = `${entry.remoteHost || "127.0.0.1"}:${entry.remotePort || "*"}`;
  return entry.type === "Remote" ? `${remote} → ${local}` : `${local} → ${remote}`;
}

function typeLabel(type: ForwardType): string {
  return type === "Dynamic" ? "Dynamic SOCKS5" : `${type} forwarding`;
}

function stateLabel(state: ForwardState): string {
  if (state === 1) return "Running";
  if (state === 2) return "Port already used";
  return "Stopped";
}

onMounted(() => {
  subscribe("serverList", (content) => {
    servers.value = Array.isArray(content)
      ? content.map(normalizeServer).filter((item): item is ServerEntry => Boolean(item))
      : [];
  });
  subscribe("serverKey", (content) => {
    selectedServerKey.value = stringValue(content, selectedServerKey.value);
  });
  subscribe("name", (content) => {
    selectedServerName.value = stringValue(content, selectedServerName.value);
  });
  subscribe("forwardList", (content) => {
    entries.value = Array.isArray(content) ? content.map(normalizeEntry) : [];
    status.value = "";
  });
  subscribe("success", (content) => {
    status.value = messageText(content, "Port forwarding updated.");
    editorVisible.value = false;
    reload();
  });
  subscribe("importResult", (content) => {
    status.value = messageText(content, "Forwarding configuration imported.");
    reload();
  });
  subscribe("error", (content) => {
    const input = record(content);
    const id = input.id;
    if (id != null) {
      const entry = entries.value.find((item) => String(item.id) === String(id));
      if (entry) entry.loading = false;
    }
    error.value = messageText(content, "Port forwarding action failed.");
    status.value = "";
  });
  bridge?.init("forward");
});

onBeforeUnmount(() => {
  for (const subscription of subscriptions) subscription.dispose();
});
</script>

<template>
  <section
    class="route-workspace forward-view"
    data-route="forward"
  >
    <header class="route-workspace__header">
      <div>
        <h1>Port forwarding</h1>
        <p class="route-workspace__subline">
          {{ serverSummary }} · {{ selectedEntries.length }} forwarding rule(s)
        </p>
      </div>
      <div class="route-workspace__actions">
        <UiButton
          type="button"
          variant="default"
          @click="showServerManager = !showServerManager"
        >
          {{ showServerManager ? "Forwarding rules" : "SSH servers" }}
        </UiButton>
        <UiButton
          type="button"
          variant="default"
          @click="reload"
        >
          Refresh
        </UiButton>
        <UiButton
          type="button"
          @click="openNew"
        >
          Add rule
        </UiButton>
      </div>
    </header>

    <p
      v-if="status"
      class="route-workspace__status"
      aria-live="polite"
    >
      {{ status }}
    </p>
    <p
      v-if="error"
      class="route-workspace__error"
      role="alert"
    >
      {{ error }}
    </p>

    <section
      v-if="showServerManager"
      class="forward-view__server-panel"
    >
      <div class="forward-view__section-title">
        <h2>SSH servers</h2>
        <div class="route-workspace__actions">
          <span class="route-workspace__subline">Select a server to manage its rules.</span>
          <UiButton
            type="button"
            variant="default"
            @click="emit('exportConfig')"
          >
            Export config
          </UiButton>
          <UiButton
            type="button"
            variant="default"
            @click="emit('importConfig', { type: 'merge' })"
          >
            Import config
          </UiButton>
        </div>
      </div>
      <div
        v-if="servers.length > 0"
        class="result-view__table-wrap"
      >
        <table class="result-view__table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Host</th>
              <th>Rules</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="server in servers"
              :key="server.key"
              :class="{ 'forward-view__selected-row': server.key === selectedServerKey }"
            >
              <td>{{ server.name }}</td>
              <td>{{ server.host || "-" }}</td>
              <td>{{ server.count }}</td>
              <td>
                <UiButton
                  type="button"
                  variant="default"
                  @click="selectServer(server.key)"
                >
                  Manage
                </UiButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p
        v-else
        class="route-workspace__empty"
      >
        No SSH or SFTP server is available.
      </p>
    </section>

    <form
      v-if="editorVisible"
      class="forward-view__editor"
      @submit.prevent="saveEditor"
    >
      <div class="forward-view__section-title">
        <h2>{{ editing.id == null ? "Add forwarding rule" : "Edit forwarding rule" }}</h2>
        <span class="route-workspace__subline">{{ serverSummary }}</span>
      </div>
      <div class="connection-view__grid">
        <UiSelect
          :model-value="editing.type"
          label="Type"
          :options="[
            { value: 'Local', label: 'Local' },
            { value: 'Remote', label: 'Remote' },
            { value: 'Dynamic', label: 'Dynamic SOCKS5' },
          ]"
          @update:model-value="editing.type = forwardType($event)"
        />
        <UiInput
          v-model="editing.name"
          label="Name"
          placeholder="Optional rule name"
        />
        <UiInput
          v-model="editing.localHost"
          label="Local host"
          placeholder="127.0.0.1"
        />
        <UiInput
          v-model="editing.localPort"
          label="Local port"
          :placeholder="editing.type === 'Dynamic' ? '1080' : 'Required'"
          type="number"
        />
        <template v-if="editing.type !== 'Dynamic'">
          <UiInput
            v-model="editing.remoteHost"
            label="Remote host"
            placeholder="127.0.0.1"
          />
          <UiInput
            v-model="editing.remotePort"
            label="Remote port"
            placeholder="Required"
            type="number"
          />
        </template>
      </div>
      <div class="forward-view__editor-options">
        <label class="forward-view__checkbox">
          <input
            v-model="editing.keepAlive"
            type="checkbox"
          >
          Keep alive
        </label>
        <label class="forward-view__checkbox">
          <input
            v-model="editing.autoStartUp"
            type="checkbox"
          >
          Start automatically
        </label>
      </div>
      <p
        v-if="editing.type !== 'Local'"
        class="route-workspace__subline"
      >
        {{ typeLabel(editing.type) }} is retained in the source protocol; its adapter must be available before it can be started.
      </p>
      <p
        v-if="editorError"
        class="route-workspace__error"
        role="alert"
      >
        {{ editorError }}
      </p>
      <div class="route-workspace__actions">
        <UiButton
          type="submit"
          variant="primary"
        >
          Save rule
        </UiButton>
        <UiButton
          type="button"
          variant="default"
          @click="closeEditor"
        >
          Cancel
        </UiButton>
      </div>
    </form>

    <section
      v-if="!showServerManager"
      class="forward-view__rules"
    >
      <div
        v-if="selectedEntries.length > 0"
        class="result-view__table-wrap"
      >
        <table class="result-view__table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Route</th>
              <th>Keep alive</th>
              <th>Auto-start</th>
              <th>State</th>
              <th>Operation</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="entry in selectedEntries"
              :key="String(entry.id ?? routeText(entry))"
            >
              <td>{{ entry.name || routeText(entry) }}</td>
              <td>{{ typeLabel(entry.type) }}</td>
              <td><code>{{ routeText(entry) }}</code></td>
              <td>
                <input
                  v-model="entry.keepAlive"
                  type="checkbox"
                  @change="patchEntry(entry)"
                >
              </td>
              <td>
                <input
                  v-model="entry.autoStartUp"
                  type="checkbox"
                  @change="patchEntry(entry)"
                >
              </td>
              <td>
                <span
                  class="forward-view__state"
                  :class="`forward-view__state--${entry.state}`"
                >
                  {{ stateLabel(entry.state) }}
                </span>
              </td>
              <td>
                <div class="forward-view__row-actions">
                  <UiButton
                    v-if="entry.state !== 1"
                    type="button"
                    :disabled="entry.loading"
                    @click="startEntry(entry)"
                  >
                    Start
                  </UiButton>
                  <UiButton
                    v-else
                    type="button"
                    variant="default"
                    @click="stopEntry(entry)"
                  >
                    Stop
                  </UiButton>
                  <UiButton
                    type="button"
                    variant="default"
                    @click="openEdit(entry)"
                  >
                    Edit
                  </UiButton>
                  <UiButton
                    type="button"
                    variant="danger"
                    @click="removeEntry(entry)"
                  >
                    Delete
                  </UiButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p
        v-else
        class="route-workspace__empty"
      >
        No forwarding rule is configured for this server.
      </p>
    </section>
  </section>
</template>
