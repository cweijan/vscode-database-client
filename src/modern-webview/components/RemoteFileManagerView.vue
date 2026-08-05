<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import UiButton from "./UiButton.vue";
import UiInput from "./UiInput.vue";

interface RemoteEntry {
  readonly name: string;
  readonly path: string;
  readonly type: string;
  readonly size?: unknown;
  readonly modified?: unknown;
  readonly kind?: string;
}

interface RemoteConfig {
  readonly name?: string;
  readonly sftpDisabled?: boolean;
  readonly fsType?: string;
  readonly rootPath?: string;
  readonly currentPath?: string;
}

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const bootstrap = readWebviewBootstrap();
const initial = bootstrap.state as RemoteConfig;
const config = ref<RemoteConfig>(initial);
const currentPath = ref(initial.currentPath || "/");
const files = ref<RemoteEntry[]>([]);
const selected = ref<RemoteEntry>();
const newName = ref("");
const loading = ref(false);
const status = ref("");
let configSubscription: BridgeDisposable | undefined;
let fileListSubscription: BridgeDisposable | undefined;
let loadingSubscription: BridgeDisposable | undefined;
let resultSubscription: BridgeDisposable | undefined;
let errorSubscription: BridgeDisposable | undefined;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value);
}

function normalizeEntry(value: unknown): RemoteEntry | undefined {
  const item = record(value);
  const path = text(item.path).trim();
  const name = text(item.name || item.filename).trim();
  if (!path || !name) return undefined;
  const type = text(item.type || item.kind, "file").toLowerCase();
  return {
    name,
    path,
    type: type === "directory" || type === "dir" ? "directory" : "file",
    size: item.size,
    modified: item.modified || item.mtime,
    kind: text(item.kind || item.type),
  };
}

function applyConfig(content: unknown): void {
  const next = record(content) as RemoteConfig;
  config.value = { ...config.value, ...next };
  if (typeof next.currentPath === "string") currentPath.value = next.currentPath;
}

function applyFileList(content: unknown): void {
  const payload = record(content);
  const nextPath = text(payload.path);
  if (nextPath) currentPath.value = nextPath;
  files.value = (Array.isArray(payload.files) ? payload.files : [])
    .map(normalizeEntry)
    .filter((item): item is RemoteEntry => Boolean(item));
  selected.value = undefined;
}

function emit(type: string, content?: unknown): void {
  bridge?.emit(type, content);
}

function load(path = currentPath.value): void {
  emit("load", { path });
}

function parentPath(): string {
  if (currentPath.value === "/") return "/";
  const parent = currentPath.value.replace(/\/+$/, "").split("/").slice(0, -1).join("/");
  return parent || "/";
}

function selectEntry(entry: RemoteEntry): void {
  selected.value = entry;
  newName.value = entry.name;
}

function openEntry(entry: RemoteEntry): void {
  emit("openFile", { item: entry });
}

function create(kind: "createFile" | "createFolder"): void {
  const name = newName.value.trim();
  if (!name) {
    status.value = "A remote name is required.";
    return;
  }
  emit(kind, { path: currentPath.value, name });
  newName.value = "";
}

function rename(): void {
  const item = selected.value;
  const name = newName.value.trim();
  if (!item || !name) return;
  emit("rename", { item, newName: name });
}

function remove(): void {
  if (!selected.value) return;
  emit("delete", { item: selected.value });
}

const canMutate = computed(() => Boolean(config.value && !config.value.sftpDisabled));

onMounted(() => {
  configSubscription = bridge?.on("config", applyConfig);
  fileListSubscription = bridge?.on("fileList", applyFileList);
  loadingSubscription = bridge?.on("loading", (content) => { loading.value = Boolean(content); });
  resultSubscription = bridge?.on("result", (content) => {
    const action = text(record(content).action || content);
    if (action) status.value = `Completed: ${action}`;
  });
  errorSubscription = bridge?.on("error", (content) => {
    status.value = text(record(content).message || content, "Remote file action failed.");
  });
  bridge?.init("fileManager");
});

onBeforeUnmount(() => {
  configSubscription?.dispose();
  fileListSubscription?.dispose();
  loadingSubscription?.dispose();
  resultSubscription?.dispose();
  errorSubscription?.dispose();
});
</script>

<template>
  <section
    class="route-workspace remote-file-manager-view"
    data-route="fileManager"
  >
    <header class="route-workspace__header">
      <div>
        <h1>{{ config.name || "Remote files" }}</h1>
        <p class="route-workspace__subline">
          {{ config.fsType || "remote" }} · {{ currentPath }}
        </p>
      </div>
      <div class="route-workspace__actions">
        <UiButton
          type="button"
          @click="load()"
        >
          Refresh
        </UiButton>
        <UiButton
          type="button"
          variant="default"
          :disabled="currentPath === '/'"
          @click="load(parentPath())"
        >
          Parent
        </UiButton>
      </div>
    </header>

    <div class="route-workbench__toolbar">
      <UiInput
        v-model="currentPath"
        label="Path"
      />
      <UiButton
        type="button"
        @click="load()"
      >
        Load path
      </UiButton>
    </div>

    <div class="connection-view__grid">
      <UiInput
        v-model="newName"
        label="New name"
        placeholder="File or folder name"
      />
      <div class="route-workspace__actions">
        <UiButton
          type="button"
          :disabled="!canMutate"
          @click="create('createFile')"
        >
          New file
        </UiButton>
        <UiButton
          type="button"
          :disabled="!canMutate"
          @click="create('createFolder')"
        >
          New folder
        </UiButton>
        <UiButton
          type="button"
          :disabled="!canMutate || !selected"
          @click="rename"
        >
          Rename
        </UiButton>
        <UiButton
          type="button"
          variant="danger"
          :disabled="!canMutate || !selected"
          @click="remove"
        >
          Delete
        </UiButton>
        <UiButton
          type="button"
          :disabled="!canMutate"
          @click="emit('upload', { path: currentPath })"
        >
          Upload
        </UiButton>
        <UiButton
          type="button"
          :disabled="!selected || selected.type === 'directory'"
          @click="emit('download', { item: selected })"
        >
          Download
        </UiButton>
      </div>
    </div>

    <p
      v-if="loading"
      class="route-workspace__status"
    >
      Loading {{ currentPath }}…
    </p>
    <p
      v-else-if="config.sftpDisabled"
      class="route-workspace__status"
    >
      Remote file access is disabled for this connection.
    </p>
    <p
      v-if="status"
      class="route-workspace__status"
    >
      {{ status }}
    </p>

    <div class="result-view__table-wrap">
      <table class="result-view__table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Size</th>
            <th>Modified</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="entry in files"
            :key="entry.path"
            :data-selected="selected?.path === entry.path"
            @click="selectEntry(entry)"
            @dblclick="openEntry(entry)"
          >
            <td>{{ entry.name }}</td>
            <td>{{ entry.type }}</td>
            <td>{{ entry.size ?? "-" }}</td>
            <td>{{ entry.modified ?? "-" }}</td>
            <td>
              <UiButton
                type="button"
                variant="default"
                @click.stop="openEntry(entry)"
              >
                Open
              </UiButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
