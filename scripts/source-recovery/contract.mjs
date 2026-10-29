#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { collectManifestSurface } from "./inventory.mjs";

const DEFAULT_INVENTORY =
  "openspec/changes/restore-target-visual-parity/evidence/target-inventory.json";
const QUOTE = "[\"'" + String.fromCharCode(96) + "]";

function parseArguments(argv) {
  const options = {
    inventory: DEFAULT_INVENTORY,
    targetRoot: null,
    candidateRoot: null,
    output: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--inventory") {
      options.inventory = argv[++index];
    } else if (argument === "--target-root") {
      options.targetRoot = argv[++index];
    } else if (argument === "--candidate-root") {
      options.candidateRoot = argv[++index];
    } else if (argument === "--output") {
      options.output = argv[++index];
    } else if (argument === "--help" || argument === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error("Unknown argument: " + argument);
    }
  }

  return options;
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node scripts/source-recovery/contract.mjs [options]",
      "",
      "Options:",
      "  --inventory <path>      Target inventory JSON.",
      "  --target-root <path>    Installed 9.0.2 extension used to build the fixture.",
      "  --candidate-root <path> Candidate package to verify against the fixture.",
      "  --output <path>         Write the fixture or verification result to a file.",
    ].join("\n"),
  );
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value
      .map(canonicalize)
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      );
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function sameJson(left, right) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function fileExists(root, relativePath) {
  try {
    await fs.access(path.join(root, relativePath.split("/").join(path.sep)));
    return true;
  } catch {
    return false;
  }
}

function normalizeRelativeReference(baseFile, reference) {
  if (
    !reference ||
    reference.startsWith("/") ||
    reference.startsWith("#") ||
    reference.startsWith("$(") ||
    /^[a-z][a-z0-9+.-]*:/i.test(reference)
  ) {
    return null;
  }
  const withoutQuery = reference.split(/[?#]/, 1)[0];
  return toPosix(
    path.posix.normalize(path.posix.join(path.posix.dirname(baseFile), withoutQuery)),
  );
}

function extractHtmlReferences(html, htmlPath) {
  const references = [];
  const attributePattern = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = attributePattern.exec(html)) !== null) {
    const resolvedPath = normalizeRelativeReference(htmlPath, match[1]);
    if (resolvedPath) {
      references.push({
        reference: match[1],
        resolvedPath,
      });
    }
  }
  return references;
}

function collectManifestPathReferences(manifest) {
  const references = [];
  const pathKeys = new Set(["main", "browser", "icon", "path", "configuration"]);

  function visit(value, key) {
    if (typeof value === "string" && pathKeys.has(key)) {
      const normalized = normalizeRelativeReference("", value);
      if (normalized) {
        references.push({
          key,
          reference: value,
          resolvedPath: normalized,
        });
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, key));
      return;
    }
    if (value && typeof value === "object") {
      Object.entries(value).forEach(([childKey, childValue]) =>
        visit(childValue, childKey),
      );
    }
  }

  visit(manifest, null);
  return references.filter(
    (reference, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.key === reference.key &&
          candidate.reference === reference.reference &&
          candidate.resolvedPath === reference.resolvedPath,
      ) === index,
  );
}

