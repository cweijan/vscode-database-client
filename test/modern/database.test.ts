import assert from "node:assert/strict";
import test from "node:test";

import {
  CallbackConfigurationReader,
  ConfigService,
} from "../../src/modern/core/config";
import { NoopLogger } from "../../src/modern/core/logging";
import {
  OperationCancelledError,
} from "../../src/modern/core/errors";
import { ConnectionManager } from "../../src/modern/database/connectionManager";
import { loadErDiagram } from "../../src/modern/database/erDiagramService";
import { normalizeMockModel } from "../../src/modern/database/mockModel";
import { OracleDialect } from "../../src/modern/database/oracle/oracleDialect";
import {
  OracleSynonymGroup,
  OracleSynonymNode,
} from "../../src/modern/database/oracle/synonyms";
import { normalizeDriverResult } from "../../src/modern/database/resultConverter";
import { elasticSearchRows } from "../../src/modern/database/nosqlFactories";
import { createStandardConnectionFactories } from "../../src/modern/database/standardFactories";
import { SqlTableGroup } from "../../src/modern/database/sqlTree";
import {
  MySqlDialect,
  SqliteDialect,
} from "../../src/modern/database/standardDialects";
import type {
  ConnectionFactory,
  DatabaseConnection,
  MetadataQueryExecutor,
  QueryResult,
} from "../../src/modern/database/types";

function settings(defaultSelectLimit = 250): ConfigService {
  return new ConfigService(
    new CallbackConfigurationReader((key, fallback) =>
      key === "defaultSelectLimit" ? (defaultSelectLimit as typeof fallback) : fallback,
    ),
  );
}

test("Oracle dialect resolves identifiers and synonyms without interpolating quotes", () => {
  const dialect = new OracleDialect();

  const columnsSql = dialect.showColumns("APP'OWNER", "ORDER'S");
  assert.match(columnsSql, /all_synonyms/);
  assert.match(columnsSql, /'APP''OWNER'/);
  assert.match(columnsSql, /'ORDER''S'/);
  assert.match(columnsSql, /rownum = 1/);

  const synonymsSql = dialect.showSynonyms("APP'OWNER");
  assert.match(synonymsSql, /s\.owner in \('APP''OWNER', 'PUBLIC'\)/);
  assert.match(synonymsSql, /s\.table_owner not in/);
  assert.match(synonymsSql, /order by "name"/i);
});

test("Oracle synonym nodes preserve target tree, pagination, and DDL semantics", () => {
  const dialect = new OracleDialect();
  const config = settings();
  const privateNode = new OracleSynonymNode(
    {
      name: "ORDERS_ALIAS",
      owner: "APP",
      tableOwner: "APP",
      tableName: "ORDERS",
    },
    dialect,
    config,
  );
  const publicNode = new OracleSynonymNode(
    {
      name: "CUSTOMERS",
      owner: "PUBLIC",
      tableOwner: "APP",
      tableName: "CUSTOMERS",
      dbLink: "REMOTE",
    },
    dialect,
    config,
  );

  assert.equal(privateNode.contextValue, "synonym");
  assert.equal(privateNode.wrappedTable, '"APP"."ORDERS_ALIAS"');
  assert.equal(
    privateNode.showDdl(),
    'CREATE OR REPLACE SYNONYM "APP"."ORDERS_ALIAS" FOR "APP"."ORDERS";',
  );
  assert.equal(
    publicNode.showDdl(),
    'CREATE OR REPLACE PUBLIC SYNONYM "CUSTOMERS" FOR "APP"."CUSTOMERS"@REMOTE;',
  );
  assert.equal(
    privateNode.getPaginationSql(),
    'SELECT * FROM "APP"."ORDERS_ALIAS" FETCH FIRST 250 ROWS ONLY',
  );
  assert.equal(privateNode.getChildren()[0].contextValue, "synonymColumns");
});

test("Oracle synonym groups filter and sort normalized metadata rows", async () => {
  let executedSql = "";
  const query: MetadataQueryExecutor = {
    async query<Row>(): Promise<QueryResult<Row>> {
      executedSql = "showSynonyms";
      return {
        rows: [
          {
            name: "ZETA",
            owner: "APP",
            table_owner: "APP",
            table_name: "Z_TABLE",
          },
          {
            name: "alpha_orders",
            owner: "PUBLIC",
            table_owner: "APP",
            table_name: "ORDERS",
          },
        ] as Row[],
        fields: [],
      };
    },
  };
  const group = new OracleSynonymGroup({
    schema: "APP",
    query,
    dialect: new OracleDialect(),
    config: settings(),
    logger: new NoopLogger(),
  });

  const children = await group.getChildren("ALPHA");
  assert.equal(executedSql, "showSynonyms");
  assert.deepEqual(children.map((child) => child.label), ["alpha_orders"]);
  assert.equal(children[0].meta.tableName, "ORDERS");
});

