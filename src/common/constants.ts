import * as vscode from "vscode";
import * as path from "path";

export class Constants {
    public static CONFIG_PREFIX = "vscode-mysql"
    public static RES_PATH = path.join(vscode.extensions.getExtension('cweijan.vscode-mysql-client2').extensionPath, "resources");
}

export class Pattern {
    public static TABLE_PATTERN = "\\b(from|join|update|into)\\b\\s*\\[?((\\w|\\.|-|`|\"|')+)\\]?";
    public static DML_PATTERN = "\\b(update|into)\\b\\s*`{0,1}(\\w|\\.|-)+`{0,1}";
    public static MULTI_PATTERN = /\b(TRIGGER|PROCEDURE|FUNCTION)\b/ig
}

export enum OperateType {
    execute = 'execute', export = 'export',
    next = 'next', init = 'init', changeTheme = "changeTheme"
}

export enum CacheKey {
    ConectionsKey = "mysql.connections",
    CollapseSate = "mysql.database.cache.collapseState",
    NOSQL_CONNECTION = "redis.connections",
    COLLAPSE_SATE = "redis.cache.collapseState",
}

export enum ConfigKey {
    ENABLE_DELIMITER = "enableDelimiter",
    LOAD_META_ON_CONNECT = "loadMetaOnConnect",
    DEFAULT_LIMIT = "defaultSelectLimit",
    SHOW_TOTAL = "showTotal",
}

export enum CommandKey {
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
    MYSQL = "MySQL", PG = "PostgreSQL",
    MSSQL = "SqlServer", ORACLE = "Oracle",
    ES = "ElasticSearch", REDIS = "Redis"
}

export enum ModelType {
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
    CONNECTION = "connection", DATABASE = "database", USER_GROUP = "userGroup", USER = "user",
    TABLE = "table", COLUMN = "column", INFO = "info", TABLE_GROUP = "tableGroup",
    VIEW = "view", VIEW_GROUP = "viewGroup", SYSTEM_VIEW_GROUP = "systemViewGroup", TRIGGER_GROUP = "triggerGroup", TRIGGER = "trigger",
    PROCEDURE_GROUP = "procedureGroup", PROCEDURE = "procedure", FUNCTION_GROUP = "functionGroup", FUNCTION = "function",
    QUERY_GROUP = "queryGroup", QUERY = "query",
    DIAGRAM_GROUP = "diagramGroup", DIAGRAM = "diagram"
}

export enum MessageType {
    DATA = 'DATA',
    DML = 'DML',
    DDL = 'DDL',
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