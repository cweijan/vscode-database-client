#!/usr/bin/env node
/**
 * Renders recovered webview components with the Vue server renderer so component behaviour can be
 * checked without a VS Code instance. The entry file is bundled through the repository's Vite +
 * Vue setup, executed, and then discarded.
 *
 * Usage: node scripts/source-recovery/render-smoke.mjs <entry.ts> [--out <dir>]
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import vue from "@vitejs/plugin-vue";
import { build } from "vite";

function parseArguments(argv) {
  const options = { entry: null, out: ".render-smoke" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--out") options.out = argv[++index];
    else if (!options.entry) options.entry = argument;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.entry) throw new Error("an entry file is required");
  return options;
}

const options = parseArguments(process.argv.slice(2));
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = path.resolve(repositoryRoot, options.out);

await build({
  root: repositoryRoot,
  configFile: false,
  logLevel: "silent",
  plugins: [vue()],
  publicDir: false,
  build: {
    ssr: path.resolve(repositoryRoot, options.entry),
    outDir,
    emptyOutDir: true,
    target: "node20",
    minify: false,
  },
});

const outputFiles = await fs.readdir(outDir);
const entryFile = outputFiles.find((name) => name.endsWith(".mjs"));
if (!entryFile) throw new Error("render smoke bundle was not produced");
await import(pathToFileURL(path.join(outDir, entryFile)).href);
await fs.rm(outDir, { recursive: true, force: true });
console.log(`render smoke passed: ${options.entry}`);
