import * as vscode from "vscode";

import type { ExtensionServices } from "../core/extensionServices";
import type { ConnectionOptions, QueryResult } from "../database/types";
import { asConnectionOptions } from "../database/connectionOptions";
import {
  parseSqlTableReferences,
  sqlWordAt,
  type SqlTableReference,
} from "./sqlDocumentModel";

interface DdlTarget {
  readonly connectionId: string;
  readonly schema: string | null;
  readonly table: string;
}

function asConnection(value: unknown, idHint?: string): ConnectionOptions | undefined {
  return asConnectionOptions(value, idHint);
}

function connectionsFromState(value: unknown): ConnectionOptions[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => asConnection(item))
      .filter((item): item is ConnectionOptions => item !== undefined);
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  return Object.entries(value)
    .map(([id, item]) => asConnection(item, id))
    .filter((item): item is ConnectionOptions => item !== undefined);
}

function connectionTitle(connection: ConnectionOptions): string {
  const candidate = connection as ConnectionOptions & { readonly name?: string };
  return candidate.name || connection.id || connection.host || connection.type;
}

function rowValue(row: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    if (row[name] !== undefined) {
      return row[name];
    }
    const matching = Object.keys(row).find(
      (key) => key.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    if (matching) {
      return row[matching];
    }
  }
  return undefined;
}

function rowText(row: Record<string, unknown>, ...names: string[]): string {
  const value = rowValue(row, ...names);
  return value == null ? "" : String(value);
}

function resultRows(result: QueryResult<Record<string, unknown>>): Record<string, unknown>[] {
  return Array.isArray(result.rows) ? result.rows : [];
}

function tableNameFromRow(row: Record<string, unknown>): string {
  return rowText(row, "name", "table_name", "TABLE_NAME", "relname");
}

function connectionSchema(connection: ConnectionOptions): string | null {
  return connection.schema || connection.database || null;
}

function uniqueConnections(services: ExtensionServices): ConnectionOptions[] {
  const byId = new Map<string, ConnectionOptions>();
  const active = services.activeConnection.get();
  if (active) {
    byId.set(active.id, active);
  }
  for (const connection of connectionsFromState(
    services.state.get("database.connections", {}),
  )) {
    byId.set(connection.id, connection);
  }
  return [...byId.values()];
}

function targetFromUri(uri: vscode.Uri): DdlTarget | undefined {
  if (uri.scheme !== "db_ddl" || uri.authority !== "table") {
    return undefined;
  }
  const table = decodeURIComponent(uri.path.replace(/^\/+/, "")).replace(/\.sql$/i, "");
  const query = new URLSearchParams(uri.query);
  const connectionId = query.get("connection");
  if (!table || !connectionId) {
    return undefined;
  }
  return {
    connectionId,
    schema: query.get("schema") || null,
    table,
  };
}

export function createSqlDdlUri(
  connection: ConnectionOptions,
  schema: string | null,
  table: string,
): vscode.Uri {
  const query = new URLSearchParams({
    connection: connection.id,
    schema: schema || "",
  });
  return vscode.Uri.parse(
    `db_ddl://table/${encodeURIComponent(table)}.sql?${query.toString()}`,
  );
}

function tableReferenceAt(
  source: string,
  offset: number,
): SqlTableReference | undefined {
  const word = sqlWordAt(source, offset);
  if (!word) {
    return undefined;
  }
  return parseSqlTableReferences(source).find(
    (reference) =>
      word.start >= reference.start && word.end <= reference.end,
  );
}

function sourceFromResult(result: QueryResult<Record<string, unknown>>): string | undefined {
  const row = resultRows(result)[0];
  if (!row) {
    return undefined;
  }
  const named = rowText(
    row,
    "Create Table",
    "create_table_query",
    "CREATE TABLE",
    "definition",
    "source",
    "sql",
    "SQL Original Statement",
  ).trim();
  if (named) {
    return named;
  }
  return Object.values(row)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .find((value) => /\b(?:CREATE|ALTER)\s+TABLE\b/i.test(value));
}

async function buildFallbackDdl(
  services: ExtensionServices,
  connection: ConnectionOptions,
  schema: string | null,
  table: string,
): Promise<string> {
  const dialect = services.dialects.resolve(connection.type);
  const columnsSql = dialect.showColumns(schema, table);
  const result = await services.connections.query<Record<string, unknown>>(
    connection,
    columnsSql,
  );
  const qualified = schema
    ? `${dialect.quoteIdentifier(schema)}.${dialect.quoteIdentifier(table)}`
    : dialect.quoteIdentifier(table);
  const columns = resultRows(result)
    .map((row) => {
      const name = rowText(row, "name", "column_name", "COLUMN_NAME");
      const type = rowText(row, "type", "data_type", "DATA_TYPE", "simpleType");
      return name ? `  ${dialect.quoteIdentifier(name)} ${type || "TEXT"}` : "";
    })
    .filter(Boolean);
  return [
    `CREATE TABLE ${qualified} (`,
    columns.length > 0 ? columns.join(",\n") : "  -- column metadata unavailable",
    ");",
  ].join("\n");
}

