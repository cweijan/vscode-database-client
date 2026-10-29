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

const CLASS_TOKEN = /(?<![\w-])[a-z][a-z0-9]*(?:-[a-z0-9]+)*__(?:[a-z0-9]+-)*[a-z0-9]+|(?<![\w-])(?:es|ssh|er|db|vsc|tw|mock|redis|rabbit|struct|data|line|metric)-[a-z0-9]+(?:-[a-z0-9]+)*/g;

function parseArguments(argv) {
  const options = { reference: "reference/target-webview/modules", output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--reference") options.reference = argv[++index];
    else if (argument === "--output") options.output = argv[++index];
    else if (argument === "--help" || argument === "-h") {
      console.log(
        "Usage: node scripts/source-recovery/webview-parity.mjs [--reference <dir>] [--output <json>]",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
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

function candidateClasses(source) {
  const classes = new Set();
  for (const match of source.matchAll(/class="([^"]+)"/g)) {
    for (const name of match[1].split(/\s+/)) {
      if (name && !name.includes("{")) classes.add(name);
    }
  }
  for (const match of source.matchAll(/'([a-z][\w-]*(?:__|--)[\w-]+)'/g)) {
    classes.add(match[1]);
  }
  for (const match of source.matchAll(/`([a-z][\w-]*(?:__|--)[\w-]+)`/g)) {
    classes.add(match[1]);
  }
  return classes;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const referenceRoot = path.resolve(repositoryRoot, options.reference);
  const componentsRoot = path.resolve(repositoryRoot, "src/modern-webview/components");

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
    try {
      componentSource = await fs.readFile(componentPath, "utf8");
    } catch {
      componentSource = "";
    }
    const expected = targetClasses(moduleSource);
    const actual = candidateClasses(componentSource);
    const missing = [...expected].filter((name) => !actual.has(name)).sort();
    const shared = [...expected].filter((name) => actual.has(name)).length;
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
