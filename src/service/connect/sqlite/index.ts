import { Schema } from "./schema";
import { Disposable } from "vscode";
import { Result, ResultSet } from "./common";
import { executeQuery } from "./queryExecutor";
import { validateSqliteCommand } from "./sqliteCommandValidation";

// TODO: Improve how the sqlite command is set
class SQLite implements Disposable {

    private dbPath: string;
    private sqliteCommand!: string;

    constructor(dbPath:string) {
        this.dbPath=dbPath;
        this.setSqliteCommand(null);
    }

    query(query: string): Promise<Result|Result[]> {
        if (!this.sqliteCommand) Promise.resolve({error: "Unable to execute query: provide a valid sqlite3 executable in the setting sqlite.sqlite3."});

        return executeQuery(this.sqliteCommand, this.dbPath, query);
    }
    
    schema(dbPath: string): Promise<Schema.Database> {
        if (!this.sqliteCommand) Promise.resolve({error: "Unable to execute query: provide a valid sqlite3 executable in the setting sqlite.sqlite3."});

        return Promise.resolve(Schema.build(dbPath, this.sqliteCommand));
    }

    dispose() {
        // Nothing to dispose
    }

    setSqliteCommand(sqliteCommand: string) {
        this.sqliteCommand = validateSqliteCommand(sqliteCommand);
    }
}

export interface QueryResult {resultSet?: ResultSet; error?: Error; }

export default SQLite;