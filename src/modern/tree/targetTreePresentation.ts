import type { ResourceResolver } from "../core/contracts";
import type { ConnectionOptions } from "../database/types";

export interface TargetAssetIconSpec {
  readonly kind: "asset";
  readonly light: string;
  readonly dark: string;
  readonly root?: readonly string[];
}

export interface TargetThemeIconSpec {
  readonly kind: "theme";
  readonly id: string;
  readonly color?: string;
}

export type TargetIconSpec = TargetAssetIconSpec | TargetThemeIconSpec;

export interface TargetTreePresentation {
  readonly label: string;
  readonly contextValue: string;
  readonly icon: TargetIconSpec;
  readonly collapsibleState: "none" | "collapsed" | "expanded";
  readonly order?: number;
}

export type TargetTreeFeature =
  | "event"
  | "foreignTable"
  | "materializedView"
  | "sequence"
  | "trigger"
  | "type";

export function targetTreeFeatureEnabled(
  value: readonly string[] | string | undefined,
  feature: TargetTreeFeature,
): boolean {
  const configured = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",").map((item) => item.trim()).filter(Boolean)
      : [];
  return configured.includes(feature);
}

/**
 * The SQL tree is a protocol as much as it is a collection of classes.  Keep
 * the visible label, context value, icon and default expansion state together
 * so a node implementation cannot silently drift from the installed target.
 */
export const targetSqlTreePresentations = {
  queryGroup: {
    label: "Query",
    contextValue: "queryGroup",
    icon: { kind: "asset", light: "ssh/sql.svg", dark: "ssh/sql.svg", root: ["resources"] },
    collapsibleState: "collapsed",
  },
  tableGroup: {
    label: "Tables",
    contextValue: "tableGroup",
    icon: targetThemeIcon("three-bars", "terminal.ansiBlue"),
    collapsibleState: "expanded",
  },
  columnGroup: {
    label: "Columns",
    contextValue: "columnGroup",
    icon: targetThemeIcon("browser"),
    collapsibleState: "expanded",
  },
  otherColumnGroup: {
    label: "Columns",
    contextValue: "otherColumnGroup",
    icon: targetThemeIcon("browser"),
    collapsibleState: "expanded",
  },
  indexGroup: {
    label: "Index",
    contextValue: "indexGroup",
    icon: targetThemeIcon("key"),
    collapsibleState: "collapsed",
  },
  partitionGroup: {
    label: "Partitions",
    contextValue: "partitionGroup",
    icon: targetThemeIcon("split-vertical"),
    collapsibleState: "collapsed",
  },
  typeGroup: {
    label: "Types",
    contextValue: "typeGroup",
    icon: targetThemeIcon("symbol-class"),
    collapsibleState: "collapsed",
  },
  foreignTableGroup: {
    label: "Foreign Tables",
    contextValue: "foreignTableGroup",
    icon: targetThemeIcon("three-bars", "terminal.ansiGreen"),
    collapsibleState: "collapsed",
  },
  viewGroup: {
    label: "Views",
    contextValue: "viewGroup",
    icon: targetThemeIcon("three-bars", "problemsWarningIcon.foreground"),
    collapsibleState: "collapsed",
  },
  materializedViewGroup: {
    label: "Materialized Views",
    contextValue: "viewGroup",
    icon: targetThemeIcon("three-bars", "terminal.ansiYellow"),
    collapsibleState: "collapsed",
  },
  sequenceGroup: {
    label: "Sequences",
    contextValue: "sequenceGroup",
    icon: targetThemeIcon("export"),
    collapsibleState: "collapsed",
  },
  synonymGroup: {
    label: "Synonyms",
    contextValue: "synonymGroup",
    icon: targetThemeIcon("references"),
    collapsibleState: "collapsed",
  },
  functionGroup: {
    label: "Functions",
    contextValue: "functionGroup",
    icon: targetThemeIcon("symbol-function"),
    collapsibleState: "collapsed",
  },
  procedureGroup: {
    label: "Procedures",
    contextValue: "procedureGroup",
    icon: targetThemeIcon("gear"),
    collapsibleState: "collapsed",
  },
  triggerGroup: {
    label: "Triggers",
    contextValue: "triggerGroup",
    icon: targetThemeIcon("zap", "terminal.ansiYellow"),
    collapsibleState: "collapsed",
  },
  eventGroup: {
    label: "Events",
    contextValue: "eventGroup",
    icon: targetThemeIcon("compass"),
    collapsibleState: "collapsed",
  },
  packageGroup: {
    label: "Packages",
    contextValue: "packageGroup",
    icon: targetThemeIcon("package"),
    collapsibleState: "collapsed",
  },
} as const satisfies Readonly<Record<string, TargetTreePresentation>>;

