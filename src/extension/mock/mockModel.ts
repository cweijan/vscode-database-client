export interface MockModel {
    host: string;
    port: string;
    user: string;
    database: string;
    table: string;
    mockStartIndex: number;
    mockCount: number;
    mock: {
        [key: string]: {
            type: string,
            value: any,
        }
    }
}