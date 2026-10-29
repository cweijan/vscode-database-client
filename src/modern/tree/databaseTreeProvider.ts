import { mkdir, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";

import type { ExtensionServices } from "../core/extensionServices";
import { SourceRecoveryPendingError } from "../core/errors";
import {
  openErDiagramPanel,
  registerWebviewUtilityProtocols,
} from "../commands/webviewUtilityProtocols";
import { bindResultProtocols, type ResultState } from "../commands/resultProtocols";
import type {
  ConnectionOptions,
  Dialect,
  MetadataQueryExecutor,
  QueryField,
  QueryResult,
} from "../database/types";
import { asConnectionOptions } from "../database/connectionOptions";
import {
  buildCheckSql,
  buildCreateForeignKeySql,
  buildCreateIndexSql,
  buildDropColumnSql,
  buildDropIndexSql,
  buildDropCheckSql,
  buildDropForeignKeySql,
  buildDropTriggerSql,
  buildUpdateColumnSql,
  buildUpdateTableSql,
  normalizeDesignColumn,
  type CreateForeignKeyDesignInput,
  type CreateIndexDesignInput,
  type TableDesignMetadata,
  type UpdateColumnDesignInput,
  type UpdateTableDesignInput,
} from "../database/tableDesign";
import { buildTableFullTextSql } from "../database/fullTextSearch";
import {
  queryScopeKey,
  type QueryFileEntry,
  type QueryTreeEntry,
} from "../database/queryFiles";
import {
  groupConnectionEntries,
  isConnectionGroupBranch,
  type ConnectionGroupTree,
} from "./connectionGrouping";
import {
  DEFAULT_TABLE_SORT_RULE,
  sortTableMetadata,
  tableSortOptions,
  tableSortStateKey,
  type TableSortRule,
} from "../database/tableSort";
import {
  OracleSynonymGroup,
  OracleSynonymNode,
} from "../database/oracle/synonyms";
import {
  userDetailsSql,
  userDisplayName,
  userDropSql,
  userGrantSql,
  userIdentity,
  type UserIdentity,
} from "../database/userManagement";
import { DockerConnectionNode } from "../remote/dockerTree";
import { SshConnectionNode } from "../remote/sshTreeProvider";
import { ResourceConnectionNode } from "../remote/resourceTreeProvider";
import { RdpConnectionNode } from "../remote/rdpTreeProvider";
import {
  connectionTreeIcon,
  targetPresentationCollapsibleState,
  targetPresentationTreeIcon,
  targetResourceTreeIcon,
  targetThemePresentationIcon,
  targetThemeTreeIcon,
} from "./targetTreeIcon";
import {
  targetDatabaseNodeContext,
  isActiveDatabaseTreeItem,
  targetSpecializedConnectionContext,
  targetSqlTreePresentations,
  targetSqlAuthTreePresentations,
  targetSpecializedTreePresentations,
  targetTreeFeatureEnabled,
} from "./targetTreePresentation";
import {
  KafkaTreeService,
  type KafkaBrokerInfo,
  type KafkaConfigInfo,
  type KafkaConsumerGroupInfo,
  type KafkaConsumerMemberInfo,
  type KafkaGroupOffsetInfo,
  type KafkaPartitionInfo,
  type KafkaTopicInfo,
  type KafkaTopicOffsetInfo,
} from "../database/kafkaTreeService";
import { dumpRedis, restoreRedis } from "../database/redisDumpService";
import {
  parseRedisKeyspaceInfo,
  redisInfoValue,
  parseRedisScanPage,
  type RedisDatabaseMeta,
  type RedisScanPage,
} from "../database/redisTreeProtocol";
import {
  dumpElasticsearch,
  restoreElasticsearch,
  type ElasticsearchDumpOptions,
} from "../database/elasticsearchDumpService";
import {
  parseElasticsearchDataStreams,
  parseElasticsearchIndexRows,
  parseElasticsearchMapping,
  parseElasticsearchVersion,
  sumElasticsearchStoreBytes,
  type ElasticsearchDataStreamMeta,
  type ElasticsearchFieldMeta,
  type ElasticsearchIndexMeta,
} from "../database/elasticsearchTreeProtocol";
import {
  buildMessageTemplate,
  type MessageTemplateKind,
  type MessageTemplateProtocol,
} from "../database/messageTemplates";
import { prettyBytes } from "../core/utilityService";
import { filterTargetTreeNames, targetTreeVisibilityOptions } from "./treeVisibility";

export interface StoredConnection extends ConnectionOptions {
  readonly name?: string;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly socketPath?: string;
  readonly connectionUrl?: string;
  readonly treeFeatures?: readonly string[] | string;
  readonly advance?: {
    readonly groupingTables?: boolean;
    readonly groupingThreshold?: number;
    readonly [key: string]: unknown;
  };
  readonly [key: string]: unknown;
}

const targetSecondLevelDatabaseTypes = new Set([
  "Trino",
  "PrestoDB",
  "SqlServer",
  "PostgreSQL",
  "DuckDB",
  "Cockroach",
  "Databricks",
  "Snowflake",
  "Redshift",
  "Kingbase",
  "GaussDB",
]);

const targetSchemaConnectionTypes = new Set([
  "DM",
  "达梦",
  "Oracle",
  "Db2",
  "Db2 for i",
  "BigQuery",
  "Exasol",
]);

export interface TreeActionHost {
  query<Row = Record<string, unknown>>(
    connection: StoredConnection,
    sql: string,
  ): Promise<QueryResult<Row>>;
  openSqlDocument(sql: string): Promise<unknown>;
  showTextDocument(document: unknown): Promise<unknown>;
  writeClipboard(value: string): Promise<void>;
  input(prompt: string, placeHolder: string): Thenable<string | undefined>;
  confirm(message: string): Promise<boolean>;
  showInformation(message: string): void;
  showError(message: string): void;
}

function createActionHost(services: ExtensionServices): TreeActionHost {
  return {
    query: (connection, sql) => services.connections.query(connection, sql),
    openSqlDocument: async (sql) =>
      vscode.workspace.openTextDocument({ content: sql, language: "sql" }),
    showTextDocument: async (document) => {
      await vscode.window.showTextDocument(document as vscode.TextDocument);
    },
    writeClipboard: async (value) => {
      await vscode.env.clipboard.writeText(value);
    },
    input: (prompt, placeHolder) =>
      vscode.window.showInputBox({ prompt, placeHolder }),
    confirm: async (message) =>
      (await vscode.window.showWarningMessage(
        message,
        { modal: true },
        "Confirm",
      )) === "Confirm",
    showInformation: (message) => {
      void vscode.window.showInformationMessage(message);
    },
    showError: (message) => {
      void vscode.window.showErrorMessage(message);
    },
  };
}

function recordsFromState(value: unknown): StoredConnection[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => asConnectionOptions(item))
      .filter((item): item is StoredConnection => item !== undefined);
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  return Object.entries(value as Record<string, unknown>)
    .map(([id, item]) => asConnectionOptions(item, id))
    .filter((item): item is StoredConnection => item !== undefined);
}

function displayName(connection: StoredConnection): string {
  return connection.name || connection.id || connection.host || connection.type;
}

function targetConnectionDescription(connection: StoredConnection): string | undefined {
  if (connection.disabled) return "closed";
  const remark = connection.remark;
  if (typeof remark === "string" && remark.trim()) return remark.trim();
  if (connection.type === "JDBC") return "JDBC";
  const usingSsh = connection.usingSSH === true || connection.options?.usingSSH === true;
  if (usingSsh) return "ssh";
  if (connection.useSocksProxy === true || connection.options?.useSocksProxy === true) return "socks";
  if (connection.useHTTPProxy === true || connection.options?.useHTTPProxy === true) return "http";
  return undefined;
}

function renamedGroup(group: string, oldGroup: string, newGroup: string): string {
  if (group === oldGroup) return newGroup;
  return group.startsWith(`${oldGroup}/`)
    ? `${newGroup}${group.slice(oldGroup.length)}`
    : group;
}

function renameGroupRecord(value: unknown, oldGroup: string, newGroup: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const group = record.group;
  if (typeof group !== "string") return value;
  const nextGroup = renamedGroup(group, oldGroup, newGroup);
  return nextGroup === group ? value : { ...record, group: nextGroup };
}

function renameGroupState(value: unknown, oldGroup: string, newGroup: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => renameGroupRecord(item, oldGroup, newGroup));
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, renameGroupRecord(item, oldGroup, newGroup)]),
  );
}

function buildDatabaseConnectionTree(
  connections: readonly StoredConnection[],
  services: ExtensionServices,
  actions: TreeActionHost,
  onDelete: (id: string) => Promise<void>,
  onRefresh: (target?: DatabaseTreeItem) => void,
  onRenameGroup: (oldGroup: string, newGroup: string) => Promise<void>,
): DatabaseTreeItem[] {
  const grouped = groupConnectionEntries(
    connections.map((connection) => ({ value: connection, group: connection.group })),
  );

  const materialize = (
    tree: readonly ConnectionGroupTree<StoredConnection>[],
    parent?: DatabaseTreeItem,
  ): DatabaseTreeItem[] => tree.map((entry) => {
    if (isConnectionGroupBranch(entry)) {
      return new ConnectionGroupNode<DatabaseTreeItem>(
        entry.path,
        services,
        (groupParent) => materialize(entry.children, groupParent),
        parent,
        onRenameGroup,
      );
    }
    return new ModernConnectionNode(
      entry,
      services,
      actions,
      onDelete,
      parent,
      onRefresh,
    );
  });

  return materialize(grouped);
}

function buildNoSqlConnectionTree(
  connections: readonly StoredConnection[],
  services: ExtensionServices,
  createConnection: (connection: StoredConnection, parent?: vscode.TreeItem) => vscode.TreeItem,
  onRenameGroup: (oldGroup: string, newGroup: string) => Promise<void>,
): vscode.TreeItem[] {
  const grouped = groupConnectionEntries(
    connections.map((connection) => ({ value: connection, group: connection.group })),
  );

  const materialize = (
    tree: readonly ConnectionGroupTree<StoredConnection>[],
    parent?: vscode.TreeItem,
  ): vscode.TreeItem[] => tree.map((entry) => {
    if (isConnectionGroupBranch(entry)) {
      return new ConnectionGroupNode<vscode.TreeItem>(
        entry.path,
        services,
        (groupParent) => materialize(entry.children, groupParent),
        parent,
        onRenameGroup,
      );
    }
    return createConnection(entry, parent);
  });

  return materialize(grouped);
}

function queryDirectory(
  services: ExtensionServices,
  connection: StoredConnection,
): string {
  return services.queries.defaultDirectory(connection);
}

async function queryLinkedDirectories(
  services: ExtensionServices,
  connection: StoredConnection,
): Promise<string[]> {
  const linked = services.state.get<Record<string, unknown>>(
    "mysql.query.linkedFolders",
    {},
  );
  const value = linked[queryScopeKey(connection)];
  const candidates = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : typeof value === "string"
      ? [value]
      : [];
  const directories: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const directory = candidate.trim();
    if (!directory || !await services.queries.isDirectory(directory)) continue;
    const key = path.resolve(directory).toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    directories.push(directory);
  }
  return directories;
}

function resultRows<Row>(result: QueryResult<Row>): Row[] {
  return Array.isArray(result.rows) ? result.rows : [];
}

function rowValue(row: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    if (row[name] !== undefined) {
      return row[name];
    }
    const matchingKey = Object.keys(row).find(
      (key) => key.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    if (matchingKey) {
      return row[matchingKey];
    }
  }
  return undefined;
}

function rowText(row: Record<string, unknown>, ...names: string[]): string {
  const value = rowValue(row, ...names);
  return value == null ? "" : String(value);
}

function rowNumber(row: Record<string, unknown>, ...names: string[]): number | undefined {
  const value = Number(rowValue(row, ...names));
  return Number.isFinite(value) ? value : undefined;
}

interface TreeAdvanceOptions {
  readonly groupingTables: boolean;
  readonly groupingThreshold: number;
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function tableTreeAdvance(connection: StoredConnection): TreeAdvanceOptions {
  const options = objectRecord(connection.options);
  const advance = objectRecord(connection.advance)
    || objectRecord(options?.advance)
    || options
    || {};
  const threshold = Number(advance.groupingThreshold);
  return {
    groupingTables: advance.groupingTables === true,
    groupingThreshold: Number.isFinite(threshold) && threshold >= 0
      ? Math.floor(threshold)
      : 50,
  };
}

async function openMessageTemplate(
  connection: StoredConnection,
  protocol: MessageTemplateProtocol,
  resource: string,
  kind: MessageTemplateKind,
  vhost?: string,
): Promise<string> {
  const template = buildMessageTemplate(kind, {
    protocol,
    connectionId: connection.id,
    resource,
    ...(vhost === undefined ? {} : { vhost }),
    ...(protocol === "Kafka"
      ? { broker: `${connection.host || "localhost"}:${connection.port || 9092}` }
      : {}),
  });
  const directory = path.join(
    os.tmpdir(),
    "database-client-messages",
    encodeURIComponent(connection.id),
    encodeURIComponent(vhost || "/"),
  );
  const filePath = path.join(directory, template.fileName);
  await mkdir(directory, { recursive: true });
  await writeFile(filePath, template.content, "utf8");
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
  await vscode.window.showTextDocument(document, { preview: false });
  return filePath;
}

export abstract class DatabaseTreeItem extends vscode.TreeItem {
  public constructor(
    label: string,
    public readonly contextValue: string | undefined,
    collapsibleState = vscode.TreeItemCollapsibleState.None,
  ) {
    super(label, collapsibleState);
    this.contextValue = contextValue;
  }
}

export class InfoTreeItem extends DatabaseTreeItem {
  public constructor(message: string) {
    super(message, "info");
    this.iconPath = new vscode.ThemeIcon("info");
  }
}

class ConnectionGroupNode<T extends vscode.TreeItem> extends DatabaseTreeItem {
  private children?: readonly T[];

  public constructor(
    public readonly group: string,
    private readonly services: ExtensionServices,
    private readonly buildChildren: (parent: ConnectionGroupNode<T>) => readonly T[],
    public readonly parent?: T | ConnectionGroupNode<T>,
    private readonly onRenameGroup?: (oldGroup: string, newGroup: string) => Promise<void>,
  ) {
    super(
      group.split("/").pop() || group,
      "treeGroup",
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    this.iconPath = targetResourceTreeIcon(this.services.resources, "icon/folder.svg");
  }

  public getChildren(): T[] {
    this.children ??= this.buildChildren(this);
    return [...this.children];
  }

  public async rename(): Promise<void> {
    const value = await vscode.window.showInputBox({
      title: "Rename Connection Group",
      prompt: "New group name",
      value: this.group,
    });
    const next = value?.trim();
    if (!next || next === this.group) return;
    await this.onRenameGroup?.(this.group, next);
  }
}

export class ModernTableColumnNode extends DatabaseTreeItem {
  public constructor(
    public readonly meta: Record<string, unknown>,
    public readonly parentTable: ModernTableNode,
    public readonly index: number,
  ) {
    const name = rowText(meta, "name", "column_name", "COLUMN_NAME");
    super(name, "column");
    const type = rowText(meta, "type", "data_type", "DATA_TYPE");
    const comment = rowText(meta, "comment", "COLUMN_COMMENT").replaceAll("\n", "");
    this.description = [type, comment].filter(Boolean).join(" ");
    const key = rowText(meta, "key", "COLUMN_KEY", "isPrimary", "is_primary").toUpperCase();
    const referencedTable = rowText(meta, "referenced_table", "REFERENCED_TABLE", "foreign_table");
    const isNotNull = rowValue(meta, "isNotNull", "is_not_null", "notNull") === true
      || ["NO", "FALSE", "0"].includes(rowText(meta, "nullable", "IS_NULLABLE").toUpperCase());
    this.tooltip = `${name} ${isNotNull ? "NotNull" : "Nullable"}`;
    this.iconPath = key === "PRI" || key === "PRIMARY" || key === "1" || key === "TRUE"
      ? targetThemeTreeIcon("key", "charts.yellow")
      : referencedTable
        ? targetThemeTreeIcon("symbol-reference", "charts.blue")
        : targetThemeTreeIcon("symbol-field", isNotNull ? "charts.red" : "charts.blue");
  }

  public moveUp(): void {
    this.parentTable.showActionTemplate("Move column up", this.parentTable.getColumnOrderSql(this.index, this.index - 1));
  }

  public moveDown(): void {
    this.parentTable.showActionTemplate("Move column down", this.parentTable.getColumnOrderSql(this.index, this.index + 1));
  }

  public addColumnTemplate(): void {
    this.parentTable.showActionTemplate(
      "Add column",
      this.parentTable.getDialect().tableTemplate?.() || "ALTER TABLE table_name ADD COLUMN column_name TEXT;",
    );
  }

  public updateColumnTemplate(): void {
    this.parentTable.showActionTemplate("Update column", `ALTER TABLE ${this.parentTable.tableWithSchema} ALTER COLUMN ${this.parentTable.dialect.quoteIdentifier(this.label as string)} TYPE [type];`);
  }

  public dropColumnTemplate(): void {
    this.parentTable.showActionTemplate("Drop column", `ALTER TABLE ${this.parentTable.tableWithSchema} DROP COLUMN ${this.parentTable.dialect.quoteIdentifier(this.label as string)};`);
  }

  public createIndexTemplate(): void {
    this.parentTable.showActionTemplate("Create index", `CREATE INDEX [index_name] ON ${this.parentTable.tableWithSchema} (${this.parentTable.dialect.quoteIdentifier(this.label as string)});`);
  }

  public updateIndexTemplate(): void {
    this.parentTable.showActionTemplate("Update index", "ALTER INDEX [index_name] RENAME TO [new_name];");
  }

  public dropIndexTemplate(): void {
    this.parentTable.showActionTemplate("Drop index", "DROP INDEX [index_name];");
  }
}

export class ModernTableNode extends DatabaseTreeItem {
  public label: string;
  public tableWithSchema: string;

  public constructor(
    public readonly meta: Record<string, unknown>,
    public readonly connection: StoredConnection,
    public readonly dialect: Dialect,
    public readonly schema: string | null,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent?: DatabaseTreeItem,
    contextValue = "table",
  ) {
    const label = rowText(meta, "name", "table_name", "TABLE_NAME");
    super(label, contextValue, vscode.TreeItemCollapsibleState.Collapsed);
    this.label = label;
    this.tableWithSchema = schema
      ? `${dialect.quoteIdentifier(schema)}.${dialect.quoteIdentifier(label)}`
      : dialect.quoteIdentifier(label);
    const rawRows = rowNumber(meta, "table_rows", "rows", "TABLE_ROWS");
    const rows = rawRows === -1 ? 0 : rawRows;
    const comment = rowText(meta, "comment", "TABLE_COMMENT");
    this.description = [comment, rows === undefined || rows === 0 ? "" : String(rows)]
      .filter(Boolean)
      .join(" ");
    this.tooltip = [this.tableWithSchema, comment].filter(Boolean).join("\n");
    this.iconPath = targetThemeTreeIcon(
      "split-horizontal",
      rowValue(meta, "isSystem", "systemObject", "is_system") ? "errorForeground" : undefined,
    );
    if (rowValue(meta, "isSystem", "systemObject", "is_system")) {
      this.tooltip = "System View";
    }
    this.command = {
      command: "mysql.table.find",
      title: "Run Select Statement",
      arguments: [this, true],
    };
  }

  public get parentNode(): DatabaseTreeItem | undefined {
    return this.parent;
  }

  public getDialect(): Dialect {
    return this.dialect;
  }

  public getPaginationSql(): string {
    return this.dialect.buildPageSql(
      this.schema,
      this.tableWithSchema,
      this.services.config.get("defaultSelectLimit"),
    );
  }

  public async fullTextSQL(term: string): Promise<string | null> {
    return buildTableFullTextSql(
      this.dialect,
      this.schema,
      this.tableWithSchema,
      (await this.getColumnNodes()).map((column) => ({
        name: String(column.label),
        type: String(column.description || ""),
      })),
      term,
    );
  }

  public async getColumnNodes(): Promise<ModernTableColumnNode[]> {
    const sql = this.dialect.showColumns(this.schema, this.label);
    const result = await this.actions.query<Record<string, unknown>>(
      this.connection,
      sql,
    );
    return resultRows(result).map(
      (row, index) => new ModernTableColumnNode(row, this, index),
    );
  }

  public async getChildren(): Promise<DatabaseTreeItem[]> {
    const children: DatabaseTreeItem[] = [
      new ModernTableColumnGroupNode(this, this.services, this.actions),
    ];
    if (!(["Redshift", "Snowflake"] as string[]).includes(this.connection.type) && this.dialect.showIndex?.(this.schema, this.label)) {
      children.push(new ModernIndexGroupNode(this, this.actions));
    }
    if (this.dialect.showTriggers?.(this.schema, null)) {
      children.push(new ModernTableTriggerGroupNode(this, this.services, this.actions));
    }
    if (
      ["MySQL", "MariaDB", "MySQLCompatible"].includes(this.connection.type)
      && this.dialect.showPartitions?.(this.schema, this.label)
    ) {
      children.push(new ModernPartitionGroupNode(this, this.actions));
    }
    return children;
  }

  public async showDdl(): Promise<string> {
    const sourceSql = this.dialect.showTableSource?.(this.schema, this.label);
    if (sourceSql) {
      const result = await this.actions.query<Record<string, unknown>>(
        this.connection,
        sourceSql,
      );
      const row = resultRows(result)[0];
      const source = row && rowText(row, "Create Table", "create_table_query", "definition");
      if (source) {
        return source;
      }
    }
    const columns = await this.getColumnNodes();
    return [
      `CREATE TABLE ${this.tableWithSchema} (`,
      ...columns.map((column, index) => {
        const suffix = index === columns.length - 1 ? "" : ",";
        return `  ${this.dialect.quoteIdentifier(String(column.label))} ${column.description || "TEXT"}${suffix}`;
      }),
      ");",
    ].join("\n");
  }

  public async viewData(viewId?: number): Promise<string> {
    const sql = this.getPaginationSql();
    const result = await this.actions.query<Record<string, unknown>>(
      this.connection,
      sql,
    );
    let columnList: QueryField[] = [];
    try {
      columnList = (await this.getColumnNodes()).map((column) => ({
        ...column.meta,
        name: String(column.label),
        type: String(column.description || column.meta.type || column.meta.simpleType || ""),
      }));
    } catch {
      // A result page remains useful when metadata access is unavailable.
    }
    const primaryKeyList = columnList.filter((column) => {
      const key = String(
        column.key || column.COLUMN_KEY || column.isPrimary || column.is_primary || "",
      ).toUpperCase();
      return key === "PRI" || key === "PRIMARY" || key === "TRUE" || key === "1";
    });
    await openResultView(
      this.services,
      this.label,
      sql,
      result,
      {
        connection: this.connection,
        table: this.label,
        schema: this.schema,
        database: this.connection.database,
        columnList,
        primaryKey: primaryKeyList[0]?.name,
        primaryKeyList,
        id: viewId ? `result:${viewId}` : "result",
        singlePage: !viewId,
      },
    );
    return viewId ? `${sql}\n-- view ${viewId}` : sql;
  }

  public async truncateTable(): Promise<void> {
    if (!(await this.actions.confirm(`Clear all data from ${this.label}?`))) {
      return;
    }
    const sql = this.connection.type === "SQLite"
      ? `DELETE FROM ${this.tableWithSchema};`
      : `TRUNCATE TABLE ${this.tableWithSchema};`;
    await this.actions.query(this.connection, sql);
    this.actions.showInformation(`Cleared table ${this.label}.`);
  }

  public async drop(): Promise<void> {
    if (!(await this.actions.confirm(`Drop table ${this.label}?`))) {
      return;
    }
    await this.actions.query(this.connection, `DROP TABLE ${this.tableWithSchema};`);
    this.actions.showInformation(`Dropped table ${this.label}.`);
  }

  public async copyTable(): Promise<string> {
    const sql = `CREATE TABLE [new_table] AS SELECT * FROM ${this.tableWithSchema};`;
    await this.showActionTemplate("Copy table", sql);
    return sql;
  }

  private async designRows(sql: string | undefined): Promise<Record<string, unknown>[]> {
    if (!sql) return [];
    return resultRows(await this.actions.query<Record<string, unknown>>(this.connection, sql));
  }

  public async getDesignMetadata(): Promise<TableDesignMetadata> {
    const columns = (await this.getColumnNodes()).map((column) => normalizeDesignColumn(column.meta));
    const [indexes, foreignKeys, checks, triggers, ddl] = await Promise.all([
      this.designRows(this.dialect.showIndex?.(this.schema, this.label)),
      this.designRows(this.dialect.showForeignKeys?.(this.schema, this.label)),
      this.designRows(this.dialect.showChecks?.(this.schema, this.label)),
      this.designRows(this.dialect.showTriggers?.(this.schema, this.label)),
      this.showDdl(),
    ]);
    const primaryKey = columns.find((column) => {
      const key = String(column.key || "").toUpperCase();
      return key === "PRI" || key === "PRIMARY" || column.isPrimary === true;
    })?.name;
    return {
      table: this.label,
      schema: this.schema,
      dbType: this.connection.type,
      engine: rowText(this.meta, "engine", "ENGINE") || undefined,
      comment: rowText(this.meta, "comment", "TABLE_COMMENT") || undefined,
      collation: rowText(this.meta, "collation", "TABLE_COLLATION") || undefined,
      columns,
      primaryKey,
      indexes,
      foreignKeys,
      checks,
      triggers,
      ddl,
      isSupportCheck: this.connection.type !== "SQLite" && this.connection.type !== "libSQL",
      supportForeignKey: Boolean(this.dialect.showForeignKeys?.(this.schema, this.label)),
      supportIndex: Boolean(this.dialect.showIndex?.(this.schema, this.label))
        && !["Snowflake", "Databricks", "Athena", "BigQuery", "PrestoDB", "Trino"].includes(this.connection.type),
      supportTrigger: Boolean(this.dialect.showTriggers?.(this.schema, this.label)),
      canAlterTable: !["SQLite", "libSQL"].includes(this.connection.type),
    };
  }

