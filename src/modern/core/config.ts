import type { ConfigurationReader } from "./contracts";

export interface DatabaseClientSettings {
  defaultSelectLimit: number;
  requestTimeout: number;
  connectTimeout: number;
  escapedAllObjectName: boolean;
  documentationHost: string;
  enableEditorCodeLens: boolean;
  splitSQLByNewLine: boolean;
  enableFlexibleSQLParser: boolean;
  enableSQLVariable: boolean;
  showSecurity: boolean;
  showTrigger: boolean;
}

const defaults: DatabaseClientSettings = {
  defaultSelectLimit: 1000,
  requestTimeout: 30_000,
  connectTimeout: 30_000,
  escapedAllObjectName: false,
  documentationHost: "https://database-client.com",
  enableEditorCodeLens: true,
  splitSQLByNewLine: true,
  enableFlexibleSQLParser: true,
  enableSQLVariable: true,
  showSecurity: true,
  showTrigger: false,
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
      enableEditorCodeLens: this.get("enableEditorCodeLens"),
      splitSQLByNewLine: this.get("splitSQLByNewLine"),
      enableFlexibleSQLParser: this.get("enableFlexibleSQLParser"),
      enableSQLVariable: this.get("enableSQLVariable"),
      showSecurity: this.get("showSecurity"),
      showTrigger: this.get("showTrigger"),
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
