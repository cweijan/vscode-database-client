#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");
const generatedRoot = path.join(projectRoot, "dist-modern");
const defaultOutput = path.join(generatedRoot, "package");

function outputPathFromArguments() {
  const argument = process.argv[2];
  const output = path.resolve(projectRoot, argument || path.relative(projectRoot, defaultOutput));
  const relative = path.relative(generatedRoot, output);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Modern staging output must remain inside dist-modern.");
  }
  return output;
}

async function copyIfPresent(source, target) {
  try {
    await fs.copyFile(source, target);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function main() {
  const output = outputPathFromArguments();
  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(output, { recursive: true });

  await copyIfPresent(path.join(projectRoot, "package.json"), path.join(output, "package.json"));
  await copyIfPresent(path.join(projectRoot, "package-lock.json"), path.join(output, "package-lock.json"));
  for (const fileName of ["README.md", "LICENSE", "CHANGELOG.md"]) {
    await copyIfPresent(path.join(projectRoot, fileName), path.join(output, fileName));
  }

  for (const directory of ["image", "images", "resources", "syntaxes", "types"]) {
    await fs.cp(
      path.join(projectRoot, directory),
      path.join(output, directory),
      { recursive: true },
    );
  }
  for (const fileName of await fs.readdir(projectRoot)) {
    if (fileName.startsWith("package.nls") && fileName.endsWith(".json")) {
      await fs.copyFile(path.join(projectRoot, fileName), path.join(output, fileName));
    }
  }

  const staticOut = path.join(projectRoot, "out");
  const stagedOut = path.join(output, "out");
  await fs.cp(staticOut, stagedOut, { recursive: true });
  await fs.copyFile(
    path.join(projectRoot, "dist-modern", "extension", "extension.js"),
    path.join(stagedOut, "extension.js"),
  );
  await fs.rm(path.join(stagedOut, "webview"), { recursive: true, force: true });
  await fs.cp(
    path.join(projectRoot, "dist-modern", "webview"),
    path.join(stagedOut, "webview"),
    { recursive: true },
  );

  console.log(`Modern package staged at ${path.relative(projectRoot, output)}`);
}

await main();
