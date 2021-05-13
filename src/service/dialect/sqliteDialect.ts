import { CreateIndexParam } from "./param/createIndexParam";
import { UpdateColumnParam } from "./param/updateColumnParam";
import { UpdateTableParam } from "./param/updateTableParam";
import { SqlDialect } from "./sqlDialect";

export class SqliTeDialect extends SqlDialect{
    updateColumn(table: string, column: string, type: string, comment: string, nullable: string): string {
        throw new Error("Method not implemented.");
    }
    showSchemas(): string {
        throw new Error("Method not implemented.");
    }
    showTables(database: string): string {
        return `SELECT name FROM sqlite_master;`;
    }
    addColumn(table: string): string {
        throw new Error("Method not implemented.");
    }
    showColumns(database: string, table: string): string {
        throw new Error("Method not implemented.");
    }
    showViews(database: string): string {
        throw new Error("Method not implemented.");
    }
    showUsers(): string {
        throw new Error("Method not implemented.");
    }
    createUser(): string {
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
        return `SELECT * FROM ${table} LIMIT ${pageSize};`;
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
    updateTable(update: UpdateTableParam): string {
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
    processList(): string {
        throw new Error("Method not implemented.");
    }
    variableList(): string {
        throw new Error("Method not implemented.");
    }
    statusList(): string {
        throw new Error("Method not implemented.");
    }

}