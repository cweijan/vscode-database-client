import { wrapByDb } from "@/common/wrapper";

export function isDbNumber(type) {
    if (!type) return false;
    const lowerType = type.toLowerCase();
    switch (lowerType) {
        case "int":
        case "bit":
        case "real":
        case "numeric":
        case "decimal":
        case "float":
        case "double":
        case "bool":
        case "boolean":
            return true;
        default:
            if (lowerType.includes("int") || lowerType.includes("serial")) {
                return true;
            }
    }
    return false;
}

export function wrapQuote(dbType, type, value) {
    if (value === "") {
        return "null";
    }
    // mongo method call
    if (dbType=='MongoDB' && /.+?\(.*?\)/.exec(value)) {
        return value;
    }
    if (typeof value == "string") {
        switch (dbType) {
            case "PostgreSQL":
            case "ClickHouse":
            case "SQLite":
            case "MySQL":
            case "SqlServer":
                value = value.replace(/'/g, "''");
        }
    }
    if (!type) {
        return `'${value}'`;
    }
    if (isDbNumber(type)) {
        return value;
    }
    return `'${value}'`.replace(/\\/g, "\\\\");
}

/**
 * find column type by column name
 * @returns 
 */
export function getTypeByColumn(columnName, columnList) {
    if (!columnList) return;
    for (const column of columnList) {
        if (column.name === columnName) {
            return column.simpleType || column.type;
        }
    }
}

export function buildDeleteSQL(param,checkboxRecords) {
    const { dbType, database, table, primaryKey } = param;
    if (dbType == "ElasticSearch") {
        if (checkboxRecords.length > 1) {
            return `POST /_bulk\n${checkboxRecords.map((c) => `{ "delete" : { "_index" : "${table}", "_id" : "${c}" } }`).join("\n")}`
        }
        return `DELETE /${table}/_doc/${checkboxRecords[0]}`;
    } else if (dbType == "MongoDB") {
        return `db('${database}').collection("${table}").deleteMany({_id:{$in:[${checkboxRecords.join(",")}]}})`;
    } else {
        const tableName = wrapByDb(table, dbType);
        return checkboxRecords.length > 1
            ? `DELETE FROM ${tableName} WHERE ${primaryKey} in (${checkboxRecords.join(",")})`
            : `DELETE FROM ${tableName} WHERE ${primaryKey}=${checkboxRecords[0]}`;
    }
}

export function buildInsertSQL(param) {
    const { row, dbType, database, table, columnList } = param;
    if (dbType == "ElasticSearch") {
        return `POST /${table}/_doc\n` + JSON.stringify(row);
    } else if (dbType == "MongoDB") {
        return `db('${database}').collection("${table}").insertOne(${JSON.stringify(row)})\n`
    }
    let columns = "";
    let values = "";
    for (const key in row) {
        if (getTypeByColumn(key, columnList) == null) continue;
        const newEle = row[key];
        if (newEle != null) {
            columns += `${wrapByDb(key, dbType)},`;
            values += `${wrapQuote(dbType, getTypeByColumn(key, columnList), newEle)},`;
        }
    }
    return values ? `INSERT INTO ${table}(${columns.replace(/,$/, "")}) VALUES(${values.replace(/,$/, "")});` : null;
}

export function buildUpdateSql(param) {
    const { currentNew, oldRow, dbType, database, table, columnList, primaryKeyList, primaryKey } = param;
    const row = currentNew;
    if (dbType == "ElasticSearch") {
        const value = {};
        for (const key in row) {
            if (key == "_XID" || key == "_index" || key == "_type" || key == "_score" || key == "_id") {
                continue;
            }
            value[key] = row[key];
        }
        return `POST /${table}/_doc/${row._id}\n` + JSON.stringify(value);
    } else if (dbType == "MongoDB") {
        const temp = Object.assign({}, row);
        delete temp["_id"];
        const id = oldRow._id.indexOf("ObjectID") != -1 ? oldRow._id : `'${oldRow._id}'`;
        return `db('${database}').collection("${table}").updateOne({_id:${id}},{ $set:${JSON.stringify(temp)}})\n`;
    }

    if (!primaryKey) {
        throw new Error("This table has not primary key, cannot update!");
    }

    let change = "";
    for (const key in currentNew) {
        if (getTypeByColumn(key, columnList) == null) continue;
        const oldEle = oldRow[key];
        const newEle = currentNew[key];
        if (oldEle !== newEle) {
            change += `${wrapByDb(key, dbType)}=${wrapQuote(dbType,
                getTypeByColumn(key, columnList),
                newEle
            )},`;
        }
    }
    if (!change) {
        return "";
    }

    let updateSql = `UPDATE ${wrapByDb(table, dbType)} SET ${change.replace(/,$/, "")}`;
    for (let i = 0; i < primaryKeyList.length; i++) {
        const pk = primaryKeyList[i];
        const pkName = pk.name;
        const pkType = pk.simpleType || pk.type;
        if (i == 0) {
            updateSql = `${updateSql} WHERE ${pkName}=${wrapQuote(dbType,
                pkType,
                oldRow[pkName]
            )}`;
        } else {
            updateSql = `${updateSql} AND ${pkName}=${wrapQuote(dbType,
                pkType,
                oldRow[pkName]
            )}`;
        }
    }
    console.log(updateSql);
    return updateSql + ";";
}