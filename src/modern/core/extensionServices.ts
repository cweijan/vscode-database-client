import * as vscode from "vscode";

import { ActiveConnectionStore } from "./activeConnection";
import { CallbackConfigurationReader, ConfigService } from "./config";
import type { Disposable, Logger } from "./contracts";
import { EventBus } from "./events";
import { ChannelLogger } from "./logging";
import { VscodeResourceResolver } from "./resources";
import { MementoStateStore } from "./state";
import { VscodeWebviewManager } from "./vscodeWebviewManager";
import { ConnectionManager } from "../database/connectionManager";
import { DialectRegistry } from "../database/dialectRegistry";
import { createStandardConnectionFactories } from "../database/standardFactories";
import { createStandardDialects } from "../database/standardDialects";

export interface ExtensionEventMap {
  connectionOpened: { id: string; type: string };
  connectionClosed: { id: string };
}

export interface ExtensionServices extends Disposable {
  readonly activeConnection: ActiveConnectionStore;
  readonly config: ConfigService;
  readonly state: MementoStateStore;
  readonly events: EventBus<ExtensionEventMap>;
  readonly logger: Logger;
  readonly resources: VscodeResourceResolver;
  readonly dialects: DialectRegistry;
  readonly connections: ConnectionManager;
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
  const state = new MementoStateStore(context.workspaceState);
  const events = new EventBus<ExtensionEventMap>();
  const resources = new VscodeResourceResolver(context.extensionUri);
  const dialects = new DialectRegistry(createStandardDialects());
  const connections = new ConnectionManager(logger);
  for (const factory of createStandardConnectionFactories()) {
    connections.registerFactory(factory);
  }
  const webviews = new VscodeWebviewManager(context.extensionUri, logger);

  return {
    activeConnection,
    config,
    state,
    events,
    logger,
    resources,
    dialects,
    connections,
    webviews,
    dispose: () => {
      events.clear();
      webviews.dispose();
      void connections.dispose();
    },
  };
}
