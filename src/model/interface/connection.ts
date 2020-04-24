export interface ConnectionInfo {
    readonly host: string;
    readonly port: string;
    readonly user: string;
    readonly password?: string;
    database?: string;
    multipleStatements?: boolean;
    readonly certPath?: string;
    readonly timezone?: string;

}
