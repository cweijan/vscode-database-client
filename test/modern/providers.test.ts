import assert from "node:assert/strict";
import test from "node:test";

import {
  formatSql,
  isExecutableSqlBlock,
  parseSqlBlocks,
  parseSqlTableReferences,
  sqlWordAt,
} from "../../src/modern/providers/sqlDocumentModel";
import {
  formatElasticBody,
  parseElasticRequests,
} from "../../src/modern/providers/elasticsearchDocumentModel";
import {
  deserializeSqlBook,
  serializeSqlBook,
} from "../../src/modern/providers/sqlNotebookModel";
import { createStandardDialects } from "../../src/modern/database/standardDialects";
import {
  dockerComposeCodeLensEnabled,
  messageQueueCodeLensCommands,
  sqlCodeLensCommands,
} from "../../src/modern/providers/supplementalCodeLens";
import { MongoTypeProvider } from "../../src/modern/providers/mongoTypeProvider";
import {
  detectSqlCompletionTarget,
  parseSqlEnumValues,
  parseSqlCteDefinitions,
  parseSqlProcedureVariables,
} from "../../src/modern/providers/sqlCompletionContext";
import {
  buildMongoFieldProbe,
  mongoFieldNames,
  mongoFieldPrefix,
  parseMongoCollectionReference,
} from "../../src/modern/providers/mongoFieldCompletion";

test("SQL block parser keeps quoted semicolons and comments inside one statement", () => {
  const blocks = parseSqlBlocks(
    "select 'a;b' as value; -- ignored ;\nselect /* ; */ 2;",
  );
  assert.deepEqual(blocks.map((block) => block.text), [
    "select 'a;b' as value;",
    "select /* ; */ 2;",
  ]);
});

test("SQL language feature filtering excludes comments and delimiter directives", () => {
  assert.equal(
    isExecutableSqlBlock({ text: "-- generated comment", start: 0, end: 19 }),
    false,
  );
  assert.equal(
    isExecutableSqlBlock({ text: "DELIMITER $$", start: 0, end: 13 }),
    false,
  );
  assert.equal(
    isExecutableSqlBlock({ text: "/*!40101 SET sql_mode = 'NO_ZERO_DATE' */", start: 0, end: 42 }),
    true,
  );
  assert.equal(
    isExecutableSqlBlock({ text: "SELECT 1 -- trailing comment", start: 0, end: 28 }),
    true,
  );
});

test("SQL formatter applies stable keyword casing without changing literals", () => {
  assert.equal(
    formatSql("select 'from value' from users where id = 1"),
    "SELECT 'from value' FROM users WHERE id = 1",
  );
});

test("SQL formatter expands long clauses and top-level lists", () => {
  assert.equal(
    formatSql("SELECT id, name, created_at FROM orders WHERE status = 'open' AND tenant_id = 42 ORDER BY created_at DESC"),
    [
      "SELECT",
      "    id,",
      "    name,",
      "    created_at",
      "FROM",
      "    orders",
      "WHERE",
      "    status = 'open'",
      "    AND tenant_id = 42",
      "ORDER BY",
      "    created_at DESC",
    ].join("\n"),
  );
});

test("SQL table references preserve schema qualification and source ranges", () => {
  const source = "SELECT * FROM `sales`.`orders` JOIN customers c ON c.id = orders.id";
  const references = parseSqlTableReferences(source);
  assert.deepEqual(
    references.map(({ name, schema }) => ({ name, schema })),
    [
      { name: "orders", schema: "sales" },
      { name: "customers", schema: undefined },
    ],
  );
  assert.equal(source.slice(references[0].start, references[0].end), "`sales`.`orders`");
  assert.deepEqual(sqlWordAt(source, source.indexOf("orders") + 2)?.word, "orders");
});

test("SQL Book serializer preserves code and markup cell boundaries", () => {
  const source = serializeSqlBook([
    { kind: "Code", language: "sql", value: "SELECT 1;" },
    { kind: "Markup", language: "markdown", value: "# Notes" },
  ]);
  assert.equal(source, "-- SQLBook: Code\nSELECT 1;\n-- SQLBook: Markup\n# Notes");
  assert.deepEqual(deserializeSqlBook(source), [
    { kind: "Code", language: "sql", value: "SELECT 1;" },
    { kind: "Markup", language: "sql", value: "# Notes" },
  ]);
});

test("Elasticsearch request parser keeps multiline JSON bodies and reports invalid JSON", () => {
  const requests = parseElasticRequests(`GET /_search
{
  // comment-json is accepted by the target editor
  "query": { "match_all": {} }
}

POST /orders/_search
{
  "query": { "match": []
}`);

  assert.equal(requests.length, 2);
  assert.equal(requests[0].method, "GET");
  assert.equal(requests[0].path, "/_search");
  assert.deepEqual(requests[0].body, { query: { match_all: {} } });
  assert.match(requests[1].error ?? "", /Unexpected|expect|invalid/i);
});

