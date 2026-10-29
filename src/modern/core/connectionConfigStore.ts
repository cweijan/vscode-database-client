import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";

import type { StateStore } from "./contracts";
import type { DatabaseType } from "../database/types";

export const CONNECTION_CONFIG_SCHEMA =
  "https://database-client.com/schema/config.json";

const DATABASE_KEY = "database.connections";
const LEGACY_DATABASE_KEY = "mysql.connections";
const NOSQL_KEY = "nosql.connections";
const LEGACY_NOSQL_KEY = "redis.connections";
const WORKSPACE_CONFIG_NAME = "database-client-config.json";

const NOSQL_CONNECTION_TYPES = new Set<string>([
  "SSH",
  "SFTP",
  "RDP",
  "Docker",
  "Redis",
  "ElasticSearch",
  "MongoDB",
  "S3",
  "FTP",
  "Neo4j",
  "Kafka",
  "Zookeeper",
  "Loki",
  "RabbitMQ",
  "etcd",
  "WebDAV",
]);

export function connectionConfigKey(
  type: DatabaseType | string,
): "database.connections" | "nosql.connections" {
  return NOSQL_CONNECTION_TYPES.has(type)
    ? "nosql.connections"
    : "database.connections";
}

const RUNTIME_CONNECTION_KEYS = new Set([
  "parent",
  "provider",
  "dialect",
  "children",
  "command",
  "context",
  "resourceUri",
  "iconPath",
  "collapsibleState",
  "terminalService",
  "forwardService",
  "handler",
  "handler0",
  "fullPath",
  "pattern",
  "level",
  "tooltip",
  "descriptionz",
  "connectionKey",
  "sshConfig",
  "uid",
  "global",
  "isGlobal",
]);

export interface ConnectionConfig {
  readonly database: Record<string, unknown>;
  readonly nosql: Record<string, unknown>;
  readonly $schema: string;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cleanConnectionValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => cleanConnectionValue(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (RUNTIME_CONNECTION_KEYS.has(key)) continue;
    const cleaned = cleanConnectionValue(item);
    if (cleaned !== undefined) result[key] = cleaned;
  }
  return result;
}

export function sanitizeConnectionMap(value: unknown): Record<string, unknown> {
  return record(cleanConnectionValue(value));
}

function connectionScope(value: unknown): boolean | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as { global?: unknown; isGlobal?: unknown };
  if (typeof source.global === "boolean") return source.global;
  return typeof source.isGlobal === "boolean" ? source.isGlobal : undefined;
}

function scopedConnectionMap(
  value: unknown,
  globalScope: boolean,
): Record<string, unknown> {
  const source = record(value);
  return Object.fromEntries(Object.entries(source).map(([id, item]) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [id, item];
    }
    const scoped = { ...(item as Record<string, unknown>) };
    Object.defineProperty(scoped, "global", {
      configurable: true,
      enumerable: true,
      value: globalScope,
      writable: false,
    });
    return [id, scoped];
  }));
}

interface ScopedConnectionMaps {
  readonly global: Record<string, unknown>;
  readonly workspace: Record<string, unknown>;
  readonly explicit: boolean;
}

function splitScopedConnectionMap(value: unknown): ScopedConnectionMaps {
  const global: Record<string, unknown> = {};
  const workspace: Record<string, unknown> = {};
  let explicit = false;
  for (const [id, item] of Object.entries(record(value))) {
    if (connectionScope(item) === true) {
      global[id] = item;
      explicit = true;
    } else {
      workspace[id] = item;
      if (connectionScope(item) === false) explicit = true;
    }
  }
  return { global, workspace, explicit };
}

function configFromSource(value: unknown): ConnectionConfig {
  const source = record(value);
  return {
    database: record(source.database ?? source[DATABASE_KEY]),
    nosql: record(source.nosql ?? source[NOSQL_KEY]),
    $schema: typeof source.$schema === "string"
      ? source.$schema
      : CONNECTION_CONFIG_SCHEMA,
  };
}

function mergeMaps(
  current: Record<string, unknown>,
  incoming: unknown,
  merge: boolean,
): Record<string, unknown> {
  const next = record(incoming);
  return merge ? { ...current, ...next } : next;
}

/**
 * Owns the target's two connection scopes while keeping the earlier modern
 * mysql/redis state keys readable during the source migration.
 */
export class ConnectionConfigStore implements StateStore {
  public constructor(
    private readonly globalState: StateStore,
    private readonly workspaceState?: StateStore,
    private readonly workspaceRoot?: string,
  ) {}

  public get<T>(key: string, fallback: T): T {
    if (key === DATABASE_KEY || key === LEGACY_DATABASE_KEY) {
      return this.readConnectionMap(DATABASE_KEY, LEGACY_DATABASE_KEY, fallback) as T;
    }
    if (key === NOSQL_KEY || key === LEGACY_NOSQL_KEY) {
      return this.readConnectionMap(NOSQL_KEY, LEGACY_NOSQL_KEY, fallback) as T;
    }
    const globalValue = this.globalState.get<unknown>(key, undefined);
    if (globalValue !== undefined) return globalValue as T;
    return this.workspaceState?.get<T>(key, fallback) ?? fallback;
  }

