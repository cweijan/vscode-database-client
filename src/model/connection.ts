export interface IConnection {
    readonly host: string;
    readonly user: string;
    readonly password: string;
    readonly database?: string;
}

interface IConnection2 {
    readonly host: string;
    readonly user: string;
    readonly password: string;
}
