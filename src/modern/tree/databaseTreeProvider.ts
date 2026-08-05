import * as vscode from "vscode";

import type { ExtensionServices } from "../core/extensionServices";
import { SourceRecoveryPendingError } from "../core/errors";
import {
  openErDiagramPanel,
  registerWebviewUtilityProtocols,
} from "../commands/webviewUtilityProtocols";
import type {
  ConnectionOptions,
  Dialect,
  MetadataQueryExecutor,
  QueryResult,
} from "../database/types";
import {
  OracleSynonymGroup,
  OracleSynonymNode,
} from "../database/oracle/synonyms";
import { DockerConnectionNode } from "../remote/dockerTree";
import { SshConnectionNode } from "../remote/sshTreeProvider";
import { ResourceConnectionNode } from "../remote/resourceTreeProvider";

export interface StoredConnection extends ConnectionOptions {
  readonly name?: string;
  readonly disabled?: boolean;
  readonly group?: string;
  readonly readOnly?: boolean;
  readonly socketPath?: string;
  readonly connectionUrl?: string;
  readonly [key: string]: unknown;
}

interface TreeActionHost {
  query<Row = Record<string, unknown>>(
    connection: StoredConnection,
    sql: string,
  ): Promise<QueryResult<Row>>;
  openSqlDocument(sql: string): Promise<unknown>;
  showTextDocument(document: unknown): Promise<unknown>;
  writeClipboard(value: string): Promise<void>;
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
    return value.filter((item): item is StoredConnection => {
      return Boolean(item && typeof item === "object");
    });
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  return Object.entries(value as Record<string, StoredConnection>).map(
    ([id, item]) => ({
      ...item,
      id: item.id || id,
      type: item.type || "MySQL",
    }),
  );
}

