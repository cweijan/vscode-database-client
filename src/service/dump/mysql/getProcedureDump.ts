import { ProcedureDumpOptions } from './interfaces/Options';
import { DB } from './DB';

interface ShowProcedures {
    Name: string;
    sql_mode: string;
    definer: string;
    character_set_client: string;
    coallation_connection: string;
    'Database Collation': string;
}
interface ShowCreateProcedure {
    Procedure: string;
    sql_mode: string;
    'Create Procedure': string;
    character_set_client: string;
    coallation_connection: string;
    'Database Collation': string;
}

async function getProcedureDump(
    connection: DB,
    dbName: string,
    options: Required<ProcedureDumpOptions>,
): Promise<Array<string>> {
    const output: Array<string> = [];
    const procedures = await connection.query<ShowProcedures>(
        `SHOW PROCEDURE STATUS WHERE Db = '${dbName}'`,
    );

    // we create a multi query here so we can query all at once rather than in individual connections
    const getSchemaMultiQuery: Array<string> = [];
    procedures.forEach(proc => {
        getSchemaMultiQuery.push(`SHOW CREATE PROCEDURE \`${proc.Name}\`;`);
    });

    if(getSchemaMultiQuery.length==0){
        return [];
    }

    const result = await connection.multiQuery<ShowCreateProcedure>(
        getSchemaMultiQuery.join('\n'),
    );
    // mysql2 returns an array of arrays which will all have our one row
    result
        .map(r => r[0])
        .forEach(res => {
            // clean up the generated SQL
            let sql = `${res['Create Procedure']}`;

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

            // drop stored procedure should go outside the delimiter mods
            if (!options || options.dropIfExist) {
                sql = `DROP PROCEDURE IF EXISTS ${res.Procedure};\n${sql}`;
            }

            // add a header to the stored procedure
            sql = [
                '',
                sql,
                '',
            ].join('\n');

            return output.push(sql);
        });

    return output;
}

export { ShowProcedures, ShowCreateProcedure, getProcedureDump };