  public async designTable(): Promise<void> {
    const state = await this.getDesignMetadata();
    const sendDesignState = async (handler: import("../core/webviewHandler").TypedWebviewHandler): Promise<void> => {
      const next = await this.getDesignMetadata();
      await handler.send("designMeta", next);
      await handler.send("designMetaNext", next);
      await handler.send("design-data", next);
    };
    const executeDesignSql = async (
      handler: import("../core/webviewHandler").TypedWebviewHandler,
      type: string,
      sql: string | undefined,
      onSuccess?: () => void,
    ): Promise<void> => {
      if (!sql?.trim()) {
        throw new Error("No SQL change was generated");
      }
      await this.actions.query(this.connection, sql);
      await handler.send("success", type);
      onSuccess?.();
      await sendDesignState(handler);
    };
    await this.services.webviews.createWebviewPanel({
      title: `Design ${this.label}`,
      type: "design",
      route: "design",
      state,
      eventHandler: (handler) => {
        const sendInitial = async (): Promise<void> => {
          try {
            await sendDesignState(handler);
          } catch (error) {
            await handler.send("error", error instanceof Error ? error.message : String(error));
          }
        };
        handler.on("init", sendInitial);
        handler.on("route-design", sendInitial);
        handler.on("refresh", sendInitial);
        handler.on("user", async () => {
          await handler.send("user", this.connection.user || "");
        });
        handler.on("ddl", async () => {
          await handler.send("ddl", { ddl: await this.showDdl(), dbType: this.connection.type });
        });
        handler.on("indexes", async () => {
          await handler.send("indexes", await this.designRows(this.dialect.showIndex?.(this.schema, this.label)));
        });
        handler.on("foreignKeys", async (content) => {
          await handler.send("foreignKeys", await this.designRows(
            typeof content === "string" ? content : this.dialect.showForeignKeys?.(this.schema, this.label),
          ));
        });
        handler.on("checks", async () => {
          await handler.send("checks", await this.designRows(this.dialect.showChecks?.(this.schema, this.label)));
        });
        handler.on("triggers", async () => {
          await handler.send("triggers", await this.designRows(this.dialect.showTriggers?.(this.schema, this.label)));
        });
        handler.on("columns", async () => {
          await handler.send("columns", (await this.getColumnNodes()).map((column) => normalizeDesignColumn(column.meta)));
        });
        handler.on("execute", async (content) => {
          try {
            const input = content && typeof content === "object"
              ? content as { type?: unknown; sql?: unknown }
              : { type: "ddl", sql: content };
            await executeDesignSql(handler, typeof input.type === "string" ? input.type : "ddl", typeof input.sql === "string" ? input.sql : undefined);
          } catch (error) {
            await handler.send("error", error instanceof Error ? error.message : String(error));
          }
        });
        handler.on("updateTable", async (content) => {
          try {
            const input = content as UpdateTableDesignInput;
            const oldTable = input.table || this.label;
            const nextTable = input.newTableName?.trim() || oldTable;
            await executeDesignSql(handler, "table", buildUpdateTableSql(this.dialect, {
              ...input,
              table: oldTable,
              schema: input.schema ?? this.schema,
              dbType: input.dbType || this.connection.type,
              comment: input.comment ?? rowText(this.meta, "comment", "TABLE_COMMENT"),
            }), () => {
              if (nextTable !== this.label) {
                this.label = nextTable;
                this.tableWithSchema = this.schema
                  ? `${this.dialect.quoteIdentifier(this.schema)}.${this.dialect.quoteIdentifier(nextTable)}`
                  : this.dialect.quoteIdentifier(nextTable);
                this.meta.name = nextTable;
              }
              if (input.newComment !== undefined) this.meta.comment = input.newComment;
              if (input.newCollation !== undefined) this.meta.collation = input.newCollation;
            });
          } catch (error) {
            await handler.send("error", error instanceof Error ? error.message : String(error));
          }
        });
        handler.on("updateColumn", async (content) => {
          try {
            const input = content as UpdateColumnDesignInput;
            await executeDesignSql(handler, "column", buildUpdateColumnSql(this.dialect, {
              ...input,
              table: input.table || this.label,
              schema: input.schema ?? this.schema,
              dbType: input.dbType || this.connection.type,
            }));
          } catch (error) {
            await handler.send("error", error instanceof Error ? error.message : String(error));
          }
        });
        handler.on("dropColumn", async (content) => {
          try {
            const input = content && typeof content === "object"
              ? content as { name?: unknown; columnName?: unknown; table?: unknown; schema?: unknown; dbType?: unknown }
              : { name: content };
            const name = typeof input.name === "string"
              ? input.name
              : typeof input.columnName === "string" ? input.columnName : "";
            await executeDesignSql(handler, "column", buildDropColumnSql(
              this.dialect,
              typeof input.dbType === "string" ? input.dbType as ConnectionOptions["type"] : this.connection.type,
              typeof input.table === "string" ? input.table : this.label,
              typeof input.schema === "string" ? input.schema : this.schema,
              name,
            ));
          } catch (error) {
            await handler.send("error", error instanceof Error ? error.message : String(error));
          }
        });
        handler.on("createIndex", async (content) => {
          try {
            const input = content as CreateIndexDesignInput;
            await executeDesignSql(handler, "index", buildCreateIndexSql(this.dialect, {
              ...input,
              table: input.table || this.label,
              schema: input.schema ?? this.schema,
              dbType: input.dbType || this.connection.type,
            }));
          } catch (error) {
            await handler.send("error", error instanceof Error ? error.message : String(error));
          }
        });
        handler.on("dropIndex", async (content) => {
          try {
            const input = content && typeof content === "object"
              ? content as { name?: unknown; indexName?: unknown; table?: unknown; schema?: unknown; dbType?: unknown }
              : { name: content };
            await executeDesignSql(handler, "index", buildDropIndexSql(
              this.dialect,
              typeof input.dbType === "string" ? input.dbType as ConnectionOptions["type"] : this.connection.type,
              typeof input.table === "string" ? input.table : this.label,
              typeof input.schema === "string" ? input.schema : this.schema,
              typeof input.name === "string"
                ? input.name
                : typeof input.indexName === "string" ? input.indexName : "",
            ));
          } catch (error) {
            await handler.send("error", error instanceof Error ? error.message : String(error));
          }
        });
        handler.on("createForeignKey", async (content) => {
          try {
            const input = content as CreateForeignKeyDesignInput;
            await executeDesignSql(handler, "fk", buildCreateForeignKeySql(this.dialect, {
              ...input,
              table: input.table || this.label,
              schema: input.schema ?? this.schema,
              dbType: input.dbType || this.connection.type,
            }));
          } catch (error) {
            await handler.send("error", error instanceof Error ? error.message : String(error));
          }
        });
        handler.on("dropForeignKey", async (content) => {
          try {
            const input = content && typeof content === "object"
              ? content as { name?: unknown; constraintName?: unknown; table?: unknown; schema?: unknown; dbType?: unknown }
              : { name: content };
            const name = typeof input.name === "string" ? input.name : typeof input.constraintName === "string" ? input.constraintName : "";
            await executeDesignSql(handler, "fk", buildDropForeignKeySql(
              this.dialect,
              typeof input.dbType === "string" ? input.dbType as ConnectionOptions["type"] : this.connection.type,
              typeof input.table === "string" ? input.table : this.label,
              typeof input.schema === "string" ? input.schema : this.schema,
              name,
            ));
          } catch (error) {
            await handler.send("error", error instanceof Error ? error.message : String(error));
          }
        });
        handler.on("createCheck", async (content) => {
          try {
            const input = content && typeof content === "object"
              ? content as { table?: unknown; schema?: unknown; clause?: unknown }
              : { clause: content };
            await executeDesignSql(handler, "check", buildCheckSql(
              this.dialect,
              typeof input.schema === "string" ? input.schema : this.schema,
              typeof input.table === "string" ? input.table : this.label,
              typeof input.clause === "string" ? input.clause : "",
            ));
          } catch (error) {
            await handler.send("error", error instanceof Error ? error.message : String(error));
          }
        });
        handler.on("dropCheck", async (content) => {
          try {
            const input = content && typeof content === "object"
              ? content as { name?: unknown; constraintName?: unknown; table?: unknown; schema?: unknown; dbType?: unknown }
              : { name: content };
            const name = typeof input.name === "string" ? input.name : typeof input.constraintName === "string" ? input.constraintName : "";
            await executeDesignSql(handler, "check", buildDropCheckSql(
              this.dialect,
              typeof input.dbType === "string" ? input.dbType as ConnectionOptions["type"] : this.connection.type,
              typeof input.table === "string" ? input.table : this.label,
              typeof input.schema === "string" ? input.schema : this.schema,
              name,
            ));
          } catch (error) {
            await handler.send("error", error instanceof Error ? error.message : String(error));
          }
        });
        handler.on("dropTrigger", async (content) => {
          try {
            const input = content && typeof content === "object"
              ? content as { name?: unknown; triggerName?: unknown; table?: unknown; schema?: unknown; dbType?: unknown }
              : { name: content };
            const name = typeof input.name === "string" ? input.name : typeof input.triggerName === "string" ? input.triggerName : "";
            await executeDesignSql(handler, "trigger", buildDropTriggerSql(
              this.dialect,
              typeof input.dbType === "string" ? input.dbType as ConnectionOptions["type"] : this.connection.type,
              typeof input.table === "string" ? input.table : this.label,
              typeof input.schema === "string" ? input.schema : this.schema,
              name,
            ));
          } catch (error) {
            await handler.send("error", error instanceof Error ? error.message : String(error));
          }
        });
      },
    });
  }

  public async createTemplate(): Promise<string> {
    return this.showActionTemplate("Table template", this.dialect.tableTemplate?.() || "CREATE TABLE table_name (...);");
  }

  public async insertTemplate(): Promise<string> {
    const columns = await this.getColumnNodes();
    const names = columns.map((column) => this.dialect.quoteIdentifier(String(column.label))).join(", ");
    const values = columns.map((column) => `:${String(column.label)}`).join(", ");
    return this.showActionTemplate("Insert template", `INSERT INTO ${this.tableWithSchema} (${names}) VALUES (${values});`);
  }

  public async updateSQLTemplate(): Promise<string> {
    return this.showActionTemplate("Update template", `UPDATE ${this.tableWithSchema} SET [column] = :value WHERE [primary_key] = :id;`);
  }

  public async deleteSQLTemplate(): Promise<string> {
    return this.showActionTemplate("Delete template", `DELETE FROM ${this.tableWithSchema} WHERE [primary_key] = :id;`);
  }

  public getColumnOrderSql(from: number, to: number): string {
    return `-- reorder column ${from} -> ${to}\n-- The exact ALTER syntax is dialect-specific.`;
  }

  public async showActionTemplate(_title: string, sql: string): Promise<string> {
    const document = await this.actions.openSqlDocument(sql);
    await this.actions.showTextDocument(document);
    return sql;
  }
}

class ModernPartitionNode extends DatabaseTreeItem {
  public constructor(
    public readonly meta: Record<string, unknown>,
    public readonly parent: ModernPartitionGroupNode,
  ) {
    const name = rowText(meta, "name", "PARTITION_NAME");
    super(name, "info");
    const strategy = rowText(meta, "strategy", "PARTITION_METHOD");
    const column = rowText(meta, "columnName", "column_name", "PARTITION_EXPRESSION");
    const value = rowText(meta, "value", "PARTITION_DESCRIPTION");
    this.description = [
      strategy,
      column ? `${column}${value ? `: ${value}` : ""}` : value,
    ].filter(Boolean).join(" ");
    const rows = rowNumber(meta, "rows", "TABLE_ROWS");
    const length = rowNumber(meta, "length", "DATA_LENGTH");
    this.tooltip = [
      column ? `${column}:` : "",
      rows === undefined ? "" : `Rows: ${rows}`,
      length === undefined ? "" : `Length: ${length} bytes`,
    ].filter(Boolean).join("\n");
    this.iconPath = targetThemeTreeIcon("split-vertical");
  }
}

class ModernPartitionGroupNode extends DatabaseTreeItem {
  public constructor(
    private readonly table: ModernTableNode,
    private readonly actions: TreeActionHost,
  ) {
    const presentation = targetSqlTreePresentations.partitionGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetThemePresentationIcon(presentation);
  }

  public async getChildren(): Promise<DatabaseTreeItem[]> {
    const sql = this.table.getDialect().showPartitions?.(this.table.schema, this.table.label);
    if (!sql) {
      return [];
    }
    try {
      const result = await this.actions.query<Record<string, unknown>>(
        this.table.connection,
        sql,
      );
      return resultRows(result).map((row) => new ModernPartitionNode(row, this));
    } catch (error) {
      return [new InfoTreeItem(error instanceof Error ? error.message : String(error))];
    }
  }
}

type ModernTableGroupParent = ModernTableGroupNode | ModernSubTableGroupNode;

function groupTableNodes(
  children: readonly ModernTableNode[],
  index: number,
  parent: ModernTableGroupParent,
  advance: TreeAdvanceOptions,
  services: ExtensionServices,
): Array<ModernTableNode | ModernSubTableGroupNode> {
  const groups = new Map<string, ModernTableNode[]>();
  for (const child of children) {
    const parts = String(child.label).split("_");
    const key = parts[index] || "";
    const group = groups.get(key);
    if (group) {
      group.push(child);
    } else {
      groups.set(key, [child]);
    }
  }
  return [...groups.entries()].map(
    ([key, groupedChildren]) => new ModernSubTableGroupNode(
      `${key}_`,
      groupedChildren,
      parent,
      index + 1,
      advance,
      services,
    ),
  );
}

class ModernSubTableGroupNode extends DatabaseTreeItem {
  public constructor(
    label: string,
    public readonly children: readonly ModernTableNode[],
    public readonly parent: ModernTableGroupParent,
    private readonly index: number,
    private readonly advance: TreeAdvanceOptions,
    private readonly services: ExtensionServices,
  ) {
    super(label, "subTableGroup", vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = targetResourceTreeIcon(this.services.resources, "icon/folder.svg");
  }

  public async getChildren(): Promise<Array<ModernTableNode | ModernSubTableGroupNode>> {
    return this.children.length > this.advance.groupingThreshold
      ? groupTableNodes(this.children, this.index, this, this.advance, this.services)
      : [...this.children];
  }

  public async createTemplate(): Promise<string> {
    const root = this.rootTableGroup();
    const template = root.getDialect().tableTemplate?.() || "CREATE TABLE table_name (...);";
    const sql = template.replace(/(table_)/i, String(this.label));
    const document = await root.getActions().openSqlDocument(sql);
    await root.getActions().showTextDocument(document);
    return sql;
  }

  private rootTableGroup(): ModernTableGroupNode {
    let parent = this.parent;
    while (parent instanceof ModernSubTableGroupNode) {
      parent = parent.parent;
    }
    return parent;
  }
}

class ModernTableGroupNode extends DatabaseTreeItem {
  public constructor(
    private readonly connection: StoredConnection,
    private readonly schema: string | null,
    private readonly dialect: Dialect,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent?: DatabaseTreeItem,
    private readonly onRefresh?: (target?: DatabaseTreeItem) => void,
  ) {
    const presentation = targetSqlTreePresentations.tableGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetThemePresentationIcon(presentation);
  }

  public async getChildren(): Promise<Array<ModernTableNode | ModernSubTableGroupNode>> {
    const result = await this.actions.query<Record<string, unknown>>(
      this.connection,
      this.dialect.showTables(this.schema),
    );
    const stateKey = tableSortStateKey(this.connection, this.schema);
    const savedRule = this.services.state.get<TableSortRule>(
      stateKey,
      DEFAULT_TABLE_SORT_RULE,
    );
    const rule = tableSortOptions(this.connection.type).includes(savedRule)
      ? savedRule
      : DEFAULT_TABLE_SORT_RULE;
    const tables = sortTableMetadata(resultRows(result), rule).map(
      (row) =>
        new ModernTableNode(
          row,
          this.connection,
          this.dialect,
          this.schema,
          this.services,
          this.actions,
          this,
        ),
    );
    const advance = tableTreeAdvance(this.connection);
    return advance.groupingTables && tables.length > advance.groupingThreshold
      ? groupTableNodes(tables, 0, this, advance, this.services)
      : tables;
  }

  public getDialect(): Dialect {
    return this.dialect;
  }

  public getActions(): TreeActionHost {
    return this.actions;
  }

  public async changeSortRule(): Promise<void> {
    const selected = await vscode.window.showQuickPick(
      tableSortOptions(this.connection.type),
      {
        title: "Change table sort rule",
        placeHolder: "Set the sort rule for tables",
      },
    );
    if (!selected) {
      return;
    }
    await this.services.state.update(
      tableSortStateKey(this.connection, this.schema),
      selected,
    );
    this.reloadExpandedChild();
  }

  public reloadExpandedChild(): void {
    this.onRefresh?.(this);
  }
}

class ModernTableColumnGroupNode extends DatabaseTreeItem {
  public constructor(
    private readonly table: ModernTableNode,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
  ) {
    const presentation = targetSqlTreePresentations.columnGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetThemePresentationIcon(presentation);
  }

  public async getChildren(): Promise<ModernTableColumnNode[]> {
    return this.table.getColumnNodes();
  }

  public addColumnTemplate(): void {
    const template = this.table.getDialect().tableTemplate?.() || "ALTER TABLE table_name ADD COLUMN column_name TEXT;";
    void this.table.showActionTemplate("Add column", template);
  }
}

class ModernIndexNode extends DatabaseTreeItem {
  public constructor(
    private readonly table: ModernTableNode,
    public readonly meta: Record<string, unknown>,
    public readonly parent: ModernIndexGroupNode,
  ) {
    const name = rowText(meta, "index_name", "INDEX_NAME", "name") || "Index";
    super(name, "index");
    const isUnique = rowValue(meta, "isUnique", "unique", "uniqueFlag");
    this.iconPath = targetThemeTreeIcon(
      "symbol-property",
      isUnique === true || ["1", "TRUE", "UNIQUE"].includes(String(isUnique ?? "").toUpperCase())
        ? "charts.yellow"
        : undefined,
    );
    this.description = [
      rowText(meta, "column_name", "COLUMN_NAME", "columns"),
      rowText(meta, "index_type", "INDEX_TYPE", "type"),
    ].filter(Boolean).join(" ");
    this.tooltip = `${table.tableWithSchema} index ${name}`;
    this.command = {
      command: "mysql.index.modify",
      title: "Update Index Statement",
      arguments: [this, true],
    };
  }

  public async updateIndexTemplate(): Promise<string> {
    const name = this.table.getDialect().quoteIdentifier(String(this.label));
    const columnNames = rowText(this.meta, "column_name", "COLUMN_NAME", "columns")
      .split(",")
      .map((column) => column.trim())
      .filter(Boolean)
      .map((column) => this.table.getDialect().quoteIdentifier(column))
      .join(", ");
    const sql = [
      `DROP INDEX ${name};`,
      `CREATE INDEX ${name} ON ${this.table.tableWithSchema} (${columnNames || "[column]"});`,
    ].join("\n");
    return this.table.showActionTemplate("Update index", sql);
  }

  public async dropIndexTemplate(): Promise<void> {
    if (!(await this.parent.getActions().confirm(`Drop index ${String(this.label)}?`))) {
      return;
    }
    await this.parent.getActions().query(
      this.table.connection,
      `DROP INDEX ${this.table.getDialect().quoteIdentifier(String(this.label))};`,
    );
    this.parent.reloadExpandedChild();
  }
}

class ModernIndexGroupNode extends DatabaseTreeItem {
  public constructor(
    private readonly table: ModernTableNode,
    private readonly actionHost: TreeActionHost,
  ) {
    const presentation = targetSqlTreePresentations.indexGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetThemePresentationIcon(presentation);
  }

  public async getChildren(): Promise<DatabaseTreeItem[]> {
    const sql = this.table.getDialect().showIndex?.(this.table.schema, this.table.label);
    if (!sql) {
      return [];
    }
    try {
      const result = await this.actionHost.query<Record<string, unknown>>(
        this.table.connection,
        sql,
      );
      const children = resultRows(result).map(
        (row) => new ModernIndexNode(this.table, row, this),
      );
      return children.length ? children : [new InfoTreeItem("No indexes found.")];
    } catch (error) {
      return [new InfoTreeItem(error instanceof Error ? error.message : String(error))];
    }
  }

  public createIndexTemplate(): void {
    void this.table.showActionTemplate(
      "Create index",
      `CREATE INDEX [index_name] ON ${this.table.tableWithSchema} ([column]);`,
    );
  }

  public get parentTable(): ModernTableNode {
    return this.table;
  }

  public getActions(): TreeActionHost {
    return this.actionHost;
  }

  public reloadExpandedChild(): void {
    if (this.table.parent instanceof ModernTableGroupNode) {
      this.table.parent.reloadExpandedChild();
    }
  }
}

class ModernQueryNode extends DatabaseTreeItem {
  public readonly filePath: string;
  public readonly queryPath: string;

  public constructor(
    entry: QueryFileEntry,
    public readonly connection: StoredConnection,
    public readonly parent: ModernQueryGroupNode,
  ) {
    super(entry.name, "query");
    this.filePath = entry.filePath;
    this.queryPath = entry.filePath;
    this.tooltip = entry.filePath;
    const extension = entry.extension.toLocaleLowerCase();
    this.iconPath = extension === "sqlbook"
      ? targetThemeTreeIcon("notebook", "charts.blue")
      : extension === "es"
        ? targetResourceTreeIcon(parent.services.resources, "icon/server/elasticsearch.svg")
        : extension === "json"
          ? targetResourceTreeIcon(parent.services.resources, "ssh/json.svg")
          : extension === "sql"
            ? targetResourceTreeIcon(parent.services.resources, "ssh/sql.svg")
            : extension === "dbclient-js"
              ? targetResourceTreeIcon(parent.services.resources, "ssh/javascript.svg")
              : targetThemeTreeIcon("code");
    this.resourceUri = vscode.Uri.file(entry.filePath);
    this.command = {
      command: "mysql.query.open",
      title: "Open Query",
      arguments: [this],
    };
  }
}

class ModernQueryGroupNode extends DatabaseTreeItem {
  public readonly directory: string;

  public constructor(
    public readonly connection: StoredConnection,
    public readonly services: ExtensionServices,
    public readonly parent: DatabaseTreeItem,
    directory?: string,
    private readonly linked = false,
  ) {
    const presentation = targetSqlTreePresentations.queryGroup;
    const subGroup = directory !== undefined;
    super(
      subGroup ? path.basename(directory) : presentation.label,
      subGroup ? "subQueryGroup" : presentation.contextValue,
      subGroup
        ? vscode.TreeItemCollapsibleState.Collapsed
        : targetPresentationCollapsibleState(presentation),
    );
    this.directory = directory || queryDirectory(this.services, this.connection);
    this.iconPath = subGroup
      ? this.linked
        ? targetThemeTreeIcon("link")
        : targetResourceTreeIcon(this.services.resources, "icon/folder.svg")
      : targetPresentationTreeIcon(this.services.resources, presentation);
  }

  public async getChildren(): Promise<DatabaseTreeItem[]> {
    const entries = await this.services.queries.listTree(this.directory);
    const linkedGroups = this.contextValue === "queryGroup"
      ? (await queryLinkedDirectories(this.services, this.connection)).map(
        (directory) => new ModernQueryGroupNode(
          this.connection,
          this.services,
          this,
          directory,
          true,
        ),
      )
      : [];
    if (entries.length === 0 && linkedGroups.length === 0) {
      return [new InfoTreeItem("No query files found.")];
    }
    const children = entries.map((entry: QueryTreeEntry) => "kind" in entry
      ? new ModernQueryGroupNode(
        this.connection,
        this.services,
        this,
        entry.directory,
      )
      : new ModernQueryNode(entry, this.connection, this));
    return [...linkedGroups, ...children].sort((left, right) => {
      const leftGroup = left.contextValue === "subQueryGroup";
      const rightGroup = right.contextValue === "subQueryGroup";
      if (leftGroup !== rightGroup) return leftGroup ? -1 : 1;
      return String(left.label).localeCompare(String(right.label), undefined, { sensitivity: "base" });
    });
  }
}

class ModernSequenceNode extends DatabaseTreeItem {
  public constructor(
    public readonly meta: Record<string, unknown>,
    public readonly parent: ModernSequenceGroupNode,
  ) {
    super(rowText(meta, "name", "sequence_name"), "sequence");
    this.iconPath = targetThemeTreeIcon("export");
    const sequence = rowValue(meta, "sequence", "last_value");
    const increment = rowValue(meta, "increment", "increment_by");
    this.description = sequence == null ? "" : String(sequence);
    this.tooltip = [
      sequence == null ? "" : `Current Value: ${sequence}`,
      increment == null ? "" : `Increment: ${increment}`,
    ].filter(Boolean).join("\n");
  }
}

class ModernSequenceGroupNode extends DatabaseTreeItem {
  public constructor(
    private readonly connection: StoredConnection,
    private readonly schema: string | null,
    private readonly dialect: Dialect,
    private readonly actions: TreeActionHost,
    public readonly parent: DatabaseTreeItem,
  ) {
    const presentation = targetSqlTreePresentations.sequenceGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetThemePresentationIcon(presentation);
  }

