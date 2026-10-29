#!/usr/bin/env node
/**
 * Reports CSS selectors the candidate webview still defines that the 9.0.2 target stylesheet does
 * not, together with how often each invented selector is used in Vue templates.
 *
 * The goal of the visual restoration is that the candidate keeps shrinking this list: every entry
 * is a piece of custom UI that has not been replaced with the target markup yet.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLASS_PATTERN = /\.(-?[_a-zA-Z][\w-]*)/g;

function parseArguments(argv) {
  const options = {
    candidate: "src/modern-webview",
    targetStyles: "src/modern-webview/styles/target",
    output: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--candidate") options.candidate = argv[++index];
    else if (argument === "--target-styles") options.targetStyles = argv[++index];
    else if (argument === "--output") options.output = argv[++index];
    else if (argument === "--help" || argument === "-h") {
      console.log(
        [
          "Usage:",
          "  node scripts/source-recovery/webview-style-audit.mjs [--candidate <dir>] [--target-styles <file>] [--output <json>]",
        ].join("\n"),
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function collectClasses(css) {
  const classes = new Set();
  for (const match of css.matchAll(CLASS_PATTERN)) {
    classes.add(match[1]);
  }
  return classes;
}

function escapeForPattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const candidateRoot = path.resolve(repositoryRoot, options.candidate);
  const targetStyles = path.resolve(repositoryRoot, options.targetStyles);

  const targetStat = await fs.stat(targetStyles);
  const targetClasses = new Set();
  const targetFiles = targetStat.isDirectory()
    ? (await fs.readdir(targetStyles))
        .filter((name) => name.endsWith(".css"))
        .map((name) => path.join(targetStyles, name))
    : [targetStyles];
  for (const file of targetFiles) {
    for (const className of collectClasses(await fs.readFile(file, "utf8"))) {
      targetClasses.add(className);
    }
  }

  const entries = await fs.readdir(candidateRoot, { withFileTypes: true });
  const styleFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".css"));

  const invented = new Map();
  for (const entry of styleFiles) {
    const css = await fs.readFile(path.join(candidateRoot, entry.name), "utf8");
    for (const className of collectClasses(css)) {
      if (targetClasses.has(className)) continue;
      invented.set(className, { stylesheet: entry.name, usages: 0 });
    }
  }

  const componentsDirectory = path.join(candidateRoot, "components");
  const componentFiles = (await fs.readdir(componentsDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".vue"))
    .map((entry) => path.join(componentsDirectory, entry.name));

  const patterns = [...invented.entries()].map(([className, info]) => ({
    className,
    info,
    pattern: new RegExp(`(?<![-\\w])${escapeForPattern(className)}(?![-\\w])`, "g"),
  }));

  for (const file of componentFiles) {
    const source = await fs.readFile(file, "utf8");
    for (const { info, pattern } of patterns) {
      const matches = source.match(pattern);
      if (matches) info.usages += matches.length;
    }
  }

  const report = {
    generatedBy: "scripts/source-recovery/webview-style-audit.mjs",
    targetStyles: path.relative(repositoryRoot, targetStyles).split(path.sep).join("/"),
    inventedSelectors: [...invented.entries()]
      .map(([className, info]) => ({ className, ...info }))
      .sort((left, right) => right.usages - left.usages || left.className.localeCompare(right.className)),
  };

  const used = report.inventedSelectors.filter((entry) => entry.usages > 0);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) {
    await fs.mkdir(path.dirname(path.resolve(repositoryRoot, options.output)), { recursive: true });
    await fs.writeFile(path.resolve(repositoryRoot, options.output), serialized, "utf8");
  } else {
    process.stdout.write(serialized);
  }
  console.log(
    `invented selectors: ${report.inventedSelectors.length}, referenced by templates: ${used.length}`,
  );
}

await main();
