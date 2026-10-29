<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import { createTranslator } from "../i18n";
import {
  boundRemotePath,
  normalizeRemotePath,
  parentRemotePath,
} from "../../modern/remote/remotePaths";
import {
  remoteContextMenuItems,
  remoteEntryTypeRank,
  type RemoteContextMenuAction,
  type RemoteFileEntryType,
  type RemoteMenuEntry,
} from "../remoteFileManagerPresentation";

interface RemoteEntry extends RemoteMenuEntry {
  readonly type: RemoteFileEntryType;
  readonly size?: unknown;
  readonly modified?: unknown;
  readonly mtime?: unknown;
  readonly owner?: unknown;
  readonly linkTarget?: unknown;
  readonly kind?: string;
  readonly icon?: string;
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
const translator = createTranslator(bootstrap.language);
const initial = bootstrap.state as RemoteConfig;
const config = ref<RemoteConfig>(initial);
const currentPath = ref(initial.currentPath || "/");
const files = ref<RemoteEntry[]>([]);
const selected = ref<RemoteEntry>();
const loading = ref(false);
const status = ref("");
const sortBy = ref("name");
const sortDescending = ref(false);
const contextMenu = ref<{
  readonly x: number;
  readonly y: number;
  readonly entry?: RemoteEntry;
  readonly restricted: boolean;
}>();
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
    type: type === "directory" || type === "dir"
      ? "directory"
      : type === "link"
        ? "link"
        : type === "other" ? "other" : "file",
    size: item.size,
    modified: item.modified || item.mtime,
    mtime: item.mtime || item.modified,
    owner: item.owner,
    linkTarget: item.linkTarget || item.target,
    kind: text(item.kind || item.type),
    icon: typeof item.icon === "string" ? item.icon : undefined,
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
  const root = normalizeRemotePath(config.value.rootPath || "/");
  return boundRemotePath(parentRemotePath(currentPath.value), root);
}

function selectEntry(entry: RemoteEntry): void {
  selected.value = entry;
}

function openEntry(entry: RemoteEntry): void {
  emit("openFile", { item: entry });
}

function create(kind: "createFile" | "createFolder"): void {
  const name = window.prompt(
    kind === "createFolder"
      ? translator.t("fileManager.newFolder", "New folder")
      : translator.t("fileManager.newFile", "New file"),
    "",
  )?.trim() || "";
  if (!name) {
    status.value = "A remote name is required.";
    return;
  }
  emit(kind, { path: currentPath.value, name });
}

function remove(item = selected.value): void {
  if (!item) return;
  emit("delete", { item });
}

const canMutate = computed(() => Boolean(config.value && !config.value.sftpDisabled));
const atRoot = computed(() => currentPath.value === normalizeRemotePath(config.value.rootPath || "/"));
const fileColumns = computed(() => [
  { key: "name", label: translator.t("common.name", "Name") },
  { key: "size", label: translator.t("fileManager.size", "Size") },
  { key: "mtime", label: translator.t("fileManager.modified", "Modified") },
  { key: "type", label: translator.t("fileManager.kind", "Type") },
  { key: "owner", label: translator.t("fileManager.owner", "Owner") },
] as const);
const sortedFiles = computed(() => {
  const values = [...files.value];
  values.sort((left, right) => {
    let result = remoteEntryTypeRank(left.type) - remoteEntryTypeRank(right.type);
    if (result !== 0) return sortDescending.value ? -result : result;
    if (sortBy.value === "size") {
      result = Number(left.size || 0) - Number(right.size || 0);
    } else if (sortBy.value === "mtime") {
      result = sortableTime(left.mtime) - sortableTime(right.mtime);
    } else if (sortBy.value === "type") {
      result = entryKind(left).localeCompare(entryKind(right));
    } else if (sortBy.value === "owner") {
      result = String(left.owner || "").localeCompare(String(right.owner || ""));
    } else {
      result = left.name.localeCompare(right.name);
    }
    if (result === 0) result = left.name.localeCompare(right.name);
    return sortDescending.value ? -result : result;
  });
  return values;
});
const breadcrumbs = computed(() => {
  const root = normalizeRemotePath(config.value.rootPath || "/");
  const current = boundRemotePath(currentPath.value, root);
  const rootParts = root.split("/").filter(Boolean);
  const currentParts = current.split("/").filter(Boolean);
  const items = [{ name: root === "/" ? "/" : root, path: root }];
  let pathValue = root;
  for (let index = rootParts.length; index < currentParts.length; index += 1) {
    const name = currentParts[index];
    pathValue = `${pathValue.replace(/\/$/, "")}/${name}`;
    items.push({ name, path: pathValue });
  }
  return items;
});