  public async getChildren(): Promise<ModernSequenceNode[]> {
    const sql = this.dialect.showSequences?.(this.schema);
    if (!sql) {
      return [];
    }
    const result = await this.actions.query<Record<string, unknown>>(this.connection, sql);
    return resultRows(result)
      .map((row) => new ModernSequenceNode(row, this))
      .sort((left, right) => String(left.label).localeCompare(String(right.label), undefined, { sensitivity: "base" }));
  }
}

class ModernCustomTypeNode extends DatabaseTreeItem {
  public constructor(
    public readonly meta: Record<string, unknown>,
    public readonly parent: ModernCustomTypeGroupNode,
  ) {
    super(rowText(meta, "name", "type_name"), "type");
    this.iconPath = targetThemeTreeIcon("symbol-class");
    this.description = rowText(meta, "enum_values", "values");
  }
}

class ModernCustomTypeGroupNode extends DatabaseTreeItem {
  public constructor(
    private readonly connection: StoredConnection,
    private readonly schema: string | null,
    private readonly dialect: Dialect,
    private readonly actions: TreeActionHost,
    public readonly parent: DatabaseTreeItem,
  ) {
    const presentation = targetSqlTreePresentations.typeGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetThemePresentationIcon(presentation);
  }

  public async getChildren(): Promise<ModernCustomTypeNode[]> {
    const sql = this.dialect.showCustomTypes?.(this.schema);
    if (!sql) {
      return [];
    }
    const result = await this.actions.query<Record<string, unknown>>(this.connection, sql);
    return resultRows(result)
      .map((row) => new ModernCustomTypeNode(row, this))
      .sort((left, right) => String(left.label).localeCompare(String(right.label), undefined, { sensitivity: "base" }));
  }
}

class ModernForeignTableNode extends ModernTableNode {
  private readonly foreignServices: ExtensionServices;
  private readonly foreignActions: TreeActionHost;

  public constructor(
    meta: Record<string, unknown>,
    connection: StoredConnection,
    dialect: Dialect,
    schema: string | null,
    services: ExtensionServices,
    actions: TreeActionHost,
    public readonly parent: ModernForeignTableGroupNode,
  ) {
    super(meta, connection, dialect, schema, services, actions, parent, "foreignTable");
    this.foreignServices = services;
    this.foreignActions = actions;
    this.iconPath = targetThemeTreeIcon("export");
    const server = rowText(meta, "server", "foreign_server_name");
    const database = rowText(meta, "server_db", "foreign_server_catalog");
    this.description = server;
    this.tooltip = database ? `Server Database: ${database}` : server;
  }

  public override async getChildren(): Promise<DatabaseTreeItem[]> {
    return [new ModernTableColumnGroupNode(this, this.foreignServices, this.foreignActions)];
  }
}

class ModernForeignTableGroupNode extends DatabaseTreeItem {
  public constructor(
    private readonly connection: StoredConnection,
    private readonly schema: string | null,
    private readonly dialect: Dialect,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent: DatabaseTreeItem,
  ) {
    const presentation = targetSqlTreePresentations.foreignTableGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetThemePresentationIcon(presentation);
  }

  public async getChildren(): Promise<ModernForeignTableNode[]> {
    const sql = this.dialect.showExternalTables?.(this.schema);
    if (!sql) {
      return [];
    }
    const result = await this.actions.query<Record<string, unknown>>(this.connection, sql);
    return resultRows(result)
      .map((row) => new ModernForeignTableNode(
        row,
        this.connection,
        this.dialect,
        this.schema,
        this.services,
        this.actions,
        this,
      ))
      .sort((left, right) => String(left.label).localeCompare(String(right.label), undefined, { sensitivity: "base" }));
  }
}

class ModernViewGroupNode extends DatabaseTreeItem {
  public constructor(
    private readonly connection: StoredConnection,
    private readonly schema: string | null,
    private readonly dialect: Dialect,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    private readonly parent?: DatabaseTreeItem,
    private readonly materialized = false,
  ) {
    const presentation = materialized
      ? targetSqlTreePresentations.materializedViewGroup
      : targetSqlTreePresentations.viewGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetThemePresentationIcon(presentation);
  }

  public async getChildren(): Promise<DatabaseTreeItem[]> {
    const showSql = this.materialized
      ? this.dialect.showMaterialViews?.(this.schema)
      : this.dialect.showViews?.(this.schema);
    if (!showSql) {
      return [new InfoTreeItem("This database does not expose views.")];
    }
    const result = await this.actions.query<Record<string, unknown>>(
      this.connection,
      showSql,
    );
    return resultRows(result).map(
      (row) =>
        new ModernViewNode(
          row,
          this.connection,
          this.schema,
          this.dialect,
          this.services,
          this.actions,
          this,
          this.materialized,
        ),
    );
  }
}

class ModernViewNode extends DatabaseTreeItem {
  public readonly label: string;
  public readonly viewWithSchema: string;

  public constructor(
    meta: Record<string, unknown>,
    private readonly connection: StoredConnection,
    private readonly schema: string | null,
    private readonly dialect: Dialect,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent: ModernViewGroupNode,
    private readonly materialized = false,
  ) {
    const label = rowText(meta, "name", "table_name", "TABLE_NAME");
    super(label, "view");
    this.label = label;
    this.viewWithSchema = schema
      ? `${dialect.quoteIdentifier(schema)}.${dialect.quoteIdentifier(label)}`
      : dialect.quoteIdentifier(label);
    this.description = rowText(meta, "comment", "VIEW_DEFINITION", "definition");
    this.tooltip = this.viewWithSchema;
    this.iconPath = targetThemeTreeIcon("split-horizontal");
  }

  public async getChildren(): Promise<DatabaseTreeItem[]> {
    return [new ModernViewColumnGroupNode(this, this.connection, this.schema, this.dialect, this.actions)];
  }

  public async showDdl(): Promise<string> {
    const sourceSql = this.dialect.showViewSource?.(this.schema, this.label);
    if (sourceSql) {
      const result = await this.actions.query<Record<string, unknown>>(
        this.connection,
        sourceSql,
      );
      const row = resultRows(result)[0];
      const source = row && rowText(row, "Create View", "definition", "VIEW_DEFINITION");
      if (source) {
        return source;
      }
    }
    return `CREATE ${this.materialized ? "MATERIALIZED " : ""}VIEW ${this.viewWithSchema} AS\nSELECT * FROM table_name;`;
  }

  public async viewData(): Promise<void> {
    const sql = this.dialect.buildPageSql(
      this.schema,
      this.viewWithSchema,
      this.services.config.get("defaultSelectLimit"),
    );
    const result = await this.actions.query<Record<string, unknown>>(
      this.connection,
      sql,
    );
    await openResultView(this.services, this.label, sql, result);
  }

  public async drop(): Promise<void> {
    if (!(await this.actions.confirm(`Drop view ${this.label}?`))) {
      return;
    }
    await this.actions.query(this.connection, `DROP ${this.materialized ? "MATERIALIZED " : ""}VIEW ${this.viewWithSchema};`);
    this.actions.showInformation(`Dropped view ${this.label}.`);
  }

  public async createTemplate(): Promise<string> {
    const sql = this.dialect.viewTemplate?.() || `CREATE ${this.materialized ? "MATERIALIZED " : ""}VIEW view_name AS SELECT * FROM table_name;`;
    const document = await this.actions.openSqlDocument(sql);
    await this.actions.showTextDocument(document);
    return sql;
  }
}

class ModernViewColumnNode extends DatabaseTreeItem {
  public constructor(
    public readonly meta: Record<string, unknown>,
    public readonly parent: ModernViewColumnGroupNode,
  ) {
    const name = rowText(meta, "name", "column_name", "COLUMN_NAME");
    super(name, "column");
    this.description = rowText(meta, "type", "data_type", "DATA_TYPE");
    const key = rowText(meta, "key", "COLUMN_KEY", "isPrimary", "is_primary").toUpperCase();
    this.iconPath = targetThemeTreeIcon(
      key === "PRI" || key === "PRIMARY" || key === "TRUE" || key === "1"
        ? "key"
        : "symbol-field",
      key === "PRI" || key === "PRIMARY" || key === "TRUE" || key === "1"
        ? "charts.yellow"
        : "charts.blue",
    );
  }
}

class ModernViewColumnGroupNode extends DatabaseTreeItem {
  public constructor(
    private readonly view: ModernViewNode,
    private readonly connection: StoredConnection,
    private readonly schema: string | null,
    private readonly dialect: Dialect,
    private readonly actions: TreeActionHost,
  ) {
    const presentation = targetSqlTreePresentations.otherColumnGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetThemePresentationIcon(presentation);
  }

  public async getChildren(): Promise<ModernViewColumnNode[]> {
    const result = await this.actions.query<Record<string, unknown>>(
      this.connection,
      this.dialect.showColumns(this.schema, String(this.view.label)),
    );
    return resultRows(result).map((row) => new ModernViewColumnNode(row, this));
  }
}

class ModernOracleSynonymNode extends DatabaseTreeItem {
  public constructor(
    private readonly sourceNode: OracleSynonymNode,
    private readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent: ModernOracleSynonymGroupNode,
  ) {
    super(sourceNode.label, "synonym", vscode.TreeItemCollapsibleState.Collapsed);
    this.description = sourceNode.description;
    this.tooltip = sourceNode.tooltip;
    this.iconPath = targetThemeTreeIcon("symbol-reference");
  }

  public async getChildren(): Promise<DatabaseTreeItem[]> {
    return [new InfoTreeItem("Columns are loaded through the synonym target metadata query.")];
  }

  public getPaginationSql(): string {
    return this.sourceNode.getPaginationSql();
  }

  public async viewData(): Promise<void> {
    const sql = this.getPaginationSql();
    const result = await this.actions.query<Record<string, unknown>>(
      this.connection,
      sql,
    );
    await openResultView(this.services, this.sourceNode.label, sql, result);
  }

  public async showDdl(): Promise<string> {
    const sql = this.sourceNode.showDdl();
    const document = await this.actions.openSqlDocument(sql);
    await this.actions.showTextDocument(document);
    return sql;
  }
}

class ModernOracleSynonymGroupNode extends DatabaseTreeItem {
  private readonly sourceGroup: OracleSynonymGroup;

  public constructor(
    private readonly connection: StoredConnection,
    private readonly schema: string,
    private readonly dialect: Dialect,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent: DatabaseTreeItem,
  ) {
    const presentation = targetSqlTreePresentations.synonymGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetThemePresentationIcon(presentation);
    const query: MetadataQueryExecutor = {
      query: (sql) => this.actions.query(this.connection, sql),
    };
    this.sourceGroup = new OracleSynonymGroup({
      schema,
      query,
      dialect,
      config: services.config,
      logger: services.logger,
    }, parent);
  }

  public async getChildren(): Promise<ModernOracleSynonymNode[]> {
    const nodes = await this.sourceGroup.getChildren();
    return nodes.map(
      (node) =>
        new ModernOracleSynonymNode(
          node,
          this.connection,
          this.services,
          this.actions,
          this,
        ),
    );
  }
}

type RoutineKind = "procedure" | "function" | "trigger" | "event";

class ModernRoutineNode extends DatabaseTreeItem {
  public constructor(
    name: string,
    private readonly kind: RoutineKind,
    private readonly connection: StoredConnection,
    private readonly schema: string | null,
    private readonly dialect: Dialect,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent: ModernRoutineGroupNode | ModernTableTriggerGroupNode,
    meta: Record<string, unknown> = {},
  ) {
    super(name, kind, vscode.TreeItemCollapsibleState.None);
    const invalid = String(meta.status || "").toUpperCase() === "INVALID";
    this.iconPath = invalid
      ? targetThemeTreeIcon("error", "testing.iconFailed")
      : kind === "trigger"
        ? targetThemeTreeIcon("zap")
        : kind === "function"
          ? targetThemeTreeIcon("symbol-function")
          : kind === "event"
            ? targetThemeTreeIcon("compass")
            : targetThemeTreeIcon("gear");
    this.tooltip = `${kind} ${name}`;
  }

  private qualifiedName(): string {
    const name = this.dialect.quoteIdentifier(String(this.label));
    return this.schema ? `${this.dialect.quoteIdentifier(this.schema)}.${name}` : name;
  }

  public async showSource(): Promise<string> {
    const sourceSql = this.kind === "event"
      ? this.dialect.showEventSource?.(this.schema, String(this.label))
      : this.dialect.showRoutineSource?.(
        this.kind,
        this.schema,
        String(this.label),
      );
    const result = sourceSql
      ? await this.actions.query<Record<string, unknown>>(this.connection, sourceSql)
      : undefined;
    const row = result && resultRows(result)[0];
    const source = row && rowText(row, "Create Procedure", "Create Function", "Create Event", "SQL Original Statement", "definition");
    const fallback = source || `${this.kind.toUpperCase()} ${this.qualifiedName()}();`;
    const document = await this.actions.openSqlDocument(fallback);
    await this.actions.showTextDocument(document);
    return fallback;
  }

  public async drop(): Promise<void> {
    if (!(await this.actions.confirm(`Drop ${this.kind} ${String(this.label)}?`))) {
      return;
    }
    await this.actions.query(
      this.connection,
      `DROP ${this.kind.toUpperCase()} ${this.qualifiedName()};`,
    );
    this.actions.showInformation(`Dropped ${this.kind} ${String(this.label)}.`);
  }

  public async createTemplate(): Promise<string> {
    const template = this.kind === "procedure"
      ? this.dialect.procedureTemplate?.()
      : this.kind === "function"
        ? this.dialect.functionTemplate?.()
        : this.kind === "trigger"
          ? this.dialect.triggerTemplate?.()
          : this.dialect.eventTemplate?.();
    const sql = template || `${this.kind.toUpperCase()} ${String(this.label)}();`;
    const document = await this.actions.openSqlDocument(sql);
    await this.actions.showTextDocument(document);
    return sql;
  }
}

class ModernRoutineGroupNode extends DatabaseTreeItem {
  public constructor(
    private readonly kind: RoutineKind,
    private readonly connection: StoredConnection,
    private readonly schema: string | null,
    private readonly dialect: Dialect,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent: DatabaseTreeItem,
  ) {
    const presentation = kind === "function"
      ? targetSqlTreePresentations.functionGroup
      : kind === "procedure"
        ? targetSqlTreePresentations.procedureGroup
        : kind === "trigger"
          ? targetSqlTreePresentations.triggerGroup
          : targetSqlTreePresentations.eventGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetThemePresentationIcon(presentation);
  }

  private listSql(): string | undefined {
    if (this.kind === "procedure") {
      return this.dialect.showProcedures?.(this.schema);
    }
    if (this.kind === "function") {
      return this.dialect.showFunctions?.(this.schema);
    }
    if (this.kind === "event") {
      return this.dialect.showEvents?.(this.schema);
    }
    return this.dialect.showTriggers?.(this.schema);
  }

  public async getChildren(): Promise<ModernRoutineNode[]> {
    const sql = this.listSql();
    if (!sql) {
      return [];
    }
    const result = await this.actions.query<Record<string, unknown>>(
      this.connection,
      sql,
    );
    return resultRows(result).map(
      (row) =>
        new ModernRoutineNode(
          rowText(row, "name", "routine_name", "ROUTINE_NAME", "trigger_name", "TRIGGER_NAME"),
          this.kind,
          this.connection,
          this.schema,
          this.dialect,
          this.services,
          this.actions,
          this,
          row,
        ),
    );
  }

  public async createTemplate(): Promise<string> {
    const node = new ModernRoutineNode(
      `${this.kind}_name`,
      this.kind,
      this.connection,
      this.schema,
      this.dialect,
      this.services,
      this.actions,
      this,
      {},
    );
    return node.createTemplate();
  }
}

class ModernTableTriggerGroupNode extends DatabaseTreeItem {
  public constructor(
    private readonly table: ModernTableNode,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
  ) {
    const presentation = targetSqlTreePresentations.triggerGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetThemePresentationIcon(presentation);
  }

  public async getChildren(): Promise<ModernRoutineNode[]> {
    const sql = this.table.getDialect().showTriggers?.(this.table.schema, this.table.label);
    if (!sql) {
      return [];
    }
    const result = await this.actions.query<Record<string, unknown>>(
      this.table.connection,
      sql,
    );
    return resultRows(result).map(
      (row) => new ModernRoutineNode(
        rowText(row, "name", "routine_name", "ROUTINE_NAME", "trigger_name", "TRIGGER_NAME"),
        "trigger",
        this.table.connection,
        this.table.schema,
        this.table.getDialect(),
        this.services,
        this.actions,
        this,
        row,
      ),
    );
  }

  public createTemplate(): Promise<string> {
    const node = new ModernRoutineNode(
      `${this.table.label}_trigger`,
      "trigger",
      this.table.connection,
      this.table.schema,
      this.table.getDialect(),
      this.services,
      this.actions,
      this,
      {},
    );
    return node.createTemplate();
  }
}

class ModernPackageNode extends DatabaseTreeItem {
  public constructor(
    name: string,
    public readonly meta: Record<string, unknown>,
    private readonly connection: StoredConnection,
    private readonly schema: string | null,
    private readonly dialect: Dialect,
    private readonly actions: TreeActionHost,
    public readonly parent: ModernPackageGroupNode,
  ) {
    super(name, "package");
    this.iconPath = String(meta.status || "").toUpperCase() === "INVALID"
      ? targetThemeTreeIcon("error", "testing.iconFailed")
      : new vscode.ThemeIcon("package");
    this.tooltip = `${this.dialect.id} package ${name}`;
  }

  public async showSource(): Promise<string> {
    const sourceSql = this.dialect.showPackageSource?.(
      this.schema,
      String(this.label),
    );
    const result = sourceSql
      ? await this.actions.query<Record<string, unknown>>(this.connection, sourceSql)
      : undefined;
    const source = result
      ? resultRows(result)
        .map((row) => rowText(row, "text", "source", "TEXT"))
        .join("")
        .trim()
      : "";
    const fallback = source || `CREATE OR REPLACE PACKAGE ${this.dialect.quoteIdentifier(String(this.label))} AS\nEND;\n/`;
    const document = await this.actions.openSqlDocument(fallback);
    await this.actions.showTextDocument(document);
    return fallback;
  }

  public async drop(): Promise<void> {
    if (!(await this.actions.confirm(`Drop package ${String(this.label)}?`))) {
      return;
    }
    const name = this.dialect.quoteIdentifier(String(this.label));
    const qualifiedName = this.schema
      ? `${this.dialect.quoteIdentifier(this.schema)}.${name}`
      : name;
    await this.actions.query(this.connection, `DROP PACKAGE ${qualifiedName};`);
    this.actions.showInformation(`Dropped package ${String(this.label)}.`);
    this.parent.reloadExpandedChild();
  }
}

class ModernPackageGroupNode extends DatabaseTreeItem {
  public constructor(
    private readonly connection: StoredConnection,
    private readonly schema: string | null,
    private readonly dialect: Dialect,
    private readonly actions: TreeActionHost,
    public readonly parent: ModernDatabaseNode,
    private readonly onRefresh?: (target?: DatabaseTreeItem) => void,
  ) {
    const presentation = targetSqlTreePresentations.packageGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetThemePresentationIcon(presentation);
  }

  public async getChildren(): Promise<ModernPackageNode[]> {
    const sql = this.dialect.showPackages?.(this.schema);
    if (!sql) {
      return [];
    }
    const result = await this.actions.query<Record<string, unknown>>(
      this.connection,
      sql,
    );
    return resultRows(result)
      .map((row) => ({
        name: rowText(row, "name", "object_name", "OBJECT_NAME"),
        meta: row,
      }))
      .filter((row) => row.name.length > 0)
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }))
      .map(
        (row) =>
          new ModernPackageNode(
            row.name,
            row.meta,
            this.connection,
            this.schema,
            this.dialect,
            this.actions,
            this,
          ),
      );
  }

  public async createTemplate(): Promise<string> {
    const sql = this.dialect.packageTemplate?.();
    if (!sql) {
      this.actions.showError(`Creating packages is not supported for ${this.connection.type}.`);
      return "";
    }
    const document = await this.actions.openSqlDocument(sql);
    await this.actions.showTextDocument(document);
    return sql;
  }

  public reloadExpandedChild(): void {
    this.onRefresh?.(this);
  }
}

class ModernUserNode extends DatabaseTreeItem {
  public readonly username: string;
  public readonly host?: string;
  private readonly identity: UserIdentity;

  public constructor(
    username: string,
    host: string | undefined,
    private readonly connection: StoredConnection,
    private readonly dialect: Dialect,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent: ModernUserGroupNode,
  ) {
    const identity = userIdentity(username, host);
    const presentation = targetSqlAuthTreePresentations.user;
    super(
      userDisplayName(identity),
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.identity = identity;
    this.username = identity.username;
    this.host = identity.host;
    this.iconPath = targetThemePresentationIcon(presentation);
    this.tooltip = `${this.dialect.id} user ${userDisplayName(identity)}`;
  }

  public async selectSQLTemplate(): Promise<string> {
    const sql = userDetailsSql(this.connection.type, this.dialect, this.identity);
    if (!sql) {
      this.actions.showError(`User details are not supported for ${this.connection.type}.`);
      return "";
    }
    return this.showTemplate("User details", sql);
  }

  public async grandTemplate(): Promise<string> {
    const sql = userGrantSql(this.connection.type, this.dialect, this.identity);
    if (!sql) {
      this.actions.showError(`Granting privileges is not supported for ${this.connection.type}.`);
      return "";
    }
    return this.showTemplate("Grant user privileges", sql);
  }

  public async changePasswordTemplate(): Promise<string> {
    const sql = this.dialect.updateUser?.(this.username, this.host);
    if (!sql) {
      this.actions.showError(`Modify password for ${this.connection.type} is not supported yet.`);
      return "";
    }
    return this.showTemplate("Change user password", sql);
  }

  public async drop(): Promise<void> {
    if (!(await this.actions.confirm(`Drop user ${userDisplayName(this.identity)}?`))) {
      return;
    }
    await this.actions.query(
      this.connection,
      userDropSql(this.connection.type, this.dialect, this.identity),
    );
    this.actions.showInformation(`Dropped user ${userDisplayName(this.identity)}.`);
    this.parent.reloadExpandedChild();
  }

  private async showTemplate(title: string, sql: string): Promise<string> {
    const document = await this.actions.openSqlDocument(sql);
    await this.actions.showTextDocument(document);
    return sql;
  }
}

class ModernUserGroupNode extends DatabaseTreeItem {
  private readonly showUsersSql: () => string | undefined;

  public constructor(
    private readonly connection: StoredConnection,
    private readonly dialect: Dialect,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent: DatabaseTreeItem,
    private readonly onRefresh?: (target?: DatabaseTreeItem) => void,
    contextValue = "userGroup",
    showUsersSql?: () => string | undefined,
  ) {
    const presentation = contextValue === "databaseUserGroup"
      ? targetSqlAuthTreePresentations.databaseUserGroup
      : targetSqlAuthTreePresentations.userGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetThemePresentationIcon(presentation);
    this.showUsersSql = showUsersSql || (() => this.dialect.showUsers?.());
  }

  public async getChildren(): Promise<ModernUserNode[]> {
    const sql = this.showUsersSql();
    if (!sql) {
      return [];
    }
    const result = await this.actions.query<Record<string, unknown>>(
      this.connection,
      sql,
    );
    return resultRows(result)
      .map((row) => ({
        username: rowText(row, "user", "username", "name", "USER_NAME"),
        host: rowText(row, "host", "HOST"),
      }))
      .filter((row) => row.username.length > 0)
      .map(
        (row) =>
          new ModernUserNode(
            row.username,
            row.host || undefined,
            this.connection,
            this.dialect,
            this.services,
            this.actions,
            this,
          ),
      );
  }

  public async createTemplate(): Promise<string> {
    const sql = this.dialect.createUser?.();
    if (!sql) {
      this.actions.showError(`Creating users is not supported for ${this.connection.type}.`);
      return "";
    }
    const document = await this.actions.openSqlDocument(sql);
    await this.actions.showTextDocument(document);
    return sql;
  }

  public reloadExpandedChild(): void {
    this.onRefresh?.(this);
  }
}

class ModernRoleNode extends DatabaseTreeItem {
  public constructor(
    role: string,
    private readonly connection: StoredConnection,
    private readonly dialect: Dialect,
    private readonly actions: TreeActionHost,
    public readonly parent: ModernRoleGroupNode,
  ) {
    const presentation = targetSqlAuthTreePresentations.role;
    super(
      role,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetThemePresentationIcon(presentation);
  }

  public async selectSQLTemplate(): Promise<string> {
    const sql = this.dialect.updateRole?.(String(this.label)) || `SELECT * FROM roles WHERE name = ${this.dialect.escapeLiteral(String(this.label))};`;
    const document = await vscode.workspace.openTextDocument({ content: sql, language: "sql" });
    await this.actions.showTextDocument(document);
    return sql;
  }

  public async grandTemplate(): Promise<string> {
    const sql = this.dialect.grantRole?.(String(this.label));
    if (!sql) {
      this.actions.showError(`Granting role ${String(this.label)} is not supported for ${this.connection.type}.`);
      return "";
    }
    const document = await vscode.workspace.openTextDocument({ content: sql, language: "sql" });
    await this.actions.showTextDocument(document);
    return sql;
  }

  public async drop(): Promise<void> {
    const sql = this.dialect.dropRole?.(String(this.label));
    if (!sql) {
      this.actions.showError(`Dropping role ${String(this.label)} is not supported for ${this.connection.type}.`);
      return;
    }
    if (!(await this.actions.confirm(`Drop role ${String(this.label)}?`))) return;
    await this.actions.query(this.connection, sql);
    this.parent.reloadExpandedChild();
  }
}

class ModernRoleGroupNode extends DatabaseTreeItem {
  public constructor(
    private readonly connection: StoredConnection,
    private readonly dialect: Dialect,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent: DatabaseTreeItem,
    private readonly onRefresh?: (target?: DatabaseTreeItem) => void,
    contextValue = "roleGroup",
    showRolesSql?: () => string | undefined,
  ) {
    const presentation = contextValue === "databaseRoleGroup"
      ? targetSqlAuthTreePresentations.databaseRoleGroup
      : targetSqlAuthTreePresentations.roleGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.showRolesSql = showRolesSql || (() => this.dialect.showRoles?.());
    this.iconPath = targetThemePresentationIcon(presentation);
  }

