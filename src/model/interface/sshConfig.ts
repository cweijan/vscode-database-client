export interface SSHConfig {
    host: string;
    port: number;
    username: string;
    password?: string;
    private?: string;
    privateKey?: Buffer;
    passphrase?: string;
}

