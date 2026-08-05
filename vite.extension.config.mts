import path from "node:path";
import { fileURLToPath } from "node:url";
import { builtinModules } from "node:module";

import { defineConfig } from "vite";

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url));
const nodeBuiltins = [
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
];

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(repositoryRoot, "src"),
      "@modern": path.resolve(repositoryRoot, "src/modern"),
    },
  },
  build: {
    outDir: path.resolve(repositoryRoot, "dist-modern/extension"),
    emptyOutDir: true,
    sourcemap: true,
    target: "node20",
    lib: {
      entry: path.resolve(repositoryRoot, "src/modern/extension.ts"),
      formats: ["cjs"],
      fileName: () => "extension.js",
    },
    rollupOptions: {
      // Database drivers are Node-oriented CommonJS packages. Keep them in
      // the extension's normal dependency graph so their own built-in-module
      // resolution remains intact at activation time.
      external: [
        "vscode",
        "@cweijan/mysql2",
        "@cweijan/mysql2/promise",
        "pg",
        "axios",
        "ioredis",
        "mongodb",
        "neo4j-driver",
        "tedious",
        ...nodeBuiltins,
      ],
    },
  },
});
