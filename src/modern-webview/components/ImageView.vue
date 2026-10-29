<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import UiInput from "./UiInput.vue";

type ImageTool = "crop" | "resize" | "base64" | "tinyPng" | "svg";

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const tool = ref<ImageTool>("resize");
const fileInput = ref<HTMLInputElement>();
const sourceDataUrl = ref("");
const sourceName = ref("image");
const outputDataUrl = ref("");
const svgSource = ref("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"320\" height=\"180\"><rect width=\"100%\" height=\"100%\" fill=\"#0e639c\"/></svg>");
const tinyPngKey = ref("");
const tinyPngConfigured = ref(false);
const inputWidth = ref(0);
const inputHeight = ref(0);
const outputWidth = ref(800);
const outputHeight = ref(600);
const cropX = ref(0);
const cropY = ref(0);
const cropWidth = ref(320);
const cropHeight = ref(180);
const status = ref("");
const busy = ref(false);
let subscriptions: BridgeDisposable[] = [];

const hasOutput = computed(() => Boolean(outputDataUrl.value || (tool.value === "svg" && svgSource.value.trim())));

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Unable to read image"));
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to decode image"));
    image.src = source;
  });
}

async function selectFile(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    await setSource(await readFile(file), file.name);
  } catch (error) {
    status.value = error instanceof Error ? error.message : "Unable to read image.";
  } finally {
    (event.target as HTMLInputElement).value = "";
  }
}

async function setSource(dataUrl: string, fileName: string): Promise<void> {
  sourceDataUrl.value = dataUrl;
  sourceName.value = fileName || "image";
  outputDataUrl.value = "";
  const image = await loadImage(dataUrl);
  inputWidth.value = image.naturalWidth;
  inputHeight.value = image.naturalHeight;
  outputWidth.value = image.naturalWidth;
  outputHeight.value = image.naturalHeight;
  cropWidth.value = image.naturalWidth;
  cropHeight.value = image.naturalHeight;
  status.value = `${image.naturalWidth} × ${image.naturalHeight}`;
}

async function render(): Promise<void> {
  if (!sourceDataUrl.value) {
    status.value = "Select an image first.";
    return;
  }
  busy.value = true;
  try {
    const image = await loadImage(sourceDataUrl.value);
    const canvas = document.createElement("canvas");
    if (tool.value === "crop") {
      const width = Math.max(1, Math.min(inputWidth.value, Number(cropWidth.value) || 1));
      const height = Math.max(1, Math.min(inputHeight.value, Number(cropHeight.value) || 1));
      const x = Math.max(0, Math.min(inputWidth.value - width, Number(cropX.value) || 0));
      const y = Math.max(0, Math.min(inputHeight.value - height, Number(cropY.value) || 0));
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")?.drawImage(image, x, y, width, height, 0, 0, width, height);
    } else {
      const width = Math.max(1, Number(outputWidth.value) || image.naturalWidth);
      const height = Math.max(1, Number(outputHeight.value) || image.naturalHeight);
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")?.drawImage(image, 0, 0, width, height);
    }
    outputDataUrl.value = canvas.toDataURL("image/png");
    status.value = "Image generated.";
  } catch (error) {
    status.value = error instanceof Error ? error.message : "Unable to process image.";
  } finally {
    busy.value = false;
  }
}

function generateBase64(): void {
  outputDataUrl.value = sourceDataUrl.value;
  status.value = sourceDataUrl.value ? "Base64 data ready." : "Select an image first.";
}

