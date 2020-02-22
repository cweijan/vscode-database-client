"user strict";

export class Constants {
    /** db connection alive time :10minute */
    public static EXPIRE_TIME=10*60*1000;
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
}
