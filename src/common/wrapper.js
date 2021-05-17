/**
 * wrap origin with ` if is unusual identifier
 * @param origin any string
 */
export function wrapByDb(origin, databaseType) {
    if (origin == null) { return origin; }

    if (origin.match(/\b[-\s]+\b/ig) || origin.match(/^( |if|key|desc|length)$/i)) {
        if (databaseType == 'SqlServer') {
            return origin.split(".").map(text => `[${text}]`).join(".")
        }
        if (databaseType == 'PostgreSQL') {
            return origin.split(".").map(text => `"${text}"`).join(".")
        }
        if (databaseType == 'MongoDB') {
            return origin;
        }
        return `\`${origin}\``;
    }

    return origin;
}