function generateSvg(): void {
  outputDataUrl.value = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgSource.value)))}`;
  status.value = "SVG data ready.";
}

function compressTinyPng(): void {
  if (!sourceDataUrl.value) {
    status.value = "Select an image first.";
    return;
  }
  busy.value = true;
  bridge?.emit("compressTinyPng", { dataUrl: sourceDataUrl.value });
}

function run(): void {
  if (tool.value === "base64") generateBase64();
  else if (tool.value === "svg") generateSvg();
  else if (tool.value === "tinyPng") compressTinyPng();
  else void render();
}

async function copyOutput(): Promise<void> {
  const value = outputDataUrl.value || (tool.value === "svg" ? svgSource.value : "");
  if (!value) return;
  await navigator.clipboard.writeText(value);
  status.value = "Copied.";
}

function saveOutput(): void {
  const value = outputDataUrl.value;
  if (!value) return;
  const extension = tool.value === "svg" ? "svg" : "png";
  bridge?.emit(tool.value === "svg" ? "saveSvgFile" : "saveImageFile", {
    ...(tool.value === "svg" ? { content: svgSource.value } : { dataUrl: value }),
    fileName: `${sourceName.value.replace(/\.[^.]+$/, "") || "image"}.${extension}`,
    operation: tool.value,
  });
}

onMounted(() => {
  subscriptions = [
    bridge?.on("tinyPngApiKeyStatus", (content) => {
      const payload = content && typeof content === "object" ? content as { configured?: unknown; apiKey?: unknown } : {};
      tinyPngConfigured.value = Boolean(payload.configured);
      tinyPngKey.value = String(payload.apiKey || "");
      busy.value = false;
    }),
    bridge?.on("compressTinyPngResult", (content) => {
      const payload = content && typeof content === "object" ? content as { success?: unknown; dataUrl?: unknown; message?: unknown } : {};
      busy.value = false;
      if (payload.success && typeof payload.dataUrl === "string") {
        outputDataUrl.value = payload.dataUrl;
        status.value = "TinyPNG compression completed.";
      } else {
        status.value = String(payload.message || "TinyPNG compression failed.");
      }
    }),
    bridge?.on("error", (content) => {
      busy.value = false;
      status.value = String(content || "Image operation failed.");
    }),
  ].filter((item): item is BridgeDisposable => Boolean(item));
  bridge?.init("image");
  bridge?.emit("getTinyPngApiKey");
});

onBeforeUnmount(() => {
  for (const subscription of subscriptions) subscription.dispose();
});
</script>

<template>
  <section
    class="route-workspace image-view"
    data-route="image"
  >
    <header class="route-workspace__header">
      <div>
        <h1>Image Tools</h1>
        <p class="route-workspace__subline">
          Crop, resize, convert, compress and export images from the extension.
        </p>
      </div>
      <div class="route-workspace__actions">
        <VscButton
          :disabled="!hasOutput"
          @click="copyOutput"
        >
          Copy
        </VscButton>
        <VscButton
          :disabled="!hasOutput"
          @click="saveOutput"
        >
          Save
        </VscButton>
      </div>
    </header>

    <div class="image-view__toolbar">
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        hidden
        @change="selectFile"
      >
      <VscButton
        @click="fileInput?.click()"
      >
        Select image
      </VscButton>
      <select
        v-model="tool"
        class="field__input"
      >
        <option value="crop">
          Crop
        </option>
        <option value="resize">
          Resize
        </option>
        <option value="base64">
          Image to Base64
        </option>
        <option value="tinyPng">
          TinyPNG
        </option>
        <option value="svg">
          SVG editor
        </option>
      </select>
      <VscButton
        :disabled="busy"
        @click="run"
      >
        {{ busy ? "Working…" : "Run" }}
      </VscButton>
    </div>

    <div
      v-if="tool === 'crop'"
      class="image-view__controls"
    >
      <label class="inline-block mr-10">
        <span class="common_input_label">X</span>
        <input
          v-model.number="cropX"
          class="field__input"
          type="number"
        >
      </label>
      <label class="inline-block mr-10">
        <span class="common_input_label">Y</span>
        <input
          v-model.number="cropY"
          class="field__input"
          type="number"
        >
      </label>
      <label class="inline-block mr-10">
        <span class="common_input_label">Width</span>
        <input
          v-model.number="cropWidth"
          class="field__input"
          type="number"
        >
      </label>
      <label class="inline-block mr-10">
        <span class="common_input_label">Height</span>
        <input
          v-model.number="cropHeight"
          class="field__input"
          type="number"
        >
      </label>
    </div>
    <div
      v-else-if="tool === 'resize'"
      class="image-view__controls"
    >
      <label class="inline-block mr-10">
        <span class="common_input_label">Width</span>
        <input
          v-model.number="outputWidth"
          class="field__input"
          type="number"
        >
      </label>
      <label class="inline-block mr-10">
        <span class="common_input_label">Height</span>
        <input
          v-model.number="outputHeight"
          class="field__input"
          type="number"
        >
      </label>
      <p class="route-workspace__subline">
        Input: {{ inputWidth }} × {{ inputHeight }}
      </p>
    </div>
    <div
      v-else-if="tool === 'tinyPng'"
      class="image-view__controls"
    >
      <UiInput
        v-model="tinyPngKey"
        label="TinyPNG API Key"
        type="password"
        placeholder="Stored in VS Code settings"
      />
      <VscButton
        type="default"
        @click="bridge?.emit('saveTinyPngApiKey', tinyPngKey)"
      >
        Save key
      </VscButton>
      <span class="route-workspace__subline">
        {{ tinyPngConfigured ? "API key configured" : "API key not configured" }}
      </span>
    </div>
    <textarea
      v-else-if="tool === 'svg'"
      v-model="svgSource"
      class="field__input image-view__svg"
      spellcheck="false"
    />

    <div class="image-view__preview-grid">
      <article class="image-view__panel">
        <h2>Input</h2>
        <img
          v-if="sourceDataUrl"
          :src="sourceDataUrl"
          :alt="sourceName"
          class="image-view__preview"
        >
        <p
          v-else
          class="route-workspace__empty"
        >
          Select or paste an image to begin.
        </p>
      </article>
      <article class="image-view__panel">
        <h2>Output</h2>
        <img
          v-if="outputDataUrl"
          :src="outputDataUrl"
          alt="Processed result"
          class="image-view__preview"
        >
        <pre
          v-else-if="tool === 'base64'"
          class="image-view__text"
        >Run the converter to produce Base64 data.</pre>
        <p
          v-else
          class="route-workspace__empty"
        >
          No output yet.
        </p>
      </article>
    </div>
    <p
      v-if="status"
      class="route-workspace__status"
    >
      {{ status }}
    </p>
  </section>
</template>
