#!/usr/bin/env node

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_INVENTORY =
  "openspec/changes/restore-target-visual-parity/evidence/target-inventory.json";
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
      "src/modern/core/cache.ts",
      "src/modern/core/connectionConfigStore.ts",
      "src/modern/core/extensionServices.ts",
    ],
    validation: ["npm run typecheck:modern", "npm run lint:modern"],
    coverage: "typed configuration, target global/workspace connection state, resource paths, cache ownership, events, errors, logging, and service ownership",
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
      "src/modern/database/nodeZookeeperClient.d.ts",
      "src/modern/database/sslOptions.ts",
      "src/modern/database/tableSort.ts",
      "src/modern/database/userManagement.ts",
      "src/modern/database/sqljs.d.ts",
      "src/modern/database/standardDialects.ts",
      "src/modern/database/additionalFactories.ts",
    ],
    validation: ["npm run typecheck:modern", "npm run test:modern"],
    coverage: "connection lifecycle, cancellation boundary, result conversion, driver adapter, SQL.js, Dameng, Snowflake, Databricks, BigQuery, Trino, PrestoDB, TDengine, FTP, WebDAV, S3, etcd, Zookeeper, typed certificate loading, dialect selection, safe database/schema drop SQL, and per-table truncate planning",
  },
  {
    id: "3.3",
    name: "sql-metadata-tree",
    sourceFiles: [
      "src/modern/database/sqlTree.ts",
      "src/modern/database/metadataService.ts",
      "src/modern/database/fullTextSearch.ts",
      "src/modern/database/tableSort.ts",
      "src/modern/database/userManagement.ts",
      "src/modern/tree/databaseTreeProvider.ts",
    ],
    validation: ["npm run typecheck:modern", "npm run test:modern"],
    coverage: "typed table nodes, context values, filtering, persisted Default/Rows Count/Data Size sorting, pagination, metadata query ownership, typed full-text SQL and nested table-group discovery, typed Users and MySQL Events groups, typed Oracle Package discovery/source/drop/template, escaped user grant/drop/password templates, exact-name destructive-operation confirmation, and per-table database truncation execution",
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
      "src/modern/providers/sqlCompletionContext.ts",
      "src/modern/providers/sqlMetadataCompletion.ts",
      "src/modern/providers/vscodeLanguageProviders.ts",
      "src/modern/providers/sqlMetadataProviders.ts",
      "src/modern/providers/sqlDiagnostics.ts",
      "src/modern/providers/sqlDecorations.ts",
      "src/modern/providers/sqlVariableProvider.ts",
      "src/modern/providers/supplementalCodeLens.ts",
      "src/modern/providers/elasticsearchDocumentModel.ts",
      "src/modern/providers/elasticsearchDocumentFeatures.ts",
      "src/modern/providers/mongoJavaScriptProviders.ts",
      "src/modern/providers/mongoTypeProvider.ts",
      "src/modern/providers/mongoFieldCompletion.ts",
      "src/modern/providers/managedFilePaths.ts",
      "src/modern/providers/authenticationProvider.ts",
      "src/modern/providers/siteUriHandler.ts",
      "src/modern/providers/webviewState.ts",
      "src/modern/providers/webviewSerializers.ts",
      "src/modern/providers/supplementalLanguageProviders.ts",
      "src/modern/commands/manifestCommands.ts",
      "src/modern/commands/internalCommandDispatcher.ts",
      "src/modern/commands/targetCommandDispatcher.ts",
      "src/modern/commands/modernCommandHost.ts",
      "src/modern/database/messageCommands.ts",
      "src/modern/providers/sqlDocumentModel.ts",
      "src/modern/providers/sqlDocumentFeatures.ts",
      "src/modern/providers/sqlNotebookModel.ts",
      "src/modern/providers/sqlNotebookProvider.ts",
      "src/modern/providers/customEditors.ts",
      "src/modern/database/queryFiles.ts",
      "src/modern/database/fullTextSearch.ts",
      "test/modern/commands.test.ts",
    ],
    validation: ["npm run typecheck:modern", "npm run lint:modern"],
    coverage: "typed command capability audit, separate manifest and internal command registries, recovered query-open/SQL-Mongo CodeLens/Mock reset/Elasticsearch execute-document-lint-copy-as-cURL boundaries, Mongo missing-db and Elasticsearch invalid-body diagnostics, SQL metadata/diagnostic/decoration/variable providers, typed Kafka/RabbitMQ producer and consumer command service with offset configuration, dedicated Structure Diff/Mock/Manager dump/Remote File Manager route classification, typed full-text search host dispatch, persisted table-sort node dispatch, typed Users/Events/Oracle Package node dispatch, typed S3/FTP resource-node command dispatch, SQL/Elasticsearch/Mongo JavaScript/Mock/MQ/Docker Compose Provider registration, SQL Book notebook serialization, saved SQL/SQL Book/Elasticsearch/Mongo query-file lifecycle commands, authentication and URI handlers, and explicit Docker Compose internal adapter boundary",
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
      "src/modern/database/mongoScript.ts",
      "src/modern/database/messageFactories.ts",
      "src/modern/database/kafkaTreeService.ts",
      "src/modern/database/messageCommands.ts",
      "src/modern/database/messageTemplates.ts",
      "src/modern/database/redisDumpService.ts",
      "src/modern/database/redisTreeProtocol.ts",
      "src/modern/database/redisValues.ts",
      "src/modern/database/elasticsearchDumpService.ts",
      "src/modern/database/elasticsearchTreeProtocol.ts",
      "src/modern/database/dockerFactory.ts",
      "src/modern/tree/databaseTreeProvider.ts",
      "src/modern/remote/sshService.ts",
      "src/modern/remote/sshForwardingService.ts",
      "src/modern/remote/remotePaths.ts",
      "src/modern/remote/fileSystemProvider.ts",
      "src/modern/remote/sshTreeProvider.ts",
      "src/modern/remote/dockerTree.ts",
      "src/modern/remote/dockerComposeParser.ts",
      "src/modern/remote/dockerComposeService.ts",
      "src/modern/remote/rdpService.ts",
      "src/modern/remote/rdpTreeProvider.ts",
      "src/modern/database/s3Urls.ts",
      "src/modern/remote/resourceTreeProvider.ts",
      "test/modern/database.test.ts",
      "test/modern/remote.test.ts",
    ],
    validation: [
      "npm run typecheck:modern",
      "npm run test:modern",
      "npm run verify:modern:activation",
    ],
    coverage: "Redis, MongoDB, Elasticsearch, Neo4j, RabbitMQ, Loki, Kafka, Docker, FTP, WebDAV, S3, etcd, and Zookeeper adapters plus Neo4j Nodes/Relationships discovery, filtering, template, view and delete boundaries, Redis connection/database/folder/key hierarchy with INFO keyspace metadata, SCAN cursor paging, displayed-database selection, binary-safe dump/restore, Elasticsearch index/field/data-stream tree metadata, query templates, settings/mapping views, JSON dump/restore and NDJSON bulk boundaries, key-value browsing/edit/create/delete, Kafka Admin-backed Brokers/Topics/Partitions/Configs/Consumer Groups/Offsets/Members tree operations, MongoDB Collections grouping/filtering/stats and the controlled JavaScript facade, BSON normalization, typed NoSQL, SSH/SFTP, RDP launch, root-bounded FileSystemProvider, resource, and Docker tree nodes; MongoDB find/aggregate/write/update/delete/index/count/distinct script boundaries, Kafka/RabbitMQ producer and consumer preparation files with connection/vhost routing context, Kafka group offset configuration, Docker Compose image pull through the selected Docker Engine API, S3 bucket filtering, provider-site URLs, public URLs, and 36,000-second temporary URL boundaries",
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
      "src/modern-webview/components/ErDiagramView.vue",
      "src/modern/database/erDiagramService.ts",
      "src/modern/database/resultPaging.ts",
      "src/modern/database/resultMutations.ts",
      "src/modern/database/resultExport.ts",
      "src/modern/database/resultImport.ts",
      "src/modern/database/resultValues.ts",
      "src/modern-webview/components/HexViewer.vue",
      "src/modern/commands/modernCommandHost.ts",
      "src/modern/commands/resultProtocols.ts",
      "src/modern/commands/webviewUtilityProtocols.ts",
      "src/modern/database/connectionManager.ts",
      "src/modern/database/sslOptions.ts",
      "src/modern/providers/sqlVariableProvider.ts",
      "src/modern/providers/sqlDecorations.ts",
      "test/modern/database.test.ts",
      "test/modern/webview.test.ts",
    ],
    validation: [
      "npm run typecheck:modern",
      "npm run test:modern",
      "npm run build:modern:webview",
    ],
    coverage: "connection form persistence, console execution messages, SQL variable substitution, connection-state and INSERT pair decorations, result table state, typed server paging/count/filter/sort SQL, multi-column filter chips and per-column filter rows, column visibility, row and cell-range selection, range copy/export and bulk NULL/empty updates, insert/update/delete mutation generation, database-type-aware date/time/JSON/numeric/boolean cell editing, LongString/Buffer/typed-binary value normalization, base64 binary editing, hex preview, native SQL binary literals, JSON/CSV/XLSX/Parquet/SQL/Markdown export, full-result export options, XLSX/JSON/CSV/Parquet import with an async file boundary, SQL file import, insert/upsert and primary-key import strategy, copy/edit/history/file entry points, ER diagram foreign-key loading/export, Elasticsearch result requests, and route wiring",
  },
  {
    id: "4.4",
    name: "webview-design-and-route-workbench",
    sourceFiles: [
      "src/modern-webview/components/DatabaseFileView.vue",
      "src/modern-webview/components/DesignView.vue",
      "src/modern-webview/components/ParquetView.vue",
      "src/modern-webview/components/ForwardView.vue",
      "src/modern-webview/components/StructureDiffView.vue",
      "src/modern-webview/components/MockView.vue",
      "src/modern-webview/components/RouteWorkbench.vue",
      "src/modern-webview/components/UiInput.vue",
      "src/modern-webview/components/UiSelect.vue",
      "src/modern/database/mockModel.ts",
      "src/modern/database/tableDesign.ts",
      "src/modern/commands/webviewUtilityProtocols.ts",
      "src/modern/remote/sshForwardingService.ts",
      "src/modern/providers/customEditors.ts",
      "src/modern/providers/webviewSerializers.ts",
      "src/modern/providers/webviewState.ts",
      "src/modern/remote/fileSystemProvider.ts",
      "src/modern/extension.ts",
      "src/modern/tree/databaseTreeProvider.ts",
      "test/modern/database.test.ts",
    ],
    validation: [
      "npm run typecheck:modern",
      "npm run build:modern:webview",
      "npm run verify:modern:activation",
    ],
    coverage: "typed table design metadata, DDL/column/index/foreign-key/check/trigger operations, explicit unsupported SQLite column-edit boundary, dedicated Mock model/editor and save-run-reset protocol, remote-file/SSH, RabbitMQ, Local SSH forwarding, explicit Remote/Dynamic forwarding adapter boundary, SSH status, metadata-backed structure-diff, database-file, and Parquet protocol boundaries",
  },
  {
    id: "4.5",
    name: "target-database-remote-and-dump-pages",
    sourceFiles: [
      "src/modern-webview/components/RedisView.vue",
      "src/modern-webview/components/RabbitQueueView.vue",
      "src/modern-webview/components/ManagerView.vue",
      "src/modern-webview/components/DumpView.vue",
      "src/modern-webview/components/ElasticsearchStatusView.vue",
      "src/modern-webview/components/RemoteFileManagerView.vue",
      "src/modern-webview/components/SshStatusView.vue",
      "src/modern-webview/components/SshMonitorView.vue",
      "src/modern-webview/components/SshTerminalView.vue",
      "src/modern-webview/components/XtermView.vue",
      "src/modern-webview/components/LokiLogView.vue",
      "src/modern-webview/routeRegistry.ts",
      "src/modern-webview/style.css",
      "src/modern-webview/router.ts",
      "src/modern/commands/webviewUtilityProtocols.ts",
      "src/modern/database/statusService.ts",
      "src/modern/database/dumpService.ts",
      "src/modern/database/mongoDumpService.ts",
      "src/modern/database/standardDialects.ts",
      "src/modern/remote/remotePaths.ts",
      "src/modern/remote/sshMonitorService.ts",
      "src/modern/remote/sshTreeProvider.ts",
      "src/modern/remote/dockerTree.ts",
      "src/modern/tree/databaseTreeProvider.ts",
      "src/modern/database/nosqlFactories.ts",
      "src/modern/database/redisDumpService.ts",
      "src/modern/database/redisTreeProtocol.ts",
      "src/modern/database/elasticsearchDumpService.ts",
      "src/modern/database/elasticsearchTreeProtocol.ts",
      "src/modern/database/sqliteFile.ts",
      "src/modern/providers/webviewSerializers.ts",
      "src/modern/providers/webviewState.ts",
      "src/modern/remote/fileSystemProvider.ts",
      "src/modern-webview/components/SqliteView.vue",
      "src/modern/remote/rdpService.ts",
      "src/modern/remote/rdpTreeProvider.ts",
      "test/modern/webview.test.ts",
    ],
    validation: [
      "npm run typecheck:modern",
      "npm run test:modern",
      "npm run build:modern:webview",
      "npm run verify:modern:activation",
    ],
    coverage: "readable Redis key, Hash/List/Set/ZSet item mutations, stream consumer-group operations, Redis connection/database/folder/key tree, type-aware keyView entry, SCAN load-more protocol, Redis command terminal, binary-safe Redis dump/restore, Loki Labels/Series tree and LogQL log page, RabbitMQ connection/Users/Virtual Hosts/Exchanges/Queues/Bindings tree, queue create/delete/bind/inspect commands, queue message multi-select/send/move/delete and management tabs, Elasticsearch index/field/data-stream tree, node status, query templates, settings/mapping views, JSON dump/restore and bulk loading, Manager process list/dashboard and controlled kill, MySQL/MariaDB/PostgreSQL dump configuration and safe parameter-array execution, MongoDB mongodump/mongorestore executable discovery, database/collection scope, and directory selection, local SQLite custom-editor loading with sql-wasm, table/view discovery, row counts, safe identifier quoting and paged browsing, root-bounded remote file manager paths, SSH status, SSH monitor, SSH terminal, RDP launch configuration, xterm pages, and Webview serializer restore protocols",
  },
  {
    id: "4.6",
    name: "target-cloud-document-settings-image-and-util-pages",
    sourceFiles: [
      "src/modern-webview/components/DocumentView.vue",
      "src/modern-webview/components/ImageView.vue",
      "src/modern-webview/components/PlanView.vue",
      "src/modern-webview/components/SettingsView.vue",
      "src/modern-webview/components/ConsoleView.vue",
      "src/modern-webview/document.ts",
      "src/modern-webview/router.ts",
      "src/modern-webview/style.css",
      "src/modern/commands/modernCommandHost.ts",
      "src/modern/commands/webviewUtilityProtocols.ts",
      "src/modern/core/config.ts",
      "src/modern/core/cloudService.ts",
      "src/modern/core/cloudConfigSyncService.ts",
      "src/modern/core/connectionConfigService.ts",
      "src/modern/core/connectionConfigStore.ts",
      "src/modern/core/extensionServices.ts",
      "src/modern/core/imageService.ts",
      "src/modern/core/resourceServer.ts",
      "src/modern/core/settingsService.ts",
      "src/modern/core/utilityService.ts",
      "src/modern/providers/authenticationProvider.ts",
      "src/modern/providers/siteUriHandler.ts",
      "src/modern/providers/webviewState.ts",
      "src/modern/core/webviewHtml.ts",
      "src/modern-webview/components/UtilView.vue",
      "test/modern/webview.test.ts",
    ],
    validation: [
      "npm run typecheck:modern",
      "npm run test:modern",
      "npm run build:modern:webview",
    ],
    coverage: "target document iframe, resourceHost handshake, language/theme URL mapping, configurable documentation host, frame CSP boundary, Cloud/License account state, Plan login/license actions, target global/workspace connection configuration, Settings import/export/update/reset, direct cloud archive encryption and query-file packaging, managed cache cleanup, Image crop/resize/Base64/SVG/TinyPNG actions, CommonUtil hash/encoding/random/timestamp tools, TaskManager process listing and guarded termination, and the loopback resource server",
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
