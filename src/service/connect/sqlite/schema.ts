import { CliDatabase } from "./cliDatabase";
import { existsSync } from "fs";

export type Schema = Schema.Database;

export namespace Schema {

    export interface Item { }

    export interface Database extends Schema.Item {
        path: string;
        tables: Schema.Table[];
    }

    export interface Table extends Schema.Item {
        database: string;
        name: string;
        type: string;
        columns: Schema.Column[];
    }

    export interface Column extends Schema.Item {
        database: string;
        table: string;
        name: string;
        type: string;
        notnull: boolean;
        pk: number;
        defVal: string;
    }

    export function build(dbPath: string, sqlite3: string): Promise<Schema.Database> {
        return new Promise((resolve, reject) => {
            if (!existsSync(dbPath)) return reject(new Error(`Failed to retrieve database schema: '${dbPath}' is not a file`));

            let schema = {
                path: dbPath,
                tables: []
            } as Schema.Database;

            const tablesQuery = `SELECT name, type FROM sqlite_master
                                WHERE (type="table" OR type="view")
                                AND name <> 'sqlite_sequence'
                                AND name <> 'sqlite_stat1'
                                ORDER BY type ASC, name ASC;`;

            let database = new CliDatabase(sqlite3, dbPath, (err) => {
                reject(err);
            });

            database.execute(tablesQuery, (rows, err) => {
                if (err) return reject(err);

                rows.shift(); // remove header from rows
                schema.tables = rows.map(row => {
                    return {database: dbPath, name: row[0], type: row[1], columns: [] } as Schema.Table;
                });

                for(let table of schema.tables) {
                    let columnQuery = `PRAGMA table_info('${table.name}');`;
                    database.execute(columnQuery, (rows, err) => {
                        if (err) {
                            const msg = `Error retrieving '${table.name}' schema: ${err}`;
                            console.log(msg)
                            return;
                        }

                        if (rows.length < 2) return;

                        //let tableName = result.stmt.replace(/.+\(\'?(\w+)\'?\).+/, '$1');
                        let header: string[] = rows.shift() || [];
                        table.columns = rows.map(row => {
                            return {
                                database: dbPath,
                                table: table.name,
                                name: row[header.indexOf('name')],
                                type: row[header.indexOf('type')].toUpperCase(),
                                notnull: row[header.indexOf('notnull')] === '1' ? true : false,
                                pk: Number(row[header.indexOf('pk')]) || 0,
                                defVal: row[header.indexOf('dflt_value')]
                            } as Schema.Column;
                        });
                    });
                }

                database.close(() => {
                    resolve(schema);
                });
            });
        });
    }
}