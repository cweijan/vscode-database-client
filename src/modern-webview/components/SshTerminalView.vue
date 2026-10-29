<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, ref } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import ForwardView from "./ForwardView.vue";
import RemoteFileManagerView from "./RemoteFileManagerView.vue";
import SshMonitorView from "./SshMonitorView.vue";
import UiInput from "./UiInput.vue";
import XtermView from "./XtermView.vue";

type SshTerminalTab = "monitor" | "terminal" | "sftp" | "portForwarding";
type SplitLayout = "horizontal" | "vertical";

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const bootstrap = readWebviewBootstrap();
const activeTab = ref<SshTerminalTab>("terminal");
const splitLayout = ref<SplitLayout>("horizontal");
const sftpDisabled = ref(false);
const sftpVisible = ref(true);
const remotePath = typeof bootstrap.state.path === "string" ? bootstrap.state.path : "";
const editorVisible = ref(false);
const editorPath = ref(remotePath);
const subscriptions: BridgeDisposable[] = [];
const sshTabs: ReadonlyArray<{ id: SshTerminalTab; label: string; icon: string }> = [
  { id: "monitor", label: "Monitor", icon: "codicon-pulse green" },
  { id: "terminal", label: "Terminal", icon: "codicon-terminal blue" },
  { id: "sftp", label: "SFTP", icon: "codicon-folder yellow" },
  { id: "portForwarding", label: "Port Forwarding", icon: "codicon-plug orange" },
];

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function loadSftp(path = remotePath): void {
  if (sftpDisabled.value) return;
  bridge?.emit("initSftp");
  if (path) {
    window.setTimeout(() => bridge?.emit("load", { path }), 100);
  }
}

function selectTab(tab: SshTerminalTab): void {
  if (tab === "sftp" && sftpDisabled.value) return;
  activeTab.value = tab;
  if (tab === "sftp") loadSftp();
}

function toggleSplit(): void {
  splitLayout.value = splitLayout.value === "horizontal" ? "vertical" : "horizontal";
}

function openEditor(): void {
  editorPath.value = remotePath;
  editorVisible.value = true;
}

function submitEditor(): void {
  const path = editorPath.value.trim();
  if (!path) return;
  editorVisible.value = false;
  bridge?.emit("editInVSCode", path);
}

onMounted(() => {
  const configSubscription = bridge?.on("config", (content) => {
    sftpDisabled.value = Boolean(record(content).sftpDisabled);
    if (sftpDisabled.value) {
      sftpVisible.value = false;
      activeTab.value = "terminal";
    }
  });
  if (configSubscription) subscriptions.push(configSubscription);
  const showSftpSubscription = bridge?.on("showSftp", (content) => {
    const payload = record(content);
    if (!sftpDisabled.value) {
      sftpVisible.value = true;
      activeTab.value = "sftp";
      if (typeof payload.path === "string") loadSftp(payload.path);
    }
  });
  if (showSftpSubscription) subscriptions.push(showSftpSubscription);
  const switchTabSubscription = bridge?.on("switchTab", (content) => {
    const payload = record(content);
    const tab = payload.tab;
    if (tab !== "monitor" && tab !== "terminal" && tab !== "sftp" && tab !== "portForwarding") return;
    selectTab(tab);
    if (tab === "sftp" && typeof payload.path === "string") loadSftp(payload.path);
  });
  if (switchTabSubscription) subscriptions.push(switchTabSubscription);
  bridge?.emit("initSftpConfig");
});

onBeforeUnmount(() => {
  for (const subscription of subscriptions) subscription.dispose();
});
</script>

