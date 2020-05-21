import * as vscode from "vscode";
import * as path from "path";

export class Constants {
    public static CONFIG_PREFIX = "vscode-mysql"
    public static RES_PATH = path.join(vscode.extensions.getExtension('cweijan.vscode-mysql-client2').extensionPath, "resources");
    public static DEFAULT_SIZE = 100;
}

export class Pattern {
    public static TABLE_PATTERN = "\\b(from|join|update|into)\\b\\s*((\\w|\\.|-|`)+)";
    public static DML_PATTERN = "\\b(update|into)\\b\\s*`{0,1}(\\w|\\.|-)+`{0,1}";
    public static MULTI_PATTERN = /\b(TRIGGER|PROCEDURE|FUNCTION)\b/ig
}

export enum OperateType {
    execute = 'execute', export = 'export',
    next = 'next', init = 'init'
}

export enum CacheKey {
    ConectionsKey = "mysql.connections",
    CollapseSate = "mysql.database.cache.collapseState"
}

export enum ConfigKey {
    MAX_TABLE_COUNT = "maxTableCount",
    ENABLE_DELIMITER = "enableDelimiter",
    LOAD_META_ON_CONNECT = "loadMetaOnConnect",
    QUERY_FULL_SCREEN = "fullQueryScreen",

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

export enum ModelType {
    CONNECTION = "connection", DATABASE = "database", USER_GROUP = "userGroup", USER = "user",
    TABLE = "table", COLUMN = "column", INFO = "info", TABLE_GROUP = "tableGroup",
    VIEW = "view", VIEW_GROUP = "viewGroup", TRIGGER_GROUP = "triggerGroup", TRIGGER = "trigger",
    PROCEDURE_GROUP = "procedureGroup", PROCEDURE = "procedure", FUNCTION_GROUP = "functionGroup", FUNCTION = "function"
}

export enum MessageType {
    DATA = 'DATA',
    DML = 'DML',
    DDL = 'DDL',
    ERROR = "ERROR",
    RUN = "RUN",
    MESSAGE = "MESSAGE",
    NEXT_PAGE = "NEXT_PAGE"
}

export enum Template {
    create = "create-template.sql",
    table = "sql-template.sql",
    alter = "alter-template.sql"
}