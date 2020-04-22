export interface MockModel {
    host: string;
    port: number;
    user: string;
    database: string;
    table: string;
    mockStartIndex: number;
    mockCount: number;
    mock: { [key: string]: any }
}