  private readonly showRolesSql: () => string | undefined;

  public async getChildren(): Promise<ModernRoleNode[]> {
    const sql = this.showRolesSql();
    if (!sql) return [];
    const result = await this.actions.query<Record<string, unknown>>(this.connection, sql);
    return resultRows(result)
      .map((row) => rowText(row, "role", "name", "ROLE_NAME"))
      .filter(Boolean)
      .map((role) => new ModernRoleNode(role, this.connection, this.dialect, this.actions, this));
  }

  public async createTemplate(): Promise<string> {
    const sql = this.dialect.createRole?.();
    if (!sql) {
      this.actions.showError(`Creating roles is not supported for ${this.connection.type}.`);
      return "";
    }
    const document = await vscode.workspace.openTextDocument({ content: sql, language: "sql" });
    await this.actions.showTextDocument(document);
    return sql;
  }

  public reloadExpandedChild(): void {
    this.onRefresh?.(this);
  }
}

class ModernLoginNode extends DatabaseTreeItem {
  public constructor(
    login: string,
    private readonly connection: StoredConnection,
    private readonly dialect: Dialect,
    private readonly actions: TreeActionHost,
    public readonly parent: ModernLoginGroupNode,
  ) {
    const presentation = targetSqlAuthTreePresentations.login;
    super(
      login,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetThemePresentationIcon(presentation);
  }

  public async selectSQLTemplate(): Promise<string> {
    const sql = this.dialect.updateLogin?.(String(this.label)) || `SELECT * FROM logins WHERE name = ${this.dialect.escapeLiteral(String(this.label))};`;
    const document = await vscode.workspace.openTextDocument({ content: sql, language: "sql" });
    await this.actions.showTextDocument(document);
    return sql;
  }

  public async changePasswordTemplate(): Promise<string> {
    return this.selectSQLTemplate();
  }

  public async drop(): Promise<void> {
    const sql = this.dialect.dropLogin?.(String(this.label));
    if (!sql) {
      this.actions.showError(`Dropping login ${String(this.label)} is not supported for ${this.connection.type}.`);
      return;
    }
    if (!(await this.actions.confirm(`Drop login ${String(this.label)}?`))) return;
    await this.actions.query(this.connection, sql);
    this.parent.reloadExpandedChild();
  }
}

class ModernLoginGroupNode extends DatabaseTreeItem {
  private readonly showLoginsSql: () => string | undefined;

  public constructor(
    private readonly connection: StoredConnection,
    private readonly dialect: Dialect,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent: DatabaseTreeItem,
    private readonly onRefresh?: (target?: DatabaseTreeItem) => void,
    showLoginsSql?: () => string | undefined,
  ) {
    const presentation = targetSqlAuthTreePresentations.loginGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.showLoginsSql = showLoginsSql || (() => this.dialect.showLogins?.());
    this.iconPath = targetThemePresentationIcon(presentation);
  }

  public async getChildren(): Promise<ModernLoginNode[]> {
    const sql = this.showLoginsSql();
    if (!sql) return [];
    const result = await this.actions.query<Record<string, unknown>>(this.connection, sql);
    return resultRows(result)
      .map((row) => rowText(row, "login", "name", "LOGIN_NAME"))
      .filter(Boolean)
      .map((login) => new ModernLoginNode(login, this.connection, this.dialect, this.actions, this));
  }

  public async createTemplate(): Promise<string> {
    const sql = this.dialect.createLogin?.();
    if (!sql) {
      this.actions.showError(`Creating logins is not supported for ${this.connection.type}.`);
      return "";
    }
    const document = await vscode.workspace.openTextDocument({ content: sql, language: "sql" });
    await this.actions.showTextDocument(document);
    return sql;
  }

  public reloadExpandedChild(): void {
    this.onRefresh?.(this);
  }
}

class ModernSecurityGroupNode extends DatabaseTreeItem {
  public constructor(
    private readonly connection: StoredConnection,
    private readonly dialect: Dialect,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent: DatabaseTreeItem,
    private readonly onRefresh?: (target?: DatabaseTreeItem) => void,
  ) {
    const presentation = targetSqlAuthTreePresentations.securityGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetThemePresentationIcon(presentation);
  }

  public getChildren(): Array<ModernUserGroupNode | ModernRoleGroupNode | ModernLoginGroupNode> {
    const children: Array<ModernUserGroupNode | ModernRoleGroupNode | ModernLoginGroupNode> = [];
    if (this.dialect.showUsers?.()) {
      children.push(new ModernUserGroupNode(
        this.connection,
        this.dialect,
        this.services,
        this.actions,
        this,
        this.onRefresh,
      ));
    }
    if (this.dialect.showLogins?.()) {
      children.push(new ModernLoginGroupNode(
        this.connection,
        this.dialect,
        this.services,
        this.actions,
        this,
        this.onRefresh,
      ));
    }
    if (this.dialect.showRoles?.()) {
      children.push(new ModernRoleGroupNode(
        this.connection,
        this.dialect,
        this.services,
        this.actions,
        this,
        this.onRefresh,
      ));
    }
    return children;
  }
}

class ModernDatabaseSecurityGroupNode extends DatabaseTreeItem {
  public constructor(
    private readonly connection: StoredConnection,
    private readonly dialect: Dialect,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent: ModernDatabaseNode,
    private readonly onRefresh?: (target?: DatabaseTreeItem) => void,
  ) {
    const presentation = targetSqlAuthTreePresentations.databaseSecurityGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetThemePresentationIcon(presentation);
  }

