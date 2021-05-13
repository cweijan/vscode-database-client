export type Schema = Schema.Database;

export namespace Schema {

    export type Item = Database | Table | Column;

    export interface Database {
        path: string;
        tables: Schema.Table[];
    }

    export interface Table {
        database: string;
        name: string;
        type: string;
        columns: Schema.Column[];
    }

    export interface Column {
        database: string;
        table: string;
        name: string;
        type: string;
        notnull: boolean;
        pk: number;
        defVal: string;
    }
}

export type ResultSet = Array<Result>;

export interface Result {
    stmt: string;
    header: string[];
    rows: string[][];
}