/**
 * Target-derived metadata for tree groups whose domain services are not SQL.
 * Keeping these values here makes the specialized providers responsible for
 * data loading only; labels, context menus, icons and expansion stay stable.
 */
export const targetSpecializedTreePresentations = {
  redisDatabase: {
    label: "",
    contextValue: "redisDB",
    icon: targetThemeIcon("database", "dropdown.foreground"),
    collapsibleState: "collapsed",
  },
  redisFolder: {
    label: "",
    contextValue: "redisFolder",
    icon: targetResourceIcon("image/redis_folder.svg"),
    collapsibleState: "collapsed",
  },
  redisKey: {
    label: "",
    contextValue: "redisKey",
    icon: targetThemeIcon("key", "charts.yellow"),
    collapsibleState: "none",
  },
  mongoCollectionGroup: {
    label: "Collections",
    contextValue: "tableGroup",
    icon: targetThemeIcon("three-bars", "terminal.ansiBlue"),
    collapsibleState: "expanded",
  },
  mongoCollection: {
    label: "",
    contextValue: "mongoCollection",
    icon: targetThemeIcon("split-horizontal"),
    collapsibleState: "collapsed",
  },
  mongoDocumentGroup: {
    label: "Columns",
    contextValue: "columnGroup",
    icon: targetThemeIcon("browser"),
    collapsibleState: "expanded",
  },
  mongoIndexGroup: {
    label: "Index",
    contextValue: "indexGroup",
    icon: targetThemeIcon("key"),
    collapsibleState: "collapsed",
  },
  elasticIndexGroup: {
    label: "Index",
    contextValue: "esIndexGroup",
    icon: targetThemeIcon("three-bars", "terminal.ansiBlue"),
    collapsibleState: "expanded",
  },
  elasticStreamGroup: {
    label: "Streams",
    contextValue: "esStreamGroup",
    icon: targetThemeIcon("symbol-event"),
    collapsibleState: "collapsed",
  },
  neo4jNodeGroup: {
    label: "Nodes",
    contextValue: "neo4jNodeGroup",
    icon: targetThemeIcon("list-flat", "terminal.ansiBlue"),
    collapsibleState: "expanded",
  },
  neo4jRelationGroup: {
    label: "Relationships",
    contextValue: "neo4jRelationGroup",
    icon: targetThemeIcon("menu", "problemsWarningIcon.foreground"),
    collapsibleState: "collapsed",
  },
  rabbitVhostGroup: {
    label: "Virtual Hosts",
    contextValue: "rabbitVhostGroup",
    icon: targetThemeIcon("server-environment"),
    collapsibleState: "expanded",
  },
  rabbitExchangeGroup: {
    label: "Exchanges",
    contextValue: "rabbitExchangeGroup",
    icon: targetThemeIcon("server-environment"),
    collapsibleState: "collapsed",
  },
  rabbitQueueGroup: {
    label: "Queues",
    contextValue: "rabbitQueueGroup",
    icon: targetThemeIcon("device-camera-video"),
    collapsibleState: "expanded",
  },
  rabbitUserGroup: {
    label: "Users",
    contextValue: "rabbitUserGroup",
    icon: targetThemeIcon("account"),
    collapsibleState: "collapsed",
  },
  kafkaBrokerGroup: {
    label: "Brokers",
    contextValue: "kafkaBrokerGroup",
    icon: targetThemeIcon("server-environment"),
    collapsibleState: "collapsed",
  },
  kafkaTopicGroup: {
    label: "Topics",
    contextValue: "kafkaTopicGroup",
    icon: targetThemeIcon("device-camera-video"),
    collapsibleState: "collapsed",
  },
  kafkaTopicConfigGroup: {
    label: "Configs",
    contextValue: "commonGroup",
    icon: targetThemeIcon("symbol-field", "editor.foreground"),
    collapsibleState: "collapsed",
  },
  kafkaTopicPartitionGroup: {
    label: "Partitions",
    contextValue: "commonGroup",
    icon: targetThemeIcon("archive", "terminal.ansiBlue"),
    collapsibleState: "collapsed",
  },
  kafkaConsumerGroupGroup: {
    label: "Consumer Groups",
    contextValue: "kafkaConsumerGroupGroup",
    icon: targetThemeIcon("combine"),
    collapsibleState: "collapsed",
  },
  kafkaOffsetGroup: {
    label: "Offsets",
    contextValue: "kafkaOffsetGroup",
    icon: targetThemeIcon("dashboard"),
    collapsibleState: "collapsed",
  },
  lokiLabelGroup: {
    label: "Labels",
    contextValue: "commonGroup",
    icon: targetThemeIcon("output"),
    collapsibleState: "collapsed",
  },
  lokiLabelNameGroup: {
    label: "",
    contextValue: "commonGroup",
    icon: targetThemeIcon("three-bars", "terminal.ansiBlue"),
    collapsibleState: "collapsed",
  },
  lokiSeriesGroup: {
    label: "Series",
    contextValue: "commonGroup",
    icon: targetThemeIcon("symbol-event"),
    collapsibleState: "collapsed",
  },
} as const satisfies Readonly<Record<string, TargetTreePresentation>>;

