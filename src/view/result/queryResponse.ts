export class RunResponse {
    sql: string;
}

export class DataResponse {
    sql: string;
    costTime: number;
    primaryKey: string;
    // TODO 需要增加类型,用于对数据进行转换,以及是否为NULL
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