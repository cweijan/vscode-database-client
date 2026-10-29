#!/usr/bin/env node
/**
 * Recovers readable, stable-named source trees from the installed 9.0.2 webview bundle.
 *
 * The installed extension ships a minified Vite build. This script turns every chunk back into
 * formatted JavaScript with stable module names and rewritten import specifiers, and beautifies
 * the shipped stylesheets so the target markup/styles can be read and transcribed into
 * `src/modern-webview` without guessing.
 *
 * Output is a reference tree, never a build input:
 *   reference/target-webview/modules/<Name>.js
 *   reference/target-webview/styles/<Name>.css
 *   reference/target-webview/assets/*            (fonts, wasm)
 *   reference/target-webview/manifest.json
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const HASH_SUFFIX = /-([A-Za-z0-9_-]{8,12})$/;
const COPY_PATTERN = /\.(?:woff2?|ttf|wasm|png|jpe?g|gif|svg)$/i;

/**
 * Vue runtime helpers are re-exported by the webview SDK chunk under short build-time names.
 * The legend is recovered from the compiled call sites (`openBlock()` before each block call,
 * `withDirectives(vnode, [[vShow, ...]])`, ...) so decompiled render code can be read without
 * holding a lookup table in your head.
 */
const VUE_HELPER_LEGEND = new Map([
  ["C", "createVNode"],
  ["H", "openBlock"],
  ["J", "resolveDynamicComponent"],
  ["Jt", "normalizeClass"],
  ["K", "resolveComponent"],
  ["S", "createTextVNode"],
  ["Tt", "unref"],
  ["W", "renderList"],
  ["Zt", "toDisplayString"],
  ["_", "createCommentVNode"],
  ["c", "Fragment"],
  ["g", "createBlock"],
  ["h", "createElementVNode"],
  ["l", "Teleport"],
  ["m", "computed"],
  ["ot", "withCtx"],
  ["st", "withDirectives"],
  ["tr", "vShow"],
  ["v", "createElementBlock"],
  ["vt", "ref"],
  ["w", "defineComponent"],
  ["z", "onMounted"],
]);

const SDK_CHUNK_PATTERN = /^\.\/vscode[\w-]*\.js$/;

