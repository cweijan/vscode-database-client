import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  CallbackConfigurationReader,
  ConfigService,
} from "../../src/modern/core/config";
import { NoopLogger } from "../../src/modern/core/logging";
import {
  OperationCancelledError,
} from "../../src/modern/core/errors";
import {
  ConnectionManager,
  type ConnectionTunnelService,
} from "../../src/modern/database/connectionManager";
import {
  buildMysqlDumpArguments,
  buildPostgresDumpArguments,
  createMysqlDumpConfig,
  createPostgresDumpConfig,
  defaultDumpExecutable,
  isDumpSupported,
  resolveDumpOutputPath,
} from "../../src/modern/database/dumpService";
import {
  buildMongoDumpArguments,
  defaultMongoExecutable,
  mongoExecutableCandidates,
} from "../../src/modern/database/mongoDumpService";
import { buildSslOptions } from "../../src/modern/database/sslOptions";
import { loadErDiagram } from "../../src/modern/database/erDiagramService";
import {
  buildTableFullTextSql,
  collectFullTextSearchTargets,
} from "../../src/modern/database/fullTextSearch";
import { normalizeMockModel } from "../../src/modern/database/mockModel";
import { OracleDialect } from "../../src/modern/database/oracle/oracleDialect";
import { buildOracleJdbcConfig } from "../../src/modern/database/oracle/jdbcFactory";
import {
  OracleSynonymGroup,
  OracleSynonymNode,
} from "../../src/modern/database/oracle/synonyms";
import {
  normalizeDriverResult,
  normalizeResultValues,
} from "../../src/modern/database/resultConverter";
import {
  buildResultFiltersSql,
  buildResultCountSql,
  buildResultFilterSql,
  buildResultPageSql,
  buildResultSortSql,
  resultCount,
} from "../../src/modern/database/resultPaging";
import {
  buildResultMutationSql,
  buildResultImportSql as buildImportMutations,
} from "../../src/modern/database/resultMutations";
import {
  serializeResultExport,
} from "../../src/modern/database/resultExport";
import {
  importFormatFromPath,
  parseResultImportFile,
  parseResultImportRows,
} from "../../src/modern/database/resultImport";
import {
  buildRedisItemCommands,
  normalizeRedisConsumerGroups,
} from "../../src/modern/database/redisValues";
import {
  appendSqlHistory,
  compactSqlHistoryLabel,
  normalizeSqlHistoryEntry,
  readSqlHistory,
  sqlHistoryDocument,
} from "../../src/modern/tree/sqlHistory";
import {
  parseRedisKeyspaceInfo,
  parseRedisInfo,
  parseRedisScanPage,
} from "../../src/modern/database/redisTreeProtocol";
import {
  formatResultValue,
  parseResultBinaryInput,
  resultBinaryBase64,
  resultBinaryHex,
  resultValueEditText,
  resultValueExportText,
  resultValueOrigin,
  resultValueText,
} from "../../src/modern/database/resultValues";
import {
  countSqliteRows,
  listSqliteTables,
  quoteSqliteIdentifier,
  readSqlitePage,
} from "../../src/modern/database/sqliteFile";
import {
  buildRedisClusterNatMap,
  elasticSearchRows,
  parseRedisClusterNodes,
} from "../../src/modern/database/nosqlFactories";
import {
  buildElasticsearchBulk,
  parseElasticsearchDataStreams,
  parseElasticsearchIndexRows,
  parseElasticsearchMapping,
  parseElasticsearchVersion,
  parseElasticsearchSize,
  sumElasticsearchStoreBytes,
} from "../../src/modern/database/elasticsearchTreeProtocol";
import { normalizeLokiRows } from "../../src/modern/database/messageFactories";
import {
  buildMessageTemplate,
  parseMessageTemplateContext,
} from "../../src/modern/database/messageTemplates";
import { normalizeMongoValue } from "../../src/modern/database/mongoScript";
import {
  normalizeResultParameterLists,
  normalizeResultParameters,
} from "../../src/modern/database/resultParameters";
import {
  QueryFileService,
  queryName,
} from "../../src/modern/database/queryFiles";
import { createExtendedConnectionFactories } from "../../src/modern/database/extendedFactories";
import { createStandardConnectionFactories } from "../../src/modern/database/standardFactories";
import { SqlTableGroup } from "../../src/modern/database/sqlTree";
import { filterTargetTreeNames } from "../../src/modern/tree/treeVisibility";
import {
  sortTableMetadata,
  supportsTableDataSize,
  tableSortOptions,
} from "../../src/modern/database/tableSort";
import {
  userDisplayName,
  userDropSql,
  userGrantSql,
  userIdentity,
} from "../../src/modern/database/userManagement";
import {
  buildMysqlDashboard,
  buildPostgresDashboard,
} from "../../src/modern/database/statusService";
import {
  MySqlDialect,
  PostgresDialect,
  SqlServerDialect,
  SqliteDialect,
} from "../../src/modern/database/standardDialects";
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
} from "../../src/modern/database/tableDesign";
import type {
  ConnectionFactory,
  DatabaseConnection,
  Dialect,
  MetadataQueryExecutor,
  QueryOptions,
  QueryResult,
} from "../../src/modern/database/types";

function settings(defaultSelectLimit = 250): ConfigService {
  return new ConfigService(
    new CallbackConfigurationReader((key, fallback) =>
      key === "defaultSelectLimit" ? (defaultSelectLimit as typeof fallback) : fallback,
    ),
  );
}

test("Kafka and RabbitMQ message templates preserve target file and routing context", () => {
  const kafka = buildMessageTemplate("consumer", {
    protocol: "Kafka",
    connectionId: "kafka-main",
    resource: "orders",
    broker: "broker.example:9092",
  });
  assert.equal(kafka.fileName, "orders.consumer");
  assert.equal(kafka.language, "dbclient-mq-consumer");
  assert.match(kafka.content, /\"Topic\": \"orders\"/);
  assert.deepEqual(parseMessageTemplateContext(kafka.content), {
    connectionId: "kafka-main",
  });

  const rabbit = buildMessageTemplate("producer", {
    protocol: "RabbitMQ",
    connectionId: "rabbit-main",
    resource: "billing/failed",
    vhost: "/tenant-a",
  });
  assert.equal(rabbit.fileName, "billing%2Ffailed.producer");
  assert.equal(rabbit.language, "json");
  assert.match(rabbit.content, /Hello RabbitMQ/);
  assert.deepEqual(parseMessageTemplateContext(rabbit.content), {
    connectionId: "rabbit-main",
    vhost: "/tenant-a",
  });
});

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

  assert.match(dialect.showPackages("APP'OWNER"), /'APP''OWNER'/);
  assert.match(dialect.showPackageSource("APP'OWNER", "PKG'ONE"), /'PKG''ONE'/);
  assert.match(dialect.packageTemplate(), /CREATE OR REPLACE PACKAGE/);
});

