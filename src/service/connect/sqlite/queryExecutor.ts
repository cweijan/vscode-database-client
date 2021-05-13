import { CliDatabase } from "./cliDatabase";
import { Database } from "./interfaces/database";
import { extractStatements } from "./queryParser";
import { Result, ResultSet } from "./common";
import { QueryResult } from ".";
import { Statement } from "./interfaces/statement";

interface QueryExecutionOptions {
    sql: string[]; // sql to execute before executing the query (e.g ATTACH DATABASE <path>; PRAGMA foreign_keys = ON; ecc)
}

export function executeQuery(sqlite3: string, dbPath: string, query: string, options: QueryExecutionOptions = {sql: []}): Promise<Result|Result[]> {
    if (!sqlite3) {
        return Promise.reject(new Error(`Unable to execute query: SQLite command is not valid: '${sqlite3}'`));
    }

    console.debug(`Query: ${query}`);

    // extract the statements from the query
    let statements: Statement[];
    try {
        statements = extractStatements(query);
    } catch(err) {
        return Promise.reject(`Unable to execute query: ${err.message}`);
    }

    console.debug(`Statements:\n${JSON.stringify(statements)}`);

    let resultSet: ResultSet = [];
    let error: Error|undefined;


    return new Promise((resolve, reject) => {
        let database: Database;

        database = new CliDatabase(sqlite3, dbPath, (err) => {
            // there was an error opening the database, reject
            reject(err);
        });

        // execute sql before the queries, reject if there is any error
        for(let sql of options.sql) {
            database.execute(sql, (_rows, err) => {
                if (err) reject(new Error(`Failed to execute: '${sql}': ${err.message}`));
            });
        }

        // execute statements
        for(let statement of statements) {
            database.execute(statement.sql, (rows, err) => {
                if (err) {
                    error = err;
                } else {
                    let header = rows.length > 1? rows.shift() : [];
                    resultSet.push({stmt: statement.sql, header: header!, rows});
                }
            });
        }

        database.close(() => {
            // resolve({resultSet: resultSet, error: error});
            if(resultSet.length==1){
                resolve(resultSet[0]);
            }else{
                resolve(resultSet);
            }
        });
    });
}