  public async update<T>(key: string, value: T): Promise<void> {
    if (key === DATABASE_KEY || key === LEGACY_DATABASE_KEY) {
      const scoped = this.isWorkspaceConfigured() ? splitScopedConnectionMap(value) : undefined;
      if (scoped?.explicit) {
        await this.updateScope(false, scoped.global, undefined, false);
        await this.updateScope(true, scoped.workspace, undefined, false);
        return;
      }
      await this.updateScope(this.isWorkspaceConfigured(), value, undefined, false);
      return;
    }
    if (key === NOSQL_KEY || key === LEGACY_NOSQL_KEY) {
      const scoped = this.isWorkspaceConfigured() ? splitScopedConnectionMap(value) : undefined;
      if (scoped?.explicit) {
        await this.updateScope(false, undefined, scoped.global, false);
        await this.updateScope(true, undefined, scoped.workspace, false);
        return;
      }
      await this.updateScope(this.isWorkspaceConfigured(), undefined, value, false);
      return;
    }
    await this.globalState.update(key, value);
  }

  public keys(): readonly string[] {
    return [...new Set([
      ...this.globalState.keys(),
      ...(this.workspaceState?.keys() || []),
      DATABASE_KEY,
      NOSQL_KEY,
    ])];
  }

  public config(workspace = false): ConnectionConfig {
    const source = this.read(workspace);
    return {
      database: sanitizeConnectionMap(source.database),
      nosql: sanitizeConnectionMap(source.nosql),
      $schema: CONNECTION_CONFIG_SCHEMA,
    };
  }

  public read(workspace = false): ConnectionConfig {
    if (workspace) {
      return this.readWorkspace() || {
        database: {},
        nosql: {},
        $schema: CONNECTION_CONFIG_SCHEMA,
      };
    }
    return {
      database: record(this.readConnectionMap(DATABASE_KEY, LEGACY_DATABASE_KEY, {}, false)),
      nosql: record(this.readConnectionMap(NOSQL_KEY, LEGACY_NOSQL_KEY, {}, false)),
      $schema: CONNECTION_CONFIG_SCHEMA,
    };
  }

  public isWorkspaceConfigured(): boolean {
    const filePath = this.workspaceConfigPath();
    return filePath !== undefined && existsSync(filePath);
  }

  public workspaceConfigPath(): string | undefined {
    return this.workspaceRoot
      ? path.join(this.workspaceRoot, ".vscode", WORKSPACE_CONFIG_NAME)
      : undefined;
  }

  public async updateScope(
    workspace: boolean,
    database: unknown,
    nosql: unknown,
    merge: boolean,
  ): Promise<number> {
    const workspacePath = this.workspaceConfigPath();
    const useWorkspace = workspace && workspacePath !== undefined;
    const current = this.read(useWorkspace);
    const nextDatabase = database === undefined
      ? current.database
      : mergeMaps(current.database, database, merge);
    const nextNosql = nosql === undefined
      ? current.nosql
      : mergeMaps(current.nosql, nosql, merge);
    const persistedDatabase = sanitizeConnectionMap(nextDatabase);
    const persistedNosql = sanitizeConnectionMap(nextNosql);
    if (useWorkspace) {
      await this.writeWorkspace({
        database: persistedDatabase,
        nosql: persistedNosql,
        $schema: CONNECTION_CONFIG_SCHEMA,
      });
    } else {
      await this.writeGlobal(persistedDatabase, persistedNosql);
    }
    return Number(database !== undefined) + Number(nosql !== undefined);
  }

  private readConnectionMap(
    canonicalKey: string,
    legacyKey: string,
    fallback: unknown,
    includeWorkspace = true,
  ): unknown {
    if (includeWorkspace) {
      const workspace = this.readWorkspace();
      if (workspace) {
        const global = this.readConnectionMap(
          canonicalKey,
          legacyKey,
          fallback,
          false,
        );
        const workspaceMap = canonicalKey === DATABASE_KEY
          ? workspace.database
          : workspace.nosql;
        return {
          ...scopedConnectionMap(global, true),
          ...scopedConnectionMap(workspaceMap, false),
        };
      }
    }
    const canonical = this.globalState.get<unknown>(canonicalKey, undefined);
    if (canonical !== undefined) return canonical;
    const legacy = this.globalState.get<unknown>(legacyKey, undefined);
    if (legacy !== undefined) return legacy;
    return this.workspaceState?.get<unknown>(canonicalKey, fallback)
      ?? this.workspaceState?.get<unknown>(legacyKey, fallback)
      ?? fallback;
  }

  private readWorkspace(): ConnectionConfig | undefined {
    const filePath = this.workspaceConfigPath();
    if (!filePath || !existsSync(filePath)) return undefined;
    try {
      return configFromSource(JSON.parse(readFileSync(filePath, "utf8")));
    } catch {
      return {
        database: {},
        nosql: {},
        $schema: CONNECTION_CONFIG_SCHEMA,
      };
    }
  }

  private async writeGlobal(
    database: Record<string, unknown>,
    nosql: Record<string, unknown>,
  ): Promise<void> {
    await this.globalState.update(DATABASE_KEY, database);
    await this.globalState.update(LEGACY_DATABASE_KEY, database);
    await this.globalState.update(NOSQL_KEY, nosql);
    await this.globalState.update(LEGACY_NOSQL_KEY, nosql);
  }

  private async writeWorkspace(config: ConnectionConfig): Promise<void> {
    const filePath = this.workspaceConfigPath();
    if (!filePath) {
      await this.writeGlobal(config.database, config.nosql);
      return;
    }
    const existing = this.readWorkspaceSource(filePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      JSON.stringify({
        ...existing,
        database: config.database,
        nosql: config.nosql,
        $schema: config.$schema,
      }, null, 2),
      "utf8",
    );
  }

  private readWorkspaceSource(filePath: string): Record<string, unknown> {
    try {
      return record(JSON.parse(readFileSync(filePath, "utf8")));
    } catch {
      return {};
    }
  }
}