  public getChildren(): Array<ModernUserGroupNode | ModernRoleGroupNode> {
    const children: Array<ModernUserGroupNode | ModernRoleGroupNode> = [];
    if (this.dialect.showDatabaseUsers?.()) {
      children.push(new ModernUserGroupNode(
        this.connection,
        this.dialect,
        this.services,
        this.actions,
        this,
        this.onRefresh,
        "databaseUserGroup",
        () => this.dialect.showDatabaseUsers?.(),
      ));
    }
    if (this.dialect.showDatabaseRoles?.()) {
      children.push(new ModernRoleGroupNode(
        this.connection,
        this.dialect,
        this.services,
        this.actions,
        this,
        this.onRefresh,
        "databaseRoleGroup",
        () => this.dialect.showDatabaseRoles?.(),
      ));
    }
    return children;
  }
}

export class ModernDatabaseNode extends DatabaseTreeItem {
  public constructor(
    public readonly connection: StoredConnection,
    public readonly database: string,
    public readonly schema: string | null,
    public readonly dialect: Dialect,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent?: DatabaseTreeItem,
    private readonly onRefresh?: (target?: DatabaseTreeItem) => void,
    private readonly nodeLevel: "database" | "schema" = "database",
  ) {
    const context = nodeLevel === "schema"
      ? "schema"
      : targetSecondLevelDatabaseTypes.has(connection.type)
        ? "secondLevelDatabase"
        : targetDatabaseNodeContext(connection.type);
    super(
      database,
      context,
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    const active = isActiveDatabaseTreeItem(
      this.services.activeConnection.get(),
      connection,
      database,
      nodeLevel === "schema" ? schema : undefined,
    );
    this.iconPath = context === "schema"
      ? targetThemeTreeIcon("symbol-struct", active ? "charts.blue" : "dropdown.foreground")
      : targetThemeTreeIcon("database", active ? "charts.blue" : "dropdown.foreground");
  }

  public async getChildren(): Promise<DatabaseTreeItem[]> {
    if (this.nodeLevel === "database" && targetSecondLevelDatabaseTypes.has(this.connection.type)) {
      const children: DatabaseTreeItem[] = [];
      if (this.services.config.get("showSecurity") && (this.dialect.showDatabaseUsers?.() || this.dialect.showDatabaseRoles?.())) {
        children.push(new ModernDatabaseSecurityGroupNode(
          this.connection,
          this.dialect,
          this.services,
          this.actions,
          this,
          this.onRefresh,
        ));
      }
      children.push(new ModernQueryGroupNode(this.connection, this.services, this));
      const schemaSql = this.dialect.showSchemas?.(this.database);
      if (!schemaSql) {
        return children;
      }
      const result = await this.actions.query<Record<string, unknown>>(
        this.connection,
        schemaSql,
      );
      const schemas = resultRows(result)
        .map((row) => rowText(row, "schema", "SCHEMA_NAME", "name", "Database"))
        .filter(Boolean);
      const visibleSchemas = filterTargetTreeNames(this.connection, schemas, "schema")
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
      children.push(...visibleSchemas.map(
        (schema) => new ModernDatabaseNode(
          this.connection,
          schema,
          schema,
          this.dialect,
          this.services,
          this.actions,
          this,
          this.onRefresh,
          "schema",
        ),
      ));
      return children;
    }

    if (this.nodeLevel === "schema") {
      const schemaName = this.schema || this.database;
      const children: DatabaseTreeItem[] = [
        new ModernQueryGroupNode(this.connection, this.services, this),
      ];
      if (targetTreeFeatureEnabled(this.connection.treeFeatures, "type") && this.dialect.showCustomTypes?.(schemaName)) {
        children.push(new ModernCustomTypeGroupNode(
          this.connection,
          schemaName,
          this.dialect,
          this.actions,
          this,
        ));
      }
      if (this.connection.type === "Oracle" && this.dialect.showSynonyms) {
        children.push(new ModernOracleSynonymGroupNode(
          this.connection,
          schemaName,
          this.dialect,
          this.services,
          this.actions,
          this,
        ));
      }
      if (targetTreeFeatureEnabled(this.connection.treeFeatures, "foreignTable") && this.dialect.showExternalTables?.(schemaName)) {
        children.push(new ModernForeignTableGroupNode(
          this.connection,
          schemaName,
          this.dialect,
          this.services,
          this.actions,
          this,
        ));
      }
      children.push(new ModernTableGroupNode(
        this.connection,
        schemaName,
        this.dialect,
        this.services,
        this.actions,
        this,
        this.onRefresh,
      ));
      if (this.dialect.showViews?.(schemaName)) {
        children.push(new ModernViewGroupNode(
          this.connection,
          schemaName,
          this.dialect,
          this.services,
          this.actions,
          this,
        ));
      }
      if (targetTreeFeatureEnabled(this.connection.treeFeatures, "materializedView") && this.dialect.showMaterialViews?.(schemaName)) {
        children.push(new ModernViewGroupNode(
          this.connection,
          schemaName,
          this.dialect,
          this.services,
          this.actions,
          this,
          true,
        ));
      }
      if (targetTreeFeatureEnabled(this.connection.treeFeatures, "sequence") && this.dialect.showSequences?.(schemaName)) {
        children.push(new ModernSequenceGroupNode(
          this.connection,
          schemaName,
          this.dialect,
          this.actions,
          this,
        ));
      }
      if (["Oracle", "DM", "达梦"].includes(this.connection.type) && this.dialect.showPackages?.(schemaName)) {
        children.push(new ModernPackageGroupNode(
          this.connection,
          schemaName,
          this.dialect,
          this.actions,
          this,
          this.onRefresh,
        ));
      }
      if (this.dialect.showFunctions?.(schemaName)) {
        children.push(new ModernRoutineGroupNode(
          "function",
          this.connection,
          schemaName,
          this.dialect,
          this.services,
          this.actions,
          this,
        ));
      }
      if (this.dialect.showProcedures?.(schemaName)) {
        children.push(new ModernRoutineGroupNode(
          "procedure",
          this.connection,
          schemaName,
          this.dialect,
          this.services,
          this.actions,
          this,
        ));
      }
      if ((this.services.config.get("showTrigger") || targetTreeFeatureEnabled(this.connection.treeFeatures, "trigger")) && this.dialect.showTriggers?.(schemaName, null)) {
        children.push(new ModernRoutineGroupNode(
          "trigger",
          this.connection,
          schemaName,
          this.dialect,
          this.services,
          this.actions,
          this,
        ));
      }
      return children;
    }

    if (this.connection.type === "D1") {
      return [
        new ModernQueryGroupNode(this.connection, this.services, this),
        new ModernTableGroupNode(
          this.connection,
          this.database,
          this.dialect,
          this.services,
          this.actions,
          this,
          this.onRefresh,
        ),
      ];
    }
    const schemaName = this.schema || this.database;
    const children: DatabaseTreeItem[] = [
      new ModernQueryGroupNode(this.connection, this.services, this),
      new ModernTableGroupNode(
        this.connection,
        schemaName,
        this.dialect,
        this.services,
        this.actions,
        this,
        this.onRefresh,
      ),
    ];
    if (this.dialect.showViews?.(schemaName) && !["Cassandra", "TDengine"].includes(this.connection.type)) {
      children.push(
        new ModernViewGroupNode(
          this.connection,
          schemaName,
          this.dialect,
          this.services,
          this.actions,
          this,
        ),
      );
    }
    if (targetTreeFeatureEnabled(this.connection.treeFeatures, "materializedView") && this.dialect.showMaterialViews?.(schemaName)) {
      children.push(new ModernViewGroupNode(
        this.connection,
        schemaName,
        this.dialect,
        this.services,
        this.actions,
        this,
        true,
      ));
    }
    if (this.dialect.showPackages?.(schemaName)) {
      children.push(
        new ModernPackageGroupNode(
          this.connection,
          schemaName,
          this.dialect,
          this.actions,
          this,
          this.onRefresh,
        ),
      );
    }
    if (this.dialect.showFunctions?.(schemaName)) {
      children.push(
        new ModernRoutineGroupNode(
          "function",
          this.connection,
          schemaName,
          this.dialect,
          this.services,
          this.actions,
          this,
        ),
      );
    }
    if (this.dialect.showProcedures?.(schemaName)) {
      children.push(
        new ModernRoutineGroupNode(
          "procedure",
          this.connection,
          schemaName,
          this.dialect,
          this.services,
          this.actions,
          this,
        ),
      );
    }
    if ((this.services.config.get("showTrigger") || targetTreeFeatureEnabled(this.connection.treeFeatures, "trigger")) && this.dialect.showTriggers?.(schemaName, null)) {
      children.push(
        new ModernRoutineGroupNode(
          "trigger",
          this.connection,
          schemaName,
          this.dialect,
          this.services,
          this.actions,
          this,
        ),
      );
    }
    if (targetTreeFeatureEnabled(this.connection.treeFeatures, "event") && this.dialect.showEvents?.(schemaName)) {
      children.push(
        new ModernRoutineGroupNode(
          "event",
          this.connection,
          schemaName,
          this.dialect,
          this.services,
          this.actions,
          this,
        ),
      );
    }
    return children;
  }

  public async truncateDb(): Promise<void> {
    const sql = this.dialect.truncateDatabase?.(this.database);
    if (!sql) {
      throw new SourceRecoveryPendingError("mysql.db.truncate");
    }
    const input = await this.actions.input(
      `Dangerous: type the database name to truncate ${this.database}.`,
      "Input database name to confirm.",
    );
    if (!input || input.toLocaleLowerCase() !== this.database.toLocaleLowerCase()) {
      this.actions.showInformation(`Cancelled truncating database ${this.database}.`);
      return;
    }
    const plan = await this.actions.query<Record<string, unknown>>(
      this.connection,
      sql,
    );
    const statements = plan.rows
      .map((row) => rowText(row, "trun", "truncate_sql"))
      .filter((statement) => statement.trim().length > 0);
    for (const statement of statements) {
      await this.actions.query(this.connection, statement);
    }
    this.actions.showInformation(`Truncated database ${this.database}.`);
  }

  public async dropDatabase(): Promise<void> {
    const sql = this.dialect.dropDatabase?.(this.database);
    if (!sql) {
      throw new SourceRecoveryPendingError("mysql.db.drop");
    }
    const objectType = this.dialect.id === "postgresql"
      || this.dialect.id === "sqlserver"
      || this.dialect.id === "oracle"
      ? "schema"
      : "database";
    const input = await this.actions.input(
      `Are you sure you want to drop ${objectType} ${this.database}?`,
      `Input ${objectType} name to confirm.`,
    );
    if (!input || input.toLocaleLowerCase() !== this.database.toLocaleLowerCase()) {
      this.actions.showInformation(`Cancelled dropping ${objectType} ${this.database}.`);
      return;
    }
    await this.actions.query(this.connection, sql);
    this.actions.showInformation(`Dropped ${objectType} ${this.database}.`);
  }

  public async createTemplate(): Promise<string> {
    return this.showTemplate(this.dialect.tableTemplate?.() || "CREATE TABLE database_name (...);");
  }

  public async schemaTemplate(): Promise<string> {
    return this.showTemplate(this.dialect.showSchemas?.(this.database) || "CREATE SCHEMA schema_name;");
  }

  private async showTemplate(sql: string): Promise<string> {
    const document = await this.actions.openSqlDocument(sql);
    await this.actions.showTextDocument(document);
    return sql;
  }
}

export class ModernConnectionNode extends DatabaseTreeItem {
  public constructor(
    public readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    private readonly onDelete: (id: string) => Promise<void>,
    public readonly parent?: DatabaseTreeItem,
    private readonly onRefresh?: (target?: DatabaseTreeItem) => void,
  ) {
    super(
      displayName(connection),
      "connection",
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    this.description = targetConnectionDescription(connection);
    this.tooltip = connection.connectionUrl || `${displayName(connection)} (${connection.type})`;
    this.iconPath = connectionTreeIcon(
      this.services.resources,
      connection,
      this.services.activeConnection.get(),
    );
    if (connection.disabled) {
      this.description = "closed";
      this.collapsibleState = vscode.TreeItemCollapsibleState.None;
    }
  }

  public async getChildren(): Promise<DatabaseTreeItem[]> {
    if (this.connection.disabled) {
      return [new InfoTreeItem("Connection is disabled.")];
    }
    const dialect = this.services.dialects.resolve(this.connection.type);
    if (["SQLite", "libSQL"].includes(this.connection.type)) {
      const children: DatabaseTreeItem[] = [
        new ModernQueryGroupNode(this.connection, this.services, this),
        new ModernTableGroupNode(
          this.connection,
          null,
          dialect,
          this.services,
          this.actions,
          this,
          this.onRefresh,
        ),
      ];
      if (dialect.showViews?.(null)) {
        children.push(new ModernViewGroupNode(
          this.connection,
          null,
          dialect,
          this.services,
          this.actions,
          this,
        ));
      }
      if (targetTreeFeatureEnabled(this.connection.treeFeatures, "sequence") && dialect.showSequences?.(null)) {
        children.push(new ModernSequenceGroupNode(
          this.connection,
          null,
          dialect,
          this.actions,
          this,
        ));
      }
      if ((this.services.config.get("showTrigger") || targetTreeFeatureEnabled(this.connection.treeFeatures, "trigger")) && dialect.showTriggers?.(null, null)) {
        children.push(new ModernRoutineGroupNode(
          "trigger",
          this.connection,
          null,
          dialect,
          this.services,
          this.actions,
          this,
        ));
      }
      return children;
    }
    const children: DatabaseTreeItem[] = [];
    if (
      this.services.config.get("showSecurity")
      && (dialect.showUsers?.() || dialect.showLogins?.() || dialect.showRoles?.())
    ) {
      children.push(
        new ModernSecurityGroupNode(
          this.connection,
          dialect,
          this.services,
          this.actions,
          this,
          this.onRefresh,
        ),
      );
    }
    if (!dialect.showDatabases) {
      const level = targetSchemaConnectionTypes.has(this.connection.type) ? "schema" : "database";
      children.push(new ModernDatabaseNode(
        this.connection,
        "default",
        level === "schema" ? "default" : null,
        dialect,
        this.services,
        this.actions,
        this,
        this.onRefresh,
        level,
      ));
      return children;
    }
    const level: "database" | "schema" = targetSchemaConnectionTypes.has(this.connection.type)
      ? "schema"
      : "database";
    const visibility = targetTreeVisibilityOptions(this.connection);
    const configuredNames = visibility.usingCustomDatabaseName
      ? visibility.includeDatabases
      : [];
    let names: string[];
    if (configuredNames.length > 0) {
      names = [...configuredNames];
    } else {
      const connection = await this.services.connections.getConnection(this.connection);
      const result = await connection.query<Record<string, unknown>>(dialect.showDatabases());
      names = filterTargetTreeNames(
        this.connection,
        resultRows(result).map((row) => rowText(row, "Database", "database", "name", "schema")),
        "database",
      );
    }
    children.push(...names.map((name) => {
      return new ModernDatabaseNode(
        this.connection,
        name,
        level === "schema" ? name : null,
        dialect,
        this.services,
        this.actions,
        this,
        this.onRefresh,
        level,
      );
    }));
    return children;
  }

  public copyName(): Promise<void> {
    return this.actions.writeClipboard(displayName(this.connection));
  }

  public async copy(): Promise<unknown> {
    return this.actions.writeClipboard(displayName(this.connection));
  }

  public async createDatabase(): Promise<string> {
    const dialect = this.services.dialects.resolve(this.connection.type);
    const sql = dialect.createDatabase?.();
    if (!sql) {
      this.actions.showError(`Creating databases is not supported for ${this.connection.type}.`);
      return "";
    }
    const document = await this.actions.openSqlDocument(sql);
    await this.actions.showTextDocument(document);
    return sql;
  }

  public async openConnection(): Promise<void> {
    await this.services.connections.getConnection(this.connection);
    this.services.activeConnection.set(this.connection);
    this.actions.showInformation(`Connected to ${displayName(this.connection)}.`);
  }

  public async disableConnection(): Promise<void> {
    this.actions.showInformation(`Connection ${displayName(this.connection)} can be disabled from its configuration.`);
  }

  public async deleteConnection(): Promise<void> {
    if (await this.actions.confirm(`Delete connection ${displayName(this.connection)}?`)) {
      await this.onDelete(this.connection.id);
    }
  }

  public async selectDB(): Promise<void> {
    await this.openConnection();
  }

  public async openTerminal(): Promise<void> {
    const state = { target: this.connection, connection: this.connection };
    await this.services.webviews.createWebviewPanel({
      title: `${displayName(this.connection)} · terminal`,
      type: "xterm",
      route: "xterm",
      state,
      eventHandler: (handler) => {
        registerWebviewUtilityProtocols({
          route: "xterm",
          target: this.connection,
          state,
          webviewState: state,
          services: this.services,
          handler,
        });
      },
    });
  }

  public async copyKey(): Promise<void> {
    const key = this.connection.connectionUrl || this.connection.host || displayName(this.connection);
    await this.actions.writeClipboard(key);
  }

  public async startRdp(): Promise<void> {
    await this.services.webviews.createWebviewPanel({
      title: `${displayName(this.connection)} · remote desktop`,
      type: "sshStatus",
      route: "sshStatus",
      state: { connection: this.connection, mode: "rdp" },
    });
  }
}

export async function openResultView(
  services: ExtensionServices,
  title: string,
  sql: string,
  result: QueryResult<Record<string, unknown>>,
  context: {
    readonly connection?: ConnectionOptions;
    readonly table?: string;
    readonly schema?: string | null;
    readonly database?: string;
    readonly columnList?: QueryField[];
    readonly primaryKey?: string;
    readonly primaryKeyList?: QueryField[];
    readonly id?: string;
    readonly singlePage?: boolean;
  } = {},
): Promise<void> {
  const state: ResultState = {
    title,
    sql,
    baseSql: sql,
    sourceSql: sql,
    rows: result.rows,
    fields: result.fields,
    dbType: context.connection?.type,
    tableCount: context.table ? 1 : undefined,
    columnList: context.columnList,
    primaryKey: context.primaryKey,
    primaryKeyList: context.primaryKeyList,
    affectedRows: result.affectedRows,
    dirty: false,
    table: context.table,
    schema: context.schema,
    database: context.database,
    pageNum: 1,
    pageSize: services.config.get("defaultSelectLimit"),
    serverPaging: true,
  };
  await services.webviews.createWebviewPanel({
    title,
    type: "result",
    id: context.id || `result:${title}`,
    route: "result",
    singlePage: context.singlePage,
    state,
    eventHandler: (handler) => bindResultProtocols({
      services,
      handler,
      state,
      connection: context.connection,
      openText: async (content, language = "sql") => {
        const document = await vscode.workspace.openTextDocument({ content, language });
        return vscode.window.showTextDocument(document);
      },
      openHistory: async () => { await vscode.commands.executeCommand("mysql.history.open"); },
      openErDiagram: () => openErDiagramPanel(services, {
        connection: context.connection,
        table: context.table,
        schema: context.schema,
        database: context.database,
      }),
    }),
  });
}

type RedisKeyContainer = RedisDatabaseNode | RedisFolderNode;

function redisOption(connection: StoredConnection, key: string): unknown {
  const direct = connection[key];
  if (direct !== undefined) return direct;
  const optionValue = connection.options?.[key];
  if (optionValue !== undefined) return optionValue;
  const nestedCandidates = [connection.redis, connection.options?.redis];
  for (const candidate of nestedCandidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const nested = candidate as Record<string, unknown>;
    if (nested[key] !== undefined) return nested[key];
  }
  return undefined;
}

function redisOptionRecord(connection: StoredConnection, key: string): Record<string, unknown> {
  const value = redisOption(connection, key);
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function redisOptionText(connection: StoredConnection, key: string): string {
  const value = redisOption(connection, key);
  return value == null ? "" : String(value).trim();
}

function redisOptionBoolean(connection: StoredConnection, key: string): boolean {
  const value = redisOption(connection, key);
  return value === true || value === "true" || value === 1 || value === "1";
}

function redisDatabaseCount(connection: StoredConnection): number {
  const configured = Number(redisOption(connection, "databaseNumber"));
  return Number.isInteger(configured) && configured > 0
    ? Math.min(configured, 1024)
    : 16;
}

function redisIncludedDatabases(connection: StoredConnection): string[] {
  const direct = redisOptionText(connection, "includeDatabases");
  const advance = redisOptionRecord(connection, "advance");
  const value = direct || (advance.includeDatabases == null ? "" : String(advance.includeDatabases));
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function redisDatabaseNames(
  connection: StoredConnection,
  metadata: ReadonlyMap<string, RedisDatabaseMeta>,
): string[] {
  const names = Array.from(
    { length: redisDatabaseCount(connection) },
    (_unused, index) => String(index),
  );
  const included = redisIncludedDatabases(connection);
  if (included.length > 0) {
    return names.filter((name) => included.includes(name));
  }
  const selected = connection.database == null || connection.database.trim() === ""
    ? "0"
    : connection.database.trim();
  if (redisOptionBoolean(connection, "allDatabase")) {
    return names;
  }
  return names.filter((name) => name === selected || metadata.has(name));
}

function redisKeyspaceMetadata(
  result: QueryResult<Record<string, unknown>>,
): Map<string, RedisDatabaseMeta> {
  return parseRedisKeyspaceInfo(rowValue(resultRows(result)[0] ?? {}, "value"));
}

function redisScanPage(result: QueryResult<Record<string, unknown>>): RedisScanPage {
  return parseRedisScanPage(rowValue(resultRows(result)[0] ?? {}, "value"));
}

function scopedRedisConnection(
  connection: StoredConnection,
  database: string,
): StoredConnection {
  return {
    ...connection,
    id: `${connection.id}::redis-db:${database}`,
    database,
    name: `${displayName(connection)} [db${database}]`,
  };
}

async function openRedisTerminal(
  services: ExtensionServices,
  connection: StoredConnection,
): Promise<void> {
  const state = { target: connection, connection };
  await services.webviews.createWebviewPanel({
    title: `${displayName(connection)} · terminal`,
    type: "xterm",
    route: "xterm",
    state,
    eventHandler: (handler) => {
      registerWebviewUtilityProtocols({
        route: "xterm",
        target: connection,
        state,
        webviewState: state,
        services,
        handler,
      });
    },
  });
}

async function openRedisKeyView(
  services: ExtensionServices,
  connection: StoredConnection,
  key: string,
  prefix = "",
  newKey = false,
): Promise<void> {
  const target = {
    key,
    label: key,
    name: key,
    prefix,
    newKey,
    stack: redisOptionBoolean(connection, "stack"),
    database: connection.database,
  };
  const state = { target, connection, newKeyName: prefix };
  await services.webviews.createWebviewPanel({
    title: key ? `${displayName(connection)} · ${key}` : `${displayName(connection)} · new Redis key`,
    type: "redisKey",
    route: "keyView",
    state,
    eventHandler: (handler) => {
      registerWebviewUtilityProtocols({
        route: "keyView",
        target,
        state,
        webviewState: state,
        services,
        handler,
      });
    },
  });
}

function redisKeyChildren(
  parent: RedisKeyContainer,
  keys: readonly string[],
): Array<RedisFolderNode | RedisKeyNode> {
  const folders = new Map<string, string[]>();
  const leaves: string[] = [];
  const prefix = parent.keyPrefix;
  for (const key of [...new Set(keys)].sort((left, right) => left.localeCompare(right))) {
    const remainder = prefix && key.startsWith(`${prefix}:`)
      ? key.slice(prefix.length + 1)
      : key;
    const separator = remainder.indexOf(":");
    if (separator <= 0) {
      leaves.push(key);
      continue;
    }
    const folder = remainder.slice(0, separator);
    const folderKeys = folders.get(folder) ?? [];
    folderKeys.push(key);
    folders.set(folder, folderKeys);
  }
  return [
    ...[...folders.entries()].map(([folder, folderKeys]) => folderKeys.length === 1
      ? new RedisKeyNode(
        folderKeys[0],
        folder,
        parent.connection,
        parent.services,
        parent.actions,
        parent,
      )
      : new RedisFolderNode(folder, folderKeys, parent)),
    ...leaves.map((key) => new RedisKeyNode(
      key,
      "",
      parent.connection,
      parent.services,
      parent.actions,
      parent,
    )),
  ];
}

class RedisDatabaseNode extends DatabaseTreeItem {
  public readonly keyPrefix = "";
  private cursor = "0";
  private initialized = false;
  private readonly keys: string[] = [];

  public constructor(
    public readonly database: string,
    public readonly meta: RedisDatabaseMeta,
    public readonly connection: StoredConnection,
    public readonly services: ExtensionServices,
    public readonly actions: TreeActionHost,
    public readonly parent: RedisConnectionNode,
    public readonly refreshTree: (element?: DatabaseTreeItem) => void,
  ) {
    const presentation = targetSpecializedTreePresentations.redisDatabase;
    super(
      database,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.description = meta.keys > 0 ? `(${meta.keys})` : "";
    this.tooltip = [
      `Redis database ${database}`,
      `Keys: ${meta.keys}`,
      meta.expires == null ? "" : `Expiring keys: ${meta.expires}`,
      meta.avgTtl == null ? "" : `Average TTL: ${meta.avgTtl}`,
    ].filter(Boolean).join("\n");
    this.iconPath = targetPresentationTreeIcon(this.services.resources, presentation);
  }

  public async getChildren(): Promise<DatabaseTreeItem[]> {
    if (!this.initialized) {
      await this.fetchPage("0");
      this.initialized = true;
    }
    const children: Array<DatabaseTreeItem | RedisLoadMoreNode> = redisKeyChildren(this, this.keys);
    if (this.cursor !== "0") {
      children.unshift(new RedisLoadMoreNode(this));
    }
    return children.length > 0 ? children : [new InfoTreeItem("Database is empty.")];
  }

  public async loadMore(): Promise<void> {
    if (!this.initialized) {
      await this.fetchPage("0");
      this.initialized = true;
    } else if (this.cursor !== "0") {
      await this.fetchPage(this.cursor);
    }
    this.refreshTree(this);
  }

  public reset(): void {
    this.cursor = "0";
    this.initialized = false;
    this.keys.splice(0, this.keys.length);
  }

  public async newNode(): Promise<void> {
    await openRedisKeyView( this.services, this.connection, "", "", true);
  }

  public async openTerminal(): Promise<void> {
    await openRedisTerminal(this.services, this.connection);
  }

  public async dump(): Promise<void> {
    await dumpRedis(this.services, this.connection);
  }

  public async restore(): Promise<void> {
    await restoreRedis(this.services, this.connection);
    this.reset();
    this.refreshTree(this);
  }

  private async fetchPage(cursor: string): Promise<void> {
    const result = await this.actions.query<Record<string, unknown>>(
      this.connection,
      `SCAN ${JSON.stringify(cursor)} COUNT 1000`,
    );
    const page = redisScanPage(result);
    this.cursor = page.cursor;
    const existing = new Set(this.keys);
    for (const key of page.keys) {
      if (!existing.has(key)) {
        existing.add(key);
        this.keys.push(key);
      }
    }
  }
}

class RedisLoadMoreNode extends DatabaseTreeItem {
  public constructor(public readonly parent: RedisDatabaseNode) {
    super("Click to load more", undefined);
    this.iconPath = new vscode.ThemeIcon("package");
    this.command = {
      command: "mysql.redis.loadMore",
      title: "Load more redis keys",
      arguments: [this],
    };
  }

  public async click(): Promise<void> {
    await this.parent.loadMore();
  }
}

class RedisFolderNode extends DatabaseTreeItem {
  public readonly keyPrefix: string;
  public readonly connection: StoredConnection;
  public readonly services: ExtensionServices;
  public readonly actions: TreeActionHost;
  public readonly refreshTree: (element?: DatabaseTreeItem) => void;

  public constructor(
    folder: string,
    public readonly keys: readonly string[],
    public readonly parent: RedisKeyContainer,
  ) {
    const presentation = targetSpecializedTreePresentations.redisFolder;
    super(
      folder,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.connection = parent.connection;
    this.services = parent.services;
    this.actions = parent.actions;
    this.refreshTree = parent.refreshTree;
    this.keyPrefix = parent.keyPrefix ? `${parent.keyPrefix}:${folder}` : folder;
    this.description = `(${keys.length})`;
    this.tooltip = this.keyPrefix;
    this.iconPath = targetPresentationTreeIcon(this.services.resources, presentation);
  }

  public async getChildren(): Promise<DatabaseTreeItem[]> {
    const children = redisKeyChildren(this, this.keys);
    return children.length > 0 ? children : [new InfoTreeItem("Folder is empty.")];
  }

  public async newNode(): Promise<void> {
    await openRedisKeyView(this.services, this.connection, "", `${this.keyPrefix}:`, true);
  }

  public async delete(): Promise<void> {
    if (!(await this.actions.confirm(`Delete Redis folder ${this.keyPrefix}?`))) return;
    for (const key of this.keys) {
      await this.actions.query(this.connection, `DEL ${JSON.stringify(key)}`);
    }
    this.parent.reset();
    this.refreshTree(this.parent);
    this.actions.showInformation(`Deleted Redis folder ${this.keyPrefix}.`);
  }

  public async dump(): Promise<void> {
    await dumpRedis(this.services, this.connection, this.keyPrefix);
  }

  public reset(): void {
    this.parent.reset();
  }
}

class RedisKeyNode extends DatabaseTreeItem {
  public readonly iconDetailPath: string;

  public constructor(
    key: string,
    private readonly prefix: string,
    private readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent: RedisKeyContainer,
  ) {
    const presentation = targetSpecializedTreePresentations.redisKey;
    super(key, presentation.contextValue, targetPresentationCollapsibleState(presentation));
    this.tooltip = key;
    this.iconPath = targetPresentationTreeIcon(this.services.resources, presentation);
    this.iconDetailPath = this.services.resources.resolve("resources", "icon", "server", "redis.svg");
    this.command = {
      command: "mysql.redis.key.detail",
      title: "View Redis key detail",
      arguments: [this, true],
    };
    void this.fetchInfo();
  }

  private async fetchInfo(): Promise<void> {
    try {
      const result = await this.actions.query<Record<string, unknown>>(
        this.connection,
        `TYPE ${JSON.stringify(String(this.label))}`,
      );
      const row = resultRows(result)[0] || {};
      const type = rowText(row, "value", "type", "TYPE").toLocaleLowerCase();
      this.description = type || undefined;
      this.iconPath = type === "hash"
        ? targetThemeTreeIcon("symbol-namespace")
        : type === "stream"
          ? targetThemeTreeIcon("symbol-event")
          : targetThemeTreeIcon("key", "charts.yellow");
    } catch {
      // The key remains a normal yellow key when TYPE is unavailable.
    }
  }

  private redisCommand(name: string): string {
    return `${name} ${JSON.stringify(String(this.label))}`;
  }

  public async detail(): Promise<void> {
    await openRedisKeyView(this.services, this.connection, String(this.label), this.prefix);
  }

  public async delete(): Promise<void> {
    if (!(await this.actions.confirm(`Delete Redis key ${String(this.label)}?`))) {
      return;
    }
    await this.actions.query(this.connection, this.redisCommand("DEL"));
    this.parent.reset();
    this.parent.refreshTree(this.parent);
    this.actions.showInformation(`Deleted Redis key ${String(this.label)}.`);
  }

  public async reqDelete(): Promise<void> {
    await this.delete();
  }

  public async editData(): Promise<void> {
    await this.detail();
  }

  public async click(): Promise<void> {
    await this.detail();
  }
}

class RedisConnectionNode extends DatabaseTreeItem {
  private visibleDatabaseOverride?: Set<string>;

  public constructor(
    public readonly connection: StoredConnection,
    public readonly services: ExtensionServices,
    public readonly actions: TreeActionHost,
    private readonly onDelete: (id: string) => Promise<void>,
    public readonly parent: DatabaseTreeItem | undefined,
    private readonly refreshTree: () => void,
  ) {
    super(displayName(connection), "redisConnection", vscode.TreeItemCollapsibleState.Collapsed);
    this.description = targetConnectionDescription(connection);
    this.tooltip = connection.connectionUrl || `${displayName(connection)} (Redis)`;
    this.iconPath = connectionTreeIcon(
      this.services.resources,
      connection,
      this.services.activeConnection.get(),
    );
    if (connection.disabled) {
      this.description = "closed";
      this.collapsibleState = vscode.TreeItemCollapsibleState.None;
    }
  }

  public async getChildren(): Promise<RedisDatabaseNode[]> {
    if (this.connection.disabled) {
      return [];
    }
    this.services.activeConnection.set(this.connection);
    await this.loadConnectionMetadata();
    const metadata = await this.loadMetadata();
    const names = this.visibleDatabaseOverride
      ? [...this.visibleDatabaseOverride]
      : redisDatabaseNames(this.connection, metadata);
    return names.map((database) => new RedisDatabaseNode(
      database,
      metadata.get(database) || { name: database, keys: 0 },
      scopedRedisConnection(this.connection, database),
      this.services,
      this.actions,
      this,
      this.refreshTree,
    ));
  }

  public copyName(): Promise<void> {
    return this.actions.writeClipboard(displayName(this.connection));
  }

  public copy(): Promise<void> {
    return this.copyName();
  }

  public async openConnection(): Promise<void> {
    await this.services.connections.getConnection(this.connection);
    this.services.activeConnection.set(this.connection);
    this.actions.showInformation(`Connected to ${displayName(this.connection)}.`);
  }

  public async deleteConnection(): Promise<void> {
    if (!(await this.actions.confirm(`Delete connection ${displayName(this.connection)}?`))) return;
    const prefix = `${this.connection.id}::redis-db:`;
    for (const id of this.services.connections.activeIds()) {
      if (id.startsWith(prefix)) await this.services.connections.close(id);
    }
    await this.onDelete(this.connection.id);
  }

  public async selectDB(): Promise<void> {
    const metadata = await this.loadMetadata();
    const names = redisDatabaseNames(
      { ...this.connection, allDatabase: true },
      metadata,
    );
    const included = new Set(redisIncludedDatabases(this.connection));
    const selected = await vscode.window.showQuickPick(
      names.map((name) => ({
        label: name,
        description: metadata.get(name)?.keys ? `${metadata.get(name)?.keys} keys` : "empty",
        picked: included.has(name),
      })),
      { canPickMany: true, title: "Select displayed Redis databases" },
    );
    if (!selected) return;
    const next = new Set(selected.map((item) => item.label));
    this.visibleDatabaseOverride = next;
    const nextConnection: StoredConnection = {
      ...this.connection,
      includeDatabases: [...next].join(",") || undefined,
    };
    await this.services.connectionConfig.saveConnection(nextConnection);
    this.refreshTree();
  }

  public async openTerminal(): Promise<void> {
    await openRedisTerminal(this.services, this.connection);
  }

  public async dump(): Promise<void> {
    await dumpRedis(this.services, this.connection);
  }

  public async restore(): Promise<void> {
    await restoreRedis(this.services, this.connection);
    this.refreshTree();
  }

  private async loadMetadata(): Promise<Map<string, RedisDatabaseMeta>> {
    try {
      return redisKeyspaceMetadata(await this.actions.query(
        this.connection,
        "INFO keyspace",
      ));
    } catch (error) {
      this.services.logger.debug("Redis keyspace metadata unavailable", error);
      return new Map();
    }
  }

  private async loadConnectionMetadata(): Promise<void> {
    const results = await Promise.allSettled([
      this.actions.query(this.connection, "INFO Memory"),
      this.actions.query(this.connection, "INFO Server"),
    ]);
    const memoryResult = results[0];
    if (memoryResult.status === "fulfilled") {
      const memory = redisInfoValue(
        rowValue(resultRows(memoryResult.value)[0] ?? {}, "value"),
        "used_memory_human",
      );
      if (memory) this.description = memory;
    }
    const serverResult = results[1];
    if (serverResult.status === "fulfilled") {
      const version = redisInfoValue(
        rowValue(resultRows(serverResult.value)[0] ?? {}, "value"),
        "redis_version",
      );
      if (version) this.description = version;
    }
    if (results.some((result) => result.status === "rejected")) {
      this.services.logger.debug("Redis connection metadata unavailable", results);
    }
  }
}

class MongoDatabaseNode extends DatabaseTreeItem {
  public constructor(
    public readonly database: string,
    private readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent: DatabaseTreeItem,
    private readonly refreshTree: () => void,
  ) {
    super(database, "mongoDatabase", vscode.TreeItemCollapsibleState.Collapsed);
    const active = isActiveDatabaseTreeItem(
      this.services.activeConnection.get(),
      this.connection,
      this.database,
      undefined,
    );
    this.iconPath = targetThemeTreeIcon(
      "database",
      active ? "charts.blue" : "dropdown.foreground",
    );
  }

  public getChildren(): DatabaseTreeItem[] {
    return [
      new ModernQueryGroupNode(this.connection, this.services, this),
      new MongoCollectionGroupNode(
        this,
        this.connection,
        this.services,
        this.actions,
        this.refreshTree,
      ),
    ];
  }
}

class MongoCollectionGroupNode extends DatabaseTreeItem {
  private filter = "";

  public constructor(
    public readonly parent: MongoDatabaseNode,
    private readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    private readonly refreshTree: () => void,
  ) {
    const presentation = targetSpecializedTreePresentations.mongoCollectionGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetThemePresentationIcon(presentation);
    this.command = {
      command: "mysql.node.filterChildren",
      title: "Filter MongoDB collections",
      arguments: [this],
    };
  }

  public setFilter(value: string): void {
    this.filter = value.trim().toLocaleLowerCase();
    this.refreshTree();
  }

  public async getChildren(): Promise<MongoCollectionNode[]> {
    const [collectionsResult, statsResult] = await Promise.all([
      this.actions.query<Record<string, unknown>>(
        this.connection,
        `db(${JSON.stringify(this.parent.database)}).listCollections().toArray()`,
      ),
      this.actions.query<Record<string, unknown>>(
        this.connection,
        `db(${JSON.stringify(this.parent.database)}).stats()`,
      ).catch(() => undefined),
    ]);
    const stats = statsResult ? resultRows(statsResult)[0] : undefined;
    const totalSize = stats ? rowNumber(stats, "totalSize") : undefined;
    this.parent.description = totalSize === undefined ? undefined : prettyBytes(totalSize);

    return resultRows(collectionsResult)
      .map((row) => rowText(row, "name", "collection"))
      .filter((name) => name && name.toLocaleLowerCase().includes(this.filter))
      .sort((left, right) => left.localeCompare(right))
      .map(
        (collection) => new MongoCollectionNode(
          collection,
          this.parent.database,
          this.connection,
          this.services,
          this.actions,
          this,
        ),
      );
  }

  public async createTemplate(): Promise<string> {
    const sql = `db(${JSON.stringify(this.parent.database)}).collection("collection").insertOne({ name: "Database Client"})`;
    const document = await this.actions.openSqlDocument(sql);
    await this.actions.showTextDocument(document);
    return sql;
  }
}

class MongoCollectionNode extends DatabaseTreeItem {
  public constructor(
    public readonly collection: string,
    public readonly database: string,
    public readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent: MongoCollectionGroupNode,
  ) {
    const presentation = targetSpecializedTreePresentations.mongoCollection;
    super(
      collection,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.tooltip = `${database}.${collection}`;
    this.iconPath = targetPresentationTreeIcon(this.services.resources, presentation);
    this.command = {
      command: "mysql.table.find",
      title: "Run Select Statement",
      arguments: [this, true],
    };
  }

  public query(): string {
    return `db(${JSON.stringify(this.database)}).collection(${JSON.stringify(String(this.label))}).find({}).limit(${this.services.config.get("defaultSelectLimit")}).toArray()`;
  }

  public documentQuery(): string {
    return `db(${JSON.stringify(this.database)}).collection(${JSON.stringify(String(this.label))}).find({}).limit(50).toArray()`;
  }

  public getPaginationSql(): string {
    return this.query();
  }

  public indexQuery(): string {
    return `db(${JSON.stringify(this.database)}).collection(${JSON.stringify(String(this.label))}).listIndexes().toArray()`;
  }

  public async getChildren(): Promise<DatabaseTreeItem[]> {
    return [
      new MongoDocumentGroupNode(this, this.services, this.actions),
      new MongoIndexGroupNode(this, this.services, this.actions),
    ];
  }

  public async viewData(): Promise<void> {
    const sql = this.query();
    const result = await this.actions.query<Record<string, unknown>>(
      this.connection,
      sql,
    );
    await openResultView(this.services, String(this.label), sql, result);
  }

  public async insertTemplate(): Promise<string> {
    const sql = `db(${JSON.stringify(this.database)}).collection(${JSON.stringify(String(this.label))}).insertOne({})`;
    const document = await this.actions.openSqlDocument(sql);
    await this.actions.showTextDocument(document);
    return sql;
  }

  public async drop(): Promise<void> {
    if (!(await this.actions.confirm(`Drop MongoDB collection ${String(this.label)}?`))) {
      return;
    }
    const sql = `db(${JSON.stringify(this.database)}).collection(${JSON.stringify(String(this.label))}).drop()`;
    await this.actions.query(this.connection, sql);
    this.actions.showInformation(`Dropped MongoDB collection ${String(this.label)}.`);
  }

  public async dump(): Promise<void> {
    await this.viewData();
  }
}

class MongoDocumentGroupNode extends DatabaseTreeItem {
  public constructor(
    public readonly collection: MongoCollectionNode,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
  ) {
    const presentation = targetSpecializedTreePresentations.mongoDocumentGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetThemePresentationIcon(presentation);
  }

  public async getChildren(): Promise<DatabaseTreeItem[]> {
    const result = await this.actions.query<Record<string, unknown>>(
      this.collection.connection,
      this.collection.documentQuery(),
    );
    if (result.fields.length === 0) {
      return [new InfoTreeItem("This collection is empty.")];
    }
    return result.fields.map((field) => new MongoColumnNode(field, this));
  }
}

class MongoColumnNode extends DatabaseTreeItem {
  public constructor(
    public readonly field: QueryField,
    public readonly parent: MongoDocumentGroupNode,
  ) {
    super(field.name, "column");
    this.description = field.type;
    this.tooltip = `${parent.collection.database}.${parent.collection.collection}.${field.name}`;
    this.iconPath = targetThemeTreeIcon("symbol-field", "charts.blue");
  }
}

class MongoIndexGroupNode extends DatabaseTreeItem {
  public constructor(
    private readonly collection: MongoCollectionNode,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
  ) {
    const presentation = targetSpecializedTreePresentations.mongoIndexGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetPresentationTreeIcon(this.services.resources, presentation);
  }

  public async getChildren(): Promise<MongoIndexNode[]> {
    const result = await this.actions.query<Record<string, unknown>>(
      this.collection.connection,
      this.collection.indexQuery(),
    );
    return resultRows(result).map(
      (row, index) => new MongoIndexNode(
        rowText(row, "name") || `Index ${index + 1}`,
        row,
        this.collection,
        this.services,
      ),
    );
  }
}

class MongoIndexNode extends DatabaseTreeItem {
  public constructor(
    label: string,
    private readonly index: Record<string, unknown>,
    private readonly collection: MongoCollectionNode,
    private readonly services: ExtensionServices,
  ) {
    super(label, "index", vscode.TreeItemCollapsibleState.None);
    this.tooltip = `${collection.database}.${collection.collection} index ${label}`;
    this.iconPath = targetThemeTreeIcon(
      "symbol-property",
      ["1", "TRUE", "UNIQUE"].includes(
        rowText(index, "isUnique", "unique", "uniqueFlag").toUpperCase(),
      ) ? "charts.yellow" : undefined,
    );
  }

  public async viewData(): Promise<void> {
    await openResultView(
      this.services,
      String(this.label),
      this.collection.indexQuery(),
      { rows: [this.index], fields: [] },
      { connection: this.collection.connection, database: this.collection.database },
    );
  }

  public async click(): Promise<void> {
    await this.viewData();
  }
}

const ELASTIC_CONNECTION_QUERY = `GET /_search
{
  "from": 0,
  "size": 100,
  "query": {
    "bool": {
      "must": [
        { "match_all": {} }
      ]
    }
  }
}`;

const ELASTIC_INDEX_TEMPLATE = `// Create index
PUT /index_name
{
  "settings": { "number_of_shards": 1, "number_of_replicas": 1 },
  "mappings": {
    "properties": {
      "id": { "type": "integer" },
      "name": { "type": "text" }
    }
  }
}`;

const ELASTIC_STREAM_TEMPLATE = `// Index template
PUT /_index_template/log_template
{
  "index_patterns": ["stream_name*"],
  "data_stream": {},
  "template": {
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "message": { "type": "text" }
      }
    }
  }
}

// Create stream and put data.
POST /stream_name/_doc
{
  "message": "logged the request",
  "@timestamp": "1633677855467"
}`;

function elasticRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function elasticPayload(result: QueryResult<Record<string, unknown>>): unknown {
  const normalized = elasticRecord(result.raw);
  return normalized.raw ?? result.rows[0] ?? result.raw;
}

function elasticIndexDescription(meta: ElasticsearchIndexMeta): string {
  if (!meta.storeSize || meta.docsCount === undefined) return "";
  return `${meta.storeSize.toUpperCase()} ${meta.docsCount}`;
}

function elasticQueryTemplate(index: string, fields: readonly string[] = []): string {
  const source = fields.length > 0
    ? `,\n  "_source": {\n    "includes": [${fields.map((field) => JSON.stringify(field)).join(", ")}]\n  }`
    : "";
  return `GET /${index}/_search
{
  "from": 0,
  "size": 100,
  "query": {
    "bool": {
      "must": [
        { "match_all": {} }
      ]
    }
  }${source}
}`;
}

class ElasticColumnNode extends DatabaseTreeItem {
  public constructor(
    public readonly meta: ElasticsearchFieldMeta,
    public readonly parent: ElasticIndexNode | ElasticColumnNode,
  ) {
    super(
      meta.name,
      "esColumn",
      meta.children.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    this.description = meta.type;
    this.iconPath = new vscode.ThemeIcon(
      meta.type === "object"
        ? "symbol-class"
        : meta.type === "keyword"
          ? "symbol-constant"
          : "symbol-field",
    );
  }

  public getChildren(): ElasticColumnNode[] {
    return this.meta.children.map((child) => new ElasticColumnNode(child, this));
  }
}

class ElasticIndexGroupNode extends DatabaseTreeItem {
  private filter = "";

  public constructor(
    private readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent: ElasticConnectionNode,
    private readonly refreshTree: () => void,
  ) {
    const presentation = targetSpecializedTreePresentations.elasticIndexGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetPresentationTreeIcon(this.services.resources, presentation);
    this.command = {
      command: "mysql.node.filterChildren",
      title: "Filter Elasticsearch indexes",
      arguments: [this],
    };
  }

  public setFilter(value: string): void {
    this.filter = value.trim().toLocaleLowerCase();
    this.refreshTree();
  }

  public async getChildren(): Promise<DatabaseTreeItem[]> {
    const result = await this.actions.query<Record<string, unknown>>(
      this.connection,
      "/_cat/indices?format=json",
    );
    const allIndexes = parseElasticsearchIndexRows(result.rows);
    const totalBytes = sumElasticsearchStoreBytes(allIndexes);
    this.description = totalBytes === undefined ? undefined : prettyBytes(totalBytes);
    const indexes = allIndexes
      .filter((index) => index.name.toLocaleLowerCase().includes(this.filter));
    if (indexes.length === 0) return [new InfoTreeItem("No index found.")];
    return indexes.map(
      (index) => new ElasticIndexNode(index, this.connection, this.services, this.actions, this),
    );
  }

  public async createTemplate(): Promise<string> {
    const document = await this.actions.openSqlDocument(ELASTIC_INDEX_TEMPLATE);
    await this.actions.showTextDocument(document);
    return ELASTIC_INDEX_TEMPLATE;
  }

  public async dump(options: ElasticsearchDumpOptions = {}): Promise<void> {
    await dumpElasticsearch(this.services, this.connection, undefined, options);
  }

  public async restore(): Promise<void> {
    await restoreElasticsearch(this.services, this.connection);
    this.refreshTree();
  }
}

class ElasticIndexNode extends DatabaseTreeItem {
  public constructor(
    public readonly meta: ElasticsearchIndexMeta,
    protected readonly connection: StoredConnection,
    protected readonly services: ExtensionServices,
    protected readonly actions: TreeActionHost,
    public readonly parent: DatabaseTreeItem,
  ) {
    super(meta.name, "esIndex", vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon("split-horizontal");
    this.description = elasticIndexDescription(meta) || undefined;
    this.tooltip = [
      meta.health ? `Health: ${meta.health}` : "",
      meta.primaryShards === undefined ? "" : `Primary: ${meta.primaryShards}`,
      meta.replicaShards === undefined ? "" : `Replicas: ${meta.replicaShards}`,
    ].filter(Boolean).join("\n") || `Elasticsearch index ${meta.name}`;
    this.command = {
      command: "mysql.show.esIndex",
      title: "Show ES Index Data",
      arguments: [this, true],
    };
  }

  public async getChildren(): Promise<DatabaseTreeItem[]> {
    const result = await this.actions.query<Record<string, unknown>>(
      this.connection,
      `GET /${encodeURIComponent(this.meta.name)}/_mapping`,
    );
    return parseElasticsearchMapping(elasticPayload(result), this.meta.name)
      .map((field) => new ElasticColumnNode(field, this));
  }

  public async newQuery(): Promise<string> {
    const fields = (await this.getChildren()).map((field) => String(field.label));
    const insert = `POST /${this.meta.name}/_doc\n{\n  "id": 1,\n  "name": "test"\n}`;
    const sql = `${elasticQueryTemplate(this.meta.name, fields)}\n\n${insert}`;
    const document = await this.actions.openSqlDocument(sql);
    await this.actions.showTextDocument(document);
    return sql;
  }

  public async viewData(): Promise<void> {
    const sql = `${elasticQueryTemplate(this.meta.name)};`;
    const result = await this.actions.query<Record<string, unknown>>(this.connection, sql.slice(0, -1));
    await openResultView(this.services, this.meta.name, sql, result, {
      connection: this.connection,
      table: this.meta.name,
    });
  }

  public async countSql(): Promise<void> {
    const sql = `GET /${encodeURIComponent(this.meta.name)}/_count`;
    const result = await this.actions.query<Record<string, unknown>>(this.connection, sql);
    await openResultView(this.services, `${this.meta.name} count`, sql, result, {
      connection: this.connection,
      table: this.meta.name,
      singlePage: true,
    });
  }

  public async searchTemplate(): Promise<string> {
    const fields = (await this.getChildren()).map((field) => String(field.label));
    return this.openTemplate(elasticQueryTemplate(this.meta.name, fields));
  }

  public async insertTemplate(): Promise<string> {
    const fields = (await this.getChildren()).map((field) => `  ${JSON.stringify(String(field.label))}: ""`);
    const body = fields.length > 0 ? fields.join(",\n") : "  \"id\": 1,\n  \"name\": \"test\"";
    return this.openTemplate(`POST /${this.meta.name}/_doc\n{\n${body}\n}`);
  }

  public async updateTemplate(): Promise<string> {
    return this.openTemplate(`POST /${this.meta.name}/_doc/$1\n{\n  $2\n}`);
  }

  public async analyzeTemplate(): Promise<string> {
    return this.openTemplate(`GET /${this.meta.name}/_analyze\n{\n  "analyzer": "standard$1",\n  "text": "$2"\n}`);
  }

  public async aggregationsTemplate(): Promise<string> {
    return this.openTemplate(`GET /${this.meta.name}/_search\n{\n  "size": 0,\n  "query": { "match_all": {} },\n  "aggs": { "termAgg": { "terms": { "size": 100, "field": "$1" } } }\n}`);
  }

  public async showSettings(): Promise<void> {
    const result = await this.actions.query<Record<string, unknown>>(
      this.connection,
      `GET /${encodeURIComponent(this.meta.name)}/_settings`,
    );
    const document = elasticRecord(elasticPayload(result));
    const index = elasticRecord(document[this.meta.name] ?? document);
    await this.openJsonDocument(index.settings, `${this.meta.name}#settings.json`);
  }

  public async mappingIndex(): Promise<void> {
    const result = await this.actions.query<Record<string, unknown>>(
      this.connection,
      `GET /${encodeURIComponent(this.meta.name)}/_mapping`,
    );
    const document = elasticRecord(elasticPayload(result));
    const index = elasticRecord(document[this.meta.name] ?? document);
    await this.openJsonDocument(index.mappings, `${this.meta.name}#mapping.json`);
  }

  protected deleteRequest(): string {
    return `DELETE /${encodeURIComponent(this.meta.name)}`;
  }

  public async drop(): Promise<void> {
    if (!(await this.actions.confirm(`Delete Elasticsearch index ${this.meta.name}?`))) return;
    await this.actions.query(this.connection, this.deleteRequest());
    this.actions.showInformation(`Deleted Elasticsearch index ${this.meta.name}.`);
  }

  public async dump(options: ElasticsearchDumpOptions = {}): Promise<void> {
    await dumpElasticsearch(this.services, this.connection, this.meta.name, options);
  }

  private async openTemplate(sql: string): Promise<string> {
    const document = await this.actions.openSqlDocument(sql);
    await this.actions.showTextDocument(document);
    return sql;
  }

  private async openJsonDocument(value: unknown, name: string): Promise<void> {
    const document = await vscode.workspace.openTextDocument({
      content: JSON.stringify(value || {}, null, 2),
      language: "json",
    });
    await this.actions.showTextDocument(document);
    this.tooltip = `${this.meta.name} · ${name}`;
  }
}

class ElasticStreamNode extends ElasticIndexNode {
  public constructor(
    private readonly stream: ElasticsearchDataStreamMeta,
    connection: StoredConnection,
    services: ExtensionServices,
    actions: TreeActionHost,
    parent: ElasticStreamGroupNode,
  ) {
    super({ name: stream.name, status: stream.status, raw: stream.raw }, connection, services, actions, parent);
    this.iconPath = new vscode.ThemeIcon("symbol-event");
    this.tooltip = [
      stream.status ? `Status: ${stream.status}` : "",
      stream.timestampField ? `Timestamp: ${stream.timestampField}` : "",
    ].filter(Boolean).join("\n") || `Elasticsearch data stream ${stream.name}`;
  }

  public override async getChildren(): Promise<ElasticIndexNode[]> {
    return this.stream.indices.map(
      (index) => new ElasticIndexNode({ name: index, raw: { index } }, this.connection, this.services, this.actions, this),
    );
  }

  protected override deleteRequest(): string {
    return `DELETE /_data_stream/${encodeURIComponent(this.stream.name)}`;
  }
}

class ElasticStreamGroupNode extends DatabaseTreeItem {
  private filter = "";

  public constructor(
    private readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent: ElasticConnectionNode,
    private readonly refreshTree: () => void,
  ) {
    const presentation = targetSpecializedTreePresentations.elasticStreamGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetPresentationTreeIcon(this.services.resources, presentation);
    this.command = {
      command: "mysql.node.filterChildren",
      title: "Filter Elasticsearch streams",
      arguments: [this],
    };
  }

  public setFilter(value: string): void {
    this.filter = value.trim().toLocaleLowerCase();
    this.refreshTree();
  }

  public async getChildren(): Promise<ElasticStreamNode[]> {
    const result = await this.actions.query<Record<string, unknown>>(
      this.connection,
      "GET /_data_stream",
    );
    return parseElasticsearchDataStreams(elasticPayload(result))
      .filter((stream) => stream.name.toLocaleLowerCase().includes(this.filter))
      .map((stream) => new ElasticStreamNode(stream, this.connection, this.services, this.actions, this));
  }

  public async createTemplate(): Promise<string> {
    const document = await this.actions.openSqlDocument(ELASTIC_STREAM_TEMPLATE);
    await this.actions.showTextDocument(document);
    return ELASTIC_STREAM_TEMPLATE;
  }
}

class ElasticConnectionNode extends DatabaseTreeItem {
  public constructor(
    public readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    private readonly onDelete: (id: string) => Promise<void>,
    private readonly refreshTree: () => void,
    public readonly parent?: DatabaseTreeItem,
  ) {
    super(displayName(connection), "esConnection", vscode.TreeItemCollapsibleState.Collapsed);
    this.description = targetConnectionDescription(connection);
    this.tooltip = connection.connectionUrl || `${displayName(connection)} (ElasticSearch)`;
    this.iconPath = connectionTreeIcon(
      this.services.resources,
      connection,
      this.services.activeConnection.get(),
    );
    this.command = {
      command: "mysql.connection.open",
      title: "Open Connection",
      arguments: [this],
    };
    if (connection.disabled) {
      this.description = "closed";
      this.collapsibleState = vscode.TreeItemCollapsibleState.None;
    }
  }

  public async getChildren(): Promise<DatabaseTreeItem[]> {
    if (this.connection.disabled) return [];
    this.services.activeConnection.set(this.connection);
    try {
      const result = await this.actions.query<Record<string, unknown>>(this.connection, "GET /");
      const version = parseElasticsearchVersion(elasticPayload(result));
      if (version) this.description = `version: ${version}`;
    } catch (error) {
      this.services.logger.debug("Elasticsearch version unavailable", error);
    }
    return [
      new ModernQueryGroupNode(this.connection, this.services, this),
      new ElasticIndexGroupNode(this.connection, this.services, this.actions, this, this.refreshTree),
      new ElasticStreamGroupNode(this.connection, this.services, this.actions, this, this.refreshTree),
    ];
  }

  public async newQuery(): Promise<string> {
    const document = await this.actions.openSqlDocument(ELASTIC_CONNECTION_QUERY);
    await this.actions.showTextDocument(document);
    return ELASTIC_CONNECTION_QUERY;
  }

  public async openConnection(): Promise<void> {
    await this.services.connections.getConnection(this.connection);
    this.services.activeConnection.set(this.connection);
    this.actions.showInformation(`Connected to ${displayName(this.connection)}.`);
  }

  public async selectDB(): Promise<void> {
    await this.openConnection();
  }

  public async disableConnection(): Promise<void> {
    this.actions.showInformation("Elasticsearch connection state is managed from its configuration.");
  }

  public async deleteConnection(): Promise<void> {
    if (await this.actions.confirm(`Delete connection ${displayName(this.connection)}?`)) {
      await this.onDelete(this.connection.id);
    }
  }

  public copyName(): Promise<void> {
    return this.actions.writeClipboard(displayName(this.connection));
  }

  public copy(): Promise<void> {
    return this.copyName();
  }

  public async copyKey(): Promise<void> {
    await this.actions.writeClipboard(this.connection.connectionUrl || this.connection.host || displayName(this.connection));
  }

  public async openTerminal(): Promise<void> {
    const state = { target: this.connection, connection: this.connection };
    await this.services.webviews.createWebviewPanel({
      title: `${displayName(this.connection)} · terminal`,
      type: "xterm",
      route: "xterm",
      state,
      eventHandler: (handler) => registerWebviewUtilityProtocols({
        route: "xterm",
        target: this.connection,
        state,
        webviewState: state,
        services: this.services,
        handler,
      }),
    });
  }

  public async dump(options: ElasticsearchDumpOptions = {}): Promise<void> {
    await dumpElasticsearch(this.services, this.connection, undefined, options);
  }

  public async restore(): Promise<void> {
    await restoreElasticsearch(this.services, this.connection);
    this.refreshTree();
  }
}

class Neo4jLabelGroupNode extends DatabaseTreeItem {
  private filter = "";

  public constructor(
    private readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent: DatabaseTreeItem,
    private readonly refreshTree: () => void,
  ) {
    const presentation = targetSpecializedTreePresentations.neo4jNodeGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetPresentationTreeIcon(this.services.resources, presentation);
    this.command = {
      command: "mysql.node.filterChildren",
      title: "Filter Neo4j nodes",
      arguments: [this],
    };
  }

  public setFilter(value: string): void {
    this.filter = value.trim().toLocaleLowerCase();
    this.refreshTree();
  }

  public async getChildren(): Promise<Neo4jLabelNode[]> {
    const result = await this.actions.query<Record<string, unknown>>(
      this.connection,
      "CALL db.labels()",
    );
    const labels = resultRows(result)
      .map((row) => rowText(row, "label", "name"))
      .filter(Boolean)
      .map(
        (label) =>
          new Neo4jLabelNode(
            label,
            this.connection,
            this.services,
            this.actions,
            this,
          ),
      );
    return [
      new Neo4jLabelNode("*", this.connection, this.services, this.actions, this),
      ...labels.filter((node) => String(node.label) !== "*"),
    ].filter(
      (node) =>
        String(node.label) === "*" ||
        String(node.label).toLocaleLowerCase().includes(this.filter),
    );
  }

  public async createTemplate(): Promise<string> {
    const sql = "CREATE (n:Label {name: \"Database Client\"}) RETURN n;";
    const document = await this.actions.openSqlDocument(sql);
    await this.actions.showTextDocument(document);
    return sql;
  }
}

class Neo4jLabelNode extends DatabaseTreeItem {
  public constructor(
    label: string,
    private readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent: Neo4jLabelGroupNode,
  ) {
    super(label, "neo4jLabel");
    this.iconPath = targetThemeTreeIcon("split-horizontal");
    this.command = {
      command: "mysql.table.find",
      title: "Run Select Statement",
      arguments: [this, true],
    };
  }

  public async viewData(): Promise<void> {
    const label = String(this.label).replaceAll("`", "``");
    const sql = `MATCH (n${label === "*" ? "" : `:\`${label}\``}) RETURN n LIMIT ${this.services.config.get("defaultSelectLimit")}`;
    const result = await this.actions.query<Record<string, unknown>>(
      this.connection,
      sql,
    );
    await openResultView(this.services, String(this.label), sql, result);
  }

  public async drop(): Promise<void> {
    const label = String(this.label).replaceAll("`", "``");
    if (!(await this.actions.confirm(`Delete Neo4j nodes ${String(this.label)}?`))) return;
    const sql = `MATCH (n${label === "*" ? "" : `:\`${label}\``}) DELETE n`;
    await this.actions.query(this.connection, sql);
    this.actions.showInformation(`Deleted Neo4j nodes ${String(this.label)}.`);
  }
}

class Neo4jRelationGroupNode extends DatabaseTreeItem {
  private filter = "";

  public constructor(
    public readonly parent: DatabaseTreeItem,
    private readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    private readonly refreshTree: () => void,
  ) {
    const presentation = targetSpecializedTreePresentations.neo4jRelationGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetPresentationTreeIcon(this.services.resources, presentation);
    this.command = {
      command: "mysql.node.filterChildren",
      title: "Filter Neo4j relationships",
      arguments: [this],
    };
  }

  public setFilter(value: string): void {
    this.filter = value.trim().toLocaleLowerCase();
    this.refreshTree();
  }

  public async getChildren(): Promise<Neo4jRelationNode[]> {
    const result = await this.actions.query<Record<string, unknown>>(
      this.connection,
      "CALL db.relationshipTypes()",
    );
    const relations = resultRows(result)
      .map((row) => rowText(row, "relationshipType", "relationship_type", "name"))
      .filter(Boolean)
      .map(
        (relation) =>
          new Neo4jRelationNode(
            relation,
            this,
            this.connection,
            this.services,
            this.actions,
          ),
      );
    return [
      new Neo4jRelationNode("*", this, this.connection, this.services, this.actions),
      ...relations.filter((node) => String(node.label) !== "*"),
    ].filter(
      (node) =>
        String(node.label) === "*" ||
        String(node.label).toLocaleLowerCase().includes(this.filter),
    );
  }

  public async createTemplate(): Promise<string> {
    const sql = "MATCH (a)-[r:RELATES_TO]->(b) RETURN a, r, b;";
    const document = await this.actions.openSqlDocument(sql);
    await this.actions.showTextDocument(document);
    return sql;
  }
}

class Neo4jRelationNode extends DatabaseTreeItem {
  public constructor(
    label: string,
    public readonly parent: Neo4jRelationGroupNode,
    private readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
  ) {
    super(label, "neo4jRelation");
    this.iconPath = new vscode.ThemeIcon("split-horizontal");
    this.command = {
      command: "mysql.neo4j.relation.find",
      title: "Show Neo4j Relationship Info",
      arguments: [this, true],
    };
  }

  public async viewData(): Promise<void> {
    const relation = String(this.label).replaceAll("`", "``");
    const sql = `MATCH p=()-[r${relation === "*" ? "" : `:\`${relation}\``}]->() RETURN r LIMIT ${this.services.config.get("defaultSelectLimit")}`;
    const result = await this.actions.query<Record<string, unknown>>(
      this.connection,
      sql,
    );
    await openResultView(this.services, String(this.label), sql, result);
  }

  public async drop(): Promise<void> {
    const relation = String(this.label).replaceAll("`", "``");
    if (!(await this.actions.confirm(`Delete Neo4j relationships ${String(this.label)}?`))) return;
    const sql = `MATCH ()-[r${relation === "*" ? "" : `:\`${relation}\``}]->() DELETE r`;
    await this.actions.query(this.connection, sql);
    this.actions.showInformation(`Deleted Neo4j relationships ${String(this.label)}.`);
  }
}

type RabbitRecord = Record<string, unknown>;

function rabbitPath(...parts: string[]): string {
  return parts.map((part) => encodeURIComponent(part)).join("/");
}

function rabbitRequest(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: RabbitRecord,
): string {
  const request = `${method} ${path}`;
  return body === undefined
    ? request
    : `${request}\n${JSON.stringify(body, null, 2)}`;
}

class RabbitConnectionNode extends DatabaseTreeItem {
  public constructor(
    public readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    private readonly onDelete: (id: string) => Promise<void>,
    private readonly refreshTree: () => void,
    public readonly parent?: DatabaseTreeItem,
  ) {
    super(displayName(connection), "commonConnection", vscode.TreeItemCollapsibleState.Collapsed);
    this.description = targetConnectionDescription(connection);
    this.tooltip = connection.connectionUrl || `${displayName(connection)} (RabbitMQ)`;
    this.iconPath = connectionTreeIcon(
      this.services.resources,
      connection,
      this.services.activeConnection.get(),
    );
    this.command = {
      command: "mysql.connection.open",
      title: "Open Connection",
      arguments: [this],
    };
  }

  public async getChildren(): Promise<DatabaseTreeItem[]> {
    this.services.activeConnection.set(this.connection);
    const overview = resultRows(
      await this.actions.query<RabbitRecord>(this.connection, "GET /api/overview"),
    )[0];
    const version = overview ? rowText(overview, "product_version") : "";
    if (version) this.description = version;
    const refresh = this.refreshTree;
    return [
      new RabbitUserGroupNode(this, this.connection, this.actions, refresh),
      new RabbitVhostGroupNode(this, this.connection, this.services, this.actions, refresh),
    ];
  }

  public async openConnection(): Promise<void> {
    await this.services.connections.getConnection(this.connection);
    this.services.activeConnection.set(this.connection);
    this.actions.showInformation(`Connected to ${displayName(this.connection)}.`);
  }

  public async selectDB(): Promise<void> {
    await this.openConnection();
  }

  public async createVhost(): Promise<void> {
    const group = new RabbitVhostGroupNode(
      this,
      this.connection,
      this.services,
      this.actions,
      this.refreshTree,
    );
    await group.createVhost();
  }

  public async deleteConnection(): Promise<void> {
    if (await this.actions.confirm(`Delete connection ${displayName(this.connection)}?`)) {
      await this.onDelete(this.connection.id);
    }
  }

  public copyName(): Promise<void> {
    return this.actions.writeClipboard(displayName(this.connection));
  }

  public copy(): Promise<void> {
    return this.copyName();
  }
}

class RabbitVhostGroupNode extends DatabaseTreeItem {
  public constructor(
    public readonly parent: RabbitConnectionNode,
    private readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    private readonly refreshTree: () => void,
  ) {
    const presentation = targetSpecializedTreePresentations.rabbitVhostGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetPresentationTreeIcon(this.services.resources, presentation);
  }

  public async getChildren(): Promise<RabbitVhostNode[]> {
    const result = await this.actions.query<RabbitRecord>(this.connection, "GET /api/vhosts");
    return resultRows(result).map(
      (info) =>
        new RabbitVhostNode(
          info,
          this,
          this.connection,
          this.services,
          this.actions,
          this.refreshTree,
        ),
    );
  }

  public async createVhost(): Promise<void> {
    const name = await vscode.window.showInputBox({
      title: "Create Virtual Host",
      prompt: "Enter virtual host name",
      placeHolder: "e.g., /my-vhost",
    });
    if (!name?.trim()) return;
    await this.actions.query(
      this.connection,
      rabbitRequest("PUT", `/api/vhosts/${rabbitPath(name.trim())}`),
    );
    this.refreshTree();
    this.actions.showInformation(`Created virtual host ${name.trim()}.`);
  }
}

class RabbitVhostNode extends DatabaseTreeItem {
  public readonly vhost: string;

  public constructor(
    private readonly info: RabbitRecord,
    public readonly parent: RabbitVhostGroupNode,
    private readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    private readonly refreshTree: () => void,
  ) {
    const vhost = rowText(info, "name") || "/";
    super(vhost, "rabbitVhost", vscode.TreeItemCollapsibleState.Collapsed);
    this.vhost = vhost;
    this.description = `Messages: ${rowNumber(info, "messages") ?? 0}`;
    this.tooltip = `Cluster state: ${rowText(info, "cluster_state") || "running"}\nTracing: ${rowText(info, "tracing") || "false"}`;
    this.iconPath = new vscode.ThemeIcon("server");
  }

  public getChildren(): DatabaseTreeItem[] {
    return [
      new RabbitExchangeGroupNode(this, this.connection, this.actions, this.refreshTree),
      new RabbitQueueGroupNode(
        this,
        this.connection,
        this.services,
        this.actions,
        this.refreshTree,
      ),
    ];
  }

  public async deleteVhost(): Promise<void> {
    if (this.vhost === "/") {
      void vscode.window.showWarningMessage('Cannot delete default virtual host "/".');
      return;
    }
    if (!(await this.actions.confirm(`Delete virtual host ${this.vhost}?`))) return;
    await this.actions.query(
      this.connection,
      rabbitRequest("DELETE", `/api/vhosts/${rabbitPath(this.vhost)}`),
    );
    this.refreshTree();
    this.actions.showInformation(`Deleted virtual host ${this.vhost}.`);
  }
}

class RabbitExchangeGroupNode extends DatabaseTreeItem {
  public constructor(
    public readonly parent: RabbitVhostNode,
    private readonly connection: StoredConnection,
    private readonly actions: TreeActionHost,
    private readonly refreshTree: () => void,
  ) {
    const presentation = targetSpecializedTreePresentations.rabbitExchangeGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetThemePresentationIcon(presentation);
  }

  public async getChildren(): Promise<RabbitExchangeNode[]> {
    const result = await this.actions.query<RabbitRecord>(
      this.connection,
      `GET /api/exchanges/${rabbitPath(this.parent.vhost)}`,
    );
    return resultRows(result).map(
      (info) => new RabbitExchangeNode(info, this, this.connection, this.actions, this.refreshTree),
    );
  }
}

class RabbitExchangeNode extends DatabaseTreeItem {
  public readonly exchange: string;

  public constructor(
    private readonly info: RabbitRecord,
    public readonly parent: RabbitExchangeGroupNode,
    private readonly connection: StoredConnection,
    private readonly actions: TreeActionHost,
    private readonly refreshTree: () => void,
  ) {
    const exchange = rowText(info, "name") || "(AMQP default)";
    super(exchange, "kafkaBroker", vscode.TreeItemCollapsibleState.Collapsed);
    this.exchange = exchange === "(AMQP default)" ? "" : exchange;
    this.description = rowText(info, "type");
    this.tooltip = rowText(info, "node", "nodeId");
    this.iconPath = new vscode.ThemeIcon("combine");
  }

  public async getChildren(): Promise<InfoTreeItem[]> {
    const result = await this.actions.query<RabbitRecord>(
      this.connection,
      `GET /api/bindings/${rabbitPath(this.parent.parent.vhost)}`,
    );
    return resultRows(result)
      .filter((binding) => {
        const source = rowText(binding, "source");
        return source === this.exchange
          || (this.exchange === "" && source === "(AMQP default)");
      })
      .map((binding) => {
        const destination = new InfoTreeItem(rowText(binding, "destination"));
        destination.description = rowText(binding, "routing_key");
        destination.iconPath = new vscode.ThemeIcon("record");
        return destination;
      });
  }
}

class RabbitQueueGroupNode extends DatabaseTreeItem {
  public constructor(
    public readonly parent: RabbitVhostNode,
    private readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    private readonly refreshTree: () => void,
  ) {
    const presentation = targetSpecializedTreePresentations.rabbitQueueGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetPresentationTreeIcon(this.services.resources, presentation);
  }

  public async getChildren(): Promise<RabbitQueueNode[]> {
    const result = await this.actions.query<RabbitRecord>(
      this.connection,
      `GET /api/queues/${rabbitPath(this.parent.vhost)}`,
    );
    return resultRows(result).map(
      (info) =>
        new RabbitQueueNode(
          info,
          this,
          this.connection,
          this.services,
          this.actions,
          this.refreshTree,
        ),
    );
  }

  public async reqCreate(): Promise<void> {
    const name = await vscode.window.showInputBox({
      title: "Create Queue",
      prompt: "Enter queue name",
    });
    if (!name?.trim()) return;
    await this.actions.query(
      this.connection,
      rabbitRequest("PUT", `/api/queues/${rabbitPath(this.parent.vhost, name.trim())}`, {
        durable: true,
      }),
    );
    this.refreshTree();
    this.actions.showInformation(`Created queue ${name.trim()}.`);
  }
}

class RabbitQueueNode extends DatabaseTreeItem {
  public readonly queue: string;
  public readonly vhost: string;

  public constructor(
    private readonly info: RabbitRecord,
    public readonly parent: RabbitQueueGroupNode,
    private readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    private readonly refreshTree: () => void,
  ) {
    const queue = rowText(info, "name");
    super(queue, "rabbitQueue", vscode.TreeItemCollapsibleState.Collapsed);
    this.queue = queue;
    this.vhost = rowText(info, "vhost") || parent.parent.vhost;
    this.description = `Ready: ${rowNumber(info, "messages_ready") ?? 0} Total: ${rowNumber(info, "messages") ?? 0}`;
    this.tooltip = `VHost: ${this.vhost}\nType: ${rowText(info, "type")}\nState: ${rowText(info, "state")}\nNode: ${rowText(info, "node")}`;
    this.iconPath = new vscode.ThemeIcon("record");
    this.command = {
      command: "mysql.rabbit.queue.inspect",
      title: "Inspect RabbitMQ Queue",
      arguments: [this],
    };
  }

  public async getChildren(): Promise<RabbitBindingNode[]> {
    const result = await this.actions.query<RabbitRecord>(
      this.connection,
      `GET /api/queues/${rabbitPath(this.vhost, this.queue)}/bindings`,
    );
    return resultRows(result).map(
      (binding) => new RabbitBindingNode(binding, this, this.connection, this.actions, this.refreshTree),
    );
  }

  public async reqCreateBinding(): Promise<void> {
    const exchangeRows = resultRows(
      await this.actions.query<RabbitRecord>(
        this.connection,
        `GET /api/exchanges/${rabbitPath(this.vhost)}`,
      ),
    );
    const exchanges = exchangeRows.map((info) => ({
      label: rowText(info, "name") || "(AMQP default)",
      description: rowText(info, "type"),
      exchange: rowText(info, "name"),
    }));
    if (!exchanges.length) {
      void vscode.window.showWarningMessage("No RabbitMQ exchanges found.");
      return;
    }
    const selected = await vscode.window.showQuickPick(exchanges, {
      title: "Create RabbitMQ Binding",
      placeHolder: "Select an exchange",
      ignoreFocusOut: true,
    });
    if (!selected) return;
    const routingKey = await vscode.window.showInputBox({
      title: "Create RabbitMQ Binding",
      prompt: "Enter routing key",
      placeHolder: "e.g., my.routing.key",
    });
    if (routingKey === undefined) return;
    await this.actions.query(
      this.connection,
      rabbitRequest(
        "POST",
        `/api/bindings/${rabbitPath(this.vhost, selected.exchange)}/q/${encodeURIComponent(this.queue)}`,
        { routing_key: routingKey, arguments: {} },
      ),
    );
    this.refreshTree();
    this.actions.showInformation(`Created binding to ${selected.label}.`);
  }

  public async prepareConsume(): Promise<string> {
    return openMessageTemplate(this.connection, "RabbitMQ", this.queue, "consumer", this.vhost);
  }

  public async prepareProduce(): Promise<string> {
    return openMessageTemplate(this.connection, "RabbitMQ", this.queue, "producer", this.vhost);
  }

  public async inspectMessages(): Promise<void> {
    const state = {
      connection: this.connection,
      queue: this.queue,
      vhost: this.vhost,
    };
    await this.services.webviews.createWebviewPanel({
      title: `${this.vhost === "/" ? "" : `${this.vhost} / `}${this.queue}`,
      type: `rabbitQueue:${this.connection.id}:${this.vhost}:${this.queue}`,
      route: "rabbitQueueView",
      state,
      eventHandler: (handler) => registerWebviewUtilityProtocols({
        route: "rabbitQueueView",
        target: state,
        state,
        webviewState: state,
        services: this.services,
        handler,
      }),
    });
  }

  public async reqDelete(): Promise<void> {
    if (!(await this.actions.confirm(`Delete RabbitMQ queue ${this.queue}?`))) return;
    await this.actions.query(
      this.connection,
      rabbitRequest("DELETE", `/api/queues/${rabbitPath(this.vhost, this.queue)}`),
    );
    this.refreshTree();
    this.actions.showInformation(`Deleted queue ${this.queue}.`);
  }

}

class RabbitBindingNode extends DatabaseTreeItem {
  public constructor(
    private readonly info: RabbitRecord,
    public readonly parent: RabbitQueueNode | RabbitExchangeNode,
    private readonly connection: StoredConnection,
    private readonly actions: TreeActionHost,
    private readonly refreshTree: () => void,
  ) {
    super(rowText(info, "routing_key"), "rabbitBinding");
    this.description = rowText(info, "source") || "(AMQP default)";
    this.tooltip = `Exchange: ${this.description}\nRouting Key: ${rowText(info, "routing_key")}`;
    this.iconPath = new vscode.ThemeIcon("combine");
  }

  public async reqDelete(): Promise<void> {
    const exchange = rowText(this.info, "source");
    const vhost = rowText(this.info, "vhost") || this.queueVhost();
    const queue = rowText(this.info, "destination") || this.queueName();
    const key = rowText(this.info, "properties_key", "routing_key");
    if (!(await this.actions.confirm(`Delete RabbitMQ binding ${key}?`))) return;
    await this.actions.query(
      this.connection,
      `DELETE /api/bindings/${rabbitPath(vhost, exchange)}/q/${encodeURIComponent(queue)}/${encodeURIComponent(key)}`,
    );
    this.refreshTree();
    this.actions.showInformation("Deleted RabbitMQ binding.");
  }

  private queueName(): string {
    return this.parent instanceof RabbitQueueNode
      ? this.parent.queue
      : rowText(this.info, "destination");
  }

  private queueVhost(): string {
    return this.parent instanceof RabbitQueueNode
      ? this.parent.vhost
      : this.parent.parent.parent.vhost;
  }
}

class RabbitUserGroupNode extends DatabaseTreeItem {
  public constructor(
    public readonly parent: RabbitConnectionNode,
    private readonly connection: StoredConnection,
    private readonly actions: TreeActionHost,
    private readonly refreshTree: () => void,
  ) {
    const presentation = targetSpecializedTreePresentations.rabbitUserGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetThemePresentationIcon(presentation);
  }

  public async getChildren(): Promise<RabbitUserNode[]> {
    const result = await this.actions.query<RabbitRecord>(this.connection, "GET /api/users");
    return resultRows(result).map(
      (info) => new RabbitUserNode(info, this, this.connection, this.actions, this.refreshTree),
    );
  }

  public async createUser(): Promise<void> {
    const username = await vscode.window.showInputBox({
      title: "Create User",
      prompt: "Enter username",
    });
    if (!username?.trim()) return;
    const password = await vscode.window.showInputBox({
      title: "Create User",
      prompt: "Enter password",
      password: true,
    });
    if (password === undefined) return;
    const tags = await vscode.window.showInputBox({
      title: "Create User",
      prompt: "Enter tags (comma separated, optional)",
      placeHolder: "e.g., administrator, management",
      value: "",
    });
    await this.actions.query(
      this.connection,
      rabbitRequest("PUT", `/api/users/${rabbitPath(username.trim())}`, {
        password,
        tags: tags || "",
      }),
    );
    this.refreshTree();
    this.actions.showInformation(`Created user ${username.trim()}.`);
  }
}

class RabbitUserNode extends DatabaseTreeItem {
  public constructor(
    private readonly info: RabbitRecord,
    public readonly parent: RabbitUserGroupNode,
    private readonly connection: StoredConnection,
    private readonly actions: TreeActionHost,
    private readonly refreshTree: () => void,
  ) {
    const tags = rowText(info, "tags");
    super(
      rowText(info, "name"),
      "rabbitUser",
      tags ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
    );
    this.description = tags || "no tags";
    this.tooltip = `Password hash algorithm: ${rowText(info, "password_hash") || "N/A"}`;
    this.iconPath = new vscode.ThemeIcon("person");
  }

  public getChildren(): RabbitRoleNode[] {
    return rowText(this.info, "tags")
      .split(",")
      .map((role) => role.trim())
      .filter(Boolean)
      .map((role) => new RabbitRoleNode(role, this));
  }

  public async deleteUser(): Promise<void> {
    if (!(await this.actions.confirm(`Delete RabbitMQ user ${String(this.label)}?`))) return;
    await this.actions.query(
      this.connection,
      rabbitRequest("DELETE", `/api/users/${rabbitPath(String(this.label))}`),
    );
    this.refreshTree();
    this.actions.showInformation(`Deleted user ${String(this.label)}.`);
  }

  public async updatePassword(): Promise<void> {
    const password = await vscode.window.showInputBox({
      title: "Update Password",
      prompt: `Enter new password for user ${String(this.label)}`,
      password: true,
    });
    if (password === undefined) return;
    await this.updateUser({ password, tags: rowText(this.info, "tags") });
    this.actions.showInformation(`Updated password for user ${String(this.label)}.`);
  }

  public async addRole(): Promise<void> {
    const role = await vscode.window.showInputBox({
      title: "Add Role",
      prompt: `Enter role/tag to add to user ${String(this.label)}`,
      placeHolder: "e.g., administrator, monitoring, management",
    });
    if (!role?.trim()) return;
    const roles = this.roles();
    if (roles.includes(role.trim())) {
      void vscode.window.showWarningMessage(`User ${String(this.label)} already has role ${role.trim()}.`);
      return;
    }
    roles.push(role.trim());
    await this.updateUser({
      password: rowText(this.info, "password_hash"),
      tags: roles.join(","),
    });
    this.info.tags = roles.join(",");
    this.refreshTree();
  }

  public async removeRole(roleName: string): Promise<void> {
    if (!(await this.actions.confirm(`Remove role '${roleName}' from user ${String(this.label)}?`))) return;
    const tags = this.roles().filter((role) => role !== roleName).join(",");
    await this.updateUser({
      password: rowText(this.info, "password_hash"),
      tags,
    });
    this.info.tags = tags;
    this.refreshTree();
  }

  private roles(): string[] {
    return rowText(this.info, "tags")
      .split(",")
      .map((role) => role.trim())
      .filter(Boolean);
  }

  private async updateUser(body: RabbitRecord): Promise<void> {
    await this.actions.query(
      this.connection,
      rabbitRequest("PUT", `/api/users/${rabbitPath(String(this.label))}`, body),
    );
  }
}

class RabbitRoleNode extends DatabaseTreeItem {
  public constructor(
    role: string,
    public readonly parent: RabbitUserNode,
  ) {
    super(role, "rabbitRole");
    this.iconPath = new vscode.ThemeIcon("shield-check");
    this.command = {
      command: "mysql.rabbit.role.delete",
      title: "Remove RabbitMQ Role",
      arguments: [this],
    };
  }

  public async removeRole(): Promise<void> {
    await this.parent.removeRole(String(this.label));
  }
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

class KafkaConnectionNode extends DatabaseTreeItem {
  public constructor(
    public readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    private readonly onDelete: (id: string) => Promise<void>,
    private readonly refreshTree: () => void,
    private readonly kafka = new KafkaTreeService(),
    public readonly parent?: DatabaseTreeItem,
  ) {
    super(displayName(connection), "commonConnection", vscode.TreeItemCollapsibleState.Collapsed);
    this.description = targetConnectionDescription(connection);
    this.tooltip = connection.connectionUrl || `${displayName(connection)} (Kafka)`;
    this.iconPath = connectionTreeIcon(
      this.services.resources,
      connection,
      this.services.activeConnection.get(),
    );
    this.command = {
      command: "mysql.connection.open",
      title: "Open Connection",
      arguments: [this],
    };
  }

  public getChildren(): DatabaseTreeItem[] {
    this.services.activeConnection.set(this.connection);
    return [
      new KafkaBrokerGroupNode(this, this.connection, this.kafka),
      new KafkaTopicGroupNode(this, this.connection, this.kafka, this.actions, this.refreshTree),
      new KafkaConsumerGroupGroupNode(this, this.connection, this.kafka, this.actions, this.refreshTree),
    ];
  }

  public async openConnection(): Promise<void> {
    await this.services.connections.getConnection(this.connection);
    this.services.activeConnection.set(this.connection);
    this.actions.showInformation(`Connected to ${displayName(this.connection)}.`);
  }

  public async selectDB(): Promise<void> {
    await this.openConnection();
  }

  public async deleteConnection(): Promise<void> {
    if (await this.actions.confirm(`Delete connection ${displayName(this.connection)}?`)) {
      await this.onDelete(this.connection.id);
    }
  }

  public copyName(): Promise<void> {
    return this.actions.writeClipboard(displayName(this.connection));
  }

  public copy(): Promise<void> {
    return this.copyName();
  }
}

class KafkaBrokerGroupNode extends DatabaseTreeItem {
  public constructor(
    public readonly parent: KafkaConnectionNode,
    private readonly connection: StoredConnection,
    private readonly kafka: KafkaTreeService,
  ) {
    const presentation = targetSpecializedTreePresentations.kafkaBrokerGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetThemePresentationIcon(presentation);
  }

  public async getChildren(): Promise<KafkaBrokerNode[]> {
    const brokers = await this.kafka.listBrokers(this.connection);
    return brokers
      .sort((left, right) => left.nodeId - right.nodeId)
      .map((broker) => new KafkaBrokerNode(broker, this, this.connection, this.kafka));
  }
}

class KafkaBrokerNode extends DatabaseTreeItem {
  public constructor(
    private readonly info: KafkaBrokerInfo,
    public readonly parent: KafkaBrokerGroupNode,
    private readonly connection: StoredConnection,
    private readonly kafka: KafkaTreeService,
  ) {
    super(`${info.host}:${info.port}`, "kafkaBroker", vscode.TreeItemCollapsibleState.Collapsed);
    this.tooltip = `${info.nodeId}`;
    this.iconPath = new vscode.ThemeIcon("server");
  }

  public async getChildren(): Promise<KafkaConfigNode[]> {
    const configs = await this.kafka.brokerConfigs(this.connection, String(this.info.nodeId));
    return configs.map((config) => new KafkaConfigNode(config, this, false));
  }
}

class KafkaConfigNode extends DatabaseTreeItem {
  public constructor(
    info: KafkaConfigInfo,
    public readonly parent: KafkaBrokerNode | KafkaTopicConfigGroupNode,
    topicConfig = false,
  ) {
    super(info.name, "info");
    this.description = info.value;
    this.iconPath = new vscode.ThemeIcon(
      "symbol-field",
      topicConfig && info.name.startsWith("retention")
        ? new vscode.ThemeColor("errorForeground")
        : undefined,
    );
  }
}

class KafkaTopicGroupNode extends DatabaseTreeItem {
  public constructor(
    public readonly parent: KafkaConnectionNode,
    private readonly connection: StoredConnection,
    private readonly kafka: KafkaTreeService,
    private readonly actions: TreeActionHost,
    private readonly refreshTree: () => void,
  ) {
    const presentation = targetSpecializedTreePresentations.kafkaTopicGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetThemePresentationIcon(presentation);
  }

  public async getChildren(): Promise<KafkaTopicNode[]> {
    const topics = await this.kafka.listTopics(this.connection);
    return topics
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((topic) => new KafkaTopicNode(topic, this, this.connection, this.kafka, this.actions, this.refreshTree));
  }

  public async reqCreate(): Promise<void> {
    const name = await vscode.window.showInputBox({
      title: "Create Kafka Topic",
      prompt: "Enter topic name",
    });
    if (!name?.trim()) return;
    const partitionValue = await vscode.window.showInputBox({
      title: "Create Kafka Topic",
      prompt: "Number of partitions",
      value: "1",
    });
    const partitions = parsePositiveInteger(partitionValue);
    if (!partitions) {
      this.actions.showError("Kafka topic partitions must be a positive integer.");
      return;
    }
    const replicationValue = await vscode.window.showInputBox({
      title: "Create Kafka Topic",
      prompt: "Replication factor",
      value: "1",
    });
    const replicationFactor = parsePositiveInteger(replicationValue);
    if (!replicationFactor) {
      this.actions.showError("Kafka topic replication factor must be a positive integer.");
      return;
    }
    await this.kafka.createTopic(
      this.connection,
      name.trim(),
      partitions,
      replicationFactor,
    );
    this.refreshTree();
    this.actions.showInformation(`Created Kafka topic ${name.trim()}.`);
  }
}

class KafkaTopicNode extends DatabaseTreeItem {
  public constructor(
    private readonly info: KafkaTopicInfo,
    public readonly parent: KafkaTopicGroupNode,
    private readonly connection: StoredConnection,
    private readonly kafka: KafkaTreeService,
    private readonly actions: TreeActionHost,
    private readonly refreshTree: () => void,
  ) {
    super(info.name, "kafkaTopic", vscode.TreeItemCollapsibleState.Collapsed);
    this.description = `(${info.partitions.length})`;
    this.iconPath = new vscode.ThemeIcon("record");
  }

  public getChildren(): DatabaseTreeItem[] {
    return [
      new KafkaTopicConfigGroupNode(this, this.connection, this.kafka),
      new KafkaTopicPartitionGroupNode(this, this.info, this.connection, this.kafka),
    ];
  }

  public async reqDelete(): Promise<void> {
    if (!(await this.actions.confirm(`Delete Kafka topic ${String(this.label)}?`))) return;
    await this.kafka.deleteTopic(this.connection, String(this.label));
    this.refreshTree();
    this.actions.showInformation(`Deleted Kafka topic ${String(this.label)}.`);
  }

  public async prepareConsume(): Promise<string> {
    return openMessageTemplate(this.connection, "Kafka", String(this.label), "consumer");
  }

  public async prepareProduce(): Promise<string> {
    return openMessageTemplate(this.connection, "Kafka", String(this.label), "producer");
  }
}

class KafkaTopicConfigGroupNode extends DatabaseTreeItem {
  public constructor(
    public readonly parent: KafkaTopicNode,
    private readonly connection: StoredConnection,
    private readonly kafka: KafkaTreeService,
  ) {
    const presentation = targetSpecializedTreePresentations.kafkaTopicConfigGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetThemePresentationIcon(presentation);
  }

  public async getChildren(): Promise<KafkaConfigNode[]> {
    const configs = await this.kafka.topicConfigs(this.connection, String(this.parent.label));
    return configs
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((config) => new KafkaConfigNode(config, this, true));
  }
}

class KafkaTopicPartitionGroupNode extends DatabaseTreeItem {
  public constructor(
    public readonly parent: KafkaTopicNode,
    private readonly info: KafkaTopicInfo,
    private readonly connection: StoredConnection,
    private readonly kafka: KafkaTreeService,
  ) {
    const presentation = targetSpecializedTreePresentations.kafkaTopicPartitionGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetThemePresentationIcon(presentation);
  }

  public async getChildren(): Promise<KafkaPartitionNode[]> {
    const offsets = await this.kafka.topicOffsets(this.connection, this.info.name);
    const metadata = new Map<number, KafkaPartitionInfo>(
      this.info.partitions.map((partition) => [partition.partitionId, partition]),
    );
    return offsets.map(
      (offset) => new KafkaPartitionNode(offset, metadata.get(offset.partition), this),
    );
  }
}

class KafkaPartitionNode extends DatabaseTreeItem {
  public constructor(
    offset: KafkaTopicOffsetInfo,
    metadata: KafkaPartitionInfo | undefined,
    public readonly parent: KafkaTopicPartitionGroupNode,
  ) {
    super(`Partition ${offset.partition}`, "info");
    this.description = `Offset: ${offset.offset}, Replicas: ${metadata?.replicas.length ?? 0}`;
    this.iconPath = new vscode.ThemeIcon("archive");
  }
}

class KafkaConsumerGroupGroupNode extends DatabaseTreeItem {
  public constructor(
    public readonly parent: KafkaConnectionNode,
    private readonly connection: StoredConnection,
    private readonly kafka: KafkaTreeService,
    private readonly actions: TreeActionHost,
    private readonly refreshTree: () => void,
  ) {
    const presentation = targetSpecializedTreePresentations.kafkaConsumerGroupGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetThemePresentationIcon(presentation);
  }

  public async getChildren(): Promise<KafkaConsumerGroupNode[]> {
    const groups = await this.kafka.listConsumerGroups(this.connection);
    return groups
      .sort((left, right) => left.groupId.localeCompare(right.groupId))
      .map(
        (group) =>
          new KafkaConsumerGroupNode(
            group,
            this,
            this.connection,
            this.kafka,
            this.actions,
            this.refreshTree,
          ),
      );
  }
}

class KafkaConsumerGroupNode extends DatabaseTreeItem {
  public readonly groupId: string;

  public constructor(
    private readonly info: KafkaConsumerGroupInfo,
    public readonly parent: KafkaConsumerGroupGroupNode,
    private readonly connection: StoredConnection,
    private readonly kafka: KafkaTreeService,
    private readonly actions: TreeActionHost,
    private readonly refreshTree: () => void,
  ) {
    super(info.groupId, "kafkaConsumerGroup", vscode.TreeItemCollapsibleState.Collapsed);
    this.groupId = info.groupId;
    this.iconPath = new vscode.ThemeIcon("rocket");
    this.tooltip = info.protocolType;
  }

  public async getChildren(): Promise<DatabaseTreeItem[]> {
    const detail = await this.kafka.describeConsumerGroup(this.connection, this.groupId);
    this.description = detail.state;
    return [
      new KafkaOffsetGroupNode(this, this.connection, this.kafka, this.refreshTree),
      ...detail.members.map((member) => new KafkaConsumerNode(member, this)),
    ];
  }

  public async reqDelete(): Promise<void> {
    if (!(await this.actions.confirm(`Delete Kafka consumer group ${this.groupId}?`))) return;
    await this.kafka.deleteConsumerGroup(this.connection, this.groupId);
    this.refreshTree();
    this.actions.showInformation(`Deleted Kafka consumer group ${this.groupId}.`);
  }
}

class KafkaOffsetGroupNode extends DatabaseTreeItem {
  public constructor(
    public readonly parent: KafkaConsumerGroupNode,
    private readonly connection: StoredConnection,
    private readonly kafka: KafkaTreeService,
    private readonly refreshTree: () => void,
  ) {
    const presentation = targetSpecializedTreePresentations.kafkaOffsetGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetThemePresentationIcon(presentation);
  }

  public async getChildren(): Promise<KafkaOffsetNode[]> {
    const offsets = await this.kafka.consumerGroupOffsets(
      this.connection,
      this.parent.groupId,
      [],
    );
    return offsets.map(
      (offset) => new KafkaOffsetNode(offset, this, this.connection, this.kafka, this.refreshTree),
    );
  }
}

class KafkaOffsetNode extends DatabaseTreeItem {
  public constructor(
    private readonly info: KafkaGroupOffsetInfo,
    public readonly parent: KafkaOffsetGroupNode,
    private readonly connection: StoredConnection,
    private readonly kafka: KafkaTreeService,
    private readonly refreshTree: () => void,
  ) {
    super(
      `${info.topic}#${info.partition} -> Offset: ${info.offset}`,
      "kafkaOffset",
    );
    this.iconPath = new vscode.ThemeIcon("compass-dot");
  }