test("SQL table groups apply filtering, ordering, pagination, and stable context", async () => {
  const group = new SqlTableGroup({
    schema: "APP",
    executor: {
      async query<Row>(): Promise<QueryResult<Row>> {
        return {
          rows: [
            { name: "ZETA" },
            { name: "alpha_orders" },
            { name: "alpha_customers" },
          ] as Row[],
          fields: [],
        };
      },
    },
    dialect: new OracleDialect(),
    config: settings(),
    logger: new NoopLogger(),
  });

  const children = await group.getChildren("alpha", { offset: 1, limit: 1 });
  assert.equal(group.contextValue, "tableGroup");
  assert.equal(children[0].label, "alpha_orders");
  assert.equal(children[0].contextValue, "table");
  assert.equal(children[0].tableWithSchema, '"APP"."alpha_orders"');
});

test("ER diagram service expands foreign-key neighbors with normalized columns", async () => {
  const query: MetadataQueryExecutor = {
    async query<Row>(sql: string): Promise<QueryResult<Row>> {
      if (sql.includes("KEY_COLUMN_USAGE")) {
        return {
          rows: [
            {
              table_name: "orders",
              column_name: "customer_id",
              referenced_table: "customers",
              referenced_column: "id",
              constraint_name: "fk_orders_customer",
            },
            {
              table_name: "customers",
              column_name: "region_id",
              referenced_table: "regions",
              referenced_column: "id",
              constraint_name: "fk_customers_region",
            },
          ] as Row[],
          fields: [],
        };
      }
      const table = /TABLE_NAME = '([^']+)'/.exec(sql)?.[1] || "orders";
      const rows = table === "orders"
        ? [{ name: "id", type: "bigint", key: "PRI" }, { name: "customer_id", type: "bigint" }]
        : table === "customers"
          ? [{ name: "id", type: "bigint", key: "PRI" }, { name: "region_id", type: "bigint" }]
          : [{ name: "id", type: "bigint", key: "PRI" }];
      return { rows: rows as Row[], fields: [] };
    },
  };

  const data = await loadErDiagram(query, new MySqlDialect(), {
    table: "orders",
    schema: "app",
  });

  assert.deepEqual(data.nodes.map((node) => node.name), ["orders", "customers", "regions"]);
  assert.equal(data.nodes[0].main, true);
  assert.equal(data.nodes[1].columns[1].key, "FK");
  assert.deepEqual(data.edges.map((edge) => edge.constraintName), [
    "fk_orders_customer",
    "fk_customers_region",
  ]);
});

test("ER diagram service uses per-table foreign-key metadata for SQLite", async () => {
  const query: MetadataQueryExecutor = {
    async query<Row>(sql: string): Promise<QueryResult<Row>> {
      if (sql.includes("sqlite_master")) {
        return {
          rows: [{ name: "child" }, { name: "parent" }] as Row[],
          fields: [],
        };
      }
      if (sql.includes("foreign_key_list")) {
        return {
          rows: sql.includes('"child"')
            ? [{ table: "parent", from: "parent_id", to: "id" } as Row]
            : [],
          fields: [],
        };
      }
      return {
        rows: [{ name: sql.includes('"child"') ? "parent_id" : "id", type: "INTEGER" }] as Row[],
        fields: [],
      };
    },
  };

  const data = await loadErDiagram(query, new SqliteDialect(), { table: "child" });

  assert.deepEqual(data.nodes.map((node) => node.name), ["child", "parent"]);
  assert.equal(data.edges[0].fromColumns, "parent_id");
  assert.equal(data.edges[0].targetColumns, "id");
});

test("Mock model normalization keeps the protocol payload bounded and typed", () => {
  const model = normalizeMockModel({
    table: "orders",
    mockCount: 99_999,
    mockStartIndex: "0",
    mockValueReference: "https://mockjs.com/examples.html#DPD",
    mock: {
      id: { type: "bigint", value: "$mockIndex", nullable: false },
      amount: { type: "decimal", value: "@float(0,100)", nullable: true },
      ignored: "not-an-object",
    },
  });

  assert.ok(model);
  assert.equal(model.mockCount, 10_000);
  assert.equal(model.mockStartIndex, 0);
  assert.deepEqual(model.mock.id, {
    type: "bigint",
    value: "$mockIndex",
    nullable: false,
  });
  assert.deepEqual(model.mock.ignored, {
    type: "varchar",
    value: "",
  });
  assert.equal(normalizeMockModel({ mock: {} }), undefined);
});

