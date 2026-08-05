import type { ConfigService } from "../core/config";
import type { Logger } from "../core/contracts";
import { UnsupportedDatabaseOperationError } from "../core/errors";
import { SqlTableGroup } from "./sqlTree";
import type {
  Dialect,
  MetadataQueryExecutor,
  QueryOptions,
  QueryResult,
} from "./types";
import type { SqlTableNode, SqlTreeNode } from "./sqlTree";

export class SqlMetadataService {
  public constructor(
    private readonly executor: MetadataQueryExecutor,
    private readonly dialect: Dialect,
    private readonly config: ConfigService,
    private readonly logger: Logger,
  ) {}

  public createTableGroup(
    schema: string | null,
    parent?: SqlTreeNode,
  ): SqlTableGroup {
    return new SqlTableGroup({
      schema,
      executor: this.executor,
      dialect: this.dialect,
      config: this.config,
      logger: this.logger,
      parent,
    });
  }

  public async getColumns(
    schema: string | null,
    table: string,
    options?: QueryOptions,
  ): Promise<QueryResult> {
    const sql = this.dialect.showColumns(schema, table);
    if (!sql) {
      throw new UnsupportedDatabaseOperationError(
        "Column metadata",
        this.dialect.id,
      );
    }
    return this.executor.query(sql, options);
  }

  public async getTables(
    schema: string | null,
    filter = "",
    options?: QueryOptions,
  ): Promise<SqlTableNode[]> {
    const group = this.createTableGroup(schema);
    return group.getChildren(filter, {}, options);
  }
}