function parseArguments(argv) {
  const options = { targetRoot: null, output: null, keep: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--target-root") options.targetRoot = argv[++index];
    else if (argument === "--output") options.output = argv[++index];
    else if (argument === "--keep") options.keep = argv[++index];
    else if (argument === "--help" || argument === "-h") {
      console.log(
        [
          "Usage:",
          "  node scripts/source-recovery/decompile-webview.mjs --target-root <installed-extension> [--output <dir>]",
          "",
          "Options:",
          "  --target-root <path> Installed extension directory (must contain out/webview/assets).",
          "  --output <dir>       Output directory (default: reference/target-webview).",
          "  --keep <regex>       Only decompile chunks whose file name matches this pattern.",
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

/** `Result-CRRA39vl.js` -> `Result.js`, keeping names unique across the bundle. */
function stableNames(fileNames) {
  const names = new Map();
  const used = new Map();
  for (const fileName of [...fileNames].sort((left, right) => left.localeCompare(right))) {
    const extension = path.extname(fileName);
    const base = path.basename(fileName, extension);
    const stripped = base.replace(HASH_SUFFIX, "");
    const candidate = `${stripped || "chunk"}${extension}`;
    const collisions = used.get(candidate) ?? 0;
    used.set(candidate, collisions + 1);
    names.set(
      fileName,
      collisions === 0
        ? candidate
        : `${stripped || "chunk"}-${collisions + 1}${extension}`,
    );
  }
  return names;
}

/** Splits CSS into top-level statements without breaking quoted `url(...)` payloads. */
function splitCssStatements(source) {
  const statements = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  let parens = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "(") parens += 1;
    else if (character === ")") parens = Math.max(0, parens - 1);
    else if (character === "{" && parens === 0) depth += 1;
    else if (character === "}" && parens === 0) {
      depth = Math.max(0, depth - 1);
      if (depth === 0) {
        statements.push(source.slice(start, index + 1));
        start = index + 1;
      }
    }
  }
  const tail = source.slice(start);
  if (tail.trim()) statements.push(tail);
  return statements;
}

function indentCssBlock(block) {
  const open = block.indexOf("{");
  const close = block.lastIndexOf("}");
  if (open < 0 || close < open) return block.trim();
  const prelude = block.slice(0, open).trim();
  const body = block.slice(open + 1, close);
  const declarations = [];
  let start = 0;
  let quote = null;
  let parens = 0;
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === "(") parens += 1;
    else if (character === ")") parens = Math.max(0, parens - 1);
    else if ((character === ";" || character === "}") && parens === 0) {
      declarations.push(body.slice(start, index + 1));
      start = index + 1;
    }
  }
  if (body.slice(start).trim()) declarations.push(body.slice(start));

  const lines = declarations
    .flatMap((declaration) => splitCssStatements(declaration.trim()))
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .flatMap((declaration) => {
      if (declaration.includes("{") && !declaration.startsWith("@keyframes")) {
        return indentCssBlock(declaration)
          .split("\n")
          .map((line) => `  ${line}`);
      }
      return [`  ${declaration}`];
    });

  const isAtRuleWithBlock = prelude.startsWith("@");
  const blockText = `${prelude} {\n${lines.join("\n")}\n}`;
  return isAtRuleWithBlock ? blockText : `${blockText}`;
}

function formatCss(source) {
  let prefix = "";
  let body = source;
  if (source.startsWith("@charset")) {
    const end = source.indexOf(";") + 1;
    prefix = `${source.slice(0, end)}\n`;
    body = source.slice(end);
  }
  return `${prefix}${splitCssStatements(body)
    .map((statement) => statement.trim())
    .filter(Boolean)
    .map((statement) => indentCssBlock(statement))
    .join("\n\n")}\n`;
}

function rewriteSpecifiers(source, names) {
  return source.replace(
    /((?:from|import)\s*\(?\s*["'])(?:\.\/)?([^"']+\.js)(["'])/g,
    (match, prefix, specifier, suffix) => {
      const resolved = names.get(specifier);
      return resolved ? `${prefix}./${resolved}${suffix}` : match;
    },
  );
}

function formatJavaScript(fileName, source, names) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.ESNext,
    false,
    ts.ScriptKind.JS,
  );
  const printer = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,
    removeComments: false,
  });
  const printed = printer.printFile(sourceFile);
  return renameVueHelpers(fileName, rewriteSpecifiers(printed, names));
}

function collectHelperAliases(sourceFile) {
  const aliases = new Map();
  const foreignLocals = new Set();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    const fromSdk = SDK_CHUNK_PATTERN.test(statement.moduleSpecifier.text);
    for (const element of bindings.elements) {
      if (!fromSdk) {
        foreignLocals.add(element.name.text);
        continue;
      }
      const exported = (element.propertyName ?? element.name).text;
      const canonical = VUE_HELPER_LEGEND.get(exported);
      if (canonical) aliases.set(element.name.text, canonical);
    }
  }
  for (const name of foreignLocals) aliases.delete(name);
  return aliases;
}