function displaySize(entry: RemoteEntry): string {
  if (entry.type !== "file") return "--";
  const size = Number(entry.size || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function displayDate(value: unknown): string {
  if (!value) return "--";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "--";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function displayTime(value: unknown): string {
  if (!value) return "--";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "--";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function sortableTime(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric !== 0) return numeric;
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function entryKind(entry: RemoteEntry): string {
  if (entry.type === "directory") return "folder";
  if (entry.type === "link") return "link";
  const dot = entry.name.lastIndexOf(".");
  return dot <= 0 || dot === entry.name.length - 1
    ? "file"
    : entry.name.slice(dot + 1).toLowerCase();
}

function toggleSort(field: string): void {
  if (sortBy.value !== field) {
    sortBy.value = field;
    sortDescending.value = false;
    return;
  }
  sortDescending.value = !sortDescending.value;
}

function sortIndicator(field: string): string {
  if (sortBy.value !== field) return "none";
  return sortDescending.value ? "desc" : "asc";
}

const parentEntry = computed<RemoteEntry>(() => ({
  name: "..",
  path: parentPath(),
  type: "directory",
}));

const contextMenuItems = computed(() => remoteContextMenuItems(
  contextMenu.value?.entry,
  canMutate.value,
  config.value.fsType,
  contextMenu.value?.restricted,
).map((item) => ({
  ...item,
  label: translator.t(item.labelKey, item.labelKey),
})));

const contextMenuStyle = computed(() => {
  const position = contextMenu.value;
  if (!position) return {};
  const viewportWidth = typeof window === "undefined" ? 1024 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 768 : window.innerHeight;
  const width = 224;
  const height = position.entry ? 292 : 88;
  return {
    left: `${Math.max(8, Math.min(position.x, viewportWidth - width - 8))}px`,
    top: `${Math.max(8, Math.min(position.y, viewportHeight - height - 8))}px`,
  };
});

function closeContextMenu(): void {
  contextMenu.value = undefined;
}

function showContextMenu(
  event: MouseEvent,
  entry?: RemoteEntry,
  restricted = false,
): void {
  if (entry) selected.value = entry;
  contextMenu.value = {
    x: event.clientX,
    y: event.clientY,
    entry,
    restricted,
  };
}

async function copyRemoteText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    status.value = translator.t("common.copied", "Copied");
  } catch {
    emit("copyText", { value });
  }
}

function runContextAction(action: RemoteContextMenuAction): void {
  const menu = contextMenu.value;
  const entry = menu?.entry;
  closeContextMenu();
  if (action === "createFile" || action === "createFolder") {
    create(action);
    return;
  }
  if (!entry) return;
  switch (action) {
    case "rename": {
      const newName = window.prompt(
        translator.t("fileManager.rename", "Rename"),
        entry.name,
      )?.trim() || "";
      if (newName && newName !== entry.name) emit("rename", { item: entry, newName });
      return;
    }
    case "copyName":
      void copyRemoteText(entry.name);
      return;
    case "copyPath":
      void copyRemoteText(entry.path);
      return;
    case "openFolderTerminal":
      emit("openFolderTerminal", { item: entry });
      return;
    case "download":
      emit("download", { item: entry });
      return;
    case "delete":
      remove(entry);
      return;
  }
}

const closeMenuOnDocumentClick = (): void => closeContextMenu();
const closeMenuOnDocumentKeydown = (event: KeyboardEvent): void => {
  if (event.key === "Escape") closeContextMenu();
};

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
  document.addEventListener("click", closeMenuOnDocumentClick);
  document.addEventListener("keydown", closeMenuOnDocumentKeydown);
  bridge?.init("fileManager");
});