function resolvedCandidates(reference) {
  const normalized = reference.replace(/^\.\//, "");
  const candidates = [normalized];
  if (!path.posix.extname(normalized)) {
    candidates.push(normalized + ".js", normalized + ".json");
  }
  return candidates;
}

async function resolveManifestReferences(root, references) {
  const missing = [];
  const resolved = [];
  for (const reference of references) {
    const candidates = resolvedCandidates(reference.resolvedPath);
    const existing = [];
    for (const candidate of candidates) {
      if (await fileExists(root, candidate)) {
        existing.push(candidate);
      }
    }
    if (existing.length === 0) {
      missing.push(reference);
    } else {
      resolved.push({ ...reference, existing });
    }
  }
  return { missing, resolved };
}

function countMatches(content, pattern) {
  return [...content.matchAll(pattern)].length;
}

function collectLiteralMessageTypes(content) {
  const types = [];
  const pattern = /postMessage\(\s*\{\s*type\s*:\s*["']([^"']+)["']/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    types.push(match[1]);
  }
  return [...new Set(types)].sort((left, right) => left.localeCompare(right));
}

function collectMessageMarkers(content) {
  return {
    acquireVsCodeApi: countMatches(content, /acquireVsCodeApi/g),
    addMessageListener: countMatches(
      content,
      new RegExp("addEventListener\\(\\s*" + QUOTE + "message" + QUOTE, "g"),
    ),
    onDidReceiveMessage: countMatches(content, /onDidReceiveMessage/g),
    postMessage: countMatches(content, /postMessage/g),
    setState: countMatches(content, /setState/g),
    literalPostMessageTypes: collectLiteralMessageTypes(content),
  };
}

async function readEntryPoint(root, relativePath) {
  return fs.readFile(path.join(root, relativePath.split("/").join(path.sep)), "utf8");
}

async function buildMessageEntryPoints(root, webviewReferences) {
  const extensionPath = "out/extension.js";
  const htmlPath = "out/webview/app.html";
  const extensionContent = await readEntryPoint(root, extensionPath);
  const webviewScriptPaths = webviewReferences
    .map((reference) => reference.resolvedPath)
    .filter((reference) => /\.m?js$/i.test(reference));
  const webviewContent = (
    await Promise.all(
      webviewScriptPaths.map((relativePath) => readEntryPoint(root, relativePath)),
    )
  ).join("\n");

  return {
    extensionHost: {
      entry: extensionPath,
      markers: collectMessageMarkers(extensionContent),
    },
    webview: {
      html: htmlPath,
      scripts: webviewScriptPaths,
      markers: collectMessageMarkers(webviewContent),
    },
  };
}

async function buildContract(options, inventory) {
  const targetRoot = options.targetRoot
    ? path.resolve(options.targetRoot)
    : inventory.provenance.targetRoot.absolutePath;
  const manifest = await readJson(path.join(targetRoot, "package.json"));
  const webviewHtmlPath = "out/webview/app.html";
  const webviewHtml = await readEntryPoint(targetRoot, webviewHtmlPath);
  const webviewReferences = extractHtmlReferences(webviewHtml, webviewHtmlPath);
  const manifestReferences = collectManifestPathReferences(manifest);
  const manifestReferenceCheck = await resolveManifestReferences(
    targetRoot,
    manifestReferences,
  );
  const webviewReferenceCheck = await resolveManifestReferences(
    targetRoot,
    webviewReferences.map((reference) => ({
      key: "webview",
      reference: reference.reference,
      resolvedPath: reference.resolvedPath,
    })),
  );
  const activeFiles = inventory.activeFiles.map((file) => file.path);
  const staticRequiredFiles = inventory.activeFiles
    .filter(
      (file) =>
        file.kind === "resource" ||
        file.path === "package.json" ||
        /^out\/(?:proto|types|node_modules)\//.test(file.path),
    )
    .map((file) => file.path)
    .sort((left, right) => left.localeCompare(right));

  return {
    schemaVersion: 1,
    target: {
      name: manifest.name,
      version: manifest.version,
      main: manifest.main,
    },
    manifest: collectManifestSurface(manifest),
    manifestPathReferences: manifestReferences,
    webview: {
      html: webviewHtmlPath,
      references: webviewReferences,
      referencedAssetCount: webviewReferences.length,
    },
    messageEntryPoints: await buildMessageEntryPoints(
      targetRoot,
      webviewReferences,
    ),
    resourceClosure: {
      activeFileCount: activeFiles.length,
      staticRequiredFiles,
      preservedBackupFiles: inventory.preservedBackupFiles.map((file) => file.path),
      targetWebviewAssets: inventory.webviewAssets,
    },
    targetValidation: {
      missingManifestReferences: manifestReferenceCheck.missing,
      missingWebviewReferences: webviewReferenceCheck.missing,
    },
  };
}

async function verifyCandidate(candidateRoot, contract) {
  const root = path.resolve(candidateRoot);
  const packagePath = path.join(root, "package.json");
  const manifest = await readJson(packagePath);
  const failures = [];
  const candidateManifest = collectManifestSurface(manifest);
  if (!sameJson(candidateManifest, contract.manifest)) {
    failures.push("manifest surface differs from the 9.0.2 contract");
  }

  const manifestReferenceCheck = await resolveManifestReferences(
    root,
    collectManifestPathReferences(manifest),
  );
  if (manifestReferenceCheck.missing.length > 0) {
    failures.push(
      "manifest references missing: " +
        manifestReferenceCheck.missing.map((reference) => reference.reference).join(", "),
    );
  }

  const htmlPath = contract.webview.html;
  const htmlExists = await fileExists(root, htmlPath);
  if (!htmlExists) {
    failures.push("missing Webview entry: " + htmlPath);
  }
  let webviewReferences = [];
  if (htmlExists) {
    const html = await readEntryPoint(root, htmlPath);
    webviewReferences = extractHtmlReferences(html, htmlPath);
    const webviewReferenceCheck = await resolveManifestReferences(
      root,
      webviewReferences.map((reference) => ({
        key: "webview",
        reference: reference.reference,
        resolvedPath: reference.resolvedPath,
      })),
    );
    if (webviewReferenceCheck.missing.length > 0) {
      failures.push(
        "Webview references missing: " +
          webviewReferenceCheck.missing
            .map((reference) => reference.reference)
            .join(", "),
      );
    }
    if (webviewReferences.length !== contract.webview.referencedAssetCount) {
      failures.push(
        "Webview reference count changed from " +
          contract.webview.referencedAssetCount +
          " to " +
          webviewReferences.length,
      );
    }
  }

  const staticMissing = [];
  for (const relativePath of contract.resourceClosure.staticRequiredFiles) {
    if (!(await fileExists(root, relativePath))) {
      staticMissing.push(relativePath);
    }
  }
  if (staticMissing.length > 0) {
    failures.push("static resource closure missing: " + staticMissing.join(", "));
  }
  if (!(await fileExists(root, "out/extension.js"))) {
    failures.push("missing extension entry: out/extension.js");
  }

  return {
    valid: failures.length === 0,
    failures,
    candidate: {
      root,
      manifest: {
        name: manifest.name,
        version: manifest.version,
        main: manifest.main,
      },
      webviewReferenceCount: webviewReferences.length,
    },
  };
}

async function writeOutput(outputPath, value) {
  const content = JSON.stringify(value, null, 2) + "\n";
  if (outputPath) {
    await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
    await fs.writeFile(outputPath, content, "utf8");
  } else {
    process.stdout.write(content);
  }
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    const inventory = await readJson(path.resolve(options.inventory));
    const contract = await buildContract(options, inventory);
    if (contract.targetValidation.missingManifestReferences.length > 0) {
      throw new Error("Target manifest contains unresolved path references");
    }
    if (contract.targetValidation.missingWebviewReferences.length > 0) {
      throw new Error("Target Webview contains unresolved asset references");
    }

    if (options.candidateRoot) {
      const verification = await verifyCandidate(options.candidateRoot, contract);
      await writeOutput(options.output, verification);
      if (!verification.valid) {
        process.exitCode = 1;
      }
    } else {
      await writeOutput(options.output, contract);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  await main();
}

export {
  buildContract,
  collectManifestPathReferences,
  extractHtmlReferences,
  verifyCandidate,
};
