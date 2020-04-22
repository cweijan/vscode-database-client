import * as mysql from "mysql";

export class RunResponse {
    public sql: string;
}

export class MessageResponse {
    public message: string;
    public success: boolean;
}

export class DataResponse {
    public sql: string;
    public costTime: number;
    public primaryKey: string;
    public columnList: Column[];
    public database?: string;
    public table: string | null;
    public data: any[];
    public fields: mysql.FieldInfo[];
}
export class ErrorResponse {
    public sql: string;
    public costTime: number;
    public message: string;
}

export class DMLResponse {
    public sql: string;
    public costTime: number;
    public message?: string;
    public affectedRows: number;
}

export class Column {

    // "YES" and  "NO" 
    public nullable: string;
    public type: string;
    public comment: string;
    public key: string;
    public maxLength: number;

}