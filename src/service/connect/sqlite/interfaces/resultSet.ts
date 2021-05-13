import { Statement } from "./statement";

export type ResultSet = Array<{
    statement: Statement;
    executed: boolean;
    error?: Error;
    data: ResultData;
}>;

interface ResultData {
    //time: string;
    header: string[];
    rows: string[][];
    //raw: string;
}