<template>
  <div
    class="ssh-terminal"
    data-route="sshTerminal"
  >
    <div
      id="sshTerminalTab"
      class="ssh-terminal-tabbar"
    >
      <ul class="ssh-terminal-tabs">
        <li
          v-for="tab in sshTabs"
          v-show="tab.id !== 'sftp' || !sftpDisabled"
          :key="tab.id"
          class="ssh-terminal-tabs__item"
          :class="{ 'ssh-terminal-tabs__item--active': activeTab === tab.id }"
          @click="selectTab(tab.id)"
        >
          <i :class="`codicon ${tab.icon}`" aria-hidden="true" />
          {{ tab.label }}
        </li>
      </ul>
      <div
        v-show="activeTab === 'terminal'"
        class="ssh-terminal-actions"
      >
        <button
          class="ssh-terminal-actions__item"
          type="button"
          title="Edit current remote file in VS Code"
          @click="openEditor"
        >
          <i class="codicon codicon-edit" aria-hidden="true" />
          <span>Edit in VS Code</span>
        </button>
        <button
          v-if="!sftpDisabled"
          class="ssh-terminal-actions__item"
          type="button"
          title="Toggle SFTP split"
          @click="sftpVisible = !sftpVisible"
        >
          <i class="codicon codicon-split-horizontal" aria-hidden="true" />
        </button>
        <button
          v-if="!sftpDisabled"
          class="ssh-terminal-actions__item"
          type="button"
          title="Change split direction"
          @click="toggleSplit"
        >
          <i class="codicon codicon-layout-sidebar-right" aria-hidden="true" />
        </button>
        <button
          class="ssh-terminal-actions__item"
          type="button"
          title="Reconnect"
          @click="bridge?.emit('initTerminal', { reconnect: true })"
        >
          <i class="codicon codicon-symbol-event blue" aria-hidden="true" />
          <span>Reconnect</span>
        </button>
        <button
          class="ssh-terminal-actions__item"
          type="button"
          title="Duplicate terminal"
          @click="bridge?.emit('duplicateTab')"
        >
          <i class="codicon codicon-copy green" aria-hidden="true" />
          <span>Duplicate</span>
        </button>
        <button
          class="ssh-terminal-actions__item"
          type="button"
          title="Terminal settings"
          @click="bridge?.emit('openSettings')"
        >
          <i class="codicon codicon-gear" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div
      v-show="activeTab === 'terminal'"
      class="ssh-terminal-content"
    >
      <div
        class="ssh-terminal-split"
        :class="{
          'ssh-terminal-split--horizontal': sftpVisible && splitLayout === 'horizontal',
          'ssh-terminal-split--vertical': sftpVisible && splitLayout === 'vertical',
        }"
      >
        <div class="ssh-terminal-split__main">
          <XtermView :embedded="true" />
        </div>
        <div
          v-if="activeTab === 'terminal' && sftpVisible && !sftpDisabled"
          class="ssh-terminal-split__sftp"
        >
          <RemoteFileManagerView />
        </div>
      </div>
    </div>

    <div
      v-if="activeTab === 'sftp' && !sftpDisabled"
      class="ssh-terminal-content__panel"
    >
      <RemoteFileManagerView />
    </div>

    <div
      v-if="activeTab === 'monitor'"
      class="ssh-terminal-content__panel ssh-terminal-content__panel--embedded"
    >
      <SshMonitorView />
    </div>

    <div
      v-if="activeTab === 'portForwarding'"
      class="ssh-terminal-content__panel ssh-terminal-content__panel--embedded"
    >
      <ForwardView />
    </div>

    <div
      v-if="editorVisible"
      class="ssh-editor-modal"
      role="presentation"
      @click.self="editorVisible = false"
    >
      <div
        class="ssh-editor-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ssh-editor-dialog-title"
      >
        <div class="ssh-editor-modal__header">
          <strong id="ssh-editor-dialog-title">Edit remote file in VS Code</strong>
          <button
            type="button"
            class="ssh-editor-modal__close"
            aria-label="Close"
            @click="editorVisible = false"
          >
            ×
          </button>
        </div>
        <div class="ssh-editor-modal__body">
          <UiInput
            v-model="editorPath"
            label="Remote path"
            placeholder="/path/to/file"
          />
        </div>
        <div class="ssh-editor-modal__footer">
          <VscButton
            type="default"
            @click="editorVisible = false"
          >
            Cancel
          </VscButton>
          <VscButton @click="submitEditor">
            Open
          </VscButton>
        </div>
      </div>
    </div>
  </div>
</template>