/** Renames import aliases scope-safely so shadowing locals are never touched. */
function renameVueHelpers(fileName, source) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.JS,
  );
  const aliases = collectHelperAliases(sourceFile);
  if (aliases.size === 0) return source;

  const declarationNames = (node) => {
    const names = new Set();
    const collectBinding = (name) => {
      if (ts.isIdentifier(name)) names.add(name.text);
      else
        for (const element of name.elements) {
          if (ts.isBindingElement(element)) {
            collectBinding(element.name);
          }
        }
    };
    if (ts.isFunctionLike(node)) {
      for (const parameter of node.parameters) collectBinding(parameter.name);
      if (node.name && ts.isIdentifier(node.name)) names.add(node.name.text);
    } else if (ts.isCatchClause(node) && node.variableDeclaration) {
      collectBinding(node.variableDeclaration.name);
    } else if (ts.isVariableDeclarationList(node)) {
      for (const declaration of node.declarations) collectBinding(declaration.name);
    } else if (
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isEnumDeclaration(node)
    ) {
      if (node.name) names.add(node.name.text);
    }
    return names;
  };

  const replacements = [];
  const visit = (node, scopes) => {
    const declares = declarationNames(node);
    const nextScopes = declares.size > 0 ? [...scopes, declares] : scopes;

    if (ts.isIdentifier(node) && aliases.has(node.text)) {
      const parent = node.parent;
      const isPropertyName =
        parent &&
        ((ts.isPropertyAccessExpression(parent) && parent.name === node) ||
          (ts.isPropertyAssignment(parent) && parent.name === node) ||
          (ts.isBindingElement(parent) && parent.propertyName === node) ||
          (ts.isImportSpecifier(parent) && parent.propertyName === node) ||
          (ts.isExportSpecifier(parent) && parent.propertyName === node));
      const shadowed = scopes.some((scope) => scope.has(node.text));
      if (!isPropertyName && !shadowed) {
        replacements.push({
          start: node.getStart(sourceFile),
          end: node.getEnd(),
          canonical: aliases.get(node.text),
        });
      }
    }
    ts.forEachChild(node, (child) => visit(child, nextScopes));
  };
  visit(sourceFile, []);

  let output = source;
  for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
    output =
      output.slice(0, replacement.start) +
      replacement.canonical +
      output.slice(replacement.end);
  }
  return output;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const assetsDirectory = path.join(options.targetRoot, "out", "webview", "assets");
  const outputRoot = path.resolve(
    repositoryRoot,
    options.output ?? "reference/target-webview",
  );

  const entries = await fs.readdir(assetsDirectory, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  const keepPattern = options.keep ? new RegExp(options.keep, "i") : null;
  const names = stableNames(files.filter((name) => name.endsWith(".js")));

  const modulesDirectory = path.join(outputRoot, "modules");
  const stylesDirectory = path.join(outputRoot, "styles");
  const assetsOutput = path.join(outputRoot, "assets");
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(modulesDirectory, { recursive: true });
  await fs.mkdir(stylesDirectory, { recursive: true });
  await fs.mkdir(assetsOutput, { recursive: true });

  const manifest = { source: assetsDirectory, modules: {}, styles: {}, assets: [] };

  for (const file of files) {
    if (file.endsWith(".js")) {
      if (keepPattern && !keepPattern.test(file)) continue;
      const source = await fs.readFile(path.join(assetsDirectory, file), "utf8");
      const target = names.get(file);
      await fs.writeFile(
        path.join(modulesDirectory, target),
        formatJavaScript(target, source, names),
        "utf8",
      );
      manifest.modules[target] = file;
    } else if (file.endsWith(".css")) {
      const source = await fs.readFile(path.join(assetsDirectory, file), "utf8");
      const target = file.replace(HASH_SUFFIX, "");
      await fs.writeFile(
        path.join(stylesDirectory, target),
        formatCss(source),
        "utf8",
      );
      manifest.styles[target] = file;
    } else if (COPY_PATTERN.test(file)) {
      await fs.copyFile(path.join(assetsDirectory, file), path.join(assetsOutput, file));
      manifest.assets.push(file);
    }
  }

  await fs.writeFile(
    path.join(outputRoot, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `decompiled ${Object.keys(manifest.modules).length} modules, ` +
      `${Object.keys(manifest.styles).length} styles into ${outputRoot}`,
  );
}

await main();
