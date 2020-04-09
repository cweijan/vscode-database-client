export class RunResponse {
    sql: string;
}

export class DataResponse {
    sql: string;
    costTime: number;
    primaryKey: string;
    // 需要增加类型
    columnList: Array<string>;
    database?: string;
    table: string | null;
    data: any[]
}
export class ErrorResponse {
    sql: string;
    message: string;
}

export class DMLResponse {
    sql: string;
    costTime: number;
    affectedRows:number;
}