declare module 'sql-formatter' {
    export function format(
        sql: string,
        opts?: {
            params: string[];
        },
    ): string;
}
