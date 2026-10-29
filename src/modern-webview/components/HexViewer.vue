<script setup lang="ts">
import { computed } from "vue";

interface HexLine {
  readonly offset: string;
  readonly groups: readonly string[];
  readonly ascii: string;
}

const props = withDefaults(
  defineProps<{
    hexData: unknown;
    maxHeight?: string;
  }>(),
  { maxHeight: "60vh" },
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
  const text = String(value ?? "").trim().replace(/^0x/i, "").replaceAll(/\s+/g, "");
  return /^[0-9a-f]*$/i.test(text) && text.length % 2 === 0 ? text : "";
}

function printable(bytePair: string): string {
  const byte = Number.parseInt(bytePair, 16);
  return byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : ".";
}

const lines = computed<readonly HexLine[]>(() => {
  const hex = normalizeHex(props.hexData).toLowerCase();
  const bytes = hex.match(/.{2}/g) || [];
  const result: HexLine[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32) {
    const lineBytes = bytes.slice(offset, offset + 32);
    const groups: string[] = [];
    for (let groupStart = 0; groupStart < lineBytes.length; groupStart += 4) {
      groups.push(lineBytes.slice(groupStart, groupStart + 4).join(" "));
    }
    result.push({
      offset: offset.toString(16).padStart(4, "0").slice(-4),
      groups,
      ascii: lineBytes.map(printable).join(""),
    });
  }
  return result;
});
</script>

<template>
  <div
    class="hex-viewer"
    :style="{ maxHeight }"
    data-testid="hex-viewer"
  >
    <div
      v-for="line in lines"
      :key="line.offset"
      class="hex-viewer__line"
    >
      <span class="hex-viewer__offset">{{ line.offset }}</span>
      <span class="hex-viewer__content">
        <span
          v-for="(group, index) in line.groups"
          :key="`${line.offset}-${index}`"
          class="hex-viewer__group"
        >
          {{ group }}
        </span>
      </span>
      <span class="hex-viewer__ascii">{{ line.ascii }}</span>
    </div>
    <p
      v-if="lines.length === 0"
      class="route-workspace__empty"
    >
      No binary bytes to display.
    </p>
  </div>
</template>