test("Elasticsearch parser keeps a following request separate from an invalid body", () => {
  const requests = parseElasticRequests(`POST /orders/_search
not-json

GET /_count`);

  assert.equal(requests.length, 2);
  assert.equal(requests[0].bodyText, "not-json");
  assert.equal(requests[0].error, "Request body is not valid JSON.");
  assert.equal(requests[1].path, "/_count");
});

test("Elasticsearch body formatter produces stable readable JSON", () => {
  assert.equal(
    formatElasticBody({ query: { term: { status: "open" } } }),
    '{\n  "query": {\n    "term": {\n      "status": "open"\n    }\n  }\n}',
  );
});

test("standard dialect registry covers the target SQL families", () => {
  const dialects = createStandardDialects();
  const resolve = (type: string) => dialects.find((dialect) => dialect.supports(type));
  assert.equal(resolve("MySQL")?.id, "mysql");
  assert.equal(resolve("PostgreSQL")?.id, "postgresql");
  assert.equal(resolve("SqlServer")?.id, "sqlserver");
  assert.equal(resolve("SQLite")?.id, "sqlite");
  assert.equal(resolve("Oracle")?.id, "oracle");
  assert.equal(resolve("AzureSQLServer")?.id, "sqlserver");
  assert.equal(resolve("PostgreCompatible")?.id, "postgresql");
  assert.equal(resolve("Doris")?.id, "clickhouse");
  assert.equal(resolve("MongoDB"), undefined);
});

test("MySQL source queries remain valid when a connection has no default schema", () => {
  const mysql = createStandardDialects().find((dialect) => dialect.id === "mysql");
  assert.ok(mysql);
  assert.equal(mysql.showTableSource?.(null, "orders"), "SHOW CREATE TABLE `orders`;");
  assert.equal(mysql.showViewSource?.(null, "orders_view"), "SHOW CREATE VIEW `orders_view`;");
});

test("supplemental CodeLens decisions keep Kafka-only controls out of RabbitMQ", () => {
  assert.deepEqual(
    messageQueueCodeLensCommands(true, "RabbitMQ").map((item) => item.command),
    ["mysql.kafka.topic.produce.send"],
  );
  assert.deepEqual(
    messageQueueCodeLensCommands(false, "Kafka").map((item) => item.command),
    ["mysql.kafka.consumer.start", "mysql.kafka.consumer.configOffset"],
  );
  assert.deepEqual(
    messageQueueCodeLensCommands(false, "RabbitMQ", true).map((item) => item.command),
    ["mysql.kafka.consumer.stop"],
  );
});

test("SQL CodeLens decisions preserve target selection and optional AI actions", () => {
  assert.deepEqual(
    sqlCodeLensCommands({
      isQuery: true,
      isTemplate: false,
      isMultiLine: false,
      lineCount: 0,
      copilotInstalled: true,
    }),
    [{ command: "mysql.ai.copilot", title: "$(comment-discussion) Ask AI" }],
  );
  assert.deepEqual(
    sqlCodeLensCommands({
      isQuery: false,
      isTemplate: false,
      isMultiLine: true,
      lineCount: 3,
      appName: "Cursor",
      copilotInstalled: true,
    }).map((item) => item.command),
    ["mysql.codeLens.copy", "mysql.ai.cursor"],
  );
  assert.deepEqual(
    sqlCodeLensCommands({
      isQuery: true,
      isTemplate: true,
      isMultiLine: true,
      lineCount: 3,
    }).map((item) => item.command),
    [],
  );
});

test("MongoDB type provider restores declaration locations and documentation", () => {
  const provider = new MongoTypeProvider("out/types/mongodb.d.ts");
  const find = provider.findByName("find");
  assert.ok(find);
  assert.equal(find.name, "find");
  assert.ok(find.line > 0);
  assert.ok(find.column >= 0);
  assert.ok(find.jsDoc.length > 0);
  assert.ok(find.trimJSDoc.length > 0);
  assert.equal(provider.findByName("notA MongoDB method"), undefined);
  assert.equal(provider.findByName("find"), find);
});

test("MongoDB field completion restores collection parsing and metadata boundaries", () => {
  assert.deepEqual(
    parseMongoCollectionReference('db("analytics").collection(\'orders\').find({ "st'),
    { database: "analytics", collection: "orders" },
  );
  assert.equal(mongoFieldPrefix('db("analytics").collection("orders").find({ "st'), "st");
  assert.equal(mongoFieldPrefix("db(\"analytics\").collection(\"orders\").find({ field"), undefined);
  assert.equal(
    buildMongoFieldProbe({ database: "analytics", collection: "orders" }),
    'db("analytics").collection("orders").find({}).limit(1)',
  );
  assert.deepEqual(
    mongoFieldNames({
      fields: [{ name: "_id" }, { name: "status" }],
      rows: [{ _id: "1", customer: "Ada", status: "open" }],
    }),
    ["status", "customer"],
  );
});

