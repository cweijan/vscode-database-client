#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");
const packageRoot = path.join(projectRoot, "dist-modern", "package");
const manifest = JSON.parse(
  await fs.readFile(path.join(packageRoot, "package.json"), "utf8"),
);
const output = path.join(
  projectRoot,
  `${manifest.name}-${manifest.version}.vsix`,
);
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

await fs.rm(output, { force: true });

await new Promise((resolve, reject) => {
  const child = spawn(
    npx,
    ["--yes", "@vscode/vsce", "package", "--no-dependencies", "--out", output],
    { cwd: packageRoot, stdio: "inherit", shell: process.platform === "win32" },
  );
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (code === 0) {
      resolve();
      return;
    }
    reject(new Error(`vsce exited with ${code ?? signal}`));
  });
});

console.log(`Modern VSIX created at ${path.relative(projectRoot, output)}`);
