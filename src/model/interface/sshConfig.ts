export interface SSHConfig {
    /**
     * local tunnel port
     */
    tunnelPort: number;
    host: string;
    port: number;
    username: string;
    password?: string;
    private?: string;
    privateKey?: Buffer;
    passphrase?: string;
}

