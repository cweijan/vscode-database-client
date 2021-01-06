import { SqlDialect } from "./sqlDialect";

export class PostgreSqlDialect implements SqlDialect{
    showDatabases(): string {
        throw new Error("Method not implemented.");
    }
    showTables(database: string): string {
        throw new Error("Method not implemented.");
    }
    showColumns(database: string, table: string): string {
        throw new Error("Method not implemented.");
    }
    showViews(database: string): string {
        throw new Error("Method not implemented.");
    }
    showTriggers(database: string): string {
        throw new Error("Method not implemented.");
    }
    showProcedures(database: string): string {
        throw new Error("Method not implemented.");
    }
    showFunctions(database: string): string {
        throw new Error("Method not implemented.");
    }
    buildPageSql(database: string, table: string, pageSize: number): string {
        throw new Error("Method not implemented.");
    }
    countSql(database: string, table: string): string {
        throw new Error("Method not implemented.");
    }
    createDatabase(database: string): string {
        throw new Error("Method not implemented.");
    }
    truncateDatabase(database: string): string {
        throw new Error("Method not implemented.");
    }
    renameTable(database: string, tableName: string, newName: string): string {
        throw new Error("Method not implemented.");
    }
    showTableSource(database: string, table: string): string {
        throw new Error("Method not implemented.");
    }
    showViewSource(database: string, table: string): string {
        throw new Error("Method not implemented.");
    }
    showProcedureSource(database: string, name: string): string {
        throw new Error("Method not implemented.");
    }
    showFunctionSource(database: string, name: string): string {
        throw new Error("Method not implemented.");
    }
    showTriggerSource(database: string, name: string): string {
        throw new Error("Method not implemented.");
    }
    tableTemplate(): string {
        throw new Error("Method not implemented.");
    }
    viewTemplate(): string {
        throw new Error("Method not implemented.");
    }
    procedureTemplate(): string {
        throw new Error("Method not implemented.");
    }
    triggerTemplate(): string {
        throw new Error("Method not implemented.");
    }
    functionTemplate(): string {
        throw new Error("Method not implemented.");
    }

}