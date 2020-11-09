export class ExportOption {
    type: ExportType;
    withOutLimit: boolean;
    sql: string;
    exportPath: string;
}

export enum ExportType {
    excel = "excel", sql = "sql"
}