export const targetSqlAuthTreePresentations = {
  user: {
    label: "",
    contextValue: "user",
    icon: targetThemeIcon("person"),
    collapsibleState: "none",
  },
  userGroup: {
    label: "Users",
    contextValue: "userGroup",
    icon: targetThemeIcon("account"),
    collapsibleState: "collapsed",
  },
  databaseUserGroup: {
    label: "Users",
    contextValue: "databaseUserGroup",
    icon: targetThemeIcon("account"),
    collapsibleState: "collapsed",
  },
  role: {
    label: "",
    contextValue: "role",
    icon: targetThemeIcon("organization"),
    collapsibleState: "none",
  },
  roleGroup: {
    label: "Roles",
    contextValue: "roleGroup",
    icon: targetThemeIcon("organization"),
    collapsibleState: "collapsed",
  },
  databaseRoleGroup: {
    label: "Roles",
    contextValue: "databaseRoleGroup",
    icon: targetThemeIcon("organization"),
    collapsibleState: "collapsed",
  },
  login: {
    label: "",
    contextValue: "login",
    icon: targetThemeIcon("person"),
    collapsibleState: "none",
  },
  loginGroup: {
    label: "Logins",
    contextValue: "loginGroup",
    icon: targetThemeIcon("account"),
    collapsibleState: "collapsed",
  },
  securityGroup: {
    label: "Security",
    contextValue: "securityGroup",
    icon: targetThemeIcon("dashboard"),
    collapsibleState: "collapsed",
  },
  databaseSecurityGroup: {
    label: "Security",
    contextValue: "databaseSecurityGroup",
    icon: targetThemeIcon("shield"),
    collapsibleState: "collapsed",
  },
} as const satisfies Readonly<Record<string, TargetTreePresentation>>;

export const targetRemoteTreePresentations = {
  favorite: {
    label: "Favorites",
    contextValue: "favorite",
    icon: targetThemeIcon("star-full"),
    collapsibleState: "collapsed",
  },
  sshUserGroup: {
    label: "Users",
    contextValue: "sshUserGroup",
    icon: targetThemeIcon("account"),
    collapsibleState: "collapsed",
  },
  s3RootFolder: {
    label: "",
    contextValue: "s3Folder",
    icon: targetThemeIcon("archive"),
    collapsibleState: "collapsed",
  },
  remoteFolder: {
    label: "",
    contextValue: "folder",
    icon: targetResourceIcon("icon/folder.svg"),
    collapsibleState: "collapsed",
  },
  dockerContainerGroup: {
    label: "Containers",
    contextValue: "dockerContainerGroup",
    icon: targetThemeIcon("vm"),
    collapsibleState: "collapsed",
  },
  dockerImageGroup: {
    label: "Images",
    contextValue: "dockerImageGroup",
    icon: targetThemeIcon("package"),
    collapsibleState: "collapsed",
  },
  dockerNetworkGroup: {
    label: "Networks",
    contextValue: "dockerNetworkGroup",
    icon: targetThemeIcon("globe"),
    collapsibleState: "collapsed",
  },
  dockerVolumeGroup: {
    label: "Volumes",
    contextValue: "dockerVolumeGroup",
    icon: targetThemeIcon("archive"),
    collapsibleState: "collapsed",
  },
  dockerComposeProject: {
    label: "",
    contextValue: "dockerComposeProject",
    icon: targetThemeIcon("multiple-windows"),
    collapsibleState: "expanded",
  },
} as const satisfies Readonly<Record<string, TargetTreePresentation>>;

