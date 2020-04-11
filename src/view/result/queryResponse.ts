export class RunResponse {
    sql: string;
}

export class DataResponse {
    sql: string;
    costTime: number;
    primaryKey: string;
    columnList: Array<Column>;
    database?: string;
    table: string | null;
    data: any[]
}
export class ErrorResponse {
    sql: string;
    costTime: number;
    message: string;
}

export class DMLResponse {
    sql: string;
    costTime: number;
    message?: string;
    affectedRows: number;
}

export class Column {
    
    // "YES" and  "NO" 
    public nullable: string;
    public type :string;
    public comment: string;
    public key: string;
    public maxLength: number;

}