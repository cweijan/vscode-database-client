import { FunctionDumpOptions } from './interfaces/Options';
import { DB } from './DB';

interface ShowFunctions {
    Name: string;
    sql_mode: string;
    definer: string;
    character_set_client: string;
    coallation_connection: string;
    'Database Collation': string;
}
interface ShowCreateFunction {
    Function: string;
    sql_mode: string;
    'Create Function': string;
    character_set_client: string;
    coallation_connection: string;
    'Database Collation': string;
}

async function getFunctionDump(
    connection: DB,
    dbName: string,
    options: Required<FunctionDumpOptions>,
): Promise<Array<string>> {
    const output: Array<string> = [];
    const Functions = await connection.query<ShowFunctions>(
        `SHOW Function STATUS WHERE Db = '${dbName}'`,
    );

    // we create a multi query here so we can query all at once rather than in individual connections
    const getSchemaMultiQuery: Array<string> = [];
    Functions.forEach(proc => {
        getSchemaMultiQuery.push(`SHOW CREATE Function \`${proc.Name}\`;`);
    });

    if(getSchemaMultiQuery.length==0){
        return [];
    }

    const result = await connection.multiQuery<ShowCreateFunction>(
        getSchemaMultiQuery.join('\n'),
    );
    // mysql2 returns an array of arrays which will all have our one row
    result
        .map(r => r[0])
        .forEach(res => {
            // clean up the generated SQL
            let sql = `${res['Create Function']}`;

            if (!options || !options.definer) {
                sql = sql.replace(/CREATE DEFINER=.+?@.+? /, 'CREATE ');
            }

            // add the delimiter
            if (options && options.delimiter) {
                sql = `DELIMITER ${options.delimiter}\n${sql}${
                    options.delimiter
                }\nDELIMITER ;`;
            } else {
                sql = `DELIMITER ;;\n${sql};;\nDELIMITER ;`;
            }

            // drop stored Function should go outside the delimiter mods
            if (!options || options.dropIfExist) {
                sql = `DROP Function IF EXISTS ${res.Function};\n${sql}`;
            }

            // add a header to the stored Function
            sql = [
                '',
                sql,
                '',
            ].join('\n');

            return output.push(sql);
        });

    return output;
}

export { ShowFunctions, ShowCreateFunction, getFunctionDump };