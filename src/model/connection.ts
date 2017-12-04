export interface IConnection {
    readonly host: string;
    readonly user: string;
    readonly password?: string;
    readonly port: string;
    readonly database?: string;
    multipleStatements?: boolean;
    readonly certPath: string;
}