test("Oracle dialect exposes target metadata, monitoring, and source protocols", () => {
  const dialect = new OracleDialect();

  assert.match(dialect.showViews("APP"), /object_type = 'VIEW'/);
  assert.match(dialect.showProcedures("APP"), /object_type = 'PROCEDURE'/);
  assert.match(dialect.showFunctions("APP"), /object_type = 'FUNCTION'/);
  assert.match(dialect.showTriggers("APP", "ORDERS"), /triggering_event/);
  assert.match(dialect.showIndex("APP", "ORDERS"), /all_ind_columns/);
  assert.match(dialect.showChecks("APP", "ORDERS"), /constraint_type = 'C'/);
  assert.match(dialect.showVersion(), /v\$version/);
  assert.equal(
    dialect.truncateDatabase("app'owner"),
    "SELECT 'TRUNCATE TABLE \"' || owner || '\".\"' || object_name || '\";' AS trun FROM all_objects WHERE owner = 'APP''OWNER' AND object_type = 'TABLE';",
  );
  assert.equal(
    dialect.createDatabase?.(),
    'CREATE USER "username" IDENTIFIED BY "password";\nGRANT CREATE SESSION TO "username";',
  );
  assert.equal(
    dialect.dropDatabase?.("app'owner"),
    'DROP USER "APP\'OWNER" CASCADE;',
  );
  assert.match(dialect.processList(), /v\$session/);
  assert.equal(
    dialect.kill({ SID: 12, SERIAL: 34 }),
    "ALTER SYSTEM KILL SESSION '12,34' IMMEDIATE;",
  );
  assert.equal(dialect.kill({ SID: "not-a-number", SERIAL: 34 }), null);
  assert.match(dialect.showViewSource("APP", "ORDERS_VIEW"), /DBMS_METADATA.GET_DDL/);
  assert.match(dialect.showRoutineSource?.("procedure", "APP", "P_RUN") || "", /all_source/);
});

test("core SQL dialects expose target database creation templates", () => {
  assert.equal(
    new MySqlDialect().createDatabase?.(),
    "CREATE DATABASE database_name DEFAULT CHARACTER SET = 'utf8mb4';",
  );
  assert.equal(new PostgresDialect().createDatabase?.(), "CREATE DATABASE database_name;");
});

test("Oracle JDBC factory preserves the target driver contract and connection-string mode", () => {
  const defaults = buildOracleJdbcConfig({
    id: "oracle-default",
    type: "Oracle",
    host: "db.example",
    port: 1521,
    user: "system",
    password: "secret",
    database: "XE",
  });
  assert.equal(defaults.driver, "oracle.jdbc.driver.OracleDriver");
  assert.equal(defaults.dialect, "Oracle");
  assert.equal(defaults.aliveSQL, "SELECT 1 FROM DUAL");
  assert.equal(defaults.supportForward, true);
  assert.equal(defaults.enablePagination, true);
  assert.equal(
    defaults.jdbcUrl,
    "jdbc:oracle:thin:@tcp://db.example:1521/XE?useUnicode=true&characterEncoding=utf8",
  );
  assert.equal(defaults.username, "system");
  assert.equal(defaults.password, "secret");

  const connectionString = buildOracleJdbcConfig({
    id: "oracle-url",
    type: "Oracle",
    connectionUrl: "jdbc:oracle:thin:@//db.example:1521/APP",
    options: {
      useConnectionString: true,
      requestTimeout: 12_000,
      jdbc: {
        driverPath: "C:/drivers/ojdbc.jar",
        properties: { oracleNetConnectTimeout: 4_000 },
      },
    },
  });
  assert.equal(connectionString.jdbcUrl, "jdbc:oracle:thin:@//db.example:1521/APP");
  assert.equal(connectionString.requestTimeout, 12_000);
  assert.equal(connectionString.driverPath, "C:/drivers/ojdbc.jar");
  assert.deepEqual(connectionString.properties, { oracleNetConnectTimeout: 4_000 });
});

test("table design preserves typed metadata operations and explicit unsupported boundaries", () => {
  const mysql = new MySqlDialect();
  const postgres = new PostgresDialect();
  const sqlite = new SqliteDialect();
  const oracle = new OracleDialect();

  assert.equal(
    buildUpdateTableSql(mysql, {
      dbType: "MySQL",
      schema: "app",
      table: "orders",
      newTableName: "sales_orders",
      comment: "old",
      newComment: "customer orders",
    }),
    "ALTER TABLE `app`.`orders` RENAME TO `sales_orders`;\nALTER TABLE `app`.`orders` COMMENT = 'customer orders';",
  );
  assert.match(
    buildUpdateColumnSql(mysql, {
      dbType: "MySQL",
      schema: "app",
      table: "orders",
      columnName: "amount",
      newColumnName: "total",
      columnType: "DECIMAL(12,2)",
      isNotNull: true,
      defaultValue: "0",
      comment: "total amount",
      oldRow: { name: "amount", type: "INT", defaultValue: "0" },
    }) || "",
    /CHANGE `amount` `total` DECIMAL\(12,2\) NOT NULL DEFAULT '0' COMMENT 'total amount'/,
  );
  assert.match(
    buildUpdateColumnSql(postgres, {
      dbType: "PostgreSQL",
      schema: "public",
      table: "orders",
      columnName: "amount",
      newColumnName: "total",
      columnType: "numeric",
      isNotNull: false,
      oldRow: { name: "amount", type: "integer", isNotNull: true },
    }) || "",
    /ALTER COLUMN "amount" TYPE numeric[\s\S]*RENAME COLUMN[\s\S]*DROP NOT NULL/,
  );
  assert.match(
    buildCreateIndexSql(mysql, {
      dbType: "MySQL",
      schema: "app",
      table: "orders",
      name: "orders_total_idx",
      columns: ["total"],
      unique: true,
    }),
    /CREATE UNIQUE INDEX `orders_total_idx` ON `app`\.\`orders` \(`total`\)/,
  );
  assert.equal(
    buildCreateIndexSql(postgres, {
      dbType: "PostgreSQL",
      schema: "public",
      table: "orders",
      name: "orders_payload_idx",
      columns: ["payload"],
      type: "GIN",
    }),
    'CREATE INDEX "orders_payload_idx" ON "public"."orders" USING gin ("payload");',
  );
  assert.equal(
    buildCreateIndexSql(oracle, {
      dbType: "Oracle",
      schema: "APP",
      table: "orders",
      name: "orders_total_idx",
      columns: ["total"],
      type: "BTREE",
    }),
    'CREATE INDEX "orders_total_idx" ON "APP"."orders" ("total");',
  );
  assert.equal(
    buildDropIndexSql(mysql, "MySQL", "orders", "app", "orders_total_idx"),
    "DROP INDEX `orders_total_idx` ON `app`.`orders`;",
  );
  assert.equal(
    buildDropColumnSql(mysql, "MySQL", "orders", "app", "obsolete"),
    "ALTER TABLE `app`.`orders` DROP COLUMN `obsolete`;",
  );
  assert.equal(buildDropColumnSql(sqlite, "SQLite", "orders", null, "obsolete"), undefined);
  assert.match(
    buildCreateForeignKeySql(mysql, {
      dbType: "MySQL",
      schema: "app",
      table: "orders",
      name: "orders_customer_fk",
      column: "customer_id",
      refTable: "customers",
      refColumn: "id",
      deleteRule: "CASCADE",
    }),
    /FOREIGN KEY \(`customer_id`\) REFERENCES `customers` \(`id`\).*ON DELETE CASCADE/,
  );
  const oracleForeignKey = buildCreateForeignKeySql(oracle, {
    dbType: "Oracle",
    schema: "APP",
    table: "ORDERS",
    name: "ORDERS_CUSTOMER_FK",
    column: "CUSTOMER_ID",
    refTable: "CUSTOMERS",
    refColumn: "ID",
    deleteRule: "CASCADE",
  });
  assert.match(oracleForeignKey, /ON DELETE CASCADE/);
  assert.doesNotMatch(oracleForeignKey, /ON UPDATE/);
  assert.equal(
    buildDropForeignKeySql(mysql, "MySQL", "orders", "app", "orders_customer_fk"),
    "ALTER TABLE `app`.`orders` DROP FOREIGN KEY `orders_customer_fk`;",
  );
  assert.equal(
    buildDropCheckSql(mysql, "MySQL", "orders", "app", "orders_total_check"),
    "ALTER TABLE `app`.`orders` DROP CONSTRAINT `orders_total_check`;",
  );
  assert.equal(
    buildDropTriggerSql(postgres, "PostgreSQL", "orders", "public", "orders_audit"),
    'DROP TRIGGER "orders_audit" ON "public"."orders";',
  );
  assert.equal(buildCheckSql(mysql, "app", "orders", "total > 0"), "ALTER TABLE `app`.`orders` ADD CHECK (total > 0);");
  assert.equal(
    buildUpdateColumnSql(sqlite, {
      dbType: "SQLite",
      table: "orders",
      columnName: "amount",
      newColumnName: "total",
      columnType: "INTEGER",
      oldRow: { name: "amount", type: "TEXT" },
    }),
    undefined,
  );
});