test("SQL completion restores table and alias column contexts", () => {
  assert.deepEqual(
    detectSqlCompletionTarget("SELECT * FROM orders o WHERE o.st", "SELECT * FROM orders o WHERE o.st".length),
    {
      kind: "columns",
      prefix: "st",
      qualifier: "o",
      references: [{ name: "orders", schema: undefined, start: 14, end: 20 }],
    },
  );
  assert.deepEqual(
    detectSqlCompletionTarget("SELECT * FROM ord", "SELECT * FROM ord".length),
    { kind: "tables", prefix: "ord" },
  );
  assert.deepEqual(
    detectSqlCompletionTarget("SELECT * FROM orders WHERE ", "SELECT * FROM orders WHERE ".length),
    {
      kind: "columns",
      prefix: "",
      references: [{ name: "orders", schema: undefined, start: 14, end: 20 }],
    },
  );
});

test("SQL value completion restores enum context and safe value parsing", () => {
  assert.deepEqual(
    detectSqlCompletionTarget(
      "SELECT * FROM orders o WHERE o.status = 'op",
      "SELECT * FROM orders o WHERE o.status = 'op".length,
    ),
    {
      kind: "values",
      prefix: "op",
      column: "status",
      qualifier: "o",
      references: [{ name: "orders", schema: undefined, start: 14, end: 20 }],
    },
  );
  assert.deepEqual(
    parseSqlEnumValues("enum('open','in progress','closed')"),
    ["open", "in progress", "closed"],
  );
  assert.deepEqual(parseSqlEnumValues("varchar(32)"), []);
});

test("MySQL variable completion restores user and system variable contexts", () => {
  assert.deepEqual(
    detectSqlCompletionTarget("SELECT @@ver", "SELECT @@ver".length),
    { kind: "variables", prefix: "ver", marker: "@@" },
  );
  assert.deepEqual(
    detectSqlCompletionTarget("SET @tenant = 1; SELECT @ten", "SET @tenant = 1; SELECT @ten".length),
    { kind: "variables", prefix: "ten", marker: "@" },
  );
  assert.deepEqual(
    detectSqlCompletionTarget("SELECT status", "SELECT status".length),
    { kind: "keywords", prefix: "status" },
  );
});

test("procedure variable completion restores parameters and declared locals", () => {
  const source = "CREATE PROCEDURE load_orders(IN p_id INT, OUT p_state VARCHAR(16)) BEGIN DECLARE v_count INT; SELECT p_";
  assert.deepEqual(
    parseSqlProcedureVariables(source).map(({ name, type, direction }) => ({ name, type, direction })),
    [
      { name: "p_id", type: "INT", direction: "IN" },
      { name: "p_state", type: "VARCHAR(16)", direction: "OUT" },
      { name: "v_count", type: "INT", direction: undefined },
    ],
  );
  assert.deepEqual(
    detectSqlCompletionTarget(source, source.length),
    {
      kind: "procedureVariables",
      prefix: "p_",
      variables: [
        { name: "p_id", type: "INT", direction: "IN" },
        { name: "p_state", type: "VARCHAR(16)", direction: "OUT" },
        { name: "v_count", type: "INT", direction: undefined },
      ],
    },
  );
});

test("SQL WITH completion restores CTE aliases without querying the CTE as a real table", () => {
  const source = "WITH recent AS (SELECT id, status AS state FROM orders) SELECT recent.st FROM recent";
  assert.deepEqual(parseSqlCteDefinitions(source), [
    {
      name: "recent",
      columns: ["id", "state"],
          references: [{ name: "orders", schema: undefined, start: 32, end: 38 }],
    },
  ]);
  assert.deepEqual(
    detectSqlCompletionTarget("WITH recent AS (SELECT id, status AS state FROM orders) SELECT recent.st", "WITH recent AS (SELECT id, status AS state FROM orders) SELECT recent.st".length),
    {
      kind: "columns",
      prefix: "st",
      qualifier: "recent",
      references: [],
      cteColumns: ["id", "state"],
    },
  );
});

test("Docker Compose CodeLens requires a persisted Docker context", () => {
  assert.equal(dockerComposeCodeLensEnabled("Docker", false), true);
  assert.equal(dockerComposeCodeLensEnabled("Docker", true), false);
  assert.equal(dockerComposeCodeLensEnabled("RabbitMQ", false), false);
});