onBeforeUnmount(() => {
  configSubscription?.dispose();
  fileListSubscription?.dispose();
  loadingSubscription?.dispose();
  resultSubscription?.dispose();
  errorSubscription?.dispose();
  document.removeEventListener("click", closeMenuOnDocumentClick);
  document.removeEventListener("keydown", closeMenuOnDocumentKeydown);
});
</script>

<template>
  <div
    class="remote-file-manager"
    data-route="fileManager"
  >
    <div class="toolbar">
      <div class="toolbar-actions">
        <button
          class="vsc-button vsc-button--icon"
          type="button"
          :disabled="atRoot"
          :title="translator.t('fileManager.parentDir', 'Parent directory')"
          @click="load(parentPath())"
        >
          <i
            class="codicon codicon-arrow-up"
            aria-hidden="true"
          />
        </button>
        <button
          class="vsc-button vsc-button--icon"
          type="button"
          :disabled="loading"
          :title="translator.t('common.refresh', 'Refresh')"
          @click="load()"
        >
          <i
            class="codicon codicon-refresh file-manager-refresh-icon"
            aria-hidden="true"
          />
        </button>
        <button
          class="vsc-button vsc-button--icon"
          type="button"
          :disabled="!canMutate"
          :title="translator.t('fileManager.newFolder', 'New folder')"
          @click="create('createFolder')"
        >
          <i
            class="codicon codicon-new-folder"
            aria-hidden="true"
          />
        </button>
        <button
          class="vsc-button vsc-button--icon"
          type="button"
          :disabled="!canMutate"
          :title="translator.t('fileManager.newFile', 'New file')"
          @click="create('createFile')"
        >
          <i
            class="codicon codicon-new-file"
            aria-hidden="true"
          />
        </button>
        <button
          class="vsc-button vsc-button--icon"
          type="button"
          :disabled="!canMutate"
          :title="translator.t('fileManager.upload', 'Upload')"
          @click="emit('upload', { path: currentPath })"
        >
          <i
            class="codicon codicon-cloud-upload file-manager-upload-icon"
            aria-hidden="true"
          />
        </button>
      </div>
      <nav
        class="breadcrumb"
        aria-label="Remote path"
      >
        <template
          v-for="(breadcrumb, index) in breadcrumbs"
          :key="breadcrumb.path"
        >
          <span
            v-if="index > 0"
            class="breadcrumb-separator"
            aria-hidden="true"
          >/</span>
          <button
            class="breadcrumb-item"
            :class="{ active: breadcrumb.path === currentPath }"
            type="button"
            :title="breadcrumb.path"
            @click="load(breadcrumb.path)"
          >
            <i
              v-if="index === 0"
              class="codicon codicon-root-folder breadcrumb-root-icon"
              aria-hidden="true"
            />
            <span
              v-else
              class="breadcrumb-label"
            >{{ breadcrumb.name }}</span>
          </button>
        </template>
      </nav>
    </div>

    <div class="file-list">
      <div
        class="file-list__body"
        @contextmenu.prevent="showContextMenu($event)"
      >
        <div
          v-if="loading"
          class="file-list__loading"
        >
          <i
            class="codicon codicon-loading codicon-modifier-spin file-list__loading-icon"
            aria-hidden="true"
          />
        </div>
        <div class="file-list__header">
          <button
            v-for="column in fileColumns"
            :key="column.key"
            class="file-list__col file-list__col--sortable"
            :class="`file-list__col--${column.key === 'mtime' ? 'modified' : column.key}`"
            type="button"
            @click="toggleSort(column.key)"
          >
            <span class="file-list__header-label">{{ column.label }}</span>
            <span
              class="file-list__sort-icon"
              :class="`file-list__sort-icon--${sortIndicator(column.key)}`"
              aria-hidden="true"
            >
              <svg
                class="file-list__sort-svg"
                viewBox="0 0 8 10"
              >
                <polygon
                  class="file-list__sort-triangle file-list__sort-triangle--up"
                  points="4,0 8,4 0,4"
                />
                <polygon
                  class="file-list__sort-triangle file-list__sort-triangle--down"
                  points="0,5 8,5 4,9"
                />
              </svg>
            </span>
          </button>
          <span class="file-list__col file-list__col--actions" />
        </div>

        <div
          v-if="!atRoot"
          class="file-list__row"
          @dblclick="load(parentPath())"
          @contextmenu.stop.prevent="showContextMenu($event, parentEntry, true)"
        >
          <div class="file-list__col file-list__col--name">
            <div class="file-list__name-cell">
              <i
                class="codicon codicon-folder file-list__icon file-list__icon--folder"
                aria-hidden="true"
              />
              <span class="file-list__name">..</span>
            </div>
          </div>
          <span class="file-list__col file-list__col--size file-list__muted">--</span>
          <span class="file-list__col file-list__col--modified file-list__muted">--</span>
          <span class="file-list__col file-list__col--kind file-list__muted">{{ translator.t("fileManager.folder", "folder") }}</span>
          <span class="file-list__col file-list__col--owner file-list__muted">--</span>
          <span class="file-list__col file-list__col--actions" />
        </div>

        <div
          v-for="entry in sortedFiles"
          :key="entry.path"
          class="file-list__row"
          :data-selected="selected?.path === entry.path"
          @click="selectEntry(entry)"
          @dblclick="openEntry(entry)"
          @contextmenu.stop.prevent="showContextMenu($event, entry)"
        >
          <div class="file-list__col file-list__col--name">
            <div class="file-list__name-cell">
              <img
                v-if="entry.icon"
                class="file-list__icon"
                :src="entry.icon"
                alt=""
              >
              <i
                v-else
                class="codicon codicon-file file-list__icon"
                aria-hidden="true"
              />
              <span
                class="file-list__name"
                :title="entry.name"
              >{{ entry.name }}</span>
            </div>
          </div>
          <span class="file-list__col file-list__col--size file-list__muted">{{ displaySize(entry) }}</span>
          <span class="file-list__col file-list__col--modified file-list__muted">
            <span class="file-list__date">{{ displayDate(entry.mtime) }}</span>
            <span class="file-list__time">{{ displayTime(entry.mtime) }}</span>
          </span>
          <span class="file-list__col file-list__col--kind file-list__muted">{{ entryKind(entry) }}</span>
          <span class="file-list__col file-list__col--owner file-list__muted">{{ text(entry.owner, "--") }}</span>
          <span class="file-list__col file-list__col--actions file-list__actions">
            <button
              v-if="entry.type === 'file' || entry.type === 'directory'"
              class="vsc-button vsc-button--icon"
              type="button"
              :title="translator.t('common.download', 'Download')"
              @click.stop="emit('download', { item: entry })"
            >
              <i
                class="codicon codicon-cloud-download blue"
                aria-hidden="true"
              />
            </button>
            <button
              v-if="entry.type !== 'directory'"
              class="vsc-button vsc-button--icon file-list__delete"
              type="button"
              :title="translator.t('fileManager.delete', 'Delete')"
              :disabled="!canMutate"
              @click.stop="remove(entry)"
            >
              <i
                class="codicon codicon-trash red"
                aria-hidden="true"
              />
            </button>
          </span>
        </div>
      </div>
      <div class="file-list__footer">
        {{ translator.t("fileManager.items", "{count} items", { count: sortedFiles.length }) }}
      </div>
    </div>

    <div
      v-if="contextMenu"
      class="remote-context-menu"
      :style="contextMenuStyle"
      role="menu"
      @click.stop
    >
      <button
        v-for="action in contextMenuItems"
        :key="action.id"
        class="remote-context-menu__item"
        :class="{ 'remote-context-menu__item--divider': action.dividerBefore }"
        type="button"
        role="menuitem"
        :disabled="action.disabled"
        @click="runContextAction(action.id)"
      >
        <i
          :class="action.icon"
          aria-hidden="true"
        />
        <span>{{ action.label }}</span>
      </button>
    </div>
  </div>
</template>
