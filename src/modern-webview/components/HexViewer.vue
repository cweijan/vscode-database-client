<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    hexData?: string | Uint8Array | number[];
    maxHeight?: string;
  }>(),
  { hexData: "", maxHeight: "60vh" },
);

function normalizeHex(value: unknown): string {
  if (value instanceof Uint8Array) {
    return [...value].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  if (Array.isArray(value)) {
    const bytes = value.map(Number);
    if (bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
      return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }
  }
  return String(value ?? "").replace(/^0x/i, "").replaceAll(/\s+/g, "");
}

function printable(bytePair: string): string {
  const byte = Number.parseInt(bytePair, 16);
  return byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : ".";
}

const lines = computed<string[][][]>(() => {
  const hex = normalizeHex(props.hexData);
  const rows: string[][][] = [];
  for (let offset = 0; offset < hex.length; offset += 32) {
    const bytes = hex.slice(offset, offset + 32).match(/.{1,2}/g) ?? [];
    const groups: string[][] = [];
    for (let index = 0; index < bytes.length; index += 4) {
      groups.push(bytes.slice(index, index + 4));
    }
    rows.push(groups);
  }
  return rows;
});

function address(index: number): string {
  return `${(index * 16).toString(16).padStart(4, "0").slice(-4)}`;
}

function ascii(groups: string[][]): string {
  let text = "";
  for (const group of groups) {
    for (const byte of group) text += printable(byte);
  }
  return text;
}
</script>

<template>
  <div
    class="hex-viewer"
    :style="{ maxHeight }"
  >
    <div
      v-for="(groups, index) in lines"
      :key="index"
      class="hex-line"
    >
      <span class="hex-address select-none">{{ address(index) }}</span>
      <span class="hex-content">
        <span
          v-for="(group, groupIndex) in groups"
          :key="groupIndex"
          class="inline-block hex-group"
        >{{ group.join(" ") }}</span>
      </span>
      <span class="hex-ascii ml-4 opacity-70 whitespace-nowrap">{{ ascii(groups) }}</span>
    </div>
  </div>
</template>