test("SQLite file browsing quotes table names and returns paged rows", () => {
  const queries: string[] = [];
  const database = {
    exec(sql: string) {
      queries.push(sql);
      if (sql.includes("sqlite_master")) {
        return [{
          columns: ["name", "type"],
          values: [["orders\"2026", "table"], ["summary", "view"]],
        }];
      }
      if (sql.includes("COUNT(*)")) {
        return [{ columns: ["cnt"], values: [[3]] }];
      }
      return [{
        columns: ["id", "label"],
        values: [[2, "second"]],
      }];
    },
  };

  assert.equal(quoteSqliteIdentifier('orders"2026'), '"orders""2026"');
  assert.equal(countSqliteRows(database, 'orders"2026'), 3);
  assert.deepEqual(listSqliteTables(database), [
    { name: 'orders"2026', type: "table", rowCount: 3 },
    { name: "summary", type: "view", rowCount: 3 },
  ]);
  assert.deepEqual(readSqlitePage(database, 'orders"2026', 2, 1), {
    columns: ["id", "label"],
    rows: [{ id: 2, label: "second" }],
    total: 3,
  });
  assert.match(queries.at(-1) || "", /FROM "orders""2026" LIMIT 1 OFFSET 1/);
});

test("binary result values expose a stable hex preview without losing base64 boundaries", () => {
  assert.equal(resultBinaryHex({ kind: "binary", base64: "aGk=" }), "6869");
  assert.equal(resultBinaryHex({ type: "Buffer", data: [0, 1, 255] }), "0001ff");
  assert.deepEqual(normalizeResultParameters([{ type: "HEX", value: "0x00FF" }]), [Buffer.from([0, 255])]);
  assert.deepEqual(
    normalizeResultParameterLists([[{ type: "HEX", value: "6869" }], []]),
    [[Buffer.from("hi")], []],
  );
  assert.throws(
    () => normalizeResultParameters([{ type: "HEX", value: "0x0" }]),
    /even hexadecimal/,
  );
  assert.equal(resultBinaryHex({ kind: "binary", base64: "not-base64!" }), undefined);
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

test("table sort rules preserve metadata and order rows or data size descending", () => {
  const rows = [
    { name: "alpha", table_rows: "2", data_length: "100" },
    { name: "beta", table_rows: 12, data_length: 50 },
    { name: "gamma", table_rows: 12, data_length: 500 },
  ];

  assert.deepEqual(
    sortTableMetadata(rows, "Rows Count").map((row) => row.name),
    ["beta", "gamma", "alpha"],
  );
  assert.deepEqual(
    sortTableMetadata(rows, "Data Size").map((row) => row.name),
    ["gamma", "alpha", "beta"],
  );
  assert.deepEqual(
    sortTableMetadata(rows, "Default").map((row) => row.name),
    ["alpha", "beta", "gamma"],
  );
  assert.equal(supportsTableDataSize("MySQL"), true);
  assert.equal(supportsTableDataSize("SQLite"), false);
  assert.deepEqual(tableSortOptions("SQLite"), ["Default", "Rows Count"]);
});

test("user management SQL keeps account boundaries escaped by database family", () => {
  const mysql = new MySqlDialect();
  const postgres = new PostgresDialect();
  const identity = userIdentity("report'user", "host'1");

  assert.equal(userDisplayName(identity), "report'user@host'1");
  assert.equal(
    userDropSql("MySQL", mysql, identity),
    "DROP USER 'report''user'@'host''1';",
  );
  assert.match(
    userGrantSql("MySQL", mysql, identity) || "",
    /GRANT ALL PRIVILEGES ON \*\.\* TO 'report''user'@'host''1'/,
  );
  assert.match(
    userDropSql("PostgreSQL", postgres, userIdentity("analyst")),
    /DROP USER "analyst";/,
  );
  assert.match(
    userGrantSql("PostgreSQL", postgres, userIdentity("analyst")) || "",
    /TO "analyst";/,
  );
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

  const postgresArrayResult = normalizeDriverResult<{ id: number; name: string }>({
    rows: [[3, "Ada"]],
    fields: [{ name: "id", dataTypeID: 23 }, { name: "name", dataTypeID: 25 }],
  });
  assert.deepEqual(postgresArrayResult.rows, [{ id: 3, name: "Ada" }]);
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

test("Elasticsearch tree protocol restores index metadata, mappings, streams, and bulk documents", () => {
  const indexes = parseElasticsearchIndexRows([
    { index: "orders", health: "green", "docs.count": "12", "store.size": "3kb" },
    { value: "yellow open users uuid-2 1 0 4 0 1kb 1kb" },
  ]);
  assert.deepEqual(indexes.map((index) => index.name), ["orders", "users"]);
  assert.equal(indexes[0]?.docsCount, 12);
  assert.equal(indexes[1]?.health, "yellow");
  assert.equal(parseElasticsearchSize("1.5gb"), 1.5 * 1024 ** 3);
  assert.equal(parseElasticsearchSize("-"), undefined);
  assert.equal(sumElasticsearchStoreBytes(indexes), 4 * 1024);
  assert.equal(parseElasticsearchVersion({ version: { number: "8.15.0" } }), "8.15.0");

  const fields = parseElasticsearchMapping({
    orders: {
      mappings: {
        properties: {
          id: { type: "keyword" },
          customer: { properties: { name: { type: "text" } } },
        },
      },
    },
  }, "orders");
  assert.deepEqual(fields.map((field) => field.name), ["id", "customer"]);
  assert.deepEqual(fields[1]?.children.map((field) => field.name), ["name"]);

  const streams = parseElasticsearchDataStreams({
    data_streams: [{
      name: "logs-app",
      status: "GREEN",
      timestamp_field: { name: "@timestamp" },
      indices: [{ index_name: ".ds-logs-app-000001" }],
    }],
  });
  assert.deepEqual(streams[0], {
    name: "logs-app",
    status: "GREEN",
    timestampField: "@timestamp",
    indices: [".ds-logs-app-000001"],
    raw: {
      name: "logs-app",
      status: "GREEN",
      timestamp_field: { name: "@timestamp" },
      indices: [{ index_name: ".ds-logs-app-000001" }],
    },
  });
  assert.equal(
    buildElasticsearchBulk("orders", [{ _id: "1", _index: "orders", status: "open" }]),
    '{"create":{"_index":"orders"}}\n{"status":"open"}\n',
  );
});

test("database status service maps MySQL counters and traffic to target dashboard points", () => {
  const dashboard = buildMysqlDashboard(
    [
      { Variable_name: "Com_insert", Value: "11" },
      { Variable_name: "Com_select", Value: "42" },
      { Variable_name: "Bytes_received", Value: "1024" },
      { Variable_name: "Bytes_sent", Value: "2048" },
    ],
    { fields: [{ name: "Variable_name" }, { name: "Value" }], rows: [] },
    new Date(2026, 0, 1, 13, 5, 9),
  );

  assert.deepEqual(dashboard.queries, [
    { now: "01:05:09", type: "insert", value: 11 },
    { now: "01:05:09", type: "update", value: 0 },
    { now: "01:05:09", type: "delete", value: 0 },
    { now: "01:05:09", type: "select", value: 42 },
    { now: "01:05:09", type: "read", value: 0 },
  ]);
  assert.deepEqual(dashboard.traffic, [
    { now: "01:05:09", type: "received", value: 1024 },
    { now: "01:05:09", type: "sent", value: 2048 },
  ]);
});

test("database status service maps PostgreSQL statistics and protects process kill SQL", () => {
  const dashboard = buildPostgresDashboard(
    {
      tup_inserted: "1",
      tup_updated: "2",
      tup_deleted: "3",
      tup_returned: "4",
      tup_fetched: "5",
      blks_read: "6",
      blks_hit: "7",
    },
    { fields: [], rows: [] },
    new Date(2026, 0, 1, 1, 2, 3),
  );

  assert.equal(dashboard.queries[4]?.value, 5);
  assert.deepEqual(dashboard.traffic, [
    { now: "01:02:03", type: "read", value: 6 },
    { now: "01:02:03", type: "hit", value: 7 },
  ]);

  const mysql = new MySqlDialect();
  const postgres = new PostgresDialect();
  assert.equal(mysql.kill?.({ ID: 7 }), "KILL 7;");
  assert.equal(mysql.kill?.({ ID: "7; DROP DATABASE app" }), null);
  assert.equal(postgres.kill?.({ pid: 7 }), "SELECT pg_terminate_backend(7);");
});

test("database DDL dialects build safe truncate plans and drop the target scope", () => {
  const mysql = new MySqlDialect();
  const mysqlTruncate = mysql.truncateDatabase?.("sales'archive");
  assert.ok(mysqlTruncate?.includes("TABLE_SCHEMA = 'sales''archive'"));
  assert.ok(mysqlTruncate?.includes("REPLACE(TABLE_NAME"));
  const tick = String.fromCharCode(96);
  assert.equal(
    mysql.dropDatabase?.("sales" + tick + "archive"),
    ["DROP DATABASE ", tick, "sales", tick, tick, "archive", tick, ";"].join(""),
  );

  const postgres = new PostgresDialect();
  assert.ok(postgres.truncateDatabase?.("public")?.includes("quote_ident(table_name)"));
  assert.equal(postgres.dropDatabase?.("sales"), 'DROP SCHEMA "sales";');

  const sqlServer = new SqlServerDialect();
  assert.ok(sqlServer.truncateDatabase?.("dbo")?.includes("QUOTENAME(TABLE_NAME)"));
  assert.equal(sqlServer.dropDatabase?.("sales"), "DROP SCHEMA [sales];");

  const sqlite = new SqliteDialect();
  const sqliteDialect = sqlite as Dialect;
  assert.equal(sqliteDialect.truncateDatabase, undefined);
  assert.equal(sqliteDialect.dropDatabase, undefined);
});

test("target SQL tree metadata exposes the recovered groups through typed dialect queries", () => {
  const mysql = new MySqlDialect();
  assert.ok(mysql.showPartitions?.("sales", "orders").includes("PARTITION_NAME"));
  assert.ok(mysql.showPartitions?.("sales'archive", "orders").includes("sales''archive"));

  const postgres = new PostgresDialect();
  assert.ok(postgres.showMaterialViews?.("public").includes("pg_matviews"));
  assert.ok(postgres.showSequences?.("public").includes("pg_sequences"));
  assert.ok(postgres.showCustomTypes?.("public").includes("pg_enum"));
  assert.ok(postgres.showExternalTables?.("public").includes("foreign_tables"));
  assert.ok(postgres.showPartitions?.("public", "orders").includes("pg_partitioned_table"));

  const sqlite = new SqliteDialect();
  assert.equal(sqlite.showSequences?.(), "SELECT name, seq AS sequence FROM sqlite_sequence ORDER BY name;");
  assert.ok(sqlite.showTriggers?.(null, "orders").includes("tbl_name = 'orders'"));
});

test("full-text search builds typed SQL and discovers tables below database groups", async () => {
  const dialect = new MySqlDialect();
  const sql = buildTableFullTextSql(
    dialect,
    "app",
    "`app`.`orders`",
    [
      { name: "id", type: "int" },
      { name: "customer", type: "varchar" },
      { name: "payload", type: "json" },
    ],
    "O'Reilly",
  );
  assert.equal(
    sql,
    "SELECT * FROM `app`.`orders` WHERE `id` LIKE '%O''Reilly%' OR `customer` LIKE '%O''Reilly%' LIMIT 10;",
  );
  assert.equal(
    buildTableFullTextSql(dialect, "app", "`app`.`orders`", [{ name: "id", type: "int" }], "7"),
    "SELECT * FROM `app`.`orders` WHERE `id` = 7 LIMIT 10;",
  );
  assert.equal(
    buildTableFullTextSql(dialect, "app", "`app`.`orders`", [{ name: "payload", type: "json" }], "text"),
    null,
  );

  const table = {
    label: "orders",
    fullTextSQL: (term: string) => term === "open" ? "SELECT 1" : null,
  };
  const group = { getChildren: async () => [table] };
  const root = { getChildren: async () => [group] };
  const targets = await collectFullTextSearchTargets(root);
  assert.deepEqual(targets.map((item) => item.label), ["orders"]);
});

test("dump command builders preserve target options without putting passwords in argv", () => {
  const mysql = {
    id: "mysql-1",
    type: "MySQL" as const,
    name: "local db",
    host: "db host",
    port: 3307,
    user: "root user",
    password: "secret; do not expose",
    database: "app",
    options: { useSSL: false },
  };
  const mysqlConfig = {
    ...createMysqlDumpConfig(mysql, "mysqldump"),
    databases: "app",
    tables: "orders order_items",
    addDropTable: true,
    noData: true,
  };
  const mysqlArgs = buildMysqlDumpArguments(mysql, mysqlConfig, "mysqldump 8.0");
  assert.deepEqual(mysqlArgs.slice(0, 6), ["-h", "db host", "-P", "3307", "-u", "root user"]);
  assert.ok(mysqlArgs.includes("--no-data"));
  assert.ok(mysqlArgs.includes("orders"));
  assert.ok(!mysqlArgs.some((argument) => argument.includes("secret")));
  assert.equal(defaultDumpExecutable("MySQL", "win32"), "mysqldump");
  assert.equal(isDumpSupported("PostgreSQL"), true);
  assert.equal(isDumpSupported("SQLite"), false);
});

test("PostgreSQL dump builder quotes table identifiers and resolves placeholders", () => {
  const connection = {
    id: "pg-1",
    type: "PostgreSQL" as const,
    name: "analytics",
    host: "localhost",
    port: 5433,
    user: "reporter",
    password: "pg-secret",
    database: "warehouse",
    schema: "reporting",
  };
  const config = {
    ...createPostgresDumpConfig(connection, "pg_dump"),
    outputPath: "exports/{data_source}-{timestamp}-{database}.dump",
    schemas: "reporting archive",
    tables: "orders daily totals",
    statements: "column-insert" as const,
    format: "custom" as const,
    addDrop: true,
  };
  const output = resolveDumpOutputPath(
    config.outputPath,
    connection,
    new Date(2026, 0, 2, 13, 4, 5),
    "C:\\Users\\tester",
  );
  assert.equal(output, "C:\\Users\\tester\\exports\\analytics-2026-01-02_010405-warehouse.dump");
  const args = buildPostgresDumpArguments(connection, config, output);
  assert.ok(args.includes("--column-inserts"));
  assert.ok(args.includes("--clean"));
  assert.ok(args.includes("-n"));
  assert.ok(args.includes('"reporting"."orders"'));
  assert.ok(args.includes("-f"));
  assert.ok(!args.some((argument) => argument.includes("pg-secret")));
});

test("MongoDB dump arguments preserve URI and collection scope without shell composition", () => {
  const connection = {
    id: "mongo-1",
    type: "MongoDB" as const,
    host: "mongo.internal",
    port: 27018,
    user: "reporter",
    password: "secret",
    database: "app",
  };
  assert.equal(defaultMongoExecutable("dump"), "mongodump");
  assert.equal(defaultMongoExecutable("restore"), "mongorestore");
  assert.deepEqual(mongoExecutableCandidates("dump"), ["mongodump"]);
  assert.deepEqual(
    buildMongoDumpArguments(connection, "dump", {
      path: "D:/backups/app",
      database: "app",
      collection: "orders",
    }),
    [
      "--host", "mongo.internal",
      "--port", "27018",
      "--username", "reporter",
      "--password", "secret",
      "--db", "app",
      "--collection", "orders",
      "--out", "D:/backups/app",
    ],
  );
  assert.deepEqual(
    buildMongoDumpArguments(connection, "restore", { path: "D:/backups/app" }),
    [
      "--host", "mongo.internal",
      "--port", "27018",
      "--username", "reporter",
      "--password", "secret",
      "D:/backups/app",
    ],
  );
  assert.deepEqual(
    buildMongoDumpArguments({
      id: "mongo-uri",
      type: "MongoDB",
      connectionUrl: "mongodb://user:password@mongo.internal/app",
      database: "app",
    }, "dump", { path: "D:/backups/app" }),
    ["mongodb://user:password@mongo.internal/app", "--db", "app", "--out", "D:/backups/app"],
  );
});

test("result paging preserves the base query and keeps count parsing typed", () => {
  const sql = "SELECT * FROM orders ORDER BY id LIMIT 100;";
  assert.equal(
    buildResultPageSql(sql, "MySQL", { pageNum: 2, pageSize: 25 }),
    "SELECT * FROM orders ORDER BY id LIMIT 25 OFFSET 25;",
  );
  assert.equal(
    buildResultPageSql("SELECT TOP 50 * FROM orders", "SqlServer", { pageNum: 2, pageSize: 10 }),
    "SELECT * FROM orders ORDER BY (SELECT 1) OFFSET 10 ROWS FETCH NEXT 10 ROWS ONLY;",
  );
  assert.equal(
    buildResultPageSql("GET /orders", "ElasticSearch", { pageNum: 2, pageSize: 10 }),
    undefined,
  );
  assert.equal(
    buildResultCountSql("SELECT * FROM orders ORDER BY id LIMIT 100;"),
    "SELECT COUNT(*) AS dbclient_count FROM (SELECT * FROM orders ORDER BY id) AS dbclient_count_query;",
  );
  assert.equal(
    buildResultCountSql("SELECT * FROM orders ORDER BY id", "Oracle"),
    "SELECT COUNT(*) AS dbclient_count FROM (SELECT * FROM orders ORDER BY id) dbclient_count_query;",
  );
  assert.equal(resultCount({ DBCLIENT_COUNT: "42" }), 42);
  assert.equal(resultCount({ count: "not-a-number" }), undefined);
});

test("result filtering and sorting stay parameter-safe and preserve the query shape", () => {
  assert.equal(
    buildResultFilterSql("SELECT * FROM orders ORDER BY id LIMIT 100", "MySQL", "customer_name", "LIKE", "%ann%"),
    "SELECT * FROM orders WHERE `customer_name` LIKE '%ann%' ORDER BY id;",
  );
  assert.equal(
    buildResultFilterSql("SELECT * FROM orders", "PostgreSQL", "id", "=", "7"),
    'SELECT * FROM orders WHERE "id" = 7;',
  );
  assert.equal(
    buildResultFilterSql("SELECT * FROM orders", "MySQL", "id; DROP TABLE orders", "=", "7"),
    undefined,
  );
  assert.equal(
    buildResultSortSql("SELECT * FROM orders ORDER BY created_at", "SqlServer", "id", true),
    "SELECT * FROM orders ORDER BY [id] DESC;",
  );
});

test("result filter collections preserve multiple column predicates", () => {
  const sql = buildResultFiltersSql(
    "SELECT * FROM orders",
    "MySQL",
    [
      { column: "customer", operator: "LIKE", value: "%ann%" },
      { column: "id", operator: ">=", value: "7" },
    ],
  );
  assert.equal(
    sql,
    "SELECT * FROM orders WHERE \`customer\` LIKE '%ann%' AND \`id\` >= 7;",
  );
});

test("result mutation builders cover table rows and document databases", () => {
  const mysql = new MySqlDialect();
  const tableContext = {
    dbType: "MySQL" as const,
    dialect: mysql,
    schema: "app",
    table: "orders",
    fields: [{ name: "id" }, { name: "customer" }, { name: "note" }],
    primaryKey: "id",
  };
  const statements = buildResultMutationSql(tableContext, {
    updates: [{
      original: { id: 7, customer: "Ann", note: "old" },
      current: { id: 7, customer: "Ann", note: "new's note" },
    }],
    inserts: [{ customer: "Bob", note: null }],
    deletes: [{ id: 8 }],
  });
  assert.deepEqual(statements, [
    "INSERT INTO `app`.`orders` (`customer`, `note`) VALUES ('Bob', NULL);",
    "UPDATE `app`.`orders` SET `note` = 'new''s note' WHERE `id` = 7;",
    "DELETE FROM `app`.`orders` WHERE `id` = 8;",
  ]);
  assert.deepEqual(
    buildResultMutationSql(tableContext, {
      updates: [{
        original: { id: 7, note: null },
        current: { id: 7, note: { kind: "binary", base64: "aGk=" } },
      }],
    }),
    ["UPDATE `app`.`orders` SET `note` = X'6869' WHERE `id` = 7;"],
  );
  assert.deepEqual(
    buildResultMutationSql({
      dbType: "MongoDB",
      database: "app",
      table: "orders",
      fields: [{ name: "_id" }, { name: "customer" }],
      primaryKey: "_id",
    }, {
      updates: [{ original: { _id: "a" }, current: { _id: "a", customer: "Ann" } }],
    }),
    ['db("app").collection("orders").updateOne({_id:"a"},{$set:{"customer":"Ann"}})'],
  );
});

test("result export and import preserve target formats and typed import modes", () => {
  const dialect = new MySqlDialect();
  const context = {
    rows: [{ id: 7, customer: "Ann", note: "a|b" }],
    fields: [{ name: "id" }, { name: "customer" }, { name: "note" }],
    sql: "SELECT id, customer, note FROM orders;",
    dbType: "MySQL" as const,
    dialect,
    schema: "app",
    table: "orders",
  };

  const csv = serializeResultExport(context, {
    type: "CSV",
    csvDelimiter: "semicolon",
  });
  assert.equal(csv.text, "id;customer;note\n7;Ann;a|b\n");
  assert.deepEqual(parseResultImportRows(csv.bytes, "CSV", { csvDelimiter: "semicolon" }), context.rows);

  const markdown = serializeResultExport(context, { type: "Markdown" });
  assert.match(markdown.text || "", /# SQL/);
  assert.match(markdown.text || "", /\| a\\\|b \|/);

  const sql = serializeResultExport(context, { type: "SQL" });
  assert.equal(
    sql.text,
    "INSERT INTO `app`.`orders` (`id`, `customer`, `note`) VALUES (7, 'Ann', 'a|b');\n",
  );

  const xlsx = serializeResultExport(context, { type: "XLSX", exportSQL: true });
  assert.equal(xlsx.bytes[0], 0x50);
  assert.deepEqual(parseResultImportRows(xlsx.bytes, "XLSX"), context.rows);

  assert.deepEqual(
    buildImportMutations({
      dbType: "MySQL",
      dialect,
      schema: "app",
      table: "orders",
      fields: context.fields,
      primaryKey: "id",
    }, [{ id: 7, customer: "Ann", note: "new" }], { mode: "upsert" }),
    [
      "INSERT INTO `app`.`orders` (`id`, `customer`, `note`) VALUES (7, 'Ann', 'new') ON DUPLICATE KEY UPDATE `customer` = VALUES(`customer`), `note` = VALUES(`note`);",
    ],
  );
  assert.deepEqual(
    buildImportMutations({
      dbType: "MySQL",
      dialect,
      schema: "app",
      table: "orders",
      fields: context.fields,
      primaryKey: "id",
    }, [{ id: 7, customer: "Ann" }], { skipPrimaryKey: true }),
    [
      "INSERT INTO `app`.`orders` (`customer`) VALUES ('Ann');",
    ],
  );
});

test("parquet import uses the async file boundary and preserves rows", async () => {
  const directory = await mkdtemp(join(tmpdir(), "database-client-import-"));
  const path = join(directory, "rows.parquet");
  try {
    const bytes = Buffer.from(
      "UEFSMRUGFRQVGFwVBBUAFQQVABUEFQAAAAMDCBwBAAAAAgAAABUGFSAVJFwVBBUAFQQVABUEFQAAAAMDDjQDAAAAQW5uAwAAAEJvYhUEGTxIBHJvb3QVBAAVAiUCGAJpZAAVDCUCGARuYW1lJQAAFgQZHBksJggcFQIZFQAZGAJpZBUCFgQWQhZCJgg8NgAoBAIAAAAYBAEAAAAAGRwVBhUAFQIAAAAmShwVDBkVABkYBG5hbWUVAhYEFk4WTiZKPDYAKANCb2IYA0FubgAZHBUGFQAVAgAAABaQARYEACgJaHlwYXJxdWV0AJ8AAABQQVIx",
      "base64",
    );
    await writeFile(path, bytes);
    assert.equal(importFormatFromPath(path), "PARQUET");
    assert.deepEqual(await parseResultImportFile(path, "PARQUET"), [
      { id: 1, name: "Ann" },
      { id: 2, name: "Bob" },
    ]);
    assert.deepEqual(await readFile(path), bytes);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("query files stay scoped, typed, and renameable across the saved-query boundary", async () => {
  const root = await mkdtemp(join(tmpdir(), "database-client-query-"));
  const service = new QueryFileService(root);
  const connection = {
    id: "mysql/demo",
    type: "MySQL" as const,
    database: "app",
    schema: "reporting",
  };
  const directory = service.defaultDirectory(connection);
  try {
    assert.equal(queryName(" monthly report.sql"), "monthly report");
    assert.throws(() => queryName("..."), /Query name is required/);

    const filePath = await service.create(directory, "monthly report.sql", "sql", "SELECT 1;");
    const nestedDirectory = join(directory, "reports");
    const nestedFilePath = await service.create(nestedDirectory, "daily.sql", "sql", "SELECT 2;");
    assert.equal(await service.read(filePath), "SELECT 1;");
    assert.equal(service.isQueryFile(filePath), true);
    assert.deepEqual(await service.list(directory), [{
      name: "monthly report",
      filePath,
      extension: "sql",
      directory,
    }]);
    const tree = await service.listTree(directory);
    assert.equal("kind" in (tree[0] || {}), true);
    assert.equal(tree[0]?.name, "reports");
    assert.equal(tree[1]?.name, "monthly report");

    const renamedPath = await service.rename(filePath, "monthly report book.sql");
    assert.equal(renamedPath.endsWith("monthly report book.sql"), true);
    assert.equal((await service.list(directory))[0]?.extension, "sql");
    await service.remove(renamedPath);
    await service.remove(nestedFilePath);
    assert.deepEqual(await service.list(directory), []);
    assert.equal(service.isQueryFile(join(directory, "notes.txt")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("result values preserve driver wrappers across display, editing, and mutation boundaries", () => {
  const longString = { type: "LongString", origin: null };
  const serializedBuffer = { type: "Buffer", data: [104, 105] };
  assert.equal(resultValueOrigin(longString), null);
  assert.equal(resultValueText({ type: "LongString", origin: "large text" }), "large text");
  assert.equal(resultBinaryBase64(serializedBuffer), "aGk=");
  assert.equal(resultValueText(serializedBuffer), "[binary 2 bytes]");
  assert.equal(resultValueEditText({ kind: "binary", base64: "aGk=" }), "base64:aGk=");
  assert.deepEqual(parseResultBinaryInput("base64:aGk="), { kind: "binary", base64: "aGk=" });
  assert.equal(parseResultBinaryInput("NULL"), null);
  assert.throws(
    () => parseResultBinaryInput("plain text"),
    /base64: prefix/,
  );
  assert.deepEqual(
    buildResultMutationSql({
      dbType: "MySQL",
      dialect: new MySqlDialect(),
      schema: "app",
      table: "orders",
      fields: [{ name: "id" }, { name: "note" }],
      primaryKey: "id",
    }, {
      updates: [{
        original: { id: 7, note: null },
        current: { id: 7, note: serializedBuffer },
      }],
    }),
    ["UPDATE `app`.`orders` SET `note` = X'6869' WHERE `id` = 7;"],
  );
});

test("result values preserve target long-string, binary, and image preview boundaries", () => {
  const source = "x".repeat(65_536);
  const longString = formatResultValue(source);
  assert.equal((longString as { type?: string }).type, "LongString");
  assert.match(resultValueText(longString), /^\[1024 of 65536\] x+$/);
  assert.equal(resultValueExportText(longString).length, source.length);
  assert.equal(resultValueEditText(longString).length, source.length);

  const png = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0, 0, 0, 0, 0x49, 0x48, 0x44, 0x52,
    0, 0, 0, 1, 0, 0, 0, 2,
  ]);
  const image = formatResultValue(png, "BLOB") as { type: string; origin: string; data: string };
  assert.equal(image.type, "Image");
  assert.equal(image.origin, "0x89504E470D0A1A0A00000000494844520000000100000002");
  assert.equal(image.data, "[PNG: 1x2] 24 bytes");
  assert.equal(resultBinaryHex(image), image.origin.slice(2).toLowerCase());

  const normalized = normalizeResultValues({
    rows: [{ body: source, payload: Buffer.from([0, 255]) }],
    fields: [{ name: "body", type: "TEXT" }, { name: "payload", type: "VARBINARY" }],
  });
  assert.equal(resultValueText(normalized.rows[0]?.body), "[1024 of 65536] " + "x".repeat(1024));
  assert.equal(resultBinaryBase64(normalized.rows[0]?.payload), "AP8=");
});

test("result mutations avoid large or structured columns in fallback row predicates", () => {
  const dialect = new MySqlDialect();
  assert.deepEqual(
    buildResultMutationSql({
      dbType: "MySQL",
      dialect,
      table: "events",
      fields: [
        { name: "payload", type: "JSON" },
        { name: "created_at", type: "TIMESTAMP" },
        { name: "body", type: "BLOB" },
        { name: "status", type: "VARCHAR" },
      ],
    }, {
      deletes: [{
        payload: { state: "open" },
        created_at: "2026-08-07 12:00:00",
        body: "large body",
        status: "open",
      }],
    }),
    ["DELETE FROM `events` WHERE `status` = 'open';"],
  );
});

test("MongoDB BSON values normalize to editable target-style shell values", async () => {
  const { Binary, ObjectId, Timestamp } = await import("mongodb");
  const value = normalizeMongoValue({
    id: new ObjectId("507f1f77bcf86cd799439011"),
    payload: Binary.createFromBase64("AQID", 0),
    timestamp: Timestamp.fromNumber(9),
    createdAt: new Date("2026-08-06T00:00:00.000Z"),
  });
  assert.deepEqual(value, {
    id: "ObjectID('507f1f77bcf86cd799439011')",
    payload: "BinData(0, 'AQID')",
    timestamp: "Timestamp({ t: 0, i: 9 })",
    createdAt: "2026-08-06T00:00:00.000Z",
  });
});

test("Redis stream consumer groups normalize array and object replies", () => {
  assert.deepEqual(
    normalizeRedisConsumerGroups([
      ["name", "workers", "consumers", 2, "pending", 3, "last-delivered-id", "4-0", "lag", 1],
    ]),
    [{ name: "workers", consumers: 2, pending: 3, "last-delivered-id": "4-0", lag: 1 }],
  );
  assert.deepEqual(
    normalizeRedisConsumerGroups({ groups: [{ name: "alerts", consumers: 1 }] }),
    [{ name: "alerts", consumers: 1 }],
  );
});

test("Redis SSH cluster metadata becomes master-only NAT mappings", () => {
  const nodes = parseRedisClusterNodes([
    "a 10.0.0.1:7000@17000 myself,master - 0 0 1 connected",
    "b 10.0.0.2:7001@17001 slave a 0 0 2 connected",
    "c [::1]:7002@17002 master - 0 0 3 connected",
    "a 10.0.0.1:7000@17000 myself,master - 0 0 1 connected",
  ].join("\n"));
  assert.deepEqual(nodes, [
    { host: "10.0.0.1", port: 7000 },
    { host: "::1", port: 7002 },
  ]);
  assert.deepEqual(buildRedisClusterNatMap([
    { host: "10.0.0.1", port: 7000, localHost: "127.0.0.1", localPort: 18001 },
    { host: "::1", port: 7002, localHost: "127.0.0.1", localPort: 18002 },
  ]), {
    "10.0.0.1:7000": { host: "127.0.0.1", port: 18001 },
    "::1:7002": { host: "127.0.0.1", port: 18002 },
  });
});

test("Redis collection item mutations preserve add and edit semantics", () => {
  assert.deepEqual(
    buildRedisItemCommands({
      keyName: "orders",
      type: "hash",
      old: { key: "old", value: "1" },
      key: "new",
      value: "2",
    }),
    ['HDEL "orders" "old"', 'HSET "orders" "new" "2"'],
  );
  assert.deepEqual(
    buildRedisItemCommands({ keyName: "queue", type: "list", value: "first", position: "head" }),
    ['LPUSH "queue" "first"'],
  );
  assert.deepEqual(
    buildRedisItemCommands({
      keyName: "scores",
      type: "zset",
      old: { value: "Ann", score: 1 },
      value: "Ann",
      score: 3,
    }),
    ['ZADD "scores" 3 "Ann"'],
  );
  assert.deepEqual(
    buildRedisItemCommands({
      keyName: "scores",
      type: "zset",
      old: { value: "Ann", score: 1 },
      value: "Bob",
      score: 2,
    }),
    ['ZREM "scores" "Ann"', 'ZADD "scores" 2 "Bob"'],
  );
});

test("Redis tree protocol normalizes keyspace metadata and scan cursors", () => {
  const metadata = parseRedisKeyspaceInfo([
    "# Keyspace",
    "db0:keys=3,expires=1,avg_ttl=2500",
    "db2:keys=8,expires=0,avg_ttl=0",
  ].join("\n"));
  assert.deepEqual(metadata.get("db0"), undefined);
  assert.deepEqual(metadata.get("0"), {
    name: "0",
    keys: 3,
    expires: 1,
    avgTtl: 2500,
  });
  assert.deepEqual(parseRedisScanPage(["17", ["user:1", "user:2"]]), {
    cursor: "17",
    keys: ["user:1", "user:2"],
  });
  assert.deepEqual(parseRedisScanPage(["0", undefined]), {
    cursor: "0",
    keys: [],
  });
});

test("Redis info protocol ignores section headers and preserves typed values", () => {
  assert.deepEqual(
    [...parseRedisInfo("# Server\nredis_version:7.2.5\n\n# Memory\nused_memory_human:1.25M\n")],
    [
      ["redis_version", "7.2.5"],
      ["used_memory_human", "1.25M"],
    ],
  );
});

test("target SQL tree visibility preserves include and system-schema rules", () => {
  assert.deepEqual(
    filterTargetTreeNames(
      { type: "MySQL", advance: { includeDatabases: "orders, reporting" } },
      ["mysql", "orders", "reporting", "analytics"],
      "database",
    ),
    ["orders", "reporting"],
  );
  assert.deepEqual(
    filterTargetTreeNames(
      { type: "PostgreSQL", advance: { excludedSchemas: "^audit" } },
      ["public", "pg_catalog", "audit_log"],
      "schema",
    ),
    ["public"],
  );
});

class FakeConnection implements DatabaseConnection {
  public readonly type = "Oracle" as const;
  public queryCount = 0;
  public closed = false;
  public lastQueryOptions?: QueryOptions;

  public constructor(public readonly id: string) {}

  public async query<Row>(_sql: string, options?: QueryOptions): Promise<QueryResult<Row>> {
    this.queryCount += 1;
    this.lastQueryOptions = options;
    return { rows: [] as Row[], fields: [] };
  }

  public async close(): Promise<void> {
    this.closed = true;
  }
}

class FakeFactory implements ConnectionFactory {
  public createCount = 0;
  public readonly connections: FakeConnection[] = [];
  public lastOptions?: {
    host?: string;
    port?: number;
    connectionUrl?: string;
  };

  public supports(type: string): boolean {
    return type === "Oracle";
  }

  public async create(options: {
    id: string;
    type: "Oracle";
    host?: string;
    port?: number;
    connectionUrl?: string;
  }): Promise<DatabaseConnection> {
    this.createCount += 1;
    this.lastOptions = {
      host: options.host,
      port: options.port,
      connectionUrl: options.connectionUrl,
    };
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
  const parameter = Buffer.from([0, 255]);
  await manager.query(options, "update orders set payload = ?", { params: [parameter] });
  assert.deepEqual(factory.connections[0].lastQueryOptions?.params, [parameter]);

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

test("connection manager routes usingSSH connections through a managed local tunnel", async () => {
  const factory = new FakeFactory();
  const calls: string[] = [];
  const tunnel: ConnectionTunnelService = {
    async start(options, definition) {
      calls.push(`start:${options.host}:${definition.remoteHost}:${definition.remotePort}`);
    },
    async stop(id) {
      calls.push(`stop:${String(id)}`);
    },
    activePort() {
      return 45_555;
    },
  };
  const manager = new ConnectionManager(new NoopLogger(), tunnel);
  manager.registerFactory(factory);
  const options = {
    id: "oracle-ssh",
    type: "Oracle" as const,
    host: "database.internal",
    port: 1521,
    options: {
      usingSSH: true,
      ssh: {
        host: "bastion.internal",
        port: 22,
        username: "jump",
      },
    },
  };

  await manager.getConnection(options);
  assert.deepEqual(factory.lastOptions, {
    host: "127.0.0.1",
    port: 45_555,
    connectionUrl: undefined,
  });
  assert.deepEqual(calls, ["start:bastion.internal:database.internal:1521"]);

  await manager.close(options.id);
  assert.deepEqual(calls, [
    "start:bastion.internal:database.internal:1521",
    "stop:connection:oracle-ssh",
  ]);
});

test("standard connection factories expose every recovered driver family", () => {
  const factories = createStandardConnectionFactories();
  const supported = (type: string) =>
    factories.some((factory) => factory.supports(type));

  for (const type of [
    "MySQL",
    "MariaDB",
    "PostgreSQL",
    "Oracle",
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
    "Zookeeper",
  ]) {
    assert.equal(supported(type), true, `missing factory for ${type}`);
  }
});

test("SQLite factory accepts an explicit staged WASM directory", async () => {
  const factory = createExtendedConnectionFactories(
    join(process.cwd(), "node_modules", "sql.js", "dist"),
  ).find((candidate) => candidate.supports("SQLite"));
  assert.ok(factory);
  const connection = await factory.create({
    id: "sqlite-factory",
    type: "SQLite",
  });
  try {
    const result = await connection.query(
      "CREATE TABLE sample (id INTEGER, label TEXT); INSERT INTO sample VALUES (1, 'ready'); SELECT * FROM sample;",
    );
    assert.deepEqual(result.rows, [{ id: 1, label: "ready" }]);
  } finally {
    await connection.close();
  }
});

test("Loki responses preserve labels and stream rows across the HTTP envelope", () => {
  assert.deepEqual(
    normalizeLokiRows({ status: "success", data: ["job", "filename"] }),
    [
      { name: "job", value: "job" },
      { name: "filename", value: "filename" },
    ],
  );
  assert.deepEqual(
    normalizeLokiRows({
      status: "success",
      data: { resultType: "streams", result: [{ stream: { job: "api" }, values: [["1", "ok"]] }] },
    }),
    [{ stream: { job: "api" }, values: [["1", "ok"]] }],
  );
});

test("SSL connection options load target certificate paths into driver material", async () => {
  const root = await mkdtemp(join(tmpdir(), "database-client-ssl-"));
  const caPath = join(root, "ca.pem");
  await writeFile(caPath, "CA CERTIFICATE", "utf8");

  assert.deepEqual(buildSslOptions({
    id: "ssl-1",
    type: "MySQL",
    options: {
      useSSL: true,
      caPath,
      disableTLSVerification: false,
    },
  }), {
    ca: "CA CERTIFICATE",
    rejectUnauthorized: true,
  });
  assert.equal(buildSslOptions({ id: "ssl-2", type: "MySQL" }), undefined);

  await rm(root, { recursive: true, force: true });
});

test("SQL history keeps the target bounded, reversed-view payload, and document format", () => {
  const first = normalizeSqlHistoryEntry({
    sql: "SELECT 1",
    date: 1,
    costTime: 12,
    dbType: "MySQL",
  });
  assert.ok(first);
  const second = normalizeSqlHistoryEntry({
    sql: "SELECT 2",
    date: 2,
    costTime: 4,
    dbType: "PostgreSQL",
  });
  assert.ok(second);
  assert.deepEqual(readSqlHistory([first, { invalid: true }, second]), [first, second]);
  assert.deepEqual(appendSqlHistory([first, second], {
    sql: "SELECT 3",
    date: 3,
    costTime: 1,
    dbType: "SQLite",
  }, 2).map((entry) => entry.sql), ["SELECT 2", "SELECT 3"]);
  assert.equal(compactSqlHistoryLabel("SELECT\n*\nFROM users"), "SELECT * FROM users");
  assert.match(sqlHistoryDocument(second), /SELECT 2/);
  assert.match(sqlHistoryDocument(second), /PostgreSQL/);
});
