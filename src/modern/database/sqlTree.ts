import type { ConfigService } from "../core/config";
import type { Logger } from "../core/contracts";
import type { Dialect, MetadataQueryExecutor, QueryOptions } from "./types";

export interface SqlMetadataRow {
  name?: string;
  table_name?: string;
  table_rows?: number | string;
  data_length?: number | string;
  comment?: string | null;
  [key: string]: unknown;
}

export interface SqlTreeNode {
  readonly label: string;
  readonly contextValue: string;
  readonly parent?: SqlTreeNode;
  readonly description?: string;
}

export interface SqlTableNodeOptions {
  schema: string | null;
  dialect: Dialect;
  config: ConfigService;
  parent?: SqlTreeNode;
}

export class SqlTableNode implements SqlTreeNode {
  public readonly contextValue = "table";
  public readonly label: string;
  public readonly description?: string;

  public constructor(
    public readonly meta: SqlMetadataRow,
    private readonly options: SqlTableNodeOptions,
  ) {
    this.label = meta.name ?? meta.table_name ?? "";
    this.description = meta.comment ?? undefined;
  }

  public get parent(): SqlTreeNode | undefined {
    return this.options.parent;
  }

  public get wrappedTable(): string {
    return this.options.dialect.quoteIdentifier(this.label);
  }

  public get tableWithSchema(): string {
    return this.options.schema
      ? this.options.dialect.quoteIdentifier(this.options.schema) +
          "." +
          this.wrappedTable
      : this.wrappedTable;
  }

  public getPaginationSql(): string {
    return this.options.dialect.buildPageSql(
      this.options.schema,
      this.tableWithSchema,
      this.options.config.get("defaultSelectLimit"),
    );
  }
}

export interface SqlTableGroupOptions {
  schema: string | null;
  executor: MetadataQueryExecutor;
  dialect: Dialect;
  config: ConfigService;
  logger: Logger;
  parent?: SqlTreeNode;
}

export class SqlTableGroup implements SqlTreeNode {
  public readonly contextValue = "tableGroup";
  public readonly label = "Tables";

  public constructor(private readonly options: SqlTableGroupOptions) {}

  public get parent(): SqlTreeNode | undefined {
    return this.options.parent;
  }

  public async getChildren(
    filter = "",
    page: { offset?: number; limit?: number } = {},
    queryOptions?: QueryOptions,
  ): Promise<SqlTableNode[]> {
    const result = await this.options.executor.query<SqlMetadataRow>(
      this.options.dialect.showTables(this.options.schema),
      queryOptions,
    );
    const normalizedFilter = filter.toLocaleLowerCase();
    const offset = Math.max(0, page.offset ?? 0);
    const limit = Math.max(1, page.limit ?? Number.MAX_SAFE_INTEGER);
    const nodes = result.rows
      .map(
        (row) =>
          new SqlTableNode(row, {
            schema: this.options.schema,
            dialect: this.options.dialect,
            config: this.options.config,
            parent: this,
          }),
      )
      .filter((node) =>
        node.label.toLocaleLowerCase().includes(normalizedFilter),
      )
      .sort((left, right) =>
        left.label.localeCompare(right.label, undefined, {
          sensitivity: "base",
        }),
      )
      .slice(offset, offset + limit);
    this.options.logger.debug("SQL tables loaded", {
      schema: this.options.schema,
      count: nodes.length,
      filter,
      offset,
      limit,
    });
    return nodes;
  }
}
