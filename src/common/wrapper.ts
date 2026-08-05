import { DatabaseType } from "./constants";

/**
 * wrap origin with ` if is unusual identifier
 * @param origin any string
 */
export function wrapByDb(origin: string | null | undefined, databaseType?: DatabaseType): string | null | undefined {
    if (origin == null) { return origin; }
    if (databaseType == DatabaseType.PG) {
        return origin.split(".").map(text => `"${text}"`).join(".")
    }
    if (databaseType == DatabaseType.MONGO_DB) {
        return origin;
    }

    if (origin.match(/\b[-\s]+\b/ig) || origin.match(/^( |if|key|desc|length|group|order)$/i)) {
        if (databaseType == DatabaseType.MSSQL) {
            return origin.split(".").map(text => `[${text}]`).join(".")
        }
        return `\`${origin}\``;
    }

    return origin;
}