declare module "sql.js" {
  export interface SqlJsResult {
    readonly columns: string[];
    readonly values: unknown[][];
  }

  export interface SqlJsDatabase {
    exec(sql: string): SqlJsResult[];
    getRowsModified(): number;
    export(): Uint8Array;
    close(): void;
  }

  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | ArrayBuffer | Uint8Array) => SqlJsDatabase;
  }

  type InitSqlJs = (configuration?: {
    locateFile?: (file: string) => string;
  }) => Promise<SqlJsStatic>;

  const initSqlJs: InitSqlJs;
  export default initSqlJs;
}
