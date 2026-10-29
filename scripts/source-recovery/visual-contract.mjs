#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { collectManifestSurface } from "./inventory.mjs";

const VISUAL_RESOURCE_PATTERN = /^(?:resources\/(?:icon|image)\/|image\/)/i;
const SERVER_ICON_PATTERN = /^resources\/icon\/server\//i;
const SOURCE_FILE_PATTERN = /\.(?:[cm]?js|ts|vue)$/i;

function parseArguments(argv) {
  const options = {
    targetRoot: null,
    candidateRoot: null,
    inventory: null,
    output: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--target-root") options.targetRoot = argv[++index];
    else if (argument === "--candidate-root") options.candidateRoot = argv[++index];
    else if (argument === "--inventory") options.inventory = argv[++index];
    else if (argument === "--output") options.output = argv[++index];
    else if (argument === "--help" || argument === "-h") {
      console.log(
        [
          "Usage:",
          "  node scripts/source-recovery/visual-contract.mjs --target-root <installed-extension> [options]",
          "",
          "Options:",
          "  --candidate-root <path> Candidate source/package to verify.",
          "  --inventory <path>      Target inventory JSON; generated when omitted.",
          "  --output <path>         Write JSON instead of stdout.",
        ].join("\n"),
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!options.targetRoot) throw new Error("--target-root is required");
  return options;
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    String(left).localeCompare(String(right)),
  );
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function collectFiles(root) {
  const files = [];
  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolutePath);
      else if (entry.isFile()) {
        files.push({
          absolutePath,
          path: toPosix(path.relative(root, absolutePath)),
        });
      }
    }
  }
  await visit(root);
  return files;
}

function explicitContextValues(menus) {
  const values = [];
  for (const entries of Object.values(menus)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || typeof entry.when !== "string") continue;
      for (const match of entry.when.matchAll(/viewItem\s*==\s*([A-Za-z0-9_-]+)/g)) {
        values.push(match[1]);
      }
      for (const match of entry.when.matchAll(/viewItem\s*=~\s*\/([^/]+)\//g)) {
        values.push(...[...match[1].matchAll(/[A-Za-z][A-Za-z0-9_-]+/g)].map((item) => item[0]));
      }
    }
  }
  return sortedUnique(values);
}

function menuSurface(manifest) {
  const menus = manifest.contributes?.menus ?? {};
  const selected = ["view/item/context", "view/title", "commandPalette"];
  return Object.fromEntries(
    selected.map((location) => [
      location,
      Array.isArray(menus[location])
        ? menus[location].map((entry) => ({
            command: entry.command ?? null,
            submenu: entry.submenu ?? null,
            when: entry.when ?? null,
            group: entry.group ?? null,
          }))
        : [],
    ]),
  );
}

function routeMarkers(content) {
  const routes = [];
  const pattern = /(?:route|path|name)\s*[:=]\s*["']\/?([A-Za-z][A-Za-z0-9_-]*)["']/g;
  for (const match of content.matchAll(pattern)) routes.push(match[1]);
  return sortedUnique(routes);
}

async function collectTargetRouteMarkers(targetRoot, files) {
  const routes = [];
  for (const file of files) {
    if (!file.path.startsWith("out/") || !SOURCE_FILE_PATTERN.test(file.path)) continue;
    const content = await fs.readFile(file.absolutePath, "utf8");
    routes.push(...routeMarkers(content));
  }
  return sortedUnique(routes);
}

async function buildTargetContract(targetRoot, inventoryPath) {
  const inventory = await readJson(inventoryPath);
  const manifest = await readJson(path.join(targetRoot, "package.json"));
  const targetFiles = await collectFiles(targetRoot);
  const resources = inventory.resources.filter((resource) =>
    VISUAL_RESOURCE_PATTERN.test(resource),
  );
  const serverIcons = resources.filter((resource) => SERVER_ICON_PATTERN.test(resource));
  const menus = manifest.contributes?.menus ?? {};
  return {
    schemaVersion: 1,
    provenance: {
      generatedBy: "scripts/source-recovery/visual-contract.mjs",
      targetRoot: path.resolve(targetRoot),
      inventory: path.resolve(inventoryPath),
    },
    target: {
      name: manifest.name ?? null,
      version: manifest.version ?? null,
      manifestSurface: collectManifestSurface(manifest),
    },
    resources: {
      visual: resources,
      serverIcons,
      webview: inventory.webviewAssets,
    },
    menus: menuSurface(manifest),
    contextValues: explicitContextValues(menus),
    targetRouteMarkers: await collectTargetRouteMarkers(targetRoot, targetFiles),
  };
}

async function verifyCandidate(candidateRoot, targetContract) {
  const manifest = await readJson(path.join(candidateRoot, "package.json"));
  const candidateFiles = await collectFiles(candidateRoot);
  const candidatePaths = new Set(candidateFiles.map((file) => file.path));
  const missingVisualResources = targetContract.resources.visual.filter(
    (resource) => !candidatePaths.has(resource),
  );
  const sourceFiles = candidateFiles.filter(
    (file) => file.path.startsWith("src/modern/") || file.path.startsWith("src/modern-webview/"),
  );
  const themeIcons = [];
  for (const file of sourceFiles) {
    if (!SOURCE_FILE_PATTERN.test(file.path)) continue;
    const content = await fs.readFile(file.absolutePath, "utf8");
    for (const match of content.matchAll(/new\s+vscode\.ThemeIcon\(\s*["']([^"']+)["']/g)) {
      themeIcons.push({ path: file.path, icon: match[1] });
    }
  }
  return {
    schemaVersion: 1,
    candidateRoot: path.resolve(candidateRoot),
    manifestSurfaceMatches: JSON.stringify(collectManifestSurface(manifest)) ===
      JSON.stringify(targetContract.target.manifestSurface),
    missingVisualResources,
    missingServerIcons: targetContract.resources.serverIcons.filter(
      (resource) => !candidatePaths.has(resource),
    ),
    candidateThemeIcons: themeIcons,
    status: missingVisualResources.length === 0 ? "pass" : "fail",
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const inventoryPath = options.inventory
    ? path.resolve(options.inventory)
    : path.join(path.resolve(options.targetRoot), ".visual-inventory.json");
  try {
    await fs.access(inventoryPath);
  } catch {
    throw new Error(`Target inventory does not exist: ${inventoryPath}`);
  }
  const target = await buildTargetContract(path.resolve(options.targetRoot), inventoryPath);
  const output = options.candidateRoot
    ? { target, candidate: await verifyCandidate(path.resolve(options.candidateRoot), target) }
    : target;
  const serialized = JSON.stringify(output, null, 2) + "\n";
  if (options.output) {
    const outputPath = path.resolve(options.output);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, serialized, "utf8");
  } else {
    process.stdout.write(serialized);
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
