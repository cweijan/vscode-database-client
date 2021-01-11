
/**
 * TODO
 * 1. 增加用户角色分配视图
 * 2. 增加system view节点
 */
export abstract class SqlDialect {
    abstract updateColumn(table: string, column: string, type: string, comment: string, nullable: string): string;
    abstract showDatabases(): string;
    abstract showTables(database: string): string;
    abstract showColumns(database: string, table: string): string;
    abstract showViews(database: string): string;
    abstract showSystemViews(database: string): string;
    abstract showUsers(): string;
    abstract showTriggers(database: string): string;
    abstract showProcedures(database: string): string;
    abstract showFunctions(database: string): string;
    abstract buildPageSql(database: string, table: string, pageSize: number): string;
    abstract countSql(database: string, table: string): string;
    abstract createDatabase(database: string): string;
    abstract truncateDatabase(database: string): string;
    abstract renameTable(database: string, tableName: string, newName: string): string;
    abstract showTableSource(database: string, table: string): string;
    abstract showViewSource(database: string, table: string): string;
    abstract showProcedureSource(database: string, name: string): string;
    abstract showFunctionSource(database: string, name: string): string;
    abstract showTriggerSource(database: string, name: string): string;
    abstract tableTemplate(): string;
    abstract viewTemplate(): string;
    abstract procedureTemplate(): string;
    abstract triggerTemplate(): string;
    abstract functionTemplate(): string;
    pingDataBase(database: string): string{
        return null;
    }
    dropTriggerTemplate(name:string): string{
        return `DROP IF EXISTS TRIGGER ${name}`
    }
}

