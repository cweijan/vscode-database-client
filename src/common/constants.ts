"user strict";

export class Constants {
    public static ExtensionId = "cweijan.vscode-mysql";
    public static GlobalStateMySQLConectionsKey = "mysql.connections";
    /** 10分钟 */
    public static EXPIRE_TIME=10*60*1000;
}

export class CacheKey{
    public static DatabaseCacheKey = "mysql.database.cache.database";
    public static DatabaseTableCacheKey = "mysql.database.cache.table";
    public static DatabaseColumnCacheKey = "mysql.database.cache.column";
    public static CollapseSate = "mysql.database.cache.collapseState";

}

export class ModelType{
    public static CONNECTION="connection"
    public static DATABASE="database"
    public static TABLE="table"
    public static COLUMN="column"
    public static INFO="info";
}
