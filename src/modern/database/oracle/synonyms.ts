import type { ConfigService } from "../../core/config";
import type { Logger } from "../../core/contracts";
import { DatabaseClientError } from "../../core/errors";
import type {
  Dialect,
  MetadataQueryExecutor,
  QueryOptions,
  QueryResult,
} from "../types";

export interface OracleSynonymRecord {
  name: string;
  owner: string;
  tableOwner: string;
  tableName: string;
  dbLink?: string | null;
  comment?: string | null;
}

export interface SynonymChild {
  readonly contextValue: "synonymColumns";
  readonly label: string;
  readonly parent: OracleSynonymNode;
}

function requiredString(
  row: Record<string, unknown>,
  keys: readonly string[],
  field: string,
): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  throw new DatabaseClientError(
    "Oracle synonym row is missing " + field,
    "invalid-synonym-row",
  );
}

export function normalizeOracleSynonymRow(
  row: Record<string, unknown>,
): OracleSynonymRecord {
  return {
    name: requiredString(row, ["name", "NAME", "synonym_name"], "name"),
    owner: requiredString(row, ["owner", "OWNER"], "owner"),
    tableOwner: requiredString(
      row,
      ["table_owner", "TABLE_OWNER", "tableOwner"],
      "table owner",
    ),
    tableName: requiredString(
      row,
      ["table_name", "TABLE_NAME", "tableName"],
      "table name",
    ),
    dbLink:
      (row.db_link ?? row.DB_LINK ?? row.dbLink) as string | null | undefined,
    comment: (row.comment ?? row.COMMENT) as string | null | undefined,
  };
}

export class OracleSynonymNode {
  public readonly contextValue = "synonym";
  public readonly icon = "symbol-reference";
  public readonly label: string;
  public readonly description: string;
  public readonly tooltip: string;

  public constructor(
    public readonly meta: OracleSynonymRecord,
    private readonly dialect: Dialect,
    private readonly config: ConfigService,
    private readonly parent?: OracleSynonymGroup,
  ) {
    this.label = meta.name;
    this.description = meta.comment ?? "";
    this.tooltip =
      meta.owner +
      "." +
      meta.name +
      " -> " +
      meta.tableOwner +
      "." +
      meta.tableName +
      (meta.dbLink ? "@" + meta.dbLink : "");
  }

  public get wrappedTable(): string {
    if (this.meta.owner.toUpperCase() === "PUBLIC") {
      return this.dialect.quoteIdentifier(this.label);
    }
    return (
      this.dialect.quoteIdentifier(this.meta.owner) +
      "." +
      this.dialect.quoteIdentifier(this.label)
    );
  }

  public get tableWithSchema(): string {
    return this.wrappedTable;
  }

  public getChildren(): readonly SynonymChild[] {
    return [
      {
        contextValue: "synonymColumns",
        label: "Columns",
        parent: this,
      },
    ];
  }

  public getPaginationSql(): string {
    return this.dialect.buildPageSql(
      this.parent?.schema ?? null,
      this.wrappedTable,
      this.config.get("defaultSelectLimit"),
    );
  }

  public showDdl(): string {
    const publicPrefix =
      this.meta.owner.toUpperCase() === "PUBLIC" ? "PUBLIC " : "";
    const dbLink = this.meta.dbLink ? "@" + this.meta.dbLink : "";
    return (
      "CREATE OR REPLACE " +
      publicPrefix +
      "SYNONYM " +
      this.wrappedTable +
      " FOR " +
      this.dialect.quoteIdentifier(this.meta.tableOwner) +
      "." +
      this.dialect.quoteIdentifier(this.meta.tableName) +
      dbLink +
      ";"
    );
  }
}

export interface SynonymGroupOptions {
  schema: string;
  query: MetadataQueryExecutor;
  dialect: Dialect;
  config: ConfigService;
  logger: Logger;
}

export class OracleSynonymGroup {
  public readonly contextValue = "synonymGroup";
  public readonly icon = "references";
  public readonly label = "Synonyms";

  public constructor(
    private readonly options: SynonymGroupOptions,
    public readonly parent?: unknown,
  ) {}

  public get schema(): string {
    return this.options.schema;
  }

  public async getChildren(
    filter = "",
    queryOptions?: QueryOptions,
  ): Promise<OracleSynonymNode[]> {
    const sql = this.options.dialect.showSynonyms?.(this.options.schema);
    if (!sql) {
      throw new DatabaseClientError(
        "The selected dialect does not expose Oracle synonyms",
        "unsupported-synonyms",
      );
    }
    const result: QueryResult<Record<string, unknown>> =
      await this.options.query.query(sql, queryOptions);
    const normalized = result.rows
      .map(normalizeOracleSynonymRow)
      .filter((synonym) =>
        synonym.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()),
      )
      .map(
        (synonym) =>
          new OracleSynonymNode(
            synonym,
            this.options.dialect,
            this.options.config,
            this,
          ),
      );
    normalized.sort((left, right) =>
      left.label.localeCompare(right.label, undefined, {
        sensitivity: "base",
      }),
    );
    this.options.logger.debug("Oracle synonyms loaded", {
      schema: this.options.schema,
      count: normalized.length,
      filtered: filter.length > 0,
    });
    return normalized;
  }
}
