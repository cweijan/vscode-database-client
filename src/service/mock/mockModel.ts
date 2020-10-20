export interface MockModel {
    mode: string;
    host: string;
    port: number;
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