export class ExportOption {
    type: ExportType;
    withOutLimit: boolean;
    sql: string;
    folderPath: string;
}

export enum ExportType {
    excel = "excel", sql = "sql"
}