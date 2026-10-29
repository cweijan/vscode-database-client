#!/usr/bin/env node
/**
 * Compares the class skeleton of every recovered webview page with the class skeleton the 9.0.2
 * build renders for the same route, and reports what is still missing per page.
 *
 * Target classes are read from the decompiled reference modules (see decompile-webview.mjs);
 * candidate classes are read from the Vue templates in src/modern-webview/components.
 *
 * Usage: node scripts/source-recovery/webview-parity.mjs --reference reference/target-webview/modules
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Target module -> recovered component that must render the same surface. */
const PAGE_MODULES = {
  Main: "MainView.vue",
  connect: "ConnectionView.vue",
  ConnectResult: "target/ConnectResult.vue",
  DbFileConnect: "DatabaseFileView.vue",
  DbFileConnectPanel: "DatabaseFilePanel.vue",
  ParquetView: "ParquetView.vue",
  SqliteView: "SqliteView.vue",
  Result: "ResultView.vue",
  manager: "ManagerView.vue",
  esStatus: "ElasticsearchStatusView.vue",
  design: "DesignView.vue",
  er: "ErDiagramView.vue",
  Mock: "MockView.vue",
  structDiff: "StructureDiffView.vue",
  RedisView: "RedisView.vue",
  RabbitQueueView: "RabbitQueueView.vue",
  forward: "ForwardView.vue",
  SshTerminal: "SshTerminalView.vue",
  RemoteFileManager: "RemoteFileManagerView.vue",
  sshStatus: "SshStatusView.vue",
  sshMonitor: "SshMonitorView.vue",
  center: "CenterView.vue",
  document: "DocumentView.vue",
  Plan: "PlanView.vue",
  Settings: "SettingsView.vue",
  util: "UtilView.vue",
  image: "ImageView.vue",
  HexViewer: "HexViewer.vue",
};

/**
 * Classes that belong to an embedded vendor renderer rather than to the page markup.
 * `overlay` is the AntV X6 graph layer selector bundled by the er page.
 */
const VENDOR_CLASSES = {
  er: ["overlay"],
};

const CLASS_TOKEN = /(?<![\w-])[a-z][a-z0-9]*(?:-[a-z0-9]+)*__(?:[a-z0-9]+-)*[a-z0-9]+|(?<![\w-])(?:es|ssh|er|db|vsc|tw|mock|redis|rabbit|struct|data|line|metric)-[a-z0-9]+(?:-[a-z0-9]+)*/g;

