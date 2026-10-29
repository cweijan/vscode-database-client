<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";

interface SettingOption {
  name: string;
  value: unknown;
  type: string;
  description: string;
  enum?: readonly unknown[];
}

interface SettingGroup {
  title: string;
  tag?: string;
  options: SettingOption[];
}

interface SettingChoice {
  readonly value: unknown;
  readonly label: string;
}

interface MessageResult {
  success?: boolean;
  cancel?: boolean;
  message?: string;
}

const GROUPS: Readonly<Record<string, { title: string; tag?: string }>> = {
  editor: { title: "Editor", tag: "dbclient-editor" },
  sql: { title: "SQL", tag: "dbclient-sql-parser" },
  treeView: { title: "Tree view" },
  result: { title: "Result" },
};

const GROUP_MEMBERS: Readonly<Record<string, readonly string[]>> = {
  editor: ["enableSQLVariable", "enableEditorCodeLens", "highlightSQLBlock", "bindConnectionByActiveMark"],
  result: ["openResultsAsVertically", "splitEditorWhenQuery", "autoGetTableCount"],
  treeView: ["showSecurity", "showComment", "saveConnectionExpandedState", "terminalLocation"],
  sql: [
    "escapedAllObjectName",
    "rememberSQLVariables",
    "capitalizeKeywordsWhenFormatting",
    "autoPagingSQL",
    "queryWithSchema",
  ],
};

const KNOWN_CHOICES: Readonly<Record<string, readonly SettingChoice[]>> = {
  escapedAllObjectName: [
    { value: "auto", label: "Auto" },
    { value: "never", label: "Never" },
    { value: "always", label: "Always" },
  ],
  terminalLocation: [
    { value: "Panel", label: "Panel" },
    { value: "Editor", label: "Editor" },
  ],
};

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const options = ref<SettingOption[]>([]);
const drafts = reactive<Record<string, unknown>>({});
const syncKey = ref("");
const status = ref("");
const userEmail = ref("");
const exportWithAdditionalFiles = ref(true);
const downloadRequest = ref<{ keyPath: string; type: "" | "merge" }>({
  keyPath: "",
  type: "",
});
let subscriptions: BridgeDisposable[] = [];

const optionGroups = computed<SettingGroup[]>(() => {
  return Object.entries(GROUP_MEMBERS).map(([name, members]) => {
    const groupOptions = members
      .map((member) => options.value.find((option) => option.name === member))
      .filter((option): option is SettingOption => option !== undefined);
    return { ...GROUPS[name], options: groupOptions };
  }).filter((group) => group.options.length > 0);
});

const autoSync = computed(() => Boolean(drafts.autoSync));

function asOptions(content: unknown): SettingOption[] {
  if (!content || typeof content !== "object") return [];
  const values = (content as { options?: unknown }).options;
  if (!Array.isArray(values)) return [];
  return values
    .filter((item): item is Record<string, unknown> => Boolean(
      item && typeof item === "object" && !Array.isArray(item),
    ))
    .filter((item) => typeof item.name === "string")
    .map((item) => ({
      name: String(item.name),
      value: item.value,
      type: String(item.type || typeof item.value),
      description: String(item.description || item.name),
      enum: Array.isArray(item.enum) ? item.enum : undefined,
    }));
}

function applyOptions(content: unknown): void {
  const next = asOptions(content);
  options.value = next;
  for (const option of next) drafts[option.name] = option.value;
}

function messageResult(content: unknown, fallback: string): MessageResult {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return { message: content ? String(content) : fallback };
  }
  const value = content as MessageResult;
  return { ...value, message: value.message || fallback };
}

function displayValue(option: SettingOption): string {
  const value = drafts[option.name];
  return Array.isArray(value) || (value && typeof value === "object")
    ? JSON.stringify(value)
    : String(value ?? "");
}

function choicesFor(option: SettingOption): readonly SettingChoice[] {
  if (option.enum?.length) {
    return option.enum.map((value) => ({ value, label: String(value) }));
  }
  return KNOWN_CHOICES[option.name] || [];
}

