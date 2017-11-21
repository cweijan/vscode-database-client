export interface IConnection {
    readonly host: string;
    readonly user: string;
    readonly password: string;
    readonly port: number;
    readonly database?: string;
}
