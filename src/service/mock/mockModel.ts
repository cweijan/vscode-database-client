export interface MockModel {
    host: string;
    port: string;
    user: string;
    database: string;
    examples: string;
    table: string;
    mockStartIndex: number|string;
    mockCount: number;
    mock: {
        [key: string]: {
            type: string,
            value: any,
        }
    }
}