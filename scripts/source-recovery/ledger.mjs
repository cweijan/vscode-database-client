#!/usr/bin/env node

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_INVENTORY =
  "openspec/changes/restore-modern-source-9-0-2/evidence/target-inventory.json";
const CLASSIFICATIONS = {
  legacy: "legacy-source-reusable",
  new: "new-source-to-recover",
  replacement: "intentional-replacement",
  deferred: "deferred",
};

function parseArguments(argv) {
  const options = {
    inventory: DEFAULT_INVENTORY,
    projectRoot: process.cwd(),
    output: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--inventory") {
      options.inventory = argv[++index];
    } else if (argument === "--project-root") {
      options.projectRoot = argv[++index];
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
      "  node scripts/source-recovery/ledger.mjs [options]",
      "",
      "Options:",
      "  --inventory <path>      Target inventory JSON.",
      "  --project-root <path>   Repository containing legacy source.",
      "  --output <path>         Write the ledger JSON to a file.",
    ].join("\n"),
  );
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    String(left).localeCompare(String(right)),
  );
}

function ownerForPath(sourcePath) {
  const segments = sourcePath.split("/");
  const topLevel = segments[1] ?? "unknown";
  const ownerByTopLevel = {
    commands: "command-runtime",
    common: "common-runtime",
    config: "configuration-runtime",
    controller: "controller-runtime",
    model: "database-model",
    provider: "language-provider",
    service: "service-runtime",
    webview: "webview-runtime",
    views: "webview-runtime",
  };
  return ownerByTopLevel[topLevel] ?? topLevel + "-runtime";
}

