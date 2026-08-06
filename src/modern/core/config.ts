import type { ConfigurationReader } from "./contracts";

export interface DatabaseClientSettings {
  defaultSelectLimit: number;
  requestTimeout: number;
  connectTimeout: number;
  escapedAllObjectName: boolean;
  documentationHost: string;
}

const defaults: DatabaseClientSettings = {
  defaultSelectLimit: 1000,
  requestTimeout: 30_000,
  connectTimeout: 30_000,
  escapedAllObjectName: false,
  documentationHost: "https://database-client.com",
};

export class ConfigService {
  public constructor(private readonly reader: ConfigurationReader) {}

  public get<K extends keyof DatabaseClientSettings>(
    key: K,
  ): DatabaseClientSettings[K] {
    return this.reader.get(key, defaults[key]);
  }

  public snapshot(): DatabaseClientSettings {
    return {
      defaultSelectLimit: this.get("defaultSelectLimit"),
      requestTimeout: this.get("requestTimeout"),
      connectTimeout: this.get("connectTimeout"),
      escapedAllObjectName: this.get("escapedAllObjectName"),
      documentationHost: this.get("documentationHost"),
    };
  }
}

export class CallbackConfigurationReader implements ConfigurationReader {
  public constructor(
    private readonly read: <T>(key: string, fallback: T) => T,
  ) {}

  public get<T>(key: string, fallback: T): T {
    return this.read(key, fallback);
  }
}
