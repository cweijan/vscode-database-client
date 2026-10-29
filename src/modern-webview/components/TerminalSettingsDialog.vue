<script setup lang="ts">
import { reactive, watch } from "vue";

import type {
  TerminalCursorStyle,
  TerminalSettings,
  TerminalTheme,
} from "../terminalConfig";

const props = defineProps<{
  modelValue: boolean;
  settings: TerminalSettings;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  "update:settings": [value: TerminalSettings];
  change: [value: { key: keyof TerminalSettings; value: TerminalSettings[keyof TerminalSettings] }];
}>();

const draft = reactive<TerminalSettings>({ ...props.settings });
const cursorStyles: readonly TerminalCursorStyle[] = ["line", "block", "underline"];
const themes: readonly TerminalTheme[] = ["Auto", "Arthur", "Dracula", "OneDark", "Ubuntu", "Xterm"];

watch(() => props.settings, (settings) => {
  Object.assign(draft, settings);
}, { deep: true });

function close(): void {
  emit("update:modelValue", false);
}

function commit<K extends keyof TerminalSettings>(key: K, value: TerminalSettings[K]): void {
  draft[key] = value;
  const next = { ...draft };
  emit("update:settings", next);
  emit("change", { key, value });
}

function numberValue(event: Event, fallback: number): number {
  const value = Number((event.target as HTMLInputElement).value);
  return Number.isFinite(value) ? value : fallback;
}

function selectValue(event: Event): string {
  return (event.target as HTMLSelectElement).value;
}
</script>

<template>
  <div
    v-if="modelValue"
    class="terminal-settings-modal"
    role="presentation"
    @click.self="close"
  >
    <div
      class="terminal-settings-modal__panel"
      role="dialog"
      aria-modal="true"
      aria-label="Terminal settings"
      tabindex="-1"
      @keydown.esc="close"
    >
      <div class="terminal-settings-modal__header">
        <strong>Terminal settings</strong>
      </div>
      <div class="terminal-settings-modal__body">
        <label class="terminal-settings-modal__field">
          <span>Scrollback</span>
          <input
            class="field__input"
            type="number"
            min="0"
            :value="draft.scrollback"
            @change="commit('scrollback', Math.max(0, Math.trunc(numberValue($event, draft.scrollback))))"
          >
        </label>
        <label class="terminal-settings-modal__field">
          <span>Font size</span>
          <input
            class="field__input"
            type="number"
            min="8"
            max="32"
            :value="draft.fontSize"
            @change="commit('fontSize', Math.min(32, Math.max(8, numberValue($event, draft.fontSize))))"
          >
        </label>
        <label class="terminal-settings-modal__field">
          <span>Line height</span>
          <input
            class="field__input"
            type="number"
            min="1"
            max="2"
            step="0.1"
            :value="draft.lineHeight"
            @change="commit('lineHeight', Math.min(2, Math.max(1, numberValue($event, draft.lineHeight))))"
          >
        </label>
        <label class="terminal-settings-modal__field">
          <span>Cursor</span>
          <select
            class="field__input"
            :value="draft.cursorStyle"
            @change="commit('cursorStyle', selectValue($event) as TerminalCursorStyle)"
          >
            <option v-for="style in cursorStyles" :key="style" :value="style">
              {{ style }}
            </option>
          </select>
        </label>
        <label class="terminal-settings-modal__field">
          <span>Cursor blink</span>
          <input
            type="checkbox"
            :checked="draft.cursorBlinking"
            @change="commit('cursorBlinking', ($event.target as HTMLInputElement).checked)"
          >
        </label>
        <label class="terminal-settings-modal__field">
          <span>Theme</span>
          <select
            class="field__input"
            :value="draft.terminalTheme"
            @change="commit('terminalTheme', selectValue($event) as TerminalTheme)"
          >
            <option v-for="theme in themes" :key="theme" :value="theme">
              {{ theme }}
            </option>
          </select>
        </label>
      </div>
      <div class="terminal-settings-modal__footer">
        <button class="vsc-button vsc-button--default" type="button" @click="close">
          Close
        </button>
      </div>
    </div>
  </div>
</template>
