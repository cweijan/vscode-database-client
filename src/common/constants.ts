import * as vscode from "vscode";
import * as path from "path";

export class Constants {
    public static CONFIG_PREFIX = "vscode-mysql"
    public static RES_PATH = path.join(vscode.extensions.getExtension('cweijan.vscode-mysql-client').extensionPath, "resources");
    public static DEFAULT_SIZE = 100;
}

export enum Pattern {
    TABLE_PATTERN = "\\b(from|join|update|into)\\b\\s*`?((\\w|\\.|-)+)`?",
    DML_PATTERN = "\\b(update|into)\\b\\s*`{0,1}(\\w|\\.|-)+`{0,1}"
}

export class CacheKey {
    public static ConectionsKey = "mysql.connections";
    public static CollapseSate = "mysql.database.cache.collapseState";
}

export enum ConfigKey {
    MAX_TABLE_COUNT = "maxTableCount",

}

export class CommandKey {
    public static RecordHistory = "mysql.history.record";
    public static Refresh = "mysql.refresh";
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

export class ModelType {
    public static CONNECTION = "connection";
    public static DATABASE = "database";
    public static USER_GROUP = "userGroup";
    public static USER = "user";
    public static TABLE = "table";
    public static COLUMN = "column";
    public static INFO = "info";
    public static TABLE_GROUP = "tableGroup";
    public static VIEW = "view";
    public static VIEW_GROUP = "viewGroup";
    public static TRIGGER_GROUP = "triggerGroup";
    public static TRIGGER = "trigger";
    public static PROCEDURE_GROUP = "procedureGroup";
    public static PROCEDURE = "procedure";
    public static FUNCTION_GROUP = "functionGroup";
    public static FUNCTION = "function";
}


export enum MessageType {
    DATA = 'DATA',
    DML = 'DML',
    DDL = 'DDL',
    ERROR = "ERROR",
    RUN = "RUN",
    MESSAGE = "MESSAGE"
}


export class OperateType {
    public static execute = 'execute';
    public static init = 'init';
    public static previous = 2;
    public static next = 3;
    public static save = 4;
    public static delete = 5;
    public static export = 6;
}