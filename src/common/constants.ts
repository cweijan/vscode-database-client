import * as vscode from "vscode";
import * as path from "path";

const extName=require("@/../package.json")

export class Constants {
    public static CONFIG_PREFIX = "database-client"
    public static RES_PATH = path.join(vscode.extensions.getExtension(`${extName.publisher}.${extName.name}`).extensionPath, "resources");
}

export class Pattern {
    public static TABLE_PATTERN = "\\b(from|join|update|into)\\b\\s*\\[?((\\w|\\.|-|`|\"|')+)\\]?";
    public static DML_PATTERN = "\\b(update|into)\\b\\s*`{0,1}(\\w|\\.|-)+`{0,1}";
    public static MULTI_PATTERN = /\b(TRIGGER|PROCEDURE|FUNCTION)\b/ig
}

export enum CacheKey {
    // sql
    DATBASE_CONECTIONS = "mysql.connections",
    DATABASE_SATE = "mysql.database.cache.collapseState",
    // nosql
    NOSQL_CONNECTION = "redis.connections",
    COLLAPSE_SATE = "redis.cache.collapseState",
    // history
    GLOBAL_HISTORY="sql.history"
}

export enum ConfigKey {
    HIGHLIGHT_SQL_BLOCK = "highlightSQLBlock",
    DEFAULT_LIMIT = "defaultSelectLimit",
    PREFER_CONNECTION_NAME = "preferConnectionName",
    DISABLE_SQL_CODELEN = "disableSqlCodeLen",
}

export enum CodeCommand {
    RecordHistory = "mysql.history.record",
    Refresh = "mysql.refresh"
}

export class Cursor {
    public static FIRST_POSITION = new vscode.Position(0, 0);
    public static getRangeStartTo(end: vscode.Position): vscode.Range {
        return new vscode.Range(this.FIRST_POSITION, end);
    }
}

export enum Confirm {
    YES = "YES", NO = "NO"
}

export enum DatabaseType {
    MYSQL = "MySQL", PG = "PostgreSQL",SQLITE = "SQLite",
    MSSQL = "SqlServer", MONGO_DB="MongoDB",
    ES = "ElasticSearch", REDIS = "Redis",SSH="SSH",FTP="FTP"
}

export enum ModelType {
    MONGO_CONNECTION="mongoConnection",MONGO_TABLE="mongoTable",
    /**
     * ftp
     */
     FTP_CONNECTION="ftpConnection", FTP_FOLDER = 'ftpFolder', FTP_FILE = "ftpFile",FTP_Link = "ftpLink",
    /**
     * ssh
     */
    SSH_CONNECTION="sshConnection", FOLDER = 'folder', FILE = "file",Link = "link",
    /**
     * redis
     */
    REDIS_CONNECTION = "redisConnection", REDIS_FOLDER = "redisFolder", REDIS_KEY = "redisKey",
    /**
     * ElasticSearch
     */
    ES_CONNECTION = "esConnection", ES_INDEX = "esIndex", ES_COLUMN = "esColumn",
    /**
     * database
     */
    CONNECTION = "connection",CATALOG = "catalog", SCHEMA = "database", USER_GROUP = "userGroup", USER = "user",
    TABLE = "table", COLUMN = "column", INFO = "info", TABLE_GROUP = "tableGroup",
    VIEW = "view", VIEW_GROUP = "viewGroup",  TRIGGER_GROUP = "triggerGroup", TRIGGER = "trigger",
    PROCEDURE_GROUP = "procedureGroup", PROCEDURE = "procedure", FUNCTION_GROUP = "functionGroup", FUNCTION = "function",
    QUERY_GROUP = "queryGroup", QUERY = "query",
    DIAGRAM_GROUP = "diagramGroup", DIAGRAM = "diagram"
}

export enum MessageType {
    DATA = 'DATA',
    DML = 'DML',
    DDL = 'DDL',
    MESSAGE_BLOCK = 'MESSAGE_BLOCK',
    ERROR = "ERROR",
    RUN = "RUN",
    MESSAGE = "MESSAGE",
    NEXT_PAGE = "NEXT_PAGE",
    THEME = "theme"
}

export enum Template {
    table = "sql-template.sql",
    alter = "alter-template.sql"
}


export enum RedisType {
    hash = 'hash', list = 'list', string = 'string', zset = 'zset', set = 'set'
}