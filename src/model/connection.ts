export interface IConnection {
    readonly host: string;
    readonly user: string;
     password?: string;
    readonly port: string;
    readonly database?: string;
    multipleStatements?: boolean;
    readonly certPath: string;
    
}
