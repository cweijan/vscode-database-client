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
      // The staged extension is intentionally self-contained: its package
      // does not ship the workspace's node_modules directory. Keep only the
      // VS Code API and Node built-ins external; bundling the application
      // dependencies also makes optional providers work after installation.
      external: [
        "vscode",
        // These driver wrappers are already part of the legacy out/node_modules
        // closure and include optional/native paths that should not be parsed
        // as application JavaScript by the extension bundler.
        "mongodb",
        "neo4j-driver",
        "tedious",
        "@database-client/dmdb",
        ...nodeBuiltins,
      ],
    },
  },
});