function parseValue(option: SettingOption, value: string): unknown {
  if (option.type === "boolean") return value === "true";
  if (option.type === "number" || option.type === "integer") return Number(value);
  if (option.type === "array" || option.type === "object") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function update(option: SettingOption): void {
  bridge?.emit("updateOption", {
    name: option.name,
    type: option.type,
    value: drafts[option.name],
  });
  status.value = `${option.name} updated.`;
}

function updateText(option: SettingOption, event: Event): void {
  drafts[option.name] = parseValue(option, (event.target as HTMLInputElement).value);
}

function toggleAutoSync(event: Event): void {
  const enabled = (event.target as HTMLInputElement).checked;
  drafts.autoSync = enabled;
  const option = options.value.find((item) => item.name === "autoSync");
  if (option) update(option);
}

function resetGroup(group: SettingGroup): void {
  bridge?.emit("resetOption", group.options.map((option) => ({ name: option.name })));
  status.value = `${group.title} settings reset.`;
}

function reload(): void {
  bridge?.emit("options");
}

function editConnectionConfig(workspace = false): void {
  bridge?.emit("editConfig", workspace);
}

function exportConfig(workspace = false): void {
  bridge?.emit("exportConfig", {
    workspace,
    withQueryFiles: exportWithAdditionalFiles.value,
  });
}

function importConfig(workspace = false, confirm = false): void {
  bridge?.emit("importConfig", { workspace, confirm });
}

function chooseSyncKey(): void {
  bridge?.emit("chooseSyncKey");
}

function uploadConfig(): void {
  bridge?.emit("uploadConfig", { keyPath: syncKey.value });
}

function removeConfig(): void {
  if (window.confirm("Remove all cloud-synchronized configuration?")) {
    bridge?.emit("removeConfig");
  }
}

function downloadConfig(type: "" | "merge"): void {
  downloadRequest.value = { keyPath: syncKey.value, type };
  bridge?.emit("downloadConfig", downloadRequest.value);
}

function confirmImport(workspace: boolean): void {
  if (window.confirm("Importing configuration may replace existing connections. Continue?")) {
    importConfig(workspace, true);
  }
}

function confirmDownload(): void {
  if (window.confirm("Downloading configuration may replace existing connections. Continue?")) {
    bridge?.emit("downloadConfig", { ...downloadRequest.value, confirm: true });
  }
}

onMounted(() => {
  subscriptions = [
    bridge?.on("options", applyOptions),
    bridge?.on("syncKey", (content) => { syncKey.value = String(content || ""); }),
    bridge?.on("email", (content) => { userEmail.value = String(content || ""); }),
    bridge?.on("configSuccess", (content) => { status.value = String(content || "Configuration updated."); }),
    bridge?.on("resetSuccess", (content) => { status.value = String(content || "Settings reset."); reload(); }),
    bridge?.on("importConfirm", () => confirmImport(false)),
    bridge?.on("importWorkspaceConfirm", () => confirmImport(true)),
    bridge?.on("importResult", (content) => {
      const result = messageResult(content, "Import completed.");
      status.value = result.cancel ? "Import cancelled." : String(result.message);
    }),
    bridge?.on("uploadRes", (content) => { status.value = String(messageResult(content, "Upload completed.").message); }),
    bridge?.on("removeRes", (content) => { status.value = String(messageResult(content, "Cloud configuration removed.").message); }),
    bridge?.on("downloadConfirm", confirmDownload),
    bridge?.on("downloadResult", (content) => { status.value = String(messageResult(content, "Download completed.").message); }),
    bridge?.on("success", (content) => { status.value = String(content || "Operation completed."); }),
    bridge?.on("error", (content) => { status.value = String((content as { message?: unknown })?.message || content || "Settings operation failed."); }),
  ].filter((item): item is BridgeDisposable => Boolean(item));
  bridge?.init("console");
  bridge?.emit("options");
});

onBeforeUnmount(() => {
  for (const subscription of subscriptions) subscription.dispose();
});
</script>

<template>
  <div class="flex flex-wrap justify-center console-container">
    <div class="settings-view__layout">
      <aside class="settings-view__side">
        <section class="settings-view__card">
          <header class="settings-view__card-header">
            <h2>Configuration</h2>
            <label class="settings-view__checkbox">
              <input
                v-model="exportWithAdditionalFiles"
                type="checkbox"
              >
              <span>Include additional files</span>
            </label>
          </header>
          <div class="settings-view__scope">
            <strong>Current workspace</strong>
            <div class="settings-view__actions">
              <VscButton
                type="default"
                @click="editConnectionConfig(true)"
              >
                Edit
              </VscButton>
              <VscButton
                type="default"
                @click="exportConfig(true)"
              >
                Export
              </VscButton>
              <VscButton
                type="default"
                @click="importConfig(true)"
              >
                Import
              </VscButton>
            </div>
          </div>
          <div class="settings-view__scope">
            <strong>Global</strong>
            <div class="settings-view__actions">
              <VscButton
                type="default"
                @click="editConnectionConfig(false)"
              >
                Edit
              </VscButton>
              <VscButton
                type="default"
                @click="exportConfig(false)"
              >
                Export
              </VscButton>
              <VscButton
                type="default"
                @click="importConfig(false)"
              >
                Import
              </VscButton>
            </div>
          </div>
        </section>

        <section class="settings-view__card">
          <header class="settings-view__card-header">
            <h2>Cloud sync</h2>
            <a
              href="https://github.com/cweijan/vscode-database-client/wiki/About-Cloud-Sync"
              target="_blank"
              rel="noreferrer"
            >
              <i
                class="codicon codicon-book"
                aria-hidden="true"
              />
            </a>
          </header>
          <p class="settings-view__subline">
            {{ userEmail ? `Account: ${userEmail}` : "Sign in from the Plan page to use cloud sync." }}
          </p>
          <label class="settings-view__checkbox">
            <input
              :checked="autoSync"
              type="checkbox"
              @change="toggleAutoSync"
            >
            <span>Automatically synchronize configuration</span>
          </label>
          <div class="settings-view__sync-row">
            <input
              v-model="syncKey"
              class="field__input"
              placeholder="Sync encryption key (optional)"
              spellcheck="false"
            >
            <VscButton
              type="default"
              @click="chooseSyncKey"
            >
              <i
                class="codicon codicon-file"
                aria-hidden="true"
              />
            </VscButton>
          </div>
          <div class="settings-view__actions">
            <VscButton
              :disabled="!userEmail"
              @click="uploadConfig"
            >
              Upload
            </VscButton>
            <VscButton
              type="default"
              :disabled="!userEmail"
              @click="downloadConfig('')"
            >
              Download and replace
            </VscButton>
            <VscButton
              type="default"
              :disabled="!userEmail"
              @click="downloadConfig('merge')"
            >
              Download and merge
            </VscButton>
            <VscButton
              type="danger"
              :disabled="!userEmail"
              @click="removeConfig"
            >
              Remove cloud data
            </VscButton>
          </div>
        </section>

        <section class="settings-view__card">
          <header class="settings-view__card-header">
            <h2>Other</h2>
          </header>
          <div class="settings-view__actions">
            <VscButton
              type="default"
              @click="bridge?.emit('closeAllConnections')"
            >
              Close all connections
            </VscButton>
            <VscButton
              type="default"
              @click="bridge?.emit('open', 'https://github.com/cweijan/vscode-database-client/issues')"
            >
              Report issue
            </VscButton>
            <VscButton
              type="default"
              @click="bridge?.emit('clearCache')"
            >
              Clear cache
            </VscButton>
          </div>
        </section>
      </aside>

      <div class="option-container">
        <div class="settings-view__options-header">
          <div>
            <h1>Settings</h1>
            <p class="settings-view__subline">
              Configure Database Client options.
            </p>
          </div>
          <VscButton
            type="default"
            @click="reload"
          >
            Refresh
          </VscButton>
        </div>
        <div
          v-for="group in optionGroups"
          :key="group.title"
          class="card-container"
          style="max-width: 350px; min-width: 300px"
        >
          <div class="card">
            <div class="option-header">
              <div class="option-title">
                {{ group.title }}
              </div>
              <div class="option-header__actions">
                <VscTooltip :title="'Reset'">
                  <VscButton
                    icon="codicon-discard"
                    size="micro"
                    @click="resetGroup(group)"
                  />
                </VscTooltip>
                <VscTooltip
                  v-if="group.tag"
                  title="Show More Settings"
                >
                  <VscButton
                    icon="codicon-ellipsis"
                    size="micro"
                    @click="bridge?.emit('openMoreSettings', group.tag)"
                  />
                </VscTooltip>
              </div>
            </div>
            <div class="option-list">
              <div
                v-for="option in group.options"
                :key="option.name"
                class="option-item"
              >
                <div class="settings-view__description">
                  <strong>{{ option.description }}</strong>
                  <span>{{ option.name }}</span>
                </div>
                <div class="settings-view__control">
                  <label
                    v-if="option.type === 'boolean'"
                    class="settings-view__checkbox"
                  >
                    <input
                      v-model="drafts[option.name]"
                      type="checkbox"
                      @change="update(option)"
                    >
                    <span>{{ drafts[option.name] ? "Enabled" : "Disabled" }}</span>
                  </label>
                  <select
                    v-else-if="choicesFor(option).length > 0"
                    v-model="drafts[option.name]"
                    class="field__input"
                    @change="update(option)"
                  >
                    <option
                      v-for="choice in choicesFor(option)"
                      :key="String(choice.value)"
                      :value="choice.value"
                    >
                      {{ choice.label }}
                    </option>
                  </select>
                  <input
                    v-else
                    class="field__input"
                    :value="displayValue(option)"
                    @change="updateText(option, $event)"
                    @keyup.enter="update(option)"
                  >
                  <VscButton
                    v-if="option.type !== 'boolean' && choicesFor(option).length === 0"
                    @click="update(option)"
                  >
                    Apply
                  </VscButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p
        v-if="status"
        class="route-workspace__status"
      >
        {{ status }}
      </p>
    </div>
  </div>
</template>
