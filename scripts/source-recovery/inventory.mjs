#!/usr/bin/env node

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ORACLE_BACKUP_PATTERN = /\.bak-oracle-synonym-\d+$/i;
const SOURCE_PATH_PATTERN = /^src\/[^\s*]+$/;
const SOURCE_EXTENSION_PATTERN = /\.(?:(?:c|m)?jsx?|tsx?|vue)$/i;

function parseArguments(argv) {
  const options = {
    projectRoot: process.cwd(),
    targetRoot: null,
    output: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--project-root") {
      options.projectRoot = argv[++index];
    } else if (argument === "--target-root") {
      options.targetRoot = argv[++index];
    } else if (argument === "--output") {
      options.output = argv[++index];
    } else if (argument === "--help" || argument === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error("Unknown argument: " + argument);
    }
  }

  if (!options.targetRoot) {
    throw new Error("--target-root is required");
  }

  return options;
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node scripts/source-recovery/inventory.mjs --target-root <installed-extension> [options]",
      "",
      "Options:",
      "  --project-root <path>  Repository root used for provenance checks.",
      "  --output <path>        Write JSON to a file instead of stdout.",
    ].join("\n"),
  );
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function displayRoot(root, label) {
  return {
    label,
    absolutePath: path.resolve(root),
    placeholder: "<" + label + ">",
  };
}

async function ensureDirectory(directory) {
  const stat = await fs.stat(directory);
  if (!stat.isDirectory()) {
    throw new Error("Expected a directory: " + directory);
  }
}

async function collectFiles(root) {
  const files = [];

  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile()) {
        files.push({
          absolutePath,
          relativePath: toPosix(path.relative(root, absolutePath)),
        });
      }
    }
  }

  await visit(root);
  return files;
}

async function describeFile(file) {
  const content = await fs.readFile(file.absolutePath);
  return {
    path: file.relativePath,
    size: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    String(left).localeCompare(String(right)),
  );
}

function collectManifestSurface(manifest) {
  const contributes = manifest.contributes ?? {};
  const commands = arrayValue(contributes.commands);
  const views = Object.entries(contributes.views ?? {}).flatMap(
    ([container, entries]) =>
      arrayValue(entries).map((entry) => ({
        container,
        id: entry.id ?? null,
        name: entry.name ?? null,
        type: entry.type ?? "tree",
      })),
  );
  const viewContainers = Object.entries(contributes.viewsContainers ?? {}).flatMap(
    ([location, entries]) =>
      arrayValue(entries).map((entry) => ({
        location,
        id: entry.id ?? null,
        title: entry.title ?? null,
      })),
  );
  const configurationEntries = arrayValue(contributes.configuration);
  const configurationObjects =
    configurationEntries.length > 0
      ? configurationEntries
      : [contributes.configuration ?? {}];
  const settings = configurationObjects.flatMap((configuration) =>
    Object.keys(configuration.properties ?? {}),
  );
  const languages = arrayValue(contributes.languages).map((language) => ({
    id: language.id ?? null,
    aliases: arrayValue(language.aliases),
    extensions: arrayValue(language.extensions),
  }));
  const grammars = arrayValue(contributes.grammars).map((grammar) => ({
    language: grammar.language ?? null,
    scopeName: grammar.scopeName ?? null,
    path: grammar.path ?? null,
  }));
  const customEditors = arrayValue(contributes.customEditors).map((editor) => ({
    viewType: editor.viewType ?? null,
    selector: editor.selector ?? null,
    priority: editor.priority ?? null,
  }));
  const languageModelTools = arrayValue(contributes.languageModelTools).map(
    (tool) => ({
      name: tool.name ?? null,
      displayName: tool.displayName ?? null,
    }),
  );

  return {
    extension: {
      name: manifest.name ?? null,
      displayName: manifest.displayName ?? null,
      publisher: manifest.publisher ?? null,
      version: manifest.version ?? null,
      main: manifest.main ?? null,
      browser: manifest.browser ?? null,
      engines: manifest.engines ?? {},
      activationEvents: arrayValue(manifest.activationEvents),
    },
    commands: {
      count: commands.length,
      ids: sortedUnique(commands.map((command) => command.command)),
      entries: commands.map((command) => ({
        command: command.command ?? null,
        title: command.title ?? null,
        category: command.category ?? null,
        enablement: command.enablement ?? null,
      })),
    },
    views: {
      count: views.length,
      ids: sortedUnique(views.map((view) => view.id)),
      entries: views,
    },
    viewContainers: {
      count: viewContainers.length,
      ids: sortedUnique(viewContainers.map((container) => container.id)),
      entries: viewContainers,
    },
    settings: {
      count: sortedUnique(settings).length,
      keys: sortedUnique(settings),
    },
    languages: {
      count: languages.length,
      ids: sortedUnique(languages.map((language) => language.id)),
      entries: languages,
    },
    grammars: {
      count: grammars.length,
      scopeNames: sortedUnique(grammars.map((grammar) => grammar.scopeName)),
      entries: grammars,
    },
    customEditors: {
      count: customEditors.length,
      viewTypes: sortedUnique(customEditors.map((editor) => editor.viewType)),
      entries: customEditors,
    },
    languageModelTools: {
      count: languageModelTools.length,
      names: sortedUnique(languageModelTools.map((tool) => tool.name)),
      entries: languageModelTools,
    },
    menus: Object.fromEntries(
      Object.entries(contributes.menus ?? {}).map(([location, entries]) => [
        location,
        arrayValue(entries).map((entry) => ({
          command: entry.command ?? null,
          when: entry.when ?? null,
          group: entry.group ?? null,
        })),
      ]),
    ),
  };
}

