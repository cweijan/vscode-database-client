export const util = {
    methods: {
        wrapQuote(dbType, type, value) {
            if (value === "") {
                return "null"
            }
            // method call 
            if (/\(.*?\)/.exec(value)) {
                return value
            }
            if (typeof value == "string") {
                switch(dbType){
                        case "PostgreSQL":
                        case "SQLite":
                        case "MySQL":
                        case "SqlServer":
                        value = value.replace(/'/g, "''")
                }
            }
            if (!type) {
                return `'${value}'`
            }
            type = type.toLowerCase()
            switch (type) {
                case "int":
                case "bit":
                case "real":
                case "numeric":
                case "decimal":
                case "float":
                case "double":
                case "bool":
                case "boolean":
                    return value
                default:
                    if (type.includes("int") || type.includes("serial")) {
                        return value
                    }
            }
            return `'${value}'`
        }
    }
}