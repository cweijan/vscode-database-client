import * as vscode from "vscode";
import * as path from "path";

export class Constants {
    /** db connection alive time :10minute */
    public static EXPIRE_TIME=10*60*1000;
    public static RES_PATH=path.join(vscode.extensions.getExtension('cweijan.vscode-mysql-manager').extensionPath,"resources");
}

export class CacheKey{
    public static ConectionsKey = "mysql.connections";
    public static CollapseSate = "mysql.database.cache.collapseState";

}

export class ModelType{
    public static CONNECTION="connection"
    public static DATABASE="database"
    public static TABLE="table"
    public static COLUMN="column"
    public static INFO="info";
    public static TABLE_GROUP="tableGroup";
    public static VIEW_GROUP="viewGroup";
    public static TRIGGER_GROUP="triggerGroup";
    public static PROCEDURE_GROUP="procedureGroup";
    public static FUNCTION_GROUP="functionGroup";
}