export class SqlDdlContentProvider implements vscode.TextDocumentContentProvider {
  public constructor(private readonly services: ExtensionServices) {}

  public async provideTextDocumentContent(
    uri: vscode.Uri,
    _token: vscode.CancellationToken,
  ): Promise<string> {
    const target = targetFromUri(uri);
    if (!target) {
      return "";
    }
    const connection = uniqueConnections(this.services).find(
      (item) => item.id === target.connectionId,
    );
    if (!connection) {
      return `-- Connection ${target.connectionId} is not available.`;
    }
    const dialect = this.services.dialects.resolve(connection.type);
    const sourceSql = dialect.showTableSource?.(target.schema, target.table);
    if (sourceSql) {
      try {
        const result = await this.services.connections.query<Record<string, unknown>>(
          connection,
          sourceSql,
        );
        const source = sourceFromResult(result);
        if (source) {
          return source;
        }
      } catch (error) {
        this.services.logger.debug("DDL source query failed", {
          table: target.table,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    try {
      return await buildFallbackDdl(
        this.services,
        connection,
        target.schema,
        target.table,
      );
    } catch (error) {
      return `-- Unable to load DDL for ${target.table}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

export class SqlDefinitionProvider implements vscode.DefinitionProvider {
  public constructor(private readonly services: ExtensionServices) {}

  public provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Location | undefined {
    const reference = tableReferenceAt(
      document.getText(),
      document.offsetAt(position),
    );
    const connection = this.services.activeConnection.get();
    if (!reference || !connection) {
      return undefined;
    }
    const schema = reference.schema || connection.schema || connection.database || null;
    return new vscode.Location(
      createSqlDdlUri(connection, schema, reference.name),
      new vscode.Position(0, 0),
    );
  }
}

export class SqlWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
  public constructor(private readonly services: ExtensionServices) {}

  public async provideWorkspaceSymbols(
    query: string,
    token: vscode.CancellationToken,
  ): Promise<vscode.SymbolInformation[]> {
    const symbols: vscode.SymbolInformation[] = [];
    for (const connection of uniqueConnections(this.services)) {
      if (token.isCancellationRequested) {
        break;
      }
      const dialect = this.services.dialects.resolve(connection.type);
      const schema = connectionSchema(connection);
      try {
        const result = await this.services.connections.query<Record<string, unknown>>(
          connection,
          dialect.showTables(schema),
        );
        for (const row of resultRows(result)) {
          const name = tableNameFromRow(row);
          if (!name || (query && !name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))) {
            continue;
          }
          symbols.push(
            new vscode.SymbolInformation(
              name,
              vscode.SymbolKind.Class,
              `${connectionTitle(connection)}${schema ? `/${schema}` : ""}`,
              new vscode.Location(
                createSqlDdlUri(connection, schema, name),
                new vscode.Position(0, 0),
              ),
            ),
          );
        }
      } catch (error) {
        this.services.logger.debug("Workspace symbols skipped connection", {
          connection: connection.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return symbols;
  }
}

export class SqlTableHoverProvider implements vscode.HoverProvider {
  public constructor(private readonly services: ExtensionServices) {}

  public async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Hover | undefined> {
    const source = document.getText();
    const reference = tableReferenceAt(source, document.offsetAt(position));
    const connection = this.services.activeConnection.get();
    if (!reference || !connection) {
      return undefined;
    }
    const schema = reference.schema || connection.schema || connection.database || null;
    const dialect = this.services.dialects.resolve(connection.type);
    try {
      const result = await this.services.connections.query<Record<string, unknown>>(
        connection,
        dialect.showColumns(schema, reference.name),
      );
      const rows = resultRows(result);
      if (rows.length === 0) {
        return undefined;
      }
      const lines = rows.map((row) => {
        const name = rowText(row, "name", "column_name", "COLUMN_NAME");
        const type = rowText(row, "type", "data_type", "DATA_TYPE", "simpleType");
        const comment = rowText(row, "comment", "COLUMN_COMMENT");
        return `- **${name}**: ${type || "unknown"}${comment ? ` — ${comment}` : ""}`;
      });
      return new vscode.Hover(
        new vscode.MarkdownString(
          `**${reference.name}**\n\n${lines.join("\n")}`,
        ),
        new vscode.Range(
          document.positionAt(reference.start),
          document.positionAt(reference.end),
        ),
      );
    } catch {
      return undefined;
    }
  }
}
