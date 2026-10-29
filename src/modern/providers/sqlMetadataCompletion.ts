import * as vscode from "vscode";

import type { ExtensionServices } from "../core/extensionServices";
import type { ConnectionOptions, QueryResult } from "../database/types";
import type { SqlTableReference } from "./sqlDocumentModel";
import {
  detectSqlCompletionTarget,
  parseSqlEnumValues,
  type SqlCompletionTarget,
} from "./sqlCompletionContext";
import { SqlCompletionProvider } from "./sqlCompletionProvider";

const mysqlSystemVariables = [
  "basedir",
  "datadir",
  "version",
  "version_comment",
  "version_compile_os",
] as const;

interface SqlColumnMetadata {
  readonly name: string;
  readonly type: string;
}

function rowText(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const exact = row[key];
    if (exact != null) return String(exact);
    const matching = Object.keys(row).find(
      (candidate) => candidate.toLocaleLowerCase() === key.toLocaleLowerCase(),
    );
    if (matching && row[matching] != null) return String(row[matching]);
  }
  return "";
}

function rowsOf(result: QueryResult<Record<string, unknown>>): readonly Record<string, unknown>[] {
  return Array.isArray(result.rows) ? result.rows : [];
}

function schemaFor(connection: ConnectionOptions, reference?: SqlTableReference): string | null {
  return reference?.schema || connection.schema || connection.database || null;
}

function completionItem(
  name: string,
  kind: vscode.CompletionItemKind,
  detail: string,
): vscode.CompletionItem {
  const item = new vscode.CompletionItem(name, kind);
  item.detail = detail;
  return item;
}

export class SqlMetadataCompletionProvider implements vscode.CompletionItemProvider {
  private readonly fallback = new SqlCompletionProvider();
  private readonly tableCache = new Map<string, Promise<readonly string[]>>();
  private readonly columnCache = new Map<string, Promise<readonly SqlColumnMetadata[]>>();

  public constructor(private readonly services: ExtensionServices) {}

  public clearCache(): void {
    this.tableCache.clear();
    this.columnCache.clear();
  }

