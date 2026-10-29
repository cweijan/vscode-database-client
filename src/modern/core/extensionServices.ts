import * as vscode from "vscode";
import * as os from "node:os";
import * as path from "node:path";

import { ActiveConnectionStore } from "./activeConnection";
import { CloudService } from "./cloudService";
import { CloudConfigSyncService } from "./cloudConfigSyncService";
import { ConnectionConfigService } from "./connectionConfigService";
import { ConnectionConfigStore } from "./connectionConfigStore";
import { CallbackConfigurationReader, ConfigService } from "./config";
import { CacheService } from "./cache";
import type { Disposable, Logger, StateStore } from "./contracts";
import { EventBus } from "./events";
import { TinyPngService } from "./imageService";
import { ChannelLogger } from "./logging";
import { VscodeResourceResolver } from "./resources";
import { ResourceServer } from "./resourceServer";
import { MementoStateStore } from "./state";
import { SettingsService } from "./settingsService";
import { UtilityService } from "./utilityService";
import { VscodeWebviewManager } from "./vscodeWebviewManager";
import { ConnectionManager } from "../database/connectionManager";
import { DialectRegistry } from "../database/dialectRegistry";
import { DumpService } from "../database/dumpService";
import { MongoDumpService } from "../database/mongoDumpService";
import { MessageCommandService } from "../database/messageCommands";
import { QueryFileService } from "../database/queryFiles";
import { createStandardConnectionFactories } from "../database/standardFactories";
import { createStandardDialects } from "../database/standardDialects";
import { disposeOracleJdbcServer } from "../database/oracle/jdbcFactory";
import { SshService } from "../remote/sshService";
import { SshForwardingService } from "../remote/sshForwardingService";
import { DockerComposeService } from "../remote/dockerComposeService";
import { SqlVariableService } from "../providers/sqlVariableProvider";
import { ModernSqlDecorations } from "../providers/sqlDecorations";

export interface ExtensionEventMap {
  connectionOpened: { id: string; type: string };
  connectionClosed: { id: string };
}

export interface ExtensionServices extends Disposable {
  readonly activeConnection: ActiveConnectionStore;
  readonly config: ConfigService;
  readonly cache: CacheService;
  readonly state: StateStore;
  readonly events: EventBus<ExtensionEventMap>;
  readonly logger: Logger;
  readonly resources: VscodeResourceResolver;
  readonly resourceServer: ResourceServer;
  readonly cloud: CloudService;
  readonly cloudSync: CloudConfigSyncService;
  readonly connectionConfig: ConnectionConfigService;
  readonly settings: SettingsService;
  readonly tinyPng: TinyPngService;
  readonly utility: UtilityService;
  readonly dialects: DialectRegistry;
  readonly dump: DumpService;
  readonly mongoDump: MongoDumpService;
  readonly messageCommands: MessageCommandService;
  readonly queries: QueryFileService;
  readonly connections: ConnectionManager;
  readonly ssh: SshService;
  readonly forwarding: SshForwardingService;
  readonly dockerCompose: DockerComposeService;
  readonly sqlVariables: SqlVariableService;
  readonly sqlDecorations: ModernSqlDecorations;
  readonly webviews: VscodeWebviewManager;
}

export function createExtensionServices(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
): ExtensionServices {
  const logger = new ChannelLogger(output);
  const activeConnection = new ActiveConnectionStore();
  const config = new ConfigService(
    new CallbackConfigurationReader((key, fallback) =>
      vscode.workspace.getConfiguration("database-client").get(key, fallback),
    ),
  );
  const globalState = new MementoStateStore(context.globalState);
  const workspaceState = new MementoStateStore(context.workspaceState);
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const managedRoot = path.join(os.homedir(), ".dbclient");
  const state = new ConnectionConfigStore(globalState, workspaceState, workspaceRoot);
  const cache = new CacheService(managedRoot, () => {
    const ids = new Set<string>();
    for (const key of ["database.connections", "nosql.connections"]) {
      const value = state.get<unknown>(key, {});
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      for (const [id, item] of Object.entries(value)) {
        if (item && typeof item === "object") {
          const itemId = (item as { id?: unknown }).id;
          ids.add(typeof itemId === "string" && itemId ? itemId : id);
        }
      }
    }
    return ids;
  });
  const cloud = new CloudService(
    context.globalState,
    vscode.env.machineId,
    logger,
  );
  const settings = new SettingsService(
    context.extensionUri,
    context.extension.id,
    logger,
  );
  const resourceServer = new ResourceServer(context.extensionUri, logger, {
    documentationHost: config.get("documentationHost"),
  });
  resourceServer.setBindHandler(async (query) => {
    await cloud.setUser(query);
  });
  void resourceServer.start();
  const tinyPng = new TinyPngService(
    () => vscode.workspace.getConfiguration("database-client").get<string>("tinypng.apiKey", ""),
    (value) => Promise.resolve(vscode.workspace.getConfiguration("database-client").update(
      "tinypng.apiKey",
      value || undefined,
      vscode.ConfigurationTarget.Global,
    )),
  );
  const utility = new UtilityService();
  const events = new EventBus<ExtensionEventMap>();
  const resources = new VscodeResourceResolver(context.extensionUri);
  const dialects = new DialectRegistry(createStandardDialects());
  const dump = new DumpService();
  const mongoDump = new MongoDumpService();
  const queries = new QueryFileService(managedRoot);
  const cloudSync = new CloudConfigSyncService(
    cloud,
    state,
    managedRoot,
    logger,
  );
  const connectionConfig = new ConnectionConfigService(
    state,
    cloudSync,
    logger,
    managedRoot,
  );
  const ssh = new SshService();
  const forwarding = new SshForwardingService(ssh);
  const connections = new ConnectionManager(logger, forwarding);
  for (const factory of createStandardConnectionFactories(
    path.join(context.extensionUri.fsPath, "out"),
    forwarding,
  )) {
    connections.registerFactory(factory);
  }
  const webviews = new VscodeWebviewManager(context.extensionUri, logger);
  const messageCommands = new MessageCommandService(activeConnection, connections);
  const dockerCompose = new DockerComposeService(activeConnection, connections);
  const sqlVariables = new SqlVariableService(state);
  const sqlDecorations = new ModernSqlDecorations(activeConnection);

  return {
    activeConnection,
    config,
    cache,
    state,
    events,
    logger,
    resources,
    resourceServer,
    cloud,
    cloudSync,
    connectionConfig,
    settings,
    tinyPng,
    utility,
    dialects,
    dump,
    mongoDump,
    messageCommands,
    queries,
    connections,
    ssh,
    forwarding,
    dockerCompose,
    sqlVariables,
    sqlDecorations,
    webviews,
    dispose: () => {
      events.clear();
      cache.dispose();
      connectionConfig.dispose();
      webviews.dispose();
      resourceServer.dispose();
      disposeOracleJdbcServer();
      void connections.dispose().finally(() => {
        forwarding.dispose();
        void ssh.dispose();
      });
      messageCommands.dispose();
      dockerCompose.dispose();
      sqlDecorations.dispose();
    },
  };
}
