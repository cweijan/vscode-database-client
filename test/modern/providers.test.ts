import assert from "node:assert/strict";
import test from "node:test";

import { formatSql, parseSqlBlocks } from "../../src/modern/providers/sqlDocumentModel";
import {
  formatElasticBody,
  parseElasticRequests,
} from "../../src/modern/providers/elasticsearchDocumentModel";
import { createStandardDialects } from "../../src/modern/database/standardDialects";

test("SQL block parser keeps quoted semicolons and comments inside one statement", () => {
  const blocks = parseSqlBlocks(
    "select 'a;b' as value; -- ignored ;\nselect /* ; */ 2;",
  );
  assert.deepEqual(blocks.map((block) => block.text), [
    "select 'a;b' as value;",
    "select /* ; */ 2;",
  ]);
});

test("SQL formatter applies stable keyword casing without changing literals", () => {
  assert.equal(
    formatSql("select 'from value' from users where id = 1"),
    "SELECT 'from value' FROM users WHERE id = 1",
  );
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