  public async setOffset(): Promise<void> {
    const value = await vscode.window.showInputBox({
      title: "Set Kafka Offset",
      value: this.info.offset,
    });
    if (value === undefined) return;
    if (!/^\d+$/.test(value.trim())) {
      void vscode.window.showErrorMessage("Kafka offset must be a non-negative integer.");
      return;
    }
    await this.kafka.setOffset(
      this.connection,
      this.parent.parent.groupId,
      this.info.topic,
      this.info.partition,
      value.trim(),
    );
    this.refreshTree();
  }

  public async resetOffset(): Promise<void> {
    if (!(await vscode.window.showWarningMessage(
      `Reset Kafka offset ${this.info.topic}#${this.info.partition}?`,
      { modal: true },
      "Reset",
    ) === "Reset")) return;
    await this.kafka.resetOffset(
      this.connection,
      this.parent.parent.groupId,
      this.info.topic,
    );
    this.refreshTree();
  }
}

class KafkaConsumerNode extends DatabaseTreeItem {
  public constructor(
    info: KafkaConsumerMemberInfo,
    public readonly parent: KafkaConsumerGroupNode,
  ) {
    super(info.clientId, "kafkaConsumer");
    this.description = info.clientHost;
    this.tooltip = info.memberId;
    this.iconPath = new vscode.ThemeIcon("person");
  }
}

function keyValuePath(parentPath: string, childName: string): string {
  const parent = parentPath.replace(/\/+$/, "") || "/";
  const child = childName.trim().replace(/^\/+/, "");
  if (!child) return parent;
  return parent === "/" ? `/${child}` : `${parent}/${child}`;
}

function keyValueName(value: string): string {
  const normalized = value.replace(/\/+$/, "");
  const separator = normalized.lastIndexOf("/");
  return separator < 0 ? normalized : normalized.slice(separator + 1);
}

function keyValueCommand(
  operation: "CREATE" | "LIST" | "READ" | "WRITE" | "DELETE",
  path: string,
  body?: string,
): string {
  const command = `${operation} ${path}`;
  if (body === undefined) return command;
  return `${command}\n${body}`;
}

class KeyValueConnectionNode extends DatabaseTreeItem {
  public constructor(
    public readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    private readonly onDelete: (id: string) => Promise<void>,
    private readonly refreshTree: () => void,
    public readonly parent?: DatabaseTreeItem,
  ) {
    const isEtcd = connection.type === "etcd";
    super(
      displayName(connection),
      isEtcd ? "etcdConnection" : "keyValueConnection",
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    this.description = targetConnectionDescription(connection);
    this.tooltip = connection.connectionUrl || `${displayName(connection)} (${connection.type})`;
    this.iconPath = connectionTreeIcon(
      this.services.resources,
      connection,
      this.services.activeConnection.get(),
    );
    this.command = {
      command: "mysql.connection.open",
      title: "Open Connection",
      arguments: [this],
    };
  }

  public async getChildren(): Promise<KeyValueNode[]> {
    this.services.activeConnection.set(this.connection);
    const result = await this.actions.query(this.connection, keyValueCommand("LIST", "/"));
    return resultRows(result).map((row) => {
      const path = rowText(row, "path") || keyValuePath("/", rowText(row, "name"));
      const node = new KeyValueNode(
        rowText(row, "name") || keyValueName(path),
        path,
        this,
        this.connection,
        this.actions,
        this.refreshTree,
      );
      if (this.connection.type === "Zookeeper" && String(node.label) === "zookeeper") {
        node.iconPath = targetThemeTreeIcon("key", "charts.red");
      }
      return node;
    }).sort((left, right) => String(left.label).localeCompare(String(right.label)));
  }

  public async newNode(): Promise<void> {
    const name = await this.actions.input("Enter a new node name", "node");
    if (!name?.trim()) return;
    const path = keyValuePath("/", name);
    const operation = this.connection.type === "Zookeeper" ? "CREATE" : "WRITE";
    await this.actions.query(this.connection, keyValueCommand(operation, path));
    this.refreshTree();
  }

  public async openConnection(): Promise<void> {
    await this.services.connections.getConnection(this.connection);
    this.services.activeConnection.set(this.connection);
    this.actions.showInformation(`Connected to ${displayName(this.connection)}.`);
  }

  public async selectDB(): Promise<void> {
    await this.openConnection();
  }

  public async deleteConnection(): Promise<void> {
    if (await this.actions.confirm(`Delete connection ${displayName(this.connection)}?`)) {
      await this.onDelete(this.connection.id);
    }
  }

  public copyName(): Promise<void> {
    return this.actions.writeClipboard(displayName(this.connection));
  }

  public copy(): Promise<void> {
    return this.copyName();
  }
}

class KeyValueNode extends DatabaseTreeItem {
  public constructor(
    label: string,
    public readonly path: string,
    public readonly parent: KeyValueConnectionNode | KeyValueNode,
    public readonly connection: StoredConnection,
    private readonly actions: TreeActionHost,
    private readonly refreshTree: () => void,
  ) {
    const isEtcd = connection.type === "etcd";
    super(
      label,
      isEtcd ? "etcdNode" : "keyValueNode",
      isEtcd ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed,
    );
    this.iconPath = targetThemeTreeIcon("key", "charts.yellow");
    this.command = {
      command: "mysql.keyValue.node.edit",
      title: "Edit Data",
      arguments: [this, true],
    };
  }

