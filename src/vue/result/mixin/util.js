export const util = {
    methods: {
        wrapQuote(type, value) {
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