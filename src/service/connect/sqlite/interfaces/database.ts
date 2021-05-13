export interface Database {
    execute: (sql: string, callback?: (rows: string[][], err?: Error) => void) => void;
    close: (callback: (err?: Error) => void) => void;
}