function parseArguments(argv) {
  const options = {
    reference: "reference/target-webview/modules",
    styles: "reference/target-webview/styles",
    output: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--reference") options.reference = argv[++index];
    else if (argument === "--styles") options.styles = argv[++index];
    else if (argument === "--output") options.output = argv[++index];
    else if (argument === "--help" || argument === "-h") {
      console.log(
        "Usage: node scripts/source-recovery/webview-parity.mjs [--reference <dir>] [--styles <dir>] [--output <json>]",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

/**
 * Classes the target itself authored. Only selectors carrying a scope attribute are considered, and
 * classes that a chunk also ships unscoped (Tailwind utilities, Element Plus internals, `:deep()`
 * escapes) are removed, so third-party markup never counts as an expected page class.
 */
async function loadProjectClasses(stylesRoot) {
  const scoped = new Set();
  const unscoped = new Set();
  let files = [];
  try {
    files = (await fs.readdir(stylesRoot)).filter((name) => name.endsWith(".css"));
  } catch {
    return scoped;
  }
  for (const file of files) {
    const css = await fs.readFile(path.join(stylesRoot, file), "utf8");
    for (const match of css.matchAll(/([^{}]*)\{/g)) {
      const selector = match[1];
      const isScoped = selector.includes("[data-v-") && !selector.includes(":deep(");
      for (const name of selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
        if (isScoped) scoped.add(name[1]);
        else unscoped.add(name[1]);
      }
    }
  }
  for (const name of unscoped) scoped.delete(name);
  return scoped;
}

function collect(source, pattern) {
  const found = new Set();
  for (const match of source.matchAll(pattern)) found.add(match[1] ?? match[0]);
  return found;
}

function targetClasses(source) {
  const classes = new Set();
  const literalPattern = /class: `([^`]+)`/g;
  for (const match of source.matchAll(literalPattern)) {
    for (const name of match[1].split(/\s+/)) {
      if (name) classes.add(name);
    }
  }
  const templatePattern = /class: normalizeClass\(\[([^\]]*)\]\)/g;
  for (const match of source.matchAll(templatePattern)) {
    for (const name of match[1].matchAll(/`([^`]+)`/g)) {
      for (const part of name[1].split(/\s+/)) {
        if (part) classes.add(part);
      }
    }
  }
  return classes;
}

function escapeForPattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A class counts as rendered when the page or one of its local child components mentions it. */
function componentUsesClass(source, className) {
  return new RegExp(`(?<![-\\w])${escapeForPattern(className)}(?![-\\w])`).test(source);
}

/**
 * Concatenates the page component with the local components it renders so a page's surface is
 * measured as a whole (the target bundle also inlines those children in the page chunk).
 */
async function collectPageSource(entryPath, depth = 0, seen = new Set()) {
  if (depth > 3 || seen.has(entryPath)) return "";
  seen.add(entryPath);
  let source;
  try {
    source = await fs.readFile(entryPath, "utf8");
  } catch {
    return "";
  }
  const parts = [source];
  const directory = path.dirname(entryPath);
  for (const match of source.matchAll(/from\s+"(\.[^"]+)"/g)) {
    const specifier = match[1];
    if (!/\.(vue|ts)$/.test(specifier)) continue;
    const resolved = path.resolve(directory, specifier);
    parts.push(await collectPageSource(resolved, depth + 1, seen));
  }
  return parts.join("\n");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const referenceRoot = path.resolve(repositoryRoot, options.reference);
  const componentsRoot = path.resolve(repositoryRoot, "src/modern-webview/components");
  const projectClasses = await loadProjectClasses(path.resolve(repositoryRoot, options.styles));

  const pages = [];
  for (const [moduleName, componentName] of Object.entries(PAGE_MODULES)) {
    const modulePath = path.join(referenceRoot, `${moduleName}.js`);
    const componentPath = path.join(componentsRoot, componentName);
    let moduleSource;
    let componentSource;
    try {
      moduleSource = await fs.readFile(modulePath, "utf8");
    } catch {
      continue;
    }
    componentSource = await collectPageSource(componentPath);
    const vendor = new Set(VENDOR_CLASSES[moduleName] ?? []);
    const expected = new Set(
      [...targetClasses(moduleSource)]
        .filter((name) => projectClasses.has(name) && !vendor.has(name)),
    );
    const matched = [...expected].filter((name) => componentUsesClass(componentSource, name));
    const missing = [...expected].filter((name) => !matched.includes(name)).sort();
    const shared = matched.length;
    pages.push({
      module: moduleName,
      component: componentName,
      targetClasses: expected.size,
      matchedClasses: shared,
      coverage: expected.size === 0 ? 1 : Number((shared / expected.size).toFixed(3)),
      missing,
    });
  }

  pages.sort((left, right) => left.coverage - right.coverage);
  const report = {
    generatedBy: "scripts/source-recovery/webview-parity.mjs",
    pageCount: pages.length,
    averageCoverage: Number(
      (pages.reduce((total, page) => total + page.coverage, 0) / (pages.length || 1)).toFixed(3),
    ),
    pages,
  };

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) {
    const file = path.resolve(repositoryRoot, options.output);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, serialized, "utf8");
  } else {
    process.stdout.write(serialized);
  }
  console.log(
    `pages: ${report.pageCount}, average markup-class coverage: ${report.averageCoverage}`,
  );
}

await main();