test("driver results normalize rows, fields, and affected counts at the adapter boundary", () => {
  const result = normalizeDriverResult<{ id: number }>({
    rows: [{ id: 1 }],
    fields: [{ columnName: "id", dataType: "NUMBER" }],
    rowCount: 1,
  });
  assert.deepEqual(result.rows, [{ id: 1 }]);
  assert.deepEqual(result.fields, [
    { columnName: "id", dataType: "NUMBER", name: "id" },
  ]);
  assert.equal(result.affectedRows, 1);

  const mysqlResult = normalizeDriverResult<{ id: number }>([
    [{ id: 2 }],
    [{ name: "id", columnType: 3 }],
  ]);
  assert.deepEqual(mysqlResult.rows, [{ id: 2 }]);
  assert.deepEqual(mysqlResult.fields, [
    { name: "id", columnType: 3 },
  ]);
});

test("Elasticsearch adapter preserves array responses and search hit metadata", () => {
  assert.deepEqual(
    elasticSearchRows([
      { ip: "127.0.0.1", master: "*" },
      { ip: "127.0.0.2", master: "-" },
    ]),
    [
      { ip: "127.0.0.1", master: "*" },
      { ip: "127.0.0.2", master: "-" },
    ],
  );
  assert.deepEqual(
    elasticSearchRows({
      hits: {
        hits: [{ _id: "1", _index: "orders", _source: { status: "open" } }],
      },
    }),
    [{ _id: "1", _index: "orders", status: "open" }],
  );
});

class FakeConnection implements DatabaseConnection {
  public readonly type = "Oracle" as const;
  public queryCount = 0;
  public closed = false;

  public constructor(public readonly id: string) {}

  public async query<Row>(): Promise<QueryResult<Row>> {
    this.queryCount += 1;
    return { rows: [] as Row[], fields: [] };
  }

  public async close(): Promise<void> {
    this.closed = true;
  }
}

class FakeFactory implements ConnectionFactory {
  public createCount = 0;
  public readonly connections: FakeConnection[] = [];

  public supports(type: string): boolean {
    return type === "Oracle";
  }

  public async create(options: {
    id: string;
    type: "Oracle";
  }): Promise<DatabaseConnection> {
    this.createCount += 1;
    const connection = new FakeConnection(options.id);
    this.connections.push(connection);
    return connection;
  }
}

test("connection manager shares opening lifecycle and handles cancellation", async () => {
  const factory = new FakeFactory();
  const manager = new ConnectionManager(new NoopLogger());
  manager.registerFactory(factory);
  const options = { id: "oracle-1", type: "Oracle" as const };

  const first = await manager.getConnection(options);
  const second = await manager.getConnection(options);
  assert.equal(first, second);
  assert.equal(factory.createCount, 1);

  await manager.query(options, "select 1");
  assert.equal(factory.connections[0].queryCount, 1);

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => manager.query(options, "select 2", { signal: controller.signal }),
    (error: unknown) => error instanceof OperationCancelledError,
  );

  await manager.close(options.id);
  assert.equal(factory.connections[0].closed, true);
  assert.deepEqual(manager.activeIds(), []);
});

test("standard connection factories expose every recovered driver family", () => {
  const factories = createStandardConnectionFactories();
  const supported = (type: string) =>
    factories.some((factory) => factory.supports(type));

  for (const type of [
    "MySQL",
    "MariaDB",
    "PostgreSQL",
    "Redshift",
    "Kingbase",
    "GaussDB",
    "Cockroach",
    "Redis",
    "MongoDB",
    "Neo4j",
    "ElasticSearch",
    "SqlServer",
    "ClickHouse",
    "RabbitMQ",
    "Loki",
    "Kafka",
    "Docker",
    "SQLite",
    "libSQL",
    "D1",
    "DuckDB",
    "DM",
    "达梦",
    "Snowflake",
    "Databricks",
    "BigQuery",
    "Trino",
    "PrestoDB",
    "TDengine",
    "Doris",
    "AzureSQLServer",
    "MySQLCompatible",
    "PostgreCompatible",
    "FTP",
    "WebDAV",
    "S3",
    "etcd",
  ]) {
    assert.equal(supported(type), true, `missing factory for ${type}`);
  }
});
