declare module "node-zookeeper-client" {
  export interface ZookeeperClient {
    connect(): void;
    close(): void;
    create(
      path: string,
      callback: (error: Error | undefined, createdPath?: string) => void,
    ): void;
    create(
      path: string,
      data: Buffer | string,
      callback: (error: Error | undefined, createdPath?: string) => void,
    ): void;
    getChildren(
      path: string,
      callback: (error: Error | undefined, children?: string[]) => void,
    ): void;
    getData(
      path: string,
      callback: (error: Error | undefined, data?: Buffer) => void,
    ): void;
    setData(
      path: string,
      data: Buffer | string,
      callback: (error?: Error) => void,
    ): void;
    removeRecursive(path: string, callback: (error?: Error) => void): void;
    on(event: "error", listener: (error: Error) => void): this;
    once(event: "connected", listener: () => void): this;
    once(event: "error", listener: (error: Error) => void): this;
  }

  const client: {
    createClient(connectionString: string): ZookeeperClient;
  };

  export default client;
}
