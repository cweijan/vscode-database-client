import { UnsupportedDatabaseOperationError } from "../core/errors";
import type { DatabaseType, Dialect } from "./types";

export class DialectRegistry {
  private readonly dialects: Dialect[] = [];

  public constructor(dialects: Dialect[] = []) {
    for (const dialect of dialects) {
      this.register(dialect);
    }
  }

  public register(dialect: Dialect): void {
    const existing = this.dialects.findIndex((item) => item.id === dialect.id);
    if (existing >= 0) {
      this.dialects.splice(existing, 1, dialect);
    } else {
      this.dialects.push(dialect);
    }
  }

  public resolve(type: DatabaseType): Dialect {
    const dialect = this.dialects.find((item) => item.supports(type));
    if (!dialect) {
      throw new UnsupportedDatabaseOperationError("SQL dialect", type);
    }
    return dialect;
  }

  public list(): readonly Dialect[] {
    return this.dialects;
  }
}
