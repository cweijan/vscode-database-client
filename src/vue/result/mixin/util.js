export const util = {
    methods: {
        wrapQuote(type, value) {
            if (value === "") {
                return "null"
            }
            // method call 
            if (/\(.*?\)/.exec(value)) {
                return value
            }
            if (typeof value == "string") {
                value = value.replace(/'/g, "\\'")
            }
            if (!type) {
                return `'${value}'`
            }
            type = type.toLowerCase()
            switch (type) {
                // sql server
                case "nvarchar":
                case "nchar":
                case "nvarchar":
                case "datetimeoffset":
                case "smalldatetime":
                case "datetime2":
                // pg
                case "character":
                case "xml":
                case "uuid":
                case "jsonb":
                case "character varying":
                case "timestamp with time zone":
                // mysql
                case "varchar":
                case "char":
                case "date":
                case "time":
                case "timestamp":
                case "datetime":
                case "set":
                case "json":
                    return `'${value}'`
                default:
                    if (type.includes("timestamp") || type.includes("text") || type.includes("blob") || type.includes("binary")) {
                        return `'${value}'`
                    }
            }
            return value
        }
    }
}