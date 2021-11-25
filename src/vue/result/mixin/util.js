export const util = {
    methods: {
        isDbNumber(type){
            if(!type)return false;
            switch (type.toLowerCase()) {
                case "int":
                case "bit":
                case "real":
                case "numeric":
                case "decimal":
                case "float":
                case "double":
                case "bool":
                case "boolean":
                    return true
                default:
                    if (type.includes("int") || type.includes("serial")) {
                        return true
                    }
            }
            return false;
        },
        wrapQuote(dbType, type, value) {
            if (value === "") {
                return "null"
            }
            // method call 
            if (/.+?\(.*?\)/.exec(value)) {
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
            if(this.isDbNumber(type)){
                return value;
            }
            return `'${value}'`
        }
    }
}