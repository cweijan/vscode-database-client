export class ExportContext {
    type: ExportType;
    withOutLimit: boolean;
    table:string;
    sql: string;
    exportPath: string;
    /**
     * fields, from intenel
     */
    fields: any[];
    /**
     * result,from intenel
     */
    rows:any;
}

export enum ExportType {
    excel = "excel", sql = "sql", csv = "csv"
}