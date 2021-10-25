export interface UpdateColumnParam {
    table: string;
    comment: string;
    columnName: string;
    defaultValue: string;
    newColumnName: string;
    columnType: string;
    nullable: boolean;
}