function fileKind(relativePath) {
  if (relativePath === "package.json") {
    return "manifest";
  }
  if (relativePath.startsWith("out/webview/")) {
    return "webview-asset";
  }
  if (relativePath.startsWith("out/")) {
    return "runtime";
  }
  if (
    relativePath.startsWith("resources/") ||
    relativePath.startsWith("syntaxes/") ||
    relativePath.startsWith("image/") ||
    /^package\.nls(?:\..+)?\.json$/i.test(relativePath)
  ) {
    return "resource";
  }
  return "package-file";
}

async function collectSourceMarkers(activeFiles) {
  const occurrences = [];

  for (const file of activeFiles) {
    if (!file.relativePath.startsWith("out/")) {
      continue;
    }
    if (!/\.(?:c|m)?jsx?$/i.test(file.relativePath)) {
      continue;
    }

    const content = await fs.readFile(file.absolutePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const candidate = line
        .trim()
        .replace(/^\/\*\s*/, "")
        .replace(/\s*\*\/$/, "");
      const sourcePath = candidate.startsWith("//")
        ? candidate.slice(2).trim()
        : candidate;
      if (
        SOURCE_PATH_PATTERN.test(sourcePath) &&
        SOURCE_EXTENSION_PATTERN.test(sourcePath)
      ) {
        occurrences.push({
          bundleFile: file.relativePath,
          sourcePath,
          role: sourcePath.startsWith("src/bin/")
            ? "bundled-runtime"
            : "product-source",
        });
      }
    }
  }

  const uniqueOccurrences = Array.from(
    new Map(
      occurrences.map((occurrence) => [
        occurrence.bundleFile + ":" + occurrence.sourcePath,
        occurrence,
      ]),
    ).values(),
  ).sort((left, right) =>
    (left.bundleFile + ":" + left.sourcePath).localeCompare(
      right.bundleFile + ":" + right.sourcePath,
    ),
  );
  const uniquePaths = sortedUnique(
    uniqueOccurrences.map((occurrence) => occurrence.sourcePath),
  );

  return {
    occurrenceCount: uniqueOccurrences.length,
    uniquePathCount: uniquePaths.length,
    productPathCount: uniquePaths.filter(
      (sourcePath) => !sourcePath.startsWith("src/bin/"),
    ).length,
    bundledRuntimePathCount: uniquePaths.filter((sourcePath) =>
      sourcePath.startsWith("src/bin/"),
    ).length,
    uniquePaths,
    occurrences: uniqueOccurrences,
  };
}

