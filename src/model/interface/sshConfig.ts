export interface SSHConfig {
    /**
     * local tunnel port
     */
    tunnelPort: number;
    host: string;
    port: number;
    username: string;
    password?: string;
    privateKeyPath?: string;
    privateKey?: Buffer;
    passphrase?: string;
    algorithms?: Algorithms;
}

export interface Algorithms {
    cipher?: string[];
}