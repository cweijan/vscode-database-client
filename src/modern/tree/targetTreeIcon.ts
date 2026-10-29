import * as vscode from "vscode";

import type { ResourceResolver } from "../core/contracts";
import type { ConnectionOptions } from "../database/types";
import {
  isActiveConnection,
  resolveTargetIcon,
  targetConnectionIconSpec,
  type TargetIconSpec,
  type TargetTreePresentation,
} from "./targetTreePresentation";

export type TargetTreeIcon = NonNullable<vscode.TreeItem["iconPath"]>;

export function toVscodeTreeIcon(
  resources: ResourceResolver,
  spec: TargetIconSpec,
): TargetTreeIcon {
  const resolved = resolveTargetIcon(resources, spec);
  if ("kind" in resolved) {
    return new vscode.ThemeIcon(
      resolved.id,
      resolved.color ? new vscode.ThemeColor(resolved.color) : undefined,
    );
  }
  return { light: resolved.light, dark: resolved.dark };
}

export function targetThemeTreeIcon(
  id: string,
  color?: string,
): vscode.ThemeIcon {
  return new vscode.ThemeIcon(
    id,
    color ? new vscode.ThemeColor(color) : undefined,
  );
}

export function targetPresentationTreeIcon(
  resources: ResourceResolver,
  presentation: TargetTreePresentation,
): TargetTreeIcon {
  return toVscodeTreeIcon(resources, presentation.icon);
}

export function targetThemePresentationIcon(
  presentation: TargetTreePresentation,
): vscode.ThemeIcon {
  if (presentation.icon.kind !== "theme") {
    throw new Error(`Target presentation ${presentation.contextValue} does not use a theme icon`);
  }
  return targetThemeTreeIcon(presentation.icon.id, presentation.icon.color);
}

export function targetPresentationCollapsibleState(
  presentation: TargetTreePresentation,
): vscode.TreeItemCollapsibleState {
  return presentation.collapsibleState === "expanded"
    ? vscode.TreeItemCollapsibleState.Expanded
    : presentation.collapsibleState === "collapsed"
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None;
}

export function targetResourceTreeIcon(
  resources: ResourceResolver,
  relativePath: string,
  darkRelativePath = relativePath,
): TargetTreeIcon {
  return {
    light: resources.resolve("resources", ...relativePath.split("/")),
    dark: resources.resolve("resources", ...darkRelativePath.split("/")),
  };
}

const targetNamedFileIcons: Readonly<Record<string, string>> = {
  ".env": "tune.svg",
  ".env.development": "tune.svg",
  ".env.local": "tune.svg",
  ".env.production": "tune.svg",
  ".editorconfig": "editorconfig.svg",
  ".eslintrc": "eslint.svg",
  ".eslintrc.cjs": "eslint.svg",
  ".eslintrc.js": "eslint.svg",
  ".eslintrc.json": "eslint.svg",
  ".gitignore": "git.svg",
  ".npmrc": "npm.svg",
  ".nvmrc": "nodejs.svg",
  ".prettierrc": "prettier.svg",
  ".prettierrc.cjs": "prettier.svg",
  ".prettierrc.js": "prettier.svg",
  ".prettierrc.json": "prettier.svg",
  ".stylelintrc": "stylelint.svg",
  "babel.config.js": "babel.svg",
  "docker-compose.yaml": "docker.svg",
  "docker-compose.yml": "docker.svg",
  "dockerfile": "docker.svg",
  "eslint.config.cjs": "eslint.svg",
  "eslint.config.js": "eslint.svg",
  "eslint.config.mjs": "eslint.svg",
  "jest.config.js": "jest.svg",
  "jsconfig.json": "javascript.svg",
  "license": "license.svg",
  "license.md": "license.svg",
  "license.txt": "license.svg",
  "makefile": "cmake.svg",
  "package-lock.json": "nodejs.svg",
  "package.json": "nodejs.svg",
  "postcss.config.cjs": "postcss.svg",
  "prettier.config.cjs": "prettier.svg",
  "prettier.config.js": "prettier.svg",
  "pnpm-lock.yaml": "pnpm.svg",
  "readme": "readme.svg",
  "readme.md": "readme.svg",
  "rollup.config.js": "rollup.svg",
  "rollup.config.ts": "rollup.svg",
  "tailwind.config.js": "tailwindcss.svg",
  "tailwind.config.ts": "tailwindcss.svg",
  "tsconfig.json": "typescript.svg",
  "turbo.json": "turborepo.svg",
  "vite.config.js": "vite.svg",
  "vite.config.ts": "vite.svg",
  "vitest.config.ts": "vitest.svg",
  "webpack.config.js": "webpack.svg",
  "webpack.config.ts": "webpack.svg",
  "yarn.lock": "yarn.svg",
};