interface ConnectionIconFiles {
  readonly light: string;
  readonly dark: string;
  readonly activeLight: string;
  readonly activeDark: string;
}

function connectionIcon(
  light: string,
  activeLight = light,
  dark = light,
  activeDark = activeLight,
): ConnectionIconFiles {
  return { light, dark, activeLight, activeDark };
}

const connectionIconFiles: Readonly<Record<string, ConnectionIconFiles>> = {
  athena: connectionIcon("athena.svg", "athena_active.svg"),
  azure: connectionIcon("azure.svg", "azure_active.svg"),
  azuresqlserver: connectionIcon("azure.svg", "azure_active.svg"),
  bigquery: connectionIcon("bigquery.svg", "bigquery_active.svg"),
  cassandra: connectionIcon("cassandra.svg", "cassandra_active.svg"),
  ch: connectionIcon("ch.svg", "ch_active.svg"),
  clickhouse: connectionIcon("clickhouse.svg", "clickhouse_active.svg"),
  cockroach: connectionIcon("cockroach.svg", "cockroach_active.svg"),
  d1: connectionIcon("d1.svg", "d1_active.svg"),
  databricks: connectionIcon("databricks.svg", "databricks_active.svg"),
  db2: connectionIcon("db2.svg", "db2_active.svg"),
  "db2 for i": connectionIcon("db2.svg", "db2_active.svg"),
  dm: connectionIcon("dm.png", "dm_active.png"),
  达梦: connectionIcon("dm.png", "dm_active.png"),
  docker: connectionIcon("docker.svg"),
  doris: connectionIcon("doris.svg", "doris_active.svg"),
  duckdb: connectionIcon("duckdb.svg", "duckdb_active.svg"),
  etcd: connectionIcon("etcd.svg"),
  elasticsearch: connectionIcon("elasticsearch.svg", "elasticsearch_active.svg"),
  exasol: connectionIcon("exasol.svg", "exasol_active.svg"),
  ftp: connectionIcon("ftp.png"),
  gaussdb: connectionIcon("gaussdb.svg", "gaussdb_active.svg"),
  hive: connectionIcon("hive.svg", "hive_active.svg"),
  jdbc: connectionIcon("jdbc-active.png"),
  kafka: connectionIcon(
    "kafka_light.png",
    "kafka_light_active.png",
    "kafka.png",
    "kafka_active.png",
  ),
  kingbase: connectionIcon("kingbase.svg", "kingbase_active.svg"),
  libsql: connectionIcon("libsql.svg", "libsql_active.svg"),
  loki: connectionIcon("loki.png"),
  mariadb: connectionIcon("mariadb.svg", "mariadb_active.svg"),
  mongodb: connectionIcon("mongodb.svg", "mongodb_active.svg"),
  mysql: connectionIcon(
    "mysql.svg",
    "mysql_active.svg",
    "mysql_dark.svg",
    "mysql_active_dark.svg",
  ),
  mysqlcompatible: connectionIcon("mysql.svg", "mysql_active.svg"),
  neo4j: connectionIcon("neo4j.png", "neo4j-active.png"),
  oracle: connectionIcon("oracle.svg", "oracle_active.svg"),
  postgres: connectionIcon("postgresql.svg", "postgresql_active.svg"),
  postgresql: connectionIcon("postgresql.svg", "postgresql_active.svg"),
  postgresqlcompatible: connectionIcon("postgresql.svg", "postgresql_active.svg"),
  prestodb: connectionIcon(
    "presto.svg",
    "presto_active.svg",
    "presto_dark.svg",
    "presto_dark_active.svg",
  ),
  rabbitmq: connectionIcon("rabbitmq.svg", "rabbitmq_active.svg"),
  redis: connectionIcon("redis.png"),
  redshift: connectionIcon("redshift.svg", "redshift_active.svg"),
  rdp: connectionIcon("rdp.png"),
  s3: connectionIcon("s3.png"),
  snowflake: connectionIcon("snowflake.svg", "snowflake_active.svg"),
  sqlite: connectionIcon("sqlite.svg", "sqlite_active.svg"),
  sqlserver: connectionIcon("sqlserver.svg", "sqlserver_active.svg"),
  tdengine: connectionIcon("tdengine.svg", "tdengine_active.svg"),
  trino: connectionIcon("trino.svg", "trino_active.svg"),
  webdav: connectionIcon("webdav.png"),
  zookeeper: connectionIcon("zookeeper.png"),
};

