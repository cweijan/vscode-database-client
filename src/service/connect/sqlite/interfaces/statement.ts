export interface Statement {
    sql: string;
    type: StatementType;
    position: StatementPosition;
}

export interface StatementPosition {
    start: number[];
    end: number[];
}

export enum StatementType {
    COMMAND = "COMMAND",
    PRAGMA = "PRAGMA",
    SELECT = "SELECT",
    UPDATE = "UPDATE",
    INSERT = "INSERT",
    EXPLAIN = "EXPLAIN",
    OTHER = "OTHER"
}