function displayName(connection: StoredConnection): string {
  return connection.name || connection.id || connection.host || connection.type;
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

export abstract class DatabaseTreeItem extends vscode.TreeItem {
  public constructor(
    label: string,
    public readonly contextValue: string,
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

export class ModernTableColumnNode extends DatabaseTreeItem {
  public constructor(
    public readonly meta: Record<string, unknown>,
    public readonly parentTable: ModernTableNode,
    public readonly index: number,
  ) {
    const name = rowText(meta, "name", "column_name", "COLUMN_NAME");
    super(name, "column");
    this.description = rowText(meta, "type", "data_type", "DATA_TYPE");
    this.tooltip = [
      name,
      this.description,
      rowText(meta, "comment", "COLUMN_COMMENT"),
    ]
      .filter(Boolean)
      .join("\n");
    this.iconPath = new vscode.ThemeIcon("symbol-field");
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
  public readonly label: string;
  public readonly tableWithSchema: string;

  public constructor(
    public readonly meta: Record<string, unknown>,
    public readonly connection: StoredConnection,
    public readonly dialect: Dialect,
    public readonly schema: string | null,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent?: DatabaseTreeItem,
  ) {
    const label = rowText(meta, "name", "table_name", "TABLE_NAME");
    super(label, "table", vscode.TreeItemCollapsibleState.Collapsed);
    this.label = label;
    this.tableWithSchema = schema
      ? `${dialect.quoteIdentifier(schema)}.${dialect.quoteIdentifier(label)}`
      : dialect.quoteIdentifier(label);
    const rows = rowNumber(meta, "table_rows", "rows", "TABLE_ROWS");
    const comment = rowText(meta, "comment", "TABLE_COMMENT");
    this.description = [comment, rows === undefined ? "" : `Rows ${rows}`]
      .filter(Boolean)
      .join(" ");
    this.tooltip = [this.tableWithSchema, comment].filter(Boolean).join("\n");
    this.iconPath = new vscode.ThemeIcon("table");
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
    const normalizedTerm = term.trim();
    if (!normalizedTerm) {
      return null;
    }
    const numericSearch = /^\d+$/.test(normalizedTerm);
    const conditions = (await this.getChildren())
      .filter((column) => {
        const type = String(column.description || "");
        return Boolean(type) && (numericSearch || !/binary|blob|json|geometry/i.test(type));
      })
      .map((column) => {
        const name = this.dialect.quoteIdentifier(String(column.label));
        const type = String(column.description || "");
        return numericSearch && /bigint|bool|decimal|double|float|int|numeric|number|real|serial|smallint/i.test(type)
          ? `${name} = ${normalizedTerm}`
          : `${name} LIKE ${this.dialect.escapeLiteral(`%${normalizedTerm}%`)}`;
      });
    if (conditions.length === 0) {
      return null;
    }
    const pageSql = this.dialect.buildPageSql(this.schema, this.tableWithSchema, 10);
    return pageSql.replace(
      this.tableWithSchema,
      `${this.tableWithSchema} WHERE ${conditions.join(" OR ")}`,
    );
  }

  public async getChildren(): Promise<ModernTableColumnNode[]> {
    const sql = this.dialect.showColumns(this.schema, this.label);
    const result = await this.actions.query<Record<string, unknown>>(
      this.connection,
      sql,
    );
    return resultRows(result).map(
      (row, index) => new ModernTableColumnNode(row, this, index),
    );
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
    const columns = await this.getChildren();
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

  public async designTable(): Promise<void> {
    const sql = await this.showDdl();
    await this.services.webviews.createWebviewPanel({
      title: `Design ${this.label}`,
      type: "design",
      route: "design",
      state: { table: this.label, ddl: sql },
      eventHandler: (handler) => {
        handler.on("execute", async (content) => {
          if (typeof content !== "string") {
            return;
          }
          try {
            const result = await this.actions.query(this.connection, content);
            await handler.send("result", result);
          } catch (error) {
            await handler.send(
              "error",
              error instanceof Error ? error.message : String(error),
            );
          }
        });
      },
    });
  }

  public async createTemplate(): Promise<string> {
    return this.showActionTemplate("Table template", this.dialect.tableTemplate?.() || "CREATE TABLE table_name (...);");
  }

  public async insertTemplate(): Promise<string> {
    const columns = await this.getChildren();
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

class ModernTableGroupNode extends DatabaseTreeItem {
  public constructor(
    private readonly connection: StoredConnection,
    private readonly schema: string | null,
    private readonly dialect: Dialect,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent?: DatabaseTreeItem,
  ) {
    super("Tables", "tableGroup", vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon("list-tree");
  }

  public async getChildren(): Promise<ModernTableNode[]> {
    const result = await this.actions.query<Record<string, unknown>>(
      this.connection,
      this.dialect.showTables(this.schema),
    );
    return resultRows(result).map(
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
  ) {
    super("Views", "viewGroup", vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon("eye");
  }

  public async getChildren(): Promise<DatabaseTreeItem[]> {
    if (!this.dialect.showViews) {
      return [new InfoTreeItem("This database does not expose views.")];
    }
    const result = await this.actions.query<Record<string, unknown>>(
      this.connection,
      this.dialect.showViews(this.schema),
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
  ) {
    const label = rowText(meta, "name", "table_name", "TABLE_NAME");
    super(label, "view");
    this.label = label;
    this.viewWithSchema = schema
      ? `${dialect.quoteIdentifier(schema)}.${dialect.quoteIdentifier(label)}`
      : dialect.quoteIdentifier(label);
    this.description = rowText(meta, "comment", "VIEW_DEFINITION", "definition");
    this.tooltip = this.viewWithSchema;
    this.iconPath = new vscode.ThemeIcon("eye");
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
    return `CREATE VIEW ${this.viewWithSchema} AS\nSELECT * FROM table_name;`;
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
    await this.actions.query(this.connection, `DROP VIEW ${this.viewWithSchema};`);
    this.actions.showInformation(`Dropped view ${this.label}.`);
  }

  public async createTemplate(): Promise<string> {
    const sql = this.dialect.viewTemplate?.() || "CREATE VIEW view_name AS SELECT * FROM table_name;";
    const document = await this.actions.openSqlDocument(sql);
    await this.actions.showTextDocument(document);
    return sql;
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
    this.iconPath = new vscode.ThemeIcon("symbol-reference");
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
    public readonly parent: ModernDatabaseNode,
  ) {
    super("Synonyms", "synonymGroup", vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon("references");
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

type RoutineKind = "procedure" | "function" | "trigger";

class ModernRoutineNode extends DatabaseTreeItem {
  public constructor(
    name: string,
    private readonly kind: RoutineKind,
    private readonly connection: StoredConnection,
    private readonly schema: string | null,
    private readonly dialect: Dialect,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent: ModernRoutineGroupNode,
  ) {
    super(name, kind, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(
      kind === "trigger" ? "zap" : kind === "function" ? "symbol-function" : "symbol-method",
    );
    this.tooltip = `${kind} ${name}`;
  }

  private qualifiedName(): string {
    const name = this.dialect.quoteIdentifier(String(this.label));
    return this.schema ? `${this.dialect.quoteIdentifier(this.schema)}.${name}` : name;
  }

  public async showSource(): Promise<string> {
    const sourceSql = this.dialect.showRoutineSource?.(
      this.kind,
      this.schema,
      String(this.label),
    );
    const result = sourceSql
      ? await this.actions.query<Record<string, unknown>>(this.connection, sourceSql)
      : undefined;
    const row = result && resultRows(result)[0];
    const source = row && rowText(row, "Create Procedure", "Create Function", "SQL Original Statement", "definition");
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
        : this.dialect.triggerTemplate?.();
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
    public readonly parent: ModernDatabaseNode,
  ) {
    const label = `${kind[0].toUpperCase()}${kind.slice(1)}s`;
    super(label, `${kind}Group`, vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon("list-tree");
  }

  private listSql(): string | undefined {
    if (this.kind === "procedure") {
      return this.dialect.showProcedures?.(this.schema);
    }
    if (this.kind === "function") {
      return this.dialect.showFunctions?.(this.schema);
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
    );
    return node.createTemplate();
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
  ) {
    super(database, "database", vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon("database");
  }

  public async getChildren(): Promise<DatabaseTreeItem[]> {
    const children: DatabaseTreeItem[] = [];
    if (this.dialect.showSynonyms) {
      children.push(
        new ModernOracleSynonymGroupNode(
          this.connection,
          this.schema || this.database,
          this.dialect,
          this.services,
          this.actions,
          this,
        ),
      );
    }
    children.push(
      new ModernTableGroupNode(
        this.connection,
        this.schema || this.database,
        this.dialect,
        this.services,
        this.actions,
        this,
      ),
    );
    if (this.dialect.showViews) {
      children.push(
        new ModernViewGroupNode(
          this.connection,
          this.schema || this.database,
          this.dialect,
          this.services,
          this.actions,
          this,
        ),
      );
    }
    if (this.dialect.showProcedures) {
      children.push(
        new ModernRoutineGroupNode(
          "procedure",
          this.connection,
          this.schema || this.database,
          this.dialect,
          this.services,
          this.actions,
          this,
        ),
      );
    }
    if (this.dialect.showFunctions) {
      children.push(
        new ModernRoutineGroupNode(
          "function",
          this.connection,
          this.schema || this.database,
          this.dialect,
          this.services,
          this.actions,
          this,
        ),
      );
    }
    if (this.dialect.showTriggers) {
      children.push(
        new ModernRoutineGroupNode(
          "trigger",
          this.connection,
          this.schema || this.database,
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
    await this.actions.query(this.connection, sql);
  }

  public async dropDatabase(): Promise<void> {
    const sql = this.dialect.dropDatabase?.(this.database);
    if (!sql) {
      throw new SourceRecoveryPendingError("mysql.db.drop");
    }
    if (await this.actions.confirm(`Drop database ${this.database}?`)) {
      await this.actions.query(this.connection, sql);
    }
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
  ) {
    super(
      displayName(connection),
      "connection",
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    this.description = connection.host ? `${connection.type} · ${connection.host}` : connection.type;
    this.tooltip = connection.connectionUrl || `${displayName(connection)} (${connection.type})`;
    this.iconPath = new vscode.ThemeIcon("server");
    if (connection.disabled) {
      this.description = `${this.description} · disabled`;
      this.collapsibleState = vscode.TreeItemCollapsibleState.None;
    }
  }

  public async getChildren(): Promise<DatabaseTreeItem[]> {
    if (this.connection.disabled) {
      return [new InfoTreeItem("Connection is disabled.")];
    }
    const dialect = this.services.dialects.resolve(this.connection.type);
    const database = this.connection.database || this.connection.schema;
    if (database) {
      return [
        new ModernDatabaseNode(
          this.connection,
          database,
          this.connection.schema || null,
          dialect,
          this.services,
          this.actions,
          this,
        ),
      ];
    }
    if (!dialect.showDatabases) {
      return [new ModernDatabaseNode(this.connection, "default", null, dialect, this.services, this.actions, this)];
    }
    const connection = await this.services.connections.getConnection(this.connection);
    const result = await connection.query<Record<string, unknown>>(dialect.showDatabases());
    return resultRows(result).map((row) => {
      const name = rowText(row, "Database", "database", "name", "schema");
      return new ModernDatabaseNode(this.connection, name, null, dialect, this.services, this.actions, this);
    });
  }

  public copyName(): Promise<void> {
    return this.actions.writeClipboard(displayName(this.connection));
  }

  public async copy(): Promise<unknown> {
    return this.actions.writeClipboard(displayName(this.connection));
  }

  public async createDatabase(): Promise<string> {
    const dialect = this.services.dialects.resolve(this.connection.type);
    const sql = dialect.showDatabases
      ? `CREATE DATABASE [database_name];`
      : "CREATE SCHEMA schema_name;";
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

async function openResultView(
  services: ExtensionServices,
  title: string,
  sql: string,
  result: QueryResult<Record<string, unknown>>,
  context: {
    readonly connection?: StoredConnection;
    readonly table?: string;
    readonly schema?: string | null;
    readonly database?: string;
    readonly id?: string;
    readonly singlePage?: boolean;
  } = {},
): Promise<void> {
  await services.webviews.createWebviewPanel({
    title,
    type: "result",
    id: context.id || `result:${title}`,
    route: "result",
    singlePage: context.singlePage,
    state: {
      sql,
      rows: result.rows,
      fields: result.fields,
      affectedRows: result.affectedRows,
      connection: context.connection,
      table: context.table,
      schema: context.schema,
      database: context.database,
    },
    eventHandler: context.table
      ? (handler) => {
        handler.on("openErDiagram", async () => {
          await openErDiagramPanel(services, {
            connection: context.connection,
            table: context.table,
            schema: context.schema,
            database: context.database,
          });
        });
      }
      : undefined,
  });
}

function redisKeys(result: QueryResult<Record<string, unknown>>): string[] {
  const value = rowValue(resultRows(result)[0] ?? {}, "value");
  if (Array.isArray(value) && Array.isArray(value[1])) {
    return value[1].map(String);
  }
  return resultRows(result)
    .map((row) => rowText(row, "key", "name"))
    .filter(Boolean);
}

class RedisKeyGroupNode extends DatabaseTreeItem {
  public constructor(
    private readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent: DatabaseTreeItem,
  ) {
    super("Keys", "redisKeyGroup", vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon("key");
  }

  public async getChildren(): Promise<RedisKeyNode[]> {
    const result = await this.actions.query<Record<string, unknown>>(
      this.connection,
      "SCAN 0 COUNT 1000",
    );
    return redisKeys(result).map(
      (key) => new RedisKeyNode(key, this.connection, this.services, this.actions, this),
    );
  }

  public async newNode(): Promise<string> {
    const sql = "SET key value";
    const document = await this.actions.openSqlDocument(sql);
    await this.actions.showTextDocument(document);
    return sql;
  }

  public async click(): Promise<RedisKeyNode[]> {
    return this.getChildren();
  }
}

class RedisKeyNode extends DatabaseTreeItem {
  public constructor(
    key: string,
    private readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent: RedisKeyGroupNode,
  ) {
    super(key, "redisKey");
    this.tooltip = key;
    this.iconPath = new vscode.ThemeIcon("key");
  }

  private redisCommand(name: string): string {
    return `${name} ${JSON.stringify(String(this.label))}`;
  }

  public async detail(): Promise<void> {
    const sql = this.redisCommand("GET");
    const result = await this.actions.query<Record<string, unknown>>(
      this.connection,
      sql,
    );
    await openResultView(this.services, String(this.label), sql, result);
  }

  public async delete(): Promise<void> {
    if (!(await this.actions.confirm(`Delete Redis key ${String(this.label)}?`))) {
      return;
    }
    await this.actions.query(this.connection, this.redisCommand("DEL"));
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

class MongoDatabaseNode extends DatabaseTreeItem {
  public constructor(
    public readonly database: string,
    private readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent: DatabaseTreeItem,
  ) {
    super(database, "mongoDatabase", vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon("database");
  }

  public async getChildren(): Promise<MongoCollectionNode[]> {
    const result = await this.actions.query<Record<string, unknown>>(
      this.connection,
      `db(${JSON.stringify(this.database)}).getCollectionNames()`,
    );
    return resultRows(result).map(
      (row) =>
        new MongoCollectionNode(
          rowText(row, "name", "collection"),
          this.database,
          this.connection,
          this.services,
          this.actions,
          this,
        ),
    );
  }
}

class MongoCollectionNode extends DatabaseTreeItem {
  public constructor(
    collection: string,
    private readonly database: string,
    private readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent: MongoDatabaseNode,
  ) {
    super(collection, "mongoCollection", vscode.TreeItemCollapsibleState.None);
    this.tooltip = `${database}.${collection}`;
    this.iconPath = new vscode.ThemeIcon("table");
  }

  private query(): string {
    return `db(${JSON.stringify(this.database)}).collection(${JSON.stringify(String(this.label))}).find({}).limit(${this.services.config.get("defaultSelectLimit")})`;
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

class ElasticIndexGroupNode extends DatabaseTreeItem {
  public constructor(
    private readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent: DatabaseTreeItem,
  ) {
    super("Indexes", "esIndexGroup", vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon("list-tree");
  }

  public async getChildren(): Promise<ElasticIndexNode[]> {
    const result = await this.actions.query<Record<string, unknown>>(
      this.connection,
      "/_cat/indices?format=json",
    );
    return resultRows(result)
      .map((row) => rowText(row, "index", "name"))
      .filter(Boolean)
      .map(
        (index) =>
          new ElasticIndexNode(
            index,
            this.connection,
            this.services,
            this.actions,
            this,
          ),
      );
  }

  public async createTemplate(): Promise<string> {
    const sql = "PUT /index-name\n{\n  \"settings\": {},\n  \"mappings\": {}\n}";
    const document = await this.actions.openSqlDocument(sql);
    await this.actions.showTextDocument(document);
    return sql;
  }
}

class ElasticIndexNode extends DatabaseTreeItem {
  public constructor(
    index: string,
    private readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent: ElasticIndexGroupNode,
  ) {
    super(index, "esIndex", vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon("database");
    this.tooltip = `Elasticsearch index ${index}`;
  }

  private async request(path: string): Promise<void> {
    const result = await this.actions.query<Record<string, unknown>>(
      this.connection,
      path,
    );
    await openResultView(this.services, String(this.label), path, result);
  }

  public async viewData(): Promise<void> {
    await this.request(`/${encodeURIComponent(String(this.label))}/_search?size=${this.services.config.get("defaultSelectLimit")}`);
  }

  public async showSettings(): Promise<void> {
    await this.request(`/${encodeURIComponent(String(this.label))}/_settings`);
  }

  public async mappingIndex(): Promise<void> {
    await this.request(`/${encodeURIComponent(String(this.label))}/_mapping`);
  }

  public async searchTemplate(): Promise<string> {
    const sql = `GET /${String(this.label)}/_search?size=${this.services.config.get("defaultSelectLimit")}`;
    const document = await this.actions.openSqlDocument(sql);
    await this.actions.showTextDocument(document);
    return sql;
  }

  public async insertTemplate(): Promise<string> {
    const sql = `POST /${String(this.label)}/_doc\n{\n  "field": "value"\n}`;
    const document = await this.actions.openSqlDocument(sql);
    await this.actions.showTextDocument(document);
    return sql;
  }

  public async updateTemplate(): Promise<string> {
    const sql = `POST /${String(this.label)}/_update/id\n{\n  "doc": {}\n}`;
    const document = await this.actions.openSqlDocument(sql);
    await this.actions.showTextDocument(document);
    return sql;
  }

  public async analyzeTemplate(): Promise<string> {
    const sql = `POST /${String(this.label)}/_analyze\n{\n  "text": "text"\n}`;
    const document = await this.actions.openSqlDocument(sql);
    await this.actions.showTextDocument(document);
    return sql;
  }

  public async aggregationsTemplate(): Promise<string> {
    const sql = `POST /${String(this.label)}/_search\n{\n  "size": 0,\n  "aggs": {}\n}`;
    const document = await this.actions.openSqlDocument(sql);
    await this.actions.showTextDocument(document);
    return sql;
  }

  public async drop(): Promise<void> {
    if (!(await this.actions.confirm(`Delete Elasticsearch index ${String(this.label)}?`))) {
      return;
    }
    await this.actions.query(this.connection, `DELETE /${encodeURIComponent(String(this.label))}`);
    this.actions.showInformation(`Deleted Elasticsearch index ${String(this.label)}.`);
  }
}

class Neo4jLabelGroupNode extends DatabaseTreeItem {
  public constructor(
    private readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent: DatabaseTreeItem,
  ) {
    super("Labels", "neo4jLabelGroup", vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon("symbol-class");
  }

  public async getChildren(): Promise<Neo4jLabelNode[]> {
    const result = await this.actions.query<Record<string, unknown>>(
      this.connection,
      "CALL db.labels()",
    );
    return resultRows(result)
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
    this.iconPath = new vscode.ThemeIcon("symbol-class");
  }

  public async viewData(): Promise<void> {
    const label = String(this.label).replaceAll("`", "``");
    const sql = `MATCH (n:\`${label}\`) RETURN n LIMIT ${this.services.config.get("defaultSelectLimit")}`;
    const result = await this.actions.query<Record<string, unknown>>(
      this.connection,
      sql,
    );
    await openResultView(this.services, String(this.label), sql, result);
  }
}

class GenericServiceRootNode extends DatabaseTreeItem {
  public constructor(
    private readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent: DatabaseTreeItem,
  ) {
    super("Service", "serviceRoot", vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon("server-process");
  }

  public async getChildren(): Promise<GenericServiceActionNode[]> {
    return [
      new GenericServiceActionNode(
        this.connection,
        this.services,
        this.actions,
        this,
      ),
    ];
  }
}

class GenericServiceActionNode extends DatabaseTreeItem {
  public constructor(
    private readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    public readonly parent: GenericServiceRootNode,
  ) {
    super("Overview", "serviceAction");
    this.iconPath = new vscode.ThemeIcon("info");
  }

  private queryText(): string {
    if (this.connection.type === "Kafka") return "LIST TOPICS";
    if (this.connection.type === "Loki") return "/loki/api/v1/labels";
    return "/api/overview";
  }

  public async viewData(): Promise<void> {
    const sql = this.queryText();
    const result = await this.actions.query<Record<string, unknown>>(
      this.connection,
      sql,
    );
    await openResultView(this.services, `${this.connection.type} overview`, sql, result);
  }

  public async createTemplate(): Promise<string> {
    const sql = this.connection.type === "Kafka"
      ? "PRODUCE topic message"
      : "GET /api/overview";
    const document = await this.actions.openSqlDocument(sql);
    await this.actions.showTextDocument(document);
    return sql;
  }

  public async reqCreate(): Promise<string> {
    return this.messageTemplate(
      this.connection.type === "Kafka"
        ? "CREATE TOPIC topic_name"
        : "PUT /api/queues/%2F/queue_name\n{\n  \"durable\": true\n}",
    );
  }

  public async reqCreateBinding(): Promise<string> {
    return this.messageTemplate(
      "POST /api/bindings/%2F/e/exchange_name/q/queue_name\n{\n  \"routing_key\": \"\"\n}",
    );
  }

  public async inspectMessages(): Promise<void> {
    await this.viewData();
  }

  public async reqDelete(): Promise<void> {
    const name = await vscode.window.showInputBox({ prompt: "Resource name to delete" });
    if (!name) return;
    const sql = this.connection.type === "Kafka"
      ? `DELETE TOPIC ${name}`
      : `DELETE /api/queues/%2F/${encodeURIComponent(name)}`;
    const result = await this.actions.query<Record<string, unknown>>(this.connection, sql);
    await openResultView(this.services, `${this.connection.type} delete`, sql, result);
  }

  public async createVhost(): Promise<string> {
    return this.messageTemplate("PUT /api/vhosts/vhost_name");
  }

  public async deleteVhost(): Promise<void> {
    await this.reqDelete();
  }

  public async createUser(): Promise<string> {
    return this.messageTemplate("PUT /api/users/user_name\n{\n  \"password\": \"password\",\n  \"tags\": \"management\"\n}");
  }

  public async deleteUser(): Promise<void> {
    await this.reqDelete();
  }

  public async updatePassword(): Promise<string> {
    return this.messageTemplate("PUT /api/users/user_name\n{\n  \"password\": \"new-password\",\n  \"tags\": \"\"\n}");
  }

  public async addRole(): Promise<string> {
    return this.messageTemplate("PUT /api/permissions/%2F/user_name\n{\n  \"configure\": \".*\",\n  \"write\": \".*\",\n  \"read\": \".*\"\n}");
  }

  public async removeRole(): Promise<void> {
    await this.reqDelete();
  }

  public async prepareConsume(): Promise<string> {
    return this.messageTemplate("GET /api/queues/%2F/queue_name/get\n{\n  \"count\": 10,\n  \"ackmode\": \"ack_requeue_true\",\n  \"encoding\": \"auto\"\n}");
  }

  public async prepareProduce(): Promise<string> {
    return this.messageTemplate("POST /api/exchanges/%2F/amq.default/publish\n{\n  \"properties\": {},\n  \"routing_key\": \"queue_name\",\n  \"payload\": \"message\",\n  \"payload_encoding\": \"string\"\n}");
  }

  public async setOffset(): Promise<string> {
    return this.messageTemplate("SET OFFSET group_name topic_name partition 0");
  }

  public async resetOffset(): Promise<string> {
    return this.messageTemplate("RESET OFFSET group_name topic_name");
  }

  private async messageTemplate(sql: string): Promise<string> {
    const document = await this.actions.openSqlDocument(sql);
    await this.actions.showTextDocument(document);
    return sql;
  }
}

export class ModernNoSqlConnectionNode extends DatabaseTreeItem {
  public constructor(
    public readonly connection: StoredConnection,
    private readonly services: ExtensionServices,
    private readonly actions: TreeActionHost,
    private readonly onDelete: (id: string) => Promise<void>,
    public readonly parent?: DatabaseTreeItem,
  ) {
    super(
      displayName(connection),
      "noSqlConnection",
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    this.description = connection.host ? `${connection.type} · ${connection.host}` : connection.type;
    this.tooltip = connection.connectionUrl || `${displayName(connection)} (${connection.type})`;
    this.iconPath = new vscode.ThemeIcon("server-process");
    if (connection.disabled) {
      this.description = `${this.description} · disabled`;
      this.collapsibleState = vscode.TreeItemCollapsibleState.None;
    }
  }

  public async getChildren(): Promise<DatabaseTreeItem[]> {
    if (this.connection.disabled) {
      return [new InfoTreeItem("Connection is disabled.")];
    }
    this.services.activeConnection.set(this.connection);
    if (this.connection.type === "Redis") {
      return [new RedisKeyGroupNode(this.connection, this.services, this.actions, this)];
    }
    if (this.connection.type === "MongoDB") {
      if (this.connection.database) {
        return [
          new MongoDatabaseNode(
            this.connection.database,
            this.connection,
            this.services,
            this.actions,
            this,
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
          ),
      );
    }
    if (this.connection.type === "ElasticSearch") {
      return [new ElasticIndexGroupNode(this.connection, this.services, this.actions, this)];
    }
    if (this.connection.type === "Neo4j") {
      return [new Neo4jLabelGroupNode(this.connection, this.services, this.actions, this)];
    }
    if (["RabbitMQ", "Kafka", "Loki", "etcd"].includes(this.connection.type)) {
      return [new GenericServiceRootNode(this.connection, this.services, this.actions, this)];
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
    return undefined;
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
    return recordsFromState(raw).map(
      (connection) =>
        new ModernConnectionNode(
          connection,
          this.services,
          this.actions,
          async (id) => this.removeConnection(id),
        ),
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
    const raw = this.services.state.get<unknown>("redis.connections", {});
    return recordsFromState(raw).map((connection) => {
      const onDelete = async (id: string) => this.removeConnection(id);
      if (connection.type === "SSH" || connection.type === "SFTP") {
        return new SshConnectionNode(connection, this.services, onDelete);
      }
      if (connection.type === "Docker") {
        return new DockerConnectionNode(
          connection,
          this.services,
          onDelete,
          () => this.refresh(),
        );
      }
      if (["FTP", "S3", "WebDAV"].includes(connection.type)) {
        return new ResourceConnectionNode(connection, this.services, onDelete, () => this.refresh());
      }
      return new ModernNoSqlConnectionNode(
        connection,
        this.services,
        this.actions,
        onDelete,
      );
    });
  }

  public refresh(element?: vscode.TreeItem): void {
    this.changes.fire(element);
  }

  public dispose(): void {
    this.changes.dispose();
  }

  public async removeConnection(id: string): Promise<void> {
    const raw = this.services.state.get<unknown>("redis.connections", {});
    if (Array.isArray(raw)) {
      await this.services.state.update(
        "redis.connections",
        raw.filter((item) => (item as StoredConnection)?.id !== id),
      );
    } else if (raw && typeof raw === "object") {
      const next = { ...(raw as Record<string, unknown>) };
      delete next[id];
      await this.services.state.update("redis.connections", next);
    }
    await this.services.connections.close(id);
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
  const databaseProvider = new ModernDatabaseTreeProvider(services, "mysql.connections");
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