const targetExtensionFileIcons: Readonly<Record<string, string>> = {
  apk: "apk.svg",
  avi: "video.svg",
  bmp: "image.svg",
  c: "c.svg",
  "c#": "c#.svg",
  "c++": "c++.svg",
  class: "java.svg",
  conf: "settings.svg",
  cpp: "c++.svg",
  css: "css.svg",
  csv: "table.svg",
  db: "database.svg",
  db3: "database.svg",
  dmg: "dmg.png",
  doc: "word.svg",
  docx: "word.svg",
  exe: "exe.svg",
  gif: "image.svg",
  go: "go.svg",
  gz: "zip.svg",
  h: "c.svg",
  html: "html.svg",
  ico: "image.svg",
  iso: "iso.png",
  jar: "jar.svg",
  java: "java.svg",
  jpeg: "image.svg",
  jpg: "image.svg",
  js: "javascript.svg",
  json: "json.svg",
  jsx: "jsx.svg",
  kt: "kt.svg",
  less: "less.svg",
  lib: "lib.svg",
  log: "log.svg",
  lua: "lua.svg",
  m4a: "m4a.svg",
  md: "md.svg",
  msi: "exe.svg",
  mp3: "mp3.svg",
  mp4: "video.svg",
  parquet: "database.svg",
  pdf: "pdf.svg",
  pem: "key.svg",
  php: "php.svg",
  pkg: "pkg.png",
  png: "image.svg",
  ppt: "powerpoint.svg",
  pptx: "powerpoint.svg",
  ps1: "ps1.svg",
  py: "py.svg",
  rb: "rb.svg",
  rar: "zip.svg",
  rs: "rust.svg",
  sass: "sass.svg",
  scala: "scala.svg",
  scss: "scss.svg",
  sh: "console.svg",
  sql: "sql.svg",
  sqlbook: "sql.svg",
  sqlite: "database.svg",
  sqlite3: "database.svg",
  svg: "svg.svg",
  tar: "zip.svg",
  toml: "toml.svg",
  ts: "typescript.svg",
  tsv: "table.svg",
  tsx: "react_ts.svg",
  txt: "file.svg",
  vue: "vue.svg",
  wav: "video.svg",
  webp: "image.svg",
  xlsx: "xml.svg",
  xml: "xml.svg",
  yaml: "yaml.svg",
  yml: "yaml.svg",
  zip: "zip.svg",
};

const targetSpecialFolderIcons: Readonly<Record<string, string>> = {
  ".github": "folder-github.svg",
  ".vscode": "folder-vscode.svg",
  containerd: "folder-container.svg",
  dist: "folder-dist.svg",
  doc: "folder-docs.svg",
  docs: "folder-docs.svg",
  etc: "folder-config.svg",
  home: "folder-core.svg",
  image: "folder-images.svg",
  images: "folder-images.svg",
  img: "folder-images.svg",
  node_modules: "folder-node.svg",
  root: "folder-core.svg",
  script: "folder-scripts.svg",
  scripts: "folder-scripts.svg",
  src: "folder-src.svg",
  test: "folder-test.svg",
  tests: "folder-test.svg",
  tmp: "folder-temp.svg",
};

function targetResourcePair(resources: ResourceResolver, ...segments: string[]): TargetTreeIcon {
  const resolved = resources.resolve(...segments);
  return { light: resolved, dark: resolved };
}

export function targetRemoteFileIcon(
  resources: ResourceResolver,
  fileName: string,
): TargetTreeIcon {
  const normalized = fileName.trim().toLocaleLowerCase();
  const baseName = normalized.split(/[\\/]/).pop() || normalized;
  const exact = targetNamedFileIcons[baseName];
  const extension = baseName.includes(".")
    ? baseName.slice(baseName.lastIndexOf(".") + 1)
    : baseName;
  const icon = exact || targetExtensionFileIcons[extension] || "file.svg";
  return targetResourcePair(resources, "resources", "ssh", icon);
}

export function targetRemoteFolderIcon(
  resources: ResourceResolver,
  folderName: string,
): TargetTreeIcon {
  const normalized = folderName.trim().toLocaleLowerCase() || "root";
  const icon = targetSpecialFolderIcons[normalized];
  return icon
    ? targetResourcePair(resources, "resources", "ssh", icon)
    : targetResourcePair(resources, "resources", "icon", "folder.svg");
}

export function connectionTreeIcon(
  resources: ResourceResolver,
  connection: ConnectionOptions,
  activeConnection?: ConnectionOptions,
): TargetTreeIcon {
  return toVscodeTreeIcon(
    resources,
    targetConnectionIconSpec(
      connection.type,
      isActiveConnection(activeConnection, connection),
      sshServerType(connection),
    ),
  );
}

function sshServerType(connection: ConnectionOptions): string | undefined {
  const options = connection.options;
  if (!options) return undefined;
  const direct = options.serverType;
  if (typeof direct === "string") return direct;
  const nested = options.ssh;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const serverType = (nested as Record<string, unknown>).serverType;
    return typeof serverType === "string" ? serverType : undefined;
  }
  return undefined;
}
