import path from "node:path";
import { fileURLToPath } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(repositoryRoot, "src/modern-webview"),
  base: "./",
  plugins: [vue()],
  resolve: {
    alias: {
      "@": path.resolve(repositoryRoot, "src"),
      "@webview": path.resolve(repositoryRoot, "src/modern-webview"),
    },
  },
  build: {
    outDir: path.resolve(repositoryRoot, "dist-modern/webview"),
    emptyOutDir: true,
    sourcemap: true,
    target: "es2022",
    rollupOptions: {
      input: path.resolve(repositoryRoot, "src/modern-webview/app.html"),
    },
  },
});