function collectWebviewAssetPaths(activeFiles) {
  return activeFiles
    .filter((file) => file.relativePath.startsWith("out/webview/"))
    .map((file) => file.relativePath)
    .sort((left, right) => left.localeCompare(right));
}

function collectResourcePaths(activeFiles) {
  return activeFiles
    .filter((file) => file.kind === "resource")
    .map((file) => file.relativePath)
    .sort((left, right) => left.localeCompare(right));
}

async function buildInventory(options) {
  await ensureDirectory(options.projectRoot);
  await ensureDirectory(options.targetRoot);

  const targetFiles = await collectFiles(options.targetRoot);
  const inactiveFiles = targetFiles.filter((file) =>
    ORACLE_BACKUP_PATTERN.test(file.relativePath),
  );
  const activeFileEntries = targetFiles.filter(
    (file) => !ORACLE_BACKUP_PATTERN.test(file.relativePath),
  );
  const activeFiles = [];
  for (const file of activeFileEntries) {
    const description = await describeFile(file);
    activeFiles.push({
      ...description,
      kind: fileKind(file.relativePath),
      absolutePath: file.absolutePath,
      relativePath: file.relativePath,
    });
  }

  const packagePath = path.join(options.targetRoot, "package.json");
  const manifest = await readJson(packagePath);
  const manifestSurface = collectManifestSurface(manifest);
  const sourceMarkers = await collectSourceMarkers(activeFiles);
  const normalizedActiveFiles = activeFiles
    .map(({ absolutePath, relativePath, ...file }) => ({
      ...file,
      path: relativePath,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const inactiveFileDescriptions = [];
  for (const file of inactiveFiles) {
    const description = await describeFile(file);
    inactiveFileDescriptions.push({
      ...description,
      kind: "preserved-backup",
    });
  }

  const outFiles = normalizedActiveFiles
    .filter((file) => file.kind === "runtime")
    .map((file) => file.path);
  const dependencies = {
    production: Object.keys(manifest.dependencies ?? {}).sort(),
    optional: Object.keys(manifest.optionalDependencies ?? {}).sort(),
    bundledRuntimeFiles: outFiles.filter((file) =>
      file.startsWith("out/node_modules/"),
    ),
  };

  return {
    schemaVersion: 1,
    provenance: {
      targetRoot: displayRoot(options.targetRoot, "installed-extension"),
      projectRoot: displayRoot(options.projectRoot, "repository"),
      generatedBy: "scripts/source-recovery/inventory.mjs",
      targetFilesExcludePattern: ORACLE_BACKUP_PATTERN.source,
    },
    target: manifestSurface.extension,
    manifestSurface,
    counts: {
      allFiles: targetFiles.length,
      activeFiles: normalizedActiveFiles.length,
      preservedBackupFiles: inactiveFileDescriptions.length,
      runtimeFiles: outFiles.length,
      webviewAssets: normalizedActiveFiles.filter(
        (file) => file.kind === "webview-asset",
      ).length,
      resourceFiles: normalizedActiveFiles.filter(
        (file) => file.kind === "resource",
      ).length,
    },
    runtimeDependencies: dependencies,
    webviewAssets: collectWebviewAssetPaths(
      activeFiles.map((file) => ({
        relativePath: file.relativePath,
      })),
    ),
    resources: collectResourcePaths(normalizedActiveFiles),
    sourceMarkers,
    activeFiles: normalizedActiveFiles,
    preservedBackupFiles: inactiveFileDescriptions.sort((left, right) =>
      left.path.localeCompare(right.path),
    ),
  };
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    const inventory = await buildInventory(options);
    const output = JSON.stringify(inventory, null, 2) + "\n";

    if (options.output) {
      await fs.mkdir(path.dirname(path.resolve(options.output)), {
        recursive: true,
      });
      await fs.writeFile(options.output, output, "utf8");
    } else {
      process.stdout.write(output);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

export { collectManifestSurface };

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  await main();
}