  public async getChildren(): Promise<KeyValueNode[]> {
    if (this.connection.type === "etcd") return [];
    const result = await this.actions.query(this.connection, keyValueCommand("LIST", this.path));
    return resultRows(result).map((row) => {
      const childPath = rowText(row, "path") || keyValuePath(this.path, rowText(row, "name"));
      return new KeyValueNode(
        rowText(row, "name") || keyValueName(childPath),
        childPath,
        this,
        this.connection,
        this.actions,
        this.refreshTree,
      );
    }).sort((left, right) => String(left.label).localeCompare(String(right.label)));
  }

  public async newNode(): Promise<void> {
    const name = await this.actions.input("Enter a new node name", "node");
    if (!name?.trim()) return;
    const childPath = keyValuePath(this.path, name);
    const operation = this.connection.type === "Zookeeper" ? "CREATE" : "WRITE";
    await this.actions.query(this.connection, keyValueCommand(operation, childPath));
    this.refreshTree();
  }

  public async reqDelete(): Promise<void> {
    if (!(await this.actions.confirm(`Delete key-value node ${this.path}?`))) return;
    await this.actions.query(this.connection, keyValueCommand("DELETE", this.path));
    this.refreshTree();
  }

  public async editData(): Promise<void> {
    const result = await this.actions.query(this.connection, keyValueCommand("READ", this.path));
    const value = rowText(resultRows(result)[0] || {}, "value", "content");
    const document = await vscode.workspace.openTextDocument({
      content: value,
      language: "text",
    });
    await this.actions.showTextDocument(document);
    const saveSubscription = vscode.workspace.onDidSaveTextDocument((saved) => {
      if (saved.uri.toString() !== document.uri.toString()) return;
      void this.actions
        .query(this.connection, keyValueCommand("WRITE", this.path, saved.getText()))
        .catch((error) => this.actions.showError(error instanceof Error ? error.message : String(error)));
    });
    const closeSubscription = vscode.workspace.onDidCloseTextDocument((closed) => {
      if (closed.uri.toString() !== document.uri.toString()) return;
      saveSubscription.dispose();
      closeSubscription.dispose();
    });
  }
}

class LokiConnectionNode extends DatabaseTreeItem {
  public constructor(
    public readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    private readonly onDelete: (id: string) => Promise<void>,
    private readonly refreshTree: () => void,
    public readonly parent?: DatabaseTreeItem,
  ) {
    super(displayName(connection), "commonConnection", vscode.TreeItemCollapsibleState.Collapsed);
    this.description = targetConnectionDescription(connection);
    this.tooltip = connection.connectionUrl || `${displayName(connection)} (Loki)`;
    this.iconPath = connectionTreeIcon(
      this.services.resources,
      connection,
      this.services.activeConnection.get(),
    );
    this.command = {
      command: "mysql.connection.open",
      title: "Open Connection",
      arguments: [this],
    };
  }

