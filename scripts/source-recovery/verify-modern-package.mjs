#!/usr/bin/env node

import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildContract,
  collectManifestPathReferences,
  extractHtmlReferences,
} from "./contract.mjs";
import { collectManifestSurface } from "./inventory.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");
const inventoryPath = path.join(
  projectRoot,
  "openspec/changes/restore-modern-source-9-0-2/evidence/target-inventory.json",
);
const stagedRoot = path.join(projectRoot, "dist-modern", "package");

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

async function exists(relativePath) {
  try {
    await fs.access(path.join(stagedRoot, relativePath.split("/").join(path.sep)));
    return true;
  } catch {
    return false;
  }
}

async function resolveReference(relativePath) {
  if (await exists(relativePath)) return true;
  if (!path.posix.extname(relativePath)) {
    return (await exists(`${relativePath}.js`)) || (await exists(`${relativePath}.json`));
  }
  return false;
}

const inventory = JSON.parse(await fs.readFile(inventoryPath, "utf8"));
const contract = await buildContract({ targetRoot: null }, inventory);
const manifest = JSON.parse(await fs.readFile(path.join(stagedRoot, "package.json"), "utf8"));
const failures = [];

if (JSON.stringify(canonical(collectManifestSurface(manifest))) !== JSON.stringify(canonical(contract.manifest))) {
  failures.push("manifest surface differs from the 9.0.2 target contract");
}
for (const reference of collectManifestPathReferences(manifest)) {
  if (!(await resolveReference(reference.resolvedPath))) failures.push(`missing manifest reference: ${reference.reference}`);
}

const htmlPath = "out/webview/app.html";
if (!(await exists(htmlPath))) {
  failures.push("missing modern Webview entry: out/webview/app.html");
} else {
  const html = await fs.readFile(path.join(stagedRoot, htmlPath), "utf8");
  for (const reference of extractHtmlReferences(html, htmlPath)) {
    if (!(await exists(reference.resolvedPath))) failures.push(`missing Webview asset: ${reference.reference}`);
  }
}
for (const required of contract.resourceClosure.staticRequiredFiles) {
  if (!(await exists(required))) failures.push(`missing static resource: ${required}`);
}

assert.equal(await exists("out/extension.js"), true, "missing modern extension entry");
const extension = await fs.readFile(path.join(stagedRoot, "out/extension.js"), "utf8");
assert.match(extension, /Modern source build activated/);

const result = {
  valid: failures.length === 0,
  failures,
  candidate: {
    root: stagedRoot,
    manifest: { name: manifest.name, version: manifest.version, main: manifest.main },
    webviewReferenceCount: (await fs.readFile(path.join(stagedRoot, htmlPath), "utf8")).match(/(?:src|href)\s*=\s*["'][^"']+["']/gi)?.length || 0,
  },
};
console.log(JSON.stringify(result, null, 2));
if (!result.valid) process.exitCode = 1;
