import * as vscode from "vscode";
import * as path from "path";

export class Constants {
    public static RES_PATH=path.join(vscode.extensions.getExtension('cweijan.vscode-mysql-manager').extensionPath,"resources");
}

export class CacheKey{
    public static ConectionsKey = "mysql.connections";
    public static CollapseSate = "mysql.database.cache.collapseState";

}

export class CommandKey{
    static RecordHistory="mysql.hisotry.record"
    static Refresh="mysql.refresh"
}

export class Cursor{
    static FIRST_POSITION=new vscode.Position(0, 0);
    static getRangeStartTo(end:vscode.Position):vscode.Range{
        return new vscode.Range(this.FIRST_POSITION,end);
    }
}

export class ModelType{
    public static CONNECTION="connection"
    public static DATABASE="database"
    public static USER_GROUP="userGroup"
    public static USER="user"
    public static TABLE="table"
    public static COLUMN="column"
    public static INFO="info";
    public static TABLE_GROUP="tableGroup";
    public static VIEW="view";
    public static VIEW_GROUP="viewGroup";
    public static TRIGGER_GROUP="triggerGroup";
    public static TRIGGER="trigger";
    public static PROCEDURE_GROUP="procedureGroup";
    public static PROCEDURE="procedure";
    public static FUNCTION_GROUP="functionGroup";
    public static FUNCTION="function";
}


export class OperateType{
    static execute='execute';
    static previous=2;
    static next=3;
    static save=4;
    static delete=5;
    static export=6;
}