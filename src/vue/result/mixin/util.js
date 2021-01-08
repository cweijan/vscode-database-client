export const util = {
    methods: {
        wrapQuote(type, value) {
            console.log(type)
            type = type.toLowerCase()
            if (value === "") {
                return "null"
            }
            if (/\(.*?\)/.exec(value)) {
                return value
            }
            if (typeof value == "string") {
                value = value.replace(/'/g, "\\'")
            }
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
                    if (type.indexOf("text") !== -1 || type.indexOf("blob") !== -1 || type.indexOf("binary") !== -1) {
                        return `'${value}'`
                    }
            }
            return value
        }
    }
}