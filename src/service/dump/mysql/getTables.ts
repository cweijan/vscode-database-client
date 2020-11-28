import { Table, ColumnList } from './interfaces/Table';
import { DB } from './DB';

interface ShowTableRes {
    Table_type: 'BASE TABLE' | 'VIEW';

    [k: string]: string;
}

interface ShowColumnsRes {
    Field: string;
    Type: string;
    Null: 'YES' | 'NO';
    Key: string;
    Default: string | null;
    Extra: string;
}

async function getTables(
    connection: DB,
    dbName: string,
    restrictedTables: Array<string>,
    restrictedTablesIsBlacklist: boolean,
): Promise<Array<Table>> {
    // list the tables
    const showTablesKey = `Tables_in_${dbName}`;
    const tablesRes = await connection.query<ShowTableRes>(
        `SHOW FULL TABLES FROM \`${dbName}\``,
    );
    const actualTables = tablesRes.map<Table>(r => ({
        name: r[showTablesKey].replace(/'/g, ''),
        schema: null,
        data: null,
        isView: r.Table_type === 'VIEW',
        columns: {},
        columnsOrdered: [],
        triggers: [],
    }));

    let tables = actualTables;
    if (restrictedTables.length > 0) {
        if (restrictedTablesIsBlacklist) {
            // exclude the tables from the options that actually exist in the db
            tables = tables.filter(
                t => restrictedTables.indexOf(t.name) === -1,
            );
        } else {
            // only include the tables from the options that actually exist in the db
            // keeping the order of the passed-in whitelist and filtering out non-existing tables
            tables = restrictedTables
                .map(tableName => actualTables.find(t => t.name === tableName))
                .filter((t): t is Table => t !== undefined);
        }
    }

    // get the column definitions
    const columnsMultiQuery = tables
        .map(t => `SHOW COLUMNS FROM \`${t.name}\` FROM \`${dbName}\`;`)
        .join('\n');
    const columns = await connection.multiQuery<ShowColumnsRes>(
        columnsMultiQuery,
    );

    columns.forEach((cols, i) => {
        tables[i].columns = cols.reduce<ColumnList>((acc, c) => {
            acc[c.Field] = {
                type: c.Type
                    // split to remove things like 'unsigned' from the string
                    .split(' ')[0]
                    // split to remove the lengths
                    .split('(')[0]
                    .toLowerCase(),
                nullable: c.Null === 'YES',
            };

            return acc;
        }, {});
        tables[i].columnsOrdered = cols.map(c => c.Field);
    });

    return tables;
}

export { getTables };