  public getChildren(): DatabaseTreeItem[] {
    this.services.activeConnection.set(this.connection);
    return [
      new LokiLabelGroupNode(this, this.connection, this.services, this.actions, this.refreshTree),
      new LokiSeriesGroupNode(this, this.connection, this.services, this.actions, this.refreshTree),
    ];
  }

  public async openConnection(): Promise<void> {
    await this.services.connections.getConnection(this.connection);
    this.services.activeConnection.set(this.connection);
    this.actions.showInformation(`Connected to ${displayName(this.connection)}.`);
  }

  public async selectDB(): Promise<void> {
    await this.openConnection();
  }

  public async deleteConnection(): Promise<void> {
    if (await this.actions.confirm(`Delete connection ${displayName(this.connection)}?`)) {
      await this.onDelete(this.connection.id);
    }
  }

  public copyName(): Promise<void> {
    return this.actions.writeClipboard(displayName(this.connection));
  }

  public copy(): Promise<void> {
    return this.copyName();
  }
}

class LokiLabelGroupNode extends DatabaseTreeItem {
  private filter = "";

  public constructor(
    public readonly parent: LokiConnectionNode,
    private readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    private readonly refreshTree: () => void,
  ) {
    const presentation = targetSpecializedTreePresentations.lokiLabelGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetPresentationTreeIcon(this.services.resources, presentation);
    this.command = {
      command: "mysql.node.filterChildren",
      title: "Filter labels",
      arguments: [this],
    };
  }

  public setFilter(value: string): void {
    this.filter = value.trim().toLocaleLowerCase();
    this.refreshTree();
  }

  public async getChildren(): Promise<Array<LokiLabelNameGroupNode | InfoTreeItem>> {
    const result = await this.actions.query(this.connection, "GET /loki/api/v1/labels");
    const labels = resultRows(result)
      .map((row) => rowText(row, "name", "value"))
      .filter((name) => name && name.toLocaleLowerCase().includes(this.filter))
      .filter((name) => name !== "filename");
    if (labels.length === 0) {
      return [new InfoTreeItem("No labels found!")];
    }
    return labels.map(
      (name) => new LokiLabelNameGroupNode(name, this, this.connection, this.services, this.actions),
    );
  }
}

class LokiLabelNameGroupNode extends DatabaseTreeItem {
  public constructor(
    label: string,
    public readonly parent: LokiLabelGroupNode,
    private readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
  ) {
    const presentation = targetSpecializedTreePresentations.lokiLabelNameGroup;
    super(
      label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetPresentationTreeIcon(this.services.resources, presentation);
    this.command = {
      command: "mysql.node.filterChildren",
      title: "Filter label values",
      arguments: [this],
    };
  }

  public async getChildren(): Promise<LokiLabelNode[]> {
    const result = await this.actions.query(
      this.connection,
      `GET /loki/api/v1/label/${encodeURIComponent(String(this.label))}/values`,
    );
    return resultRows(result).map(
      (row) => new LokiLabelNode(
        rowText(row, "value", "name") || String(row),
        this,
        this.connection,
        this.services,
        this.actions,
      ),
    );
  }
}

class LokiLabelNode extends DatabaseTreeItem {
  public constructor(
    label: string,
    public readonly parent: LokiLabelNameGroupNode,
    private readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
  ) {
    super(label, "lokiLabel");
    this.iconPath = new vscode.ThemeIcon("split-horizontal");
    this.command = {
      command: "mysql.loki.label.viewLog",
      title: "View Label Logs",
      arguments: [this],
    };
  }

  public async getChildren(): Promise<DatabaseTreeItem[]> {
    return [];
  }

  public async viewLog(labelName = String(this.label)): Promise<void> {
    const state = {
      connection: this.connection,
      parentLabel: String(this.parent.label),
      labelName,
    };
    await this.services.webviews.createWebviewPanel({
      title: `${state.parentLabel}=${state.labelName}`,
      type: "lokiLog",
      route: "lokiLog",
      state,
      eventHandler: (handler) => registerWebviewUtilityProtocols({
        route: "lokiLog",
        target: state,
        state,
        webviewState: state,
        services: this.services,
        handler,
      }),
    });
  }
}

class LokiSeriesGroupNode extends DatabaseTreeItem {
  private filter = "";

  public constructor(
    public readonly parent: LokiConnectionNode,
    private readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    private readonly refreshTree: () => void,
  ) {
    const presentation = targetSpecializedTreePresentations.lokiSeriesGroup;
    super(
      presentation.label,
      presentation.contextValue,
      targetPresentationCollapsibleState(presentation),
    );
    this.iconPath = targetPresentationTreeIcon(this.services.resources, presentation);
    this.command = {
      command: "mysql.node.filterChildren",
      title: "Filter series",
      arguments: [this],
    };
  }

  public setFilter(value: string): void {
    this.filter = value.trim().toLocaleLowerCase();
    this.refreshTree();
  }

  public async getChildren(): Promise<LokiSeriesNode[]> {
    const result = await this.actions.query(this.connection, "GET /loki/api/v1/series");
    return resultRows(result)
      .map((row) => {
        const stream = rowValue(row, "stream");
        const metadata = stream && typeof stream === "object" && !Array.isArray(stream)
          ? stream as Record<string, unknown>
          : row;
        const name = rowText(metadata, "filename");
        return { name, job: rowText(metadata, "job") };
      })
      .filter((item) => item.name && item.name.toLocaleLowerCase().includes(this.filter))
      .map((item) => new LokiSeriesNode(item.name, item.job, this));
  }
}

class LokiSeriesNode extends InfoTreeItem {
  public constructor(
    name: string,
    job: string,
    public readonly parent: LokiSeriesGroupNode,
  ) {
    super(name);
    this.description = job || undefined;
    this.iconPath = new vscode.ThemeIcon("cloud");
  }
}

class Neo4jDatabaseNode extends DatabaseTreeItem {
  public constructor(
    public readonly database: string,
    public readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent: ModernNoSqlConnectionNode,
    private readonly refreshTree: () => void,
  ) {
    super(database, "database", vscode.TreeItemCollapsibleState.Collapsed);
    const active = isActiveDatabaseTreeItem(
      services.activeConnection.get(),
      connection,
      database,
      undefined,
    );
    this.iconPath = targetThemeTreeIcon("database", active ? "charts.blue" : "dropdown.foreground");
  }

  public getChildren(): DatabaseTreeItem[] {
    return [
      new ModernQueryGroupNode(this.connection, this.services, this),
      new Neo4jLabelGroupNode(
        this.connection,
        this.services,
        this.actions,
        this,
        this.refreshTree,
      ),
      new Neo4jRelationGroupNode(
        this,
        this.connection,
        this.services,
        this.actions,
        this.refreshTree,
      ),
    ];
  }
}

export class ModernNoSqlConnectionNode extends DatabaseTreeItem {
  public constructor(
    public readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    private readonly onDelete: (id: string) => Promise<void>,
    public readonly parent?: DatabaseTreeItem,
    private readonly refreshTree: () => void = () => undefined,
  ) {
    const contextValue = targetSpecializedConnectionContext(connection.type);
    super(
      displayName(connection),
      contextValue,
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    this.description = targetConnectionDescription(connection);
    this.tooltip = connection.connectionUrl || `${displayName(connection)} (${connection.type})`;
    this.iconPath = connectionTreeIcon(
      this.services.resources,
      connection,
      this.services.activeConnection.get(),
    );
    if (connection.disabled) {
      this.description = "closed";
      this.collapsibleState = vscode.TreeItemCollapsibleState.None;
    }
  }

  public async getChildren(): Promise<DatabaseTreeItem[]> {
    if (this.connection.disabled) {
      return [new InfoTreeItem("Connection is disabled.")];
    }
    this.services.activeConnection.set(this.connection);
    if (this.connection.type === "MongoDB") {
      if (this.connection.database) {
        return [
          new MongoDatabaseNode(
            this.connection.database,
            this.connection,
            this.services,
            this.actions,
            this,
            this.refreshTree,
          ),
        ];
      }
      const result = await this.actions.query<Record<string, unknown>>(
        this.connection,
        "show dbs",
      );
      return resultRows(result).map(
        (row) =>
          new MongoDatabaseNode(
            rowText(row, "name", "database"),
            this.connection,
            this.services,
            this.actions,
            this,
            this.refreshTree,
          ),
      );
    }
    if (this.connection.type === "Neo4j") {
      const result = await this.actions.query<Record<string, unknown>>(
        this.connection,
        "SHOW DATABASES yield name AS Database",
      );
      const names = resultRows(result)
        .map((row) => rowText(row, "Database", "database", "name"))
        .filter(Boolean);
      const databases = names.length > 0 ? names : [this.connection.database || "neo4j"];
      return databases.map(
        (database) => new Neo4jDatabaseNode(
          database,
          this.connection,
          this.services,
          this.actions,
          this,
          this.refreshTree,
        ),
      );
    }
    return [new InfoTreeItem(`NoSQL tree support for ${this.connection.type} is not configured.`)];
  }

  public copyName(): Promise<void> {
    return this.actions.writeClipboard(displayName(this.connection));
  }

  public copy(): Promise<void> {
    return this.copyName();
  }

  public async openConnection(): Promise<void> {
    await this.services.connections.getConnection(this.connection);
    this.services.activeConnection.set(this.connection);
    this.actions.showInformation(`Connected to ${displayName(this.connection)}.`);
  }

  public async deleteConnection(): Promise<void> {
    if (await this.actions.confirm(`Delete connection ${displayName(this.connection)}?`)) {
      await this.onDelete(this.connection.id);
    }
  }

  public async selectDB(): Promise<void> {
    await this.openConnection();
  }

  public async dump(): Promise<void> {
    await this.openRoute("dump");
  }

  public async restore(): Promise<void> {
    await this.openRoute("restore");
  }

  public async openNeo4jBrowser(): Promise<void> {
    await this.openRoute("neo4j-browser");
  }

  private async openRoute(route: string): Promise<void> {
    await this.services.webviews.createWebviewPanel({
      title: `${displayName(this.connection)} · ${route}`,
      type: route,
      route,
      state: { connection: this.connection },
    });
  }
}

export class ModernDatabaseTreeProvider
  implements vscode.TreeDataProvider<DatabaseTreeItem>
{
  private readonly changes = new vscode.EventEmitter<DatabaseTreeItem | undefined>();
  public readonly onDidChangeTreeData = this.changes.event;
  private readonly actions: TreeActionHost;

  public constructor(
    private readonly services: ExtensionServices,
    private readonly stateKey: string,
  ) {
    this.actions = createActionHost(services);
  }

  public getTreeItem(element: DatabaseTreeItem): vscode.TreeItem {
    return element;
  }

  public getParent(element: DatabaseTreeItem): DatabaseTreeItem | undefined {
    if (element instanceof ModernTableNode) return element.parent;
    if (element instanceof ModernDatabaseNode) return element.parent;
    const candidate = element as DatabaseTreeItem & {
      readonly parent?: DatabaseTreeItem;
    };
    return candidate.parent;
  }

  public async getChildren(element?: DatabaseTreeItem): Promise<DatabaseTreeItem[]> {
    if (element && "getChildren" in element && typeof element.getChildren === "function") {
      try {
        return await element.getChildren();
      } catch (error) {
        this.services.logger.error("Database tree load failed", error);
        return [new InfoTreeItem(error instanceof Error ? error.message : String(error))];
      }
    }
    const raw = this.services.state.get<unknown>(this.stateKey, {});
    return buildDatabaseConnectionTree(
      recordsFromState(raw),
      this.services,
      this.actions,
      async (id) => this.removeConnection(id),
      (target) => this.refresh(target),
      async (oldGroup, newGroup) => this.renameGroup(oldGroup, newGroup),
    );
  }

  public refresh(element?: DatabaseTreeItem): void {
    this.changes.fire(element);
  }

  public dispose(): void {
    this.changes.dispose();
  }

  public async removeConnection(id: string): Promise<void> {
    const raw = this.services.state.get<unknown>(this.stateKey, {});
    if (Array.isArray(raw)) {
      await this.services.state.update(
        this.stateKey,
        raw.filter((item) => (item as StoredConnection)?.id !== id),
      );
    } else if (raw && typeof raw === "object") {
      const next = { ...(raw as Record<string, unknown>) };
      delete next[id];
      await this.services.state.update(this.stateKey, next);
    }
    await this.services.connections.close(id);
    this.refresh();
  }

  private async renameGroup(oldGroup: string, newGroup: string): Promise<void> {
    const raw = this.services.state.get<unknown>(this.stateKey, {});
    await this.services.state.update(this.stateKey, renameGroupState(raw, oldGroup, newGroup));
    this.refresh();
  }
}

export class ModernNoSqlTreeProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private readonly changes = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  public readonly onDidChangeTreeData = this.changes.event;
  private readonly actions: TreeActionHost;

  public constructor(private readonly services: ExtensionServices) {
    this.actions = createActionHost(services);
  }

  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  public getParent(element: vscode.TreeItem): vscode.TreeItem | undefined {
    return "parent" in element
      ? (element as vscode.TreeItem & { parent?: vscode.TreeItem }).parent
      : undefined;
  }

  public async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element && "getChildren" in element && typeof element.getChildren === "function") {
      try {
        return await element.getChildren();
      } catch (error) {
        this.services.logger.error("NoSQL tree load failed", error);
        return [new InfoTreeItem(error instanceof Error ? error.message : String(error))];
      }
    }
    const raw = this.services.state.get<unknown>("nosql.connections", {});
    return buildNoSqlConnectionTree(
      recordsFromState(raw),
      this.services,
      (connection, parent) => {
        const onDelete = async (id: string) => this.removeConnection(id);
        if (connection.type === "RDP") {
          return new RdpConnectionNode(connection, this.services, onDelete, parent);
        }
        if (connection.type === "SSH" || connection.type === "SFTP") {
          return new SshConnectionNode(connection, this.services, onDelete, parent);
        }
        if (connection.type === "Docker") {
          return new DockerConnectionNode(
            connection,
            this.services,
            onDelete,
            () => this.refresh(),
            parent,
          );
        }
        if (["FTP", "S3", "WebDAV"].includes(connection.type)) {
          return new ResourceConnectionNode(
            connection,
            this.services,
            onDelete,
            () => this.refresh(),
            parent,
          );
        }
        if (!connection.disabled && (connection.type === "etcd" || connection.type === "Zookeeper")) {
          return new KeyValueConnectionNode(
            connection,
            this.services,
            this.actions,
            onDelete,
            () => this.refresh(),
            parent as DatabaseTreeItem | undefined,
          );
        }
        if (!connection.disabled && connection.type === "Loki") {
          return new LokiConnectionNode(
            connection,
            this.services,
            this.actions,
            onDelete,
            () => this.refresh(),
            parent as DatabaseTreeItem | undefined,
          );
        }
        if (!connection.disabled && connection.type === "RabbitMQ") {
          return new RabbitConnectionNode(
            connection,
            this.services,
            this.actions,
            onDelete,
            () => this.refresh(),
            parent as DatabaseTreeItem | undefined,
          );
        }
        if (!connection.disabled && connection.type === "Kafka") {
          return new KafkaConnectionNode(
            connection,
            this.services,
            this.actions,
            onDelete,
            () => this.refresh(),
            new KafkaTreeService(),
            parent as DatabaseTreeItem | undefined,
          );
        }
        if (!connection.disabled && connection.type === "Redis") {
          return new RedisConnectionNode(
            connection,
            this.services,
            this.actions,
            onDelete,
            parent as DatabaseTreeItem | undefined,
            () => this.refresh(),
          );
        }
        if (!connection.disabled && connection.type === "ElasticSearch") {
          return new ElasticConnectionNode(
            connection,
            this.services,
            this.actions,
            onDelete,
            () => this.refresh(),
            parent as DatabaseTreeItem | undefined,
          );
        }
        return new ModernNoSqlConnectionNode(
          connection,
          this.services,
          this.actions,
          onDelete,
          parent as DatabaseTreeItem | undefined,
          () => this.refresh(),
        );
      },
      async (oldGroup, newGroup) => this.renameGroup(oldGroup, newGroup),
    );
  }

  public refresh(element?: vscode.TreeItem): void {
    this.changes.fire(element);
  }

  public dispose(): void {
    this.changes.dispose();
  }

  public async removeConnection(id: string): Promise<void> {
    const raw = this.services.state.get<unknown>("nosql.connections", {});
    if (Array.isArray(raw)) {
      await this.services.state.update(
        "nosql.connections",
        raw.filter((item) => (item as StoredConnection)?.id !== id),
      );
    } else if (raw && typeof raw === "object") {
      const next = { ...(raw as Record<string, unknown>) };
      delete next[id];
      await this.services.state.update("nosql.connections", next);
    }
    await this.services.connections.close(id);
    this.refresh();
  }

  private async renameGroup(oldGroup: string, newGroup: string): Promise<void> {
    const raw = this.services.state.get<unknown>("nosql.connections", {});
    await this.services.state.update("nosql.connections", renameGroupState(raw, oldGroup, newGroup));
    this.refresh();
  }
}

export function registerModernTreeViews(
  context: vscode.ExtensionContext,
  services: ExtensionServices,
): vscode.Disposable[] {
  if (typeof vscode.window.createTreeView !== "function") {
    return [];
  }
  const databaseProvider = new ModernDatabaseTreeProvider(services, "database.connections");
  const noSqlProvider = new ModernNoSqlTreeProvider(services);
  const databaseView = vscode.window.createTreeView("github.cweijan.mysql", {
    canSelectMany: true,
    treeDataProvider: databaseProvider,
  });
  const noSqlView = vscode.window.createTreeView("github.cweijan.nosql", {
    canSelectMany: true,
    treeDataProvider: noSqlProvider,
  });
  context.subscriptions.push(databaseProvider, noSqlProvider);
  return [databaseView, noSqlView];
}