const semanticConnectionIcons: Readonly<Record<string, TargetThemeIconSpec>> = {
  // Remote connection icons are selected below because SSH has a target
  // platform variant; keep this map for semantic-only nodes.
};

function normalizedConnectionType(type: ConnectionOptions["type"]): string {
  return String(type).trim().toLocaleLowerCase();
}

export function targetConnectionIconSpec(
  type: ConnectionOptions["type"],
  active = false,
  sshServerType?: string,
): TargetIconSpec {
  const normalized = normalizedConnectionType(type);
  if (normalized === "ssh" || normalized === "sftp") {
    const platform = String(sshServerType || "").trim().toLocaleLowerCase();
    return {
      kind: "asset",
      light: platform === "windows"
        ? "win11.png"
        : platform === "macos"
          ? "macos.png"
          : "gnu.svg",
      dark: platform === "windows"
        ? "win11.png"
        : platform === "macos"
          ? "macos.png"
          : "gnu.svg",
    };
  }
  const semantic = semanticConnectionIcons[normalized];
  if (semantic) return semantic;

  const files = connectionIconFiles[normalized];
  if (!files) {
    throw new Error(`Target tree icon mapping is missing for connection type: ${String(type)}`);
  }
  return {
    kind: "asset",
    light: active ? files.activeLight : files.light,
    dark: active ? files.activeDark : files.dark,
  };
}

export function resolveTargetIcon(
  resources: ResourceResolver,
  spec: TargetIconSpec,
): { readonly light: string; readonly dark: string } | TargetThemeIconSpec {
  if (spec.kind === "theme") return spec;
  const root = spec.root || ["resources", "icon", "server"];
  return {
    light: resources.resolve(...root, ...spec.light.split("/")),
    dark: resources.resolve(...root, ...spec.dark.split("/")),
  };
}

export function targetConnectionIcon(
  resources: ResourceResolver,
  type: ConnectionOptions["type"],
  active = false,
): { readonly light: string; readonly dark: string } | TargetThemeIconSpec {
  return resolveTargetIcon(resources, targetConnectionIconSpec(type, active));
}

export function isActiveConnection(
  active: ConnectionOptions | undefined,
  candidate: ConnectionOptions,
): boolean {
  return Boolean(active && active.id === candidate.id);
}

export function isActiveDatabaseTreeItem(
  active: ConnectionOptions | undefined,
  candidate: ConnectionOptions,
  database: string,
  schema: string | null | undefined,
): boolean {
  if (!active || active.id !== candidate.id || active.database !== database) {
    return false;
  }
  return schema === undefined || active.schema === schema;
}

export function targetDatabaseNodeContext(
  type: ConnectionOptions["type"],
): "database" | "schema" {
  const normalized = String(type).trim().toLocaleLowerCase();
  return ["dm", "达梦", "oracle", "db2", "db2 for i", "bigquery", "exasol"].includes(normalized)
    ? "schema"
    : "database";
}

export function targetSpecializedConnectionContext(
  type: ConnectionOptions["type"],
): string {
  switch (String(type).trim().toLocaleLowerCase()) {
    case "mongodb":
      return "mongoConnection";
    case "elasticsearch":
      return "esConnection";
    case "neo4j":
      return "neo4jConnection";
    case "redis":
      return "redisConnection";
    case "etcd":
      return "etcdConnection";
    case "zookeeper":
      return "keyValueConnection";
    case "kafka":
    case "rabbitmq":
    case "loki":
      return "commonConnection";
    default:
      return "connection";
  }
}

export function targetAssetIcon(
  relativePath: string,
  darkRelativePath = relativePath,
  root: readonly string[] = ["resources", "icon", "server"],
): TargetAssetIconSpec {
  return { kind: "asset", light: relativePath, dark: darkRelativePath, root };
}

export function targetResourceIcon(
  relativePath: string,
  darkRelativePath = relativePath,
): TargetAssetIconSpec {
  return targetAssetIcon(relativePath, darkRelativePath, ["resources"]);
}

export function targetThemeIcon(id: string, color?: string): TargetThemeIconSpec {
  return { kind: "theme", id, ...(color ? { color } : {}) };
}
