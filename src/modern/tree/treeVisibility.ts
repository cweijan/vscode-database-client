export interface TreeVisibilityConnection {
  readonly type?: string;
  readonly advance?: unknown;
  readonly options?: unknown;
  readonly [key: string]: unknown;
}

export interface TargetTreeVisibilityOptions {
  readonly includeDatabases: readonly string[];
  readonly excludedDatabases?: RegExp;
  readonly excludedSchemas?: RegExp;
  readonly hideSystemSchema: boolean;
  readonly usingCustomDatabaseName: boolean;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function textList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .flatMap((item) => item.split(","))
      .map((item) => item.trim().toLocaleLowerCase())
      .filter(Boolean);
  }
  return typeof value === "string"
    ? value.split(",").map((item) => item.trim().toLocaleLowerCase()).filter(Boolean)
    : [];
}

function regex(value: unknown): RegExp | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    return new RegExp(value, "i");
  } catch {
    return undefined;
  }
}

function advanceOf(connection: TreeVisibilityConnection): Record<string, unknown> {
  const source = record(connection);
  const direct = record(connection.advance);
  const options = record(connection.options);
  const nested = record(options.advance);
  return {
    ...options,
    ...nested,
    ...source,
    ...direct,
  };
}

export function targetTreeVisibilityOptions(
  connection: TreeVisibilityConnection,
): TargetTreeVisibilityOptions {
  const advance = advanceOf(connection);
  return {
    includeDatabases: textList(advance.includeDatabases),
    excludedDatabases: regex(advance.excludedDatabases),
    excludedSchemas: regex(advance.excludedSchemas),
    hideSystemSchema: advance.hideSystemSchema !== false
      && advance.hideSystemSchema !== "no",
    usingCustomDatabaseName: advance.usingCustomDatabaseName === true,
  };
}

function commonSystemName(name: string): boolean {
  const normalized = name.toLocaleLowerCase();
  return ["information_schema", "performance_schema", "sys", "guest"].includes(normalized)
    || normalized.startsWith("pg_");
}

function databaseSystemName(type: string, name: string): boolean {
  const normalized = name.toLocaleLowerCase();
  switch (type) {
    case "MySQL":
    case "MariaDB":
      return normalized === "mysql";
    case "SqlServer":
    case "AzureSQLServer":
      return ["tempdb", "msdb"].includes(normalized);
    case "Redshift":
      return ["awsdatacatalog", "padb_harvest", "sys:internal"].includes(normalized);
    case "DuckDB":
      return ["system", "temp"].includes(normalized);
    default:
      return false;
  }
}

export function filterTargetTreeNames(
  connection: TreeVisibilityConnection,
  names: readonly string[],
  scope: "database" | "schema",
): string[] {
  const options = targetTreeVisibilityOptions(connection);
  const include = scope === "database" ? new Set(options.includeDatabases) : undefined;
  const excluded = scope === "database" ? options.excludedDatabases : options.excludedSchemas;
  return names.filter((name) => {
    const normalized = name.trim().toLocaleLowerCase();
    if (!normalized) return false;
    if (include && include.size > 0 && !include.has(normalized)) return false;
    if (excluded?.test(name)) return false;
    if (include && include.size > 0) return true;
    if (!options.hideSystemSchema) return true;
    return !commonSystemName(name)
      && !(scope === "database" && databaseSystemName(connection.type || "", name));
  });
}
