export class ExportContext {
    type: ExportType;
    withOutLimit: boolean;
    table:string;
    sql: string;
    exportPath: string;
    /**
     * intenel: fields 
     */
    fields: any[];
    /**
     * intenel: result
     */
    rows:any;
    /**
     * intenel: trigger when export done
     */
    done: (value?: any) => void;
}

export enum ExportType {
    excel = "excel", sql = "sql", csv = "csv"
}