  private async tableNames(connection: ConnectionOptions): Promise<readonly string[]> {
    const dialect = this.services.dialects.resolve(connection.type);
    const schema = schemaFor(connection);
    const key = `${connection.id}\u0000${dialect.id}\u0000${schema || ""}`;
    const cached = this.tableCache.get(key);
    if (cached) return cached;
    const request = this.services.connections
      .query<Record<string, unknown>>(connection, dialect.showTables(schema))
      .then((result) => rowsOf(result)
        .map((row) => rowText(row, "name", "table_name", "TABLE_NAME", "relname"))
        .filter(Boolean));
    this.tableCache.set(key, request);
    try {
      return await request;
    } catch (error) {
      this.tableCache.delete(key);
      this.services.logger.debug("SQL table completion query failed", {
        connection: connection.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private async columnMetadata(
    connection: ConnectionOptions,
    reference: SqlTableReference,
  ): Promise<readonly SqlColumnMetadata[]> {
    const dialect = this.services.dialects.resolve(connection.type);
    const schema = schemaFor(connection, reference);
    const key = `${connection.id}\u0000${dialect.id}\u0000${schema || ""}\u0000${reference.name}`;
    const cached = this.columnCache.get(key);
    if (cached) return cached;
    const request = this.services.connections
      .query<Record<string, unknown>>(connection, dialect.showColumns(schema, reference.name))
      .then((result) => rowsOf(result)
        .map((row): SqlColumnMetadata | undefined => {
          const name = rowText(row, "name", "column_name", "COLUMN_NAME");
          return name
            ? {
              name,
              type: rowText(
                row,
                "type",
                "column_type",
                "COLUMN_TYPE",
                "data_type",
                "DATA_TYPE",
                "simpleType",
              ),
            }
            : undefined;
        })
        .filter((item): item is SqlColumnMetadata => item !== undefined));
    this.columnCache.set(key, request);
    try {
      return await request;
    } catch (error) {
      this.columnCache.delete(key);
      this.services.logger.debug("SQL column completion query failed", {
        connection: connection.id,
        table: reference.name,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private async enumValues(
    connection: ConnectionOptions,
    target: Extract<SqlCompletionTarget, { readonly kind: "values" }>,
  ): Promise<readonly string[]> {
    const column = target.column?.toLocaleLowerCase();
    if (!column) {
      return [];
    }
    for (const reference of (target.references ?? []).slice(0, 5)) {
      const metadata = await this.columnMetadata(connection, reference);
      const columnMetadata = metadata.find(
        (item) => item.name.toLocaleLowerCase() === column,
      );
      const values = parseSqlEnumValues(columnMetadata?.type);
      if (values.length > 0) {
        return values;
      }
    }
    return [];
  }

  private static filterNames(names: readonly string[], prefix: string): string[] {
    const normalized = prefix.toLocaleLowerCase();
    return [...new Set(names)].filter(
      (name) => !normalized || name.toLocaleLowerCase().startsWith(normalized),
    );
  }

  private static mysqlUserVariables(source: string): string[] {
    return [...source.matchAll(/\bSET\s+@([A-Za-z_][A-Za-z0-9_]*)/gi)]
      .map((match) => match[1])
      .filter((name): name is string => Boolean(name));
  }

  public async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[]> {
    const source = document.getText();
    const target = detectSqlCompletionTarget(source, document.offsetAt(position));
    const connection = this.services.activeConnection.get();
    if (target.kind === "values") {
      if (!connection) {
        return [];
      }
      const values = SqlMetadataCompletionProvider.filterNames(
        await this.enumValues(connection, target),
        target.prefix,
      );
      const valueStart = Math.max(0, document.offsetAt(position) - target.prefix.length);
      return values.map((value) => {
        const item = completionItem(value, vscode.CompletionItemKind.Value, "enum value");
        item.range = new vscode.Range(document.positionAt(valueStart), position);
        return item;
      });
    }
    if (target.kind === "variables") {
      if (!connection || !["MySQL", "MariaDB"].includes(connection.type)) {
        return [];
      }
      const names = target.marker === "@@"
        ? [...mysqlSystemVariables]
        : [...mysqlSystemVariables, ...SqlMetadataCompletionProvider.mysqlUserVariables(source)];
      const valueStart = Math.max(
        0,
        document.offsetAt(position) - target.prefix.length - target.marker.length,
      );
      return SqlMetadataCompletionProvider.filterNames(names, target.prefix).map((name) => {
        const item = completionItem(name, vscode.CompletionItemKind.Variable, "MySQL variable");
        item.insertText = `${target.marker}${name}`;
        item.range = new vscode.Range(document.positionAt(valueStart), position);
        return item;
      });
    }
    if (target.kind === "procedureVariables") {
      const valueStart = Math.max(0, document.offsetAt(position) - target.prefix.length);
      const normalizedPrefix = target.prefix.toLocaleLowerCase();
      return target.variables
        .filter((variable) => !normalizedPrefix || variable.name.toLocaleLowerCase().startsWith(normalizedPrefix))
        .map((variable) => {
          const item = completionItem(
            variable.name,
            vscode.CompletionItemKind.Variable,
            variable.direction ? `${variable.direction} parameter` : "procedure variable",
          );
          item.documentation = variable.type;
          item.range = new vscode.Range(document.positionAt(valueStart), position);
          return item;
        });
    }
    if (target.kind === "columns" && target.cteColumns) {
      return SqlMetadataCompletionProvider.filterNames(target.cteColumns, target.prefix)
        .map((name) => completionItem(name, vscode.CompletionItemKind.Field, "CTE column"));
    }
    if (!connection || target.kind === "keywords") {
      return this.fallback.provide({
        text: source,
        offset: document.offsetAt(position),
      }).map((item) => completionItem(
        item.label,
        item.kind === "keyword" ? vscode.CompletionItemKind.Keyword : vscode.CompletionItemKind.Field,
        item.detail || item.kind,
      ));
    }
    try {
      if (target.kind === "tables") {
        return SqlMetadataCompletionProvider.filterNames(await this.tableNames(connection), target.prefix)
          .map((name) => completionItem(name, vscode.CompletionItemKind.Struct, "table"));
      }
      const references = target.references ?? [];
      const names: string[] = [];
      for (const reference of references.slice(0, 5)) {
        names.push(...(await this.columnMetadata(connection, reference)).map((item) => item.name));
      }
      return SqlMetadataCompletionProvider.filterNames(names, target.prefix)
        .map((name) => completionItem(name, vscode.CompletionItemKind.Field, "column"));
    } catch {
      return [];
    }
  }
}