function validationPlanForPath(sourcePath, classification) {
  if (/synonym/i.test(sourcePath)) {
    return "oracle-synonym-fixtures-and-dialect-smoke";
  }
  if (/^src\/commands\//.test(sourcePath)) {
    return "manifest-command-contract-and-handler-test";
  }
  if (/^src\/provider\//.test(sourcePath)) {
    return "provider-fixtures-and-focused-vscode-host-test";
  }
  if (/^src\/model\//.test(sourcePath)) {
    return "metadata-tree-fixture-and-dialect-test";
  }
  if (/^src\/webview\//.test(sourcePath)) {
    return "webview-html-message-protocol-test";
  }
  if (classification === CLASSIFICATIONS.deferred) {
    return "runtime-adapter-load-and-connection-smoke";
  }
  return "module-typecheck-and-target-marker-review";
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function sha256(filePath) {
  return createHash("sha256")
    .update(await fs.readFile(filePath))
    .digest("hex");
}

function sourceMarkersForPath(inventory, sourcePath) {
  return inventory.sourceMarkers.occurrences
    .filter((occurrence) => occurrence.sourcePath === sourcePath)
    .map((occurrence) => occurrence.bundleFile)
    .sort((left, right) => left.localeCompare(right));
}

async function buildModuleRecord({
  inventory,
  projectRoot,
  sourcePath,
  classification,
}) {
  const projectPath = path.join(projectRoot, sourcePath.split("/").join(path.sep));
  const exists = await fileExists(projectPath);
  const owner = ownerForPath(sourcePath);
  const record = {
    sourcePath,
    classification,
    owner,
    validationPlan: validationPlanForPath(sourcePath, classification),
    targetBundleFiles: sortedUnique(sourceMarkersForPath(inventory, sourcePath)),
    legacySourcePresent: exists,
    recoveryAction:
      classification === CLASSIFICATIONS.legacy
        ? "review-existing-source-and-modernize-in-place"
        : "recover-from-bundle-markers-legacy-patterns-and-behavior-fixtures",
  };

  if (exists) {
    record.legacyPath = sourcePath;
    record.legacySha256 = await sha256(projectPath);
  }

  return record;
}

const modernSlices = [
  {
    id: "3.1",
    name: "common-infrastructure",
    sourceFiles: [
      "src/modern/core/contracts.ts",
      "src/modern/core/config.ts",
      "src/modern/core/state.ts",
      "src/modern/core/events.ts",
      "src/modern/core/errors.ts",
      "src/modern/core/logging.ts",
      "src/modern/core/resources.ts",
      "src/modern/core/serviceRegistry.ts",
      "src/modern/core/activeConnection.ts",
      "src/modern/core/extensionServices.ts",
    ],
    validation: ["npm run typecheck:modern", "npm run lint:modern"],
    coverage: "typed configuration, state, resources, events, errors, logging, and service ownership",
  },
  {
    id: "3.2",
    name: "connection-and-dialect-boundaries",
    sourceFiles: [
      "src/modern/database/types.ts",
      "src/modern/database/dialectRegistry.ts",
      "src/modern/database/connectionManager.ts",
      "src/modern/database/resultConverter.ts",
      "src/modern/database/driverConnectionFactory.ts",
      "src/modern/database/standardFactories.ts",
      "src/modern/database/extendedFactories.ts",
      "src/modern/database/cloudFactories.ts",
      "src/modern/database/httpFactories.ts",
      "src/modern/database/resourceFactories.ts",
      "src/modern/database/sqljs.d.ts",
      "src/modern/database/standardDialects.ts",
      "src/modern/database/additionalFactories.ts",
    ],
    validation: ["npm run typecheck:modern", "npm run test:modern"],
    coverage: "connection lifecycle, cancellation boundary, result conversion, driver adapter, SQL.js, Dameng, Snowflake, Databricks, BigQuery, Trino, PrestoDB, TDengine, FTP, WebDAV, S3, etcd, and dialect selection",
  },
  {
    id: "3.3",
    name: "sql-metadata-tree",
    sourceFiles: [
      "src/modern/database/sqlTree.ts",
      "src/modern/database/metadataService.ts",
      "src/modern/tree/databaseTreeProvider.ts",
    ],
    validation: ["npm run typecheck:modern", "npm run test:modern"],
    coverage: "typed table nodes, context values, filtering, sorting, pagination, and metadata query ownership",
  },
  {
    id: "3.4",
    name: "commands-and-providers",
    sourceFiles: [
      "src/modern/commands/commandRegistry.ts",
      "src/modern/commands/vscodeCommandRegistrar.ts",
      "src/modern/commands/tableCommands.ts",
      "src/modern/providers/providerRegistry.ts",
      "src/modern/providers/providerRegistrar.ts",
      "src/modern/providers/sqlCompletionProvider.ts",
      "src/modern/providers/vscodeLanguageProviders.ts",
      "src/modern/commands/manifestCommands.ts",
      "src/modern/commands/targetCommandDispatcher.ts",
      "src/modern/commands/modernCommandHost.ts",
      "src/modern/providers/sqlDocumentModel.ts",
      "src/modern/providers/sqlDocumentFeatures.ts",
      "src/modern/providers/customEditors.ts",
      "test/modern/commands.test.ts",
    ],
    validation: ["npm run typecheck:modern", "npm run lint:modern"],
    coverage: "explicit command and Provider registration boundaries; target handlers remain in the recovery queue",
  },
  {
    id: "3.5",
    name: "oracle-synonym-vertical-slice",
    sourceFiles: [
      "src/modern/database/oracle/oracleDialect.ts",
      "src/modern/database/oracle/synonyms.ts",
      "test/modern/database.test.ts",
    ],
    validation: ["npm run test:modern", "npm run typecheck:modern"],
    coverage: "Oracle synonym SQL, owner/public resolution, tree presentation, filtering, pagination, and DDL",
  },
  {
    id: "3.6",
    name: "nosql-adapter-and-tree-boundaries",
    sourceFiles: [
      "src/modern/database/nosqlFactories.ts",
      "src/modern/database/messageFactories.ts",
      "src/modern/database/dockerFactory.ts",
      "src/modern/tree/databaseTreeProvider.ts",
      "src/modern/remote/sshService.ts",
      "src/modern/remote/sshTreeProvider.ts",
      "src/modern/remote/dockerTree.ts",
      "src/modern/remote/resourceTreeProvider.ts",
      "test/modern/database.test.ts",
      "test/modern/remote.test.ts",
    ],
    validation: [
      "npm run typecheck:modern",
      "npm run test:modern",
      "npm run verify:modern:activation",
    ],
    coverage: "Redis, MongoDB, Elasticsearch, Neo4j, RabbitMQ, Loki, Kafka, Docker, FTP, WebDAV, S3, and etcd adapters plus typed NoSQL, SSH/SFTP, resource, and Docker tree nodes",
  },
  {
    id: "4.1",
    name: "webview-bridge-and-host-rendering",
    sourceFiles: [
      "src/modern-webview/bridge.ts",
      "src/modern-webview/App.vue",
      "src/modern-webview/main.ts",
      "src/modern/core/webviewHandler.ts",
      "src/modern/core/webviewHtml.ts",
      "src/modern/core/vscodeWebviewHtml.ts",
      "src/modern/core/vscodeWebviewManager.ts",
      "test/modern/webview.test.ts",
    ],
    validation: ["npm run test:modern", "npm run typecheck:modern"],
    coverage: "init handshake, setState persistence boundary, typed message routing, CSP/assets, and disposal",
  },
  {
    id: "4.2",
    name: "webview-shared-foundation",
    sourceFiles: [
      "src/modern-webview/bootstrap.ts",
      "src/modern-webview/routeRegistry.ts",
      "src/modern-webview/router.ts",
      "src/modern-webview/state.ts",
      "src/modern-webview/i18n.ts",
      "src/modern-webview/assets.ts",
      "src/modern-webview/style.css",
      "src/modern-webview/app.html",
      "src/modern-webview/components/StatusBanner.vue",
      "src/modern-webview/components/RouteLayout.vue",
      "src/modern-webview/components/RouteSurface.vue",
      "src/modern-webview/components/UiButton.vue",
      "src/modern-webview/components/UiInput.vue",
      "src/modern-webview/components/UiSelect.vue",
      "src/modern-webview/components/RouteWorkbench.vue",
      "test/modern/webview.test.ts",
    ],
    validation: [
      "npm run test:modern",
      "npm run typecheck:modern",
      "npm run build:modern:webview",
    ],
    coverage: "target route names and nested paths, bootstrap config, theme variables, shared controls, localization, and stable logical asset resolution",
  },
  {
    id: "4.3",
    name: "webview-connection-and-result-flows",
    sourceFiles: [
      "src/modern-webview/components/ConnectionView.vue",
      "src/modern-webview/components/ConsoleView.vue",
      "src/modern-webview/components/ResultView.vue",
      "src/modern/commands/modernCommandHost.ts",
      "test/modern/webview.test.ts",
    ],
    validation: [
      "npm run typecheck:modern",
      "npm run test:modern",
      "npm run build:modern:webview",
    ],
    coverage: "connection form persistence, console execution messages, result table state, copy/export entry points, and route wiring",
  },
  {
    id: "4.4",
    name: "webview-design-and-route-workbench",
    sourceFiles: [
      "src/modern-webview/components/DesignView.vue",
      "src/modern-webview/components/RouteWorkbench.vue",
      "src/modern-webview/components/UiInput.vue",
      "src/modern-webview/components/UiSelect.vue",
      "src/modern/commands/webviewUtilityProtocols.ts",
      "src/modern/providers/customEditors.ts",
      "src/modern/extension.ts",
    ],
    validation: [
      "npm run typecheck:modern",
      "npm run build:modern:webview",
      "npm run verify:modern:activation",
    ],
    coverage: "DDL design execution boundary, remote-file/SSH, Mock, RabbitMQ, forwarding, SSH status, structure-diff, database-file, and Parquet protocol boundaries",
  },
];

async function buildModernSliceRecords(projectRoot) {
  return Promise.all(
    modernSlices.map(async (slice) => {
      const missingFiles = [];
      for (const sourceFile of slice.sourceFiles) {
        if (!(await fileExists(path.join(projectRoot, sourceFile)))) {
          missingFiles.push(sourceFile);
        }
      }
      return {
        ...slice,
        status: missingFiles.length === 0 ? "implemented-foundation" : "blocked",
        missingFiles,
      };
    }),
  );
}

async function buildLedger(options) {
  const inventory = JSON.parse(
    await fs.readFile(path.resolve(options.inventory), "utf8"),
  );
  const productSourcePaths = inventory.sourceMarkers.uniquePaths
    .filter((sourcePath) => !sourcePath.startsWith("src/bin/"))
    .sort((left, right) => left.localeCompare(right));
  const bundledRuntimePaths = inventory.sourceMarkers.uniquePaths
    .filter((sourcePath) => sourcePath.startsWith("src/bin/"))
    .sort((left, right) => left.localeCompare(right));

  const productModules = [];
  for (const sourcePath of productSourcePaths) {
    const projectPath = path.join(
      options.projectRoot,
      sourcePath.split("/").join(path.sep),
    );
    const classification = (await fileExists(projectPath))
      ? CLASSIFICATIONS.legacy
      : CLASSIFICATIONS.new;
    productModules.push(
      await buildModuleRecord({
        inventory,
        projectRoot: options.projectRoot,
        sourcePath,
        classification,
      }),
    );
  }

  const bundledRuntimeModules = bundledRuntimePaths.map((sourcePath) => ({
    sourcePath,
    classification: CLASSIFICATIONS.deferred,
    owner: "runtime-adapter",
    validationPlan: validationPlanForPath(
      sourcePath,
      CLASSIFICATIONS.deferred,
    ),
    targetBundleFiles: sortedUnique(sourceMarkersForPath(inventory, sourcePath)),
    legacySourcePresent: false,
    recoveryAction: "retain-target-runtime-until-typed-adapter-is-recovered",
  }));

  const classificationCounts = Object.fromEntries(
    Object.values(CLASSIFICATIONS).map((classification) => [
      classification,
      productModules.filter((module) => module.classification === classification)
        .length,
    ]),
  );
  const owners = sortedUnique(productModules.map((module) => module.owner));
  const modernSourceSlices = await buildModernSliceRecords(options.projectRoot);

  return {
    schemaVersion: 1,
    target: inventory.target,
    sourceMarkerEvidence: {
      productPathCount: productSourcePaths.length,
      bundledRuntimePathCount: bundledRuntimePaths.length,
      productBundleFiles: sortedUnique(
        productModules.flatMap((module) => module.targetBundleFiles),
      ),
      bundledRuntimeBundleFiles: sortedUnique(
        bundledRuntimeModules.flatMap((module) => module.targetBundleFiles),
      ),
    },
    summary: {
      productModuleCount: productModules.length,
      bundledRuntimeModuleCount: bundledRuntimeModules.length,
      classificationCounts,
      ownerCount: owners.length,
      owners,
      intentionalReplacements: [],
      deferredProductModules: [],
    },
    modernSourceSlices,
    productModules,
    bundledRuntimeModules,
  };
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    const ledger = await buildLedger(options);
    const content = JSON.stringify(ledger, null, 2) + "\n";
    if (options.output) {
      await fs.mkdir(path.dirname(path.resolve(options.output)), {
        recursive: true,
      });
      await fs.writeFile(options.output, content, "utf8");
    } else {
      process.stdout.write(content);
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

export { buildLedger };
