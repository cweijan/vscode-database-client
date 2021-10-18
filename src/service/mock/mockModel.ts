export interface MockModel {
    mockValueReference: string;
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