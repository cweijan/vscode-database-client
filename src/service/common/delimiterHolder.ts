export class DelimiterHolder {

    private delimiterPattern = /\bdelimiter\b\s*([;\$\.\(\)\[\]\'\"\\\/\w]+)/ig;
    private delimiteMap = new Map<string, string>();

    public get(key: string) {
        const delimiter = this.delimiteMap.get(key);
        if (!delimiter) { return ";" }
        return delimiter
    }


    public parseBatch(sql: string, key?: string): { sql: string, replace: boolean } {
        let replace = false;
        if (!sql) { return { sql, replace }; }

        const delimiterArray = []
        if (key) {
            const delimiter = this.delimiteMap.get(key)
            delimiterArray.push(delimiter)
        }

        let delimiterMatch: RegExpExecArray
        while ((delimiterMatch = this.delimiterPattern.exec(sql)) != null) {
            const target = delimiterMatch[1].split("").map((c) => c.match(/\w/) ? c : "\\" + c).join("")
            delimiterArray.push(target)
            if (key) {
                this.delimiteMap.set(key, target)
            }
        }

        if (delimiterArray.length > 0) {
            sql = sql.replace(this.delimiterPattern, "")
            for (const delimiter of delimiterArray) {
                sql = this.buildDelimiter(sql, delimiter)
                replace = true;
            }
        }

        return { sql, replace };
    }

    private buildDelimiter(sql: string, delimiter: string) {
        if (!sql || !delimiter) { return sql; }
        return sql.replace(new RegExp(`${delimiter}\\s*$`, 'gm'), ";")
    }

}