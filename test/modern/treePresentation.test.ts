import assert from "node:assert/strict";
import test from "node:test";

import {
  isActiveDatabaseTreeItem,
  targetConnectionIconSpec,
  targetSpecializedConnectionContext,
  targetRemoteTreePresentations,
  targetSqlTreePresentations,
  targetSqlAuthTreePresentations,
  targetSpecializedTreePresentations,
  targetThemeIcon,
  targetTreeFeatureEnabled,
} from "../../src/modern/tree/targetTreePresentation";
import {
  groupConnectionEntries,
  isConnectionGroupBranch,
} from "../../src/modern/tree/connectionGrouping";

test("target connection icons keep the installed database-specific asset names", () => {
  const expected: ReadonlyArray<readonly [string, string]> = [
    ["MySQL", "mysql.svg"],
    ["MariaDB", "mariadb.svg"],
    ["PostgreSQL", "postgresql.svg"],
    ["SqlServer", "sqlserver.svg"],
    ["SQLite", "sqlite.svg"],
    ["MongoDB", "mongodb.svg"],
    ["Redis", "redis.png"],
    ["ElasticSearch", "elasticsearch.svg"],
    ["Kafka", "kafka_light.png"],
    ["RabbitMQ", "rabbitmq.svg"],
    ["Loki", "loki.png"],
    ["Neo4j", "neo4j.png"],
    ["Docker", "docker.svg"],
    ["FTP", "ftp.png"],
    ["S3", "s3.png"],
    ["WebDAV", "webdav.png"],
    ["RDP", "rdp.png"],
    ["SSH", "gnu.svg"],
    ["etcd", "etcd.svg"],
  ];

  for (const [type, expectedFile] of expected) {
    const spec = targetConnectionIconSpec(type);
    assert.equal(spec.kind, "asset");
    if (spec.kind === "asset") assert.equal(spec.light, expectedFile);
  }
});

test("target active connection icons use the target active variant", () => {
  const mysql = targetConnectionIconSpec("MySQL", true);
  assert.deepEqual(mysql, {
    kind: "asset",
    light: "mysql_active.svg",
    dark: "mysql_active_dark.svg",
  });

  const kafka = targetConnectionIconSpec("Kafka", true);
  assert.deepEqual(kafka, {
    kind: "asset",
    light: "kafka_light_active.png",
    dark: "kafka_active.png",
  });
});

test("presentation helpers retain explicit semantic icons", () => {
  assert.deepEqual(targetThemeIcon("database"), { kind: "theme", id: "database" });
  assert.throws(
    () => targetConnectionIconSpec("unsupported-driver"),
    /Target tree icon mapping is missing/,
  );
});

test("disabled specialized connections retain target context values", () => {
  const expected: ReadonlyArray<readonly [string, string]> = [
    ["MongoDB", "mongoConnection"],
    ["ElasticSearch", "esConnection"],
    ["Neo4j", "neo4jConnection"],
    ["Redis", "redisConnection"],
    ["etcd", "etcdConnection"],
    ["Zookeeper", "keyValueConnection"],
    ["Kafka", "commonConnection"],
    ["RabbitMQ", "commonConnection"],
    ["Loki", "commonConnection"],
    ["unknown", "connection"],
  ];

  for (const [type, contextValue] of expected) {
    assert.equal(targetSpecializedConnectionContext(type), contextValue);
  }
});

test("active database icons follow the target connection and database scope", () => {
  const connection = { id: "db-1", type: "MySQL" as const };
  const activeDatabase = { ...connection, database: "orders" };
  const activeSchema = { ...connection, database: "orders", schema: "public" };

  assert.equal(isActiveDatabaseTreeItem(activeDatabase, connection, "orders", undefined), true);
  assert.equal(isActiveDatabaseTreeItem(activeDatabase, connection, "billing", undefined), false);
  assert.equal(isActiveDatabaseTreeItem(activeSchema, connection, "orders", "public"), true);
  assert.equal(isActiveDatabaseTreeItem(activeSchema, connection, "orders", "private"), false);
  assert.equal(isActiveDatabaseTreeItem(activeSchema, { ...connection, id: "db-2" }, "orders", undefined), false);
});

test("target optional tree groups require explicit connection features", () => {
  assert.equal(targetTreeFeatureEnabled(undefined, "trigger"), false);
  assert.equal(targetTreeFeatureEnabled("trigger, event", "trigger"), true);
  assert.equal(targetTreeFeatureEnabled(["foreignTable"], "foreignTable"), true);
  assert.equal(targetTreeFeatureEnabled(["foreignTable"], "materializedView"), false);
});

test("target SQL group presentations preserve labels, contexts, icons, and expansion", () => {
  const expected: ReadonlyArray<readonly [keyof typeof targetSqlTreePresentations, string, string, string, string]> = [
    ["queryGroup", "Query", "queryGroup", "asset", "collapsed"],
    ["tableGroup", "Tables", "tableGroup", "theme", "expanded"],
    ["columnGroup", "Columns", "columnGroup", "theme", "expanded"],
    ["indexGroup", "Index", "indexGroup", "theme", "collapsed"],
    ["partitionGroup", "Partitions", "partitionGroup", "theme", "collapsed"],
    ["typeGroup", "Types", "typeGroup", "theme", "collapsed"],
    ["foreignTableGroup", "Foreign Tables", "foreignTableGroup", "theme", "collapsed"],
    ["viewGroup", "Views", "viewGroup", "theme", "collapsed"],
    ["materializedViewGroup", "Materialized Views", "viewGroup", "theme", "collapsed"],
    ["sequenceGroup", "Sequences", "sequenceGroup", "theme", "collapsed"],
    ["synonymGroup", "Synonyms", "synonymGroup", "theme", "collapsed"],
    ["functionGroup", "Functions", "functionGroup", "theme", "collapsed"],
    ["procedureGroup", "Procedures", "procedureGroup", "theme", "collapsed"],
    ["triggerGroup", "Triggers", "triggerGroup", "theme", "collapsed"],
    ["eventGroup", "Events", "eventGroup", "theme", "collapsed"],
    ["packageGroup", "Packages", "packageGroup", "theme", "collapsed"],
  ];

  for (const [key, label, contextValue, iconKind, collapsibleState] of expected) {
    const presentation = targetSqlTreePresentations[key];
    assert.equal(presentation.label, label);
    assert.equal(presentation.contextValue, contextValue);
    assert.equal(presentation.icon.kind, iconKind);
    assert.equal(presentation.collapsibleState, collapsibleState);
  }

  assert.deepEqual(targetSqlTreePresentations.tableGroup.icon, {
    kind: "theme",
    id: "three-bars",
    color: "terminal.ansiBlue",
  });
  assert.deepEqual(targetSqlTreePresentations.queryGroup.icon, {
    kind: "asset",
    light: "ssh/sql.svg",
    dark: "ssh/sql.svg",
    root: ["resources"],
  });
});

test("specialized tree presentations preserve target group contracts", () => {
  const expected: ReadonlyArray<readonly [keyof typeof targetSpecializedTreePresentations, string, string, string]> = [
    ["mongoCollectionGroup", "Collections", "tableGroup", "expanded"],
    ["mongoDocumentGroup", "Columns", "columnGroup", "expanded"],
    ["mongoIndexGroup", "Index", "indexGroup", "collapsed"],
    ["elasticIndexGroup", "Index", "esIndexGroup", "expanded"],
    ["elasticStreamGroup", "Streams", "esStreamGroup", "collapsed"],
    ["neo4jNodeGroup", "Nodes", "neo4jNodeGroup", "expanded"],
    ["neo4jRelationGroup", "Relationships", "neo4jRelationGroup", "collapsed"],
    ["rabbitVhostGroup", "Virtual Hosts", "rabbitVhostGroup", "expanded"],
    ["rabbitExchangeGroup", "Exchanges", "rabbitExchangeGroup", "collapsed"],
    ["rabbitQueueGroup", "Queues", "rabbitQueueGroup", "expanded"],
    ["rabbitUserGroup", "Users", "rabbitUserGroup", "collapsed"],
    ["kafkaBrokerGroup", "Brokers", "kafkaBrokerGroup", "collapsed"],
    ["kafkaTopicGroup", "Topics", "kafkaTopicGroup", "collapsed"],
    ["kafkaTopicConfigGroup", "Configs", "commonGroup", "collapsed"],
    ["kafkaTopicPartitionGroup", "Partitions", "commonGroup", "collapsed"],
    ["kafkaConsumerGroupGroup", "Consumer Groups", "kafkaConsumerGroupGroup", "collapsed"],
    ["kafkaOffsetGroup", "Offsets", "kafkaOffsetGroup", "collapsed"],
    ["lokiLabelGroup", "Labels", "commonGroup", "collapsed"],
    ["lokiSeriesGroup", "Series", "commonGroup", "collapsed"],
  ];

  for (const [key, label, contextValue, collapsibleState] of expected) {
    const presentation = targetSpecializedTreePresentations[key];
    assert.equal(presentation.label, label);
    assert.equal(presentation.contextValue, contextValue);
    assert.equal(presentation.collapsibleState, collapsibleState);
    assert.equal(presentation.icon.kind, "theme");
  }

  assert.deepEqual(targetSpecializedTreePresentations.redisFolder.icon, {
    kind: "asset",
    light: "image/redis_folder.svg",
    dark: "image/redis_folder.svg",
    root: ["resources"],
  });
  assert.deepEqual(targetSpecializedTreePresentations.redisDatabase.icon, {
    kind: "theme",
    id: "database",
    color: "dropdown.foreground",
  });
  assert.deepEqual(targetSpecializedTreePresentations.kafkaTopicConfigGroup.icon, {
    kind: "theme",
    id: "symbol-field",
    color: "editor.foreground",
  });
});

test("SQL authentication presentations preserve target account groups", () => {
  const expected: ReadonlyArray<readonly [keyof typeof targetSqlAuthTreePresentations, string, string, string]> = [
    ["user", "", "user", "none"],
    ["userGroup", "Users", "userGroup", "collapsed"],
    ["databaseUserGroup", "Users", "databaseUserGroup", "collapsed"],
    ["role", "", "role", "none"],
    ["roleGroup", "Roles", "roleGroup", "collapsed"],
    ["databaseRoleGroup", "Roles", "databaseRoleGroup", "collapsed"],
    ["login", "", "login", "none"],
    ["loginGroup", "Logins", "loginGroup", "collapsed"],
    ["securityGroup", "Security", "securityGroup", "collapsed"],
    ["databaseSecurityGroup", "Security", "databaseSecurityGroup", "collapsed"],
  ];

  for (const [key, label, contextValue, collapsibleState] of expected) {
    const presentation = targetSqlAuthTreePresentations[key];
    assert.equal(presentation.label, label);
    assert.equal(presentation.contextValue, contextValue);
    assert.equal(presentation.collapsibleState, collapsibleState);
    assert.equal(presentation.icon.kind, "theme");
  }
  assert.equal(targetSqlAuthTreePresentations.user.icon.id, "person");
  assert.equal(targetSqlAuthTreePresentations.databaseSecurityGroup.icon.id, "shield");
});

test("remote tree presentations preserve target group icons and expansion", () => {
  const expected: ReadonlyArray<readonly [keyof typeof targetRemoteTreePresentations, string, string, string]> = [
    ["favorite", "Favorites", "favorite", "collapsed"],
    ["sshUserGroup", "Users", "sshUserGroup", "collapsed"],
    ["s3RootFolder", "", "s3Folder", "collapsed"],
    ["remoteFolder", "", "folder", "collapsed"],
    ["dockerContainerGroup", "Containers", "dockerContainerGroup", "collapsed"],
    ["dockerImageGroup", "Images", "dockerImageGroup", "collapsed"],
    ["dockerNetworkGroup", "Networks", "dockerNetworkGroup", "collapsed"],
    ["dockerVolumeGroup", "Volumes", "dockerVolumeGroup", "collapsed"],
    ["dockerComposeProject", "", "dockerComposeProject", "expanded"],
  ];

  for (const [key, label, contextValue, collapsibleState] of expected) {
    const presentation = targetRemoteTreePresentations[key];
    assert.equal(presentation.label, label);
    assert.equal(presentation.contextValue, contextValue);
    assert.equal(presentation.collapsibleState, collapsibleState);
    if (key === "remoteFolder") {
      assert.equal(presentation.icon.kind, "asset");
    } else {
      assert.equal(presentation.icon.kind, "theme");
    }
  }
  assert.equal(targetRemoteTreePresentations.dockerContainerGroup.icon.id, "vm");
  assert.deepEqual(targetRemoteTreePresentations.remoteFolder.icon, {
    kind: "asset",
    light: "icon/folder.svg",
    dark: "icon/folder.svg",
    root: ["resources"],
  });
});

test("connection groups preserve target hierarchy and place groups first", () => {
  const alpha = { id: "alpha", group: "Production/API" };
  const beta = { id: "beta", group: "Production/Workers" };
  const loose = { id: "loose" };
  const tree = groupConnectionEntries([
    { value: loose },
    { value: alpha, group: alpha.group },
    { value: beta, group: beta.group },
  ]);

  assert.equal(tree.length, 2);
  assert.equal(isConnectionGroupBranch(tree[0]), true);
  if (!isConnectionGroupBranch(tree[0])) return;
  assert.equal(tree[0].label, "Production");
  assert.deepEqual(
    tree[0].children.map((entry) => isConnectionGroupBranch(entry) ? entry.label : entry.id),
    ["API", "Workers"],
  );
  assert.equal(tree[1], loose);
});
