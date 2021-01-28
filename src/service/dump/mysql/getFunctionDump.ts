import { FunctionDumpOptions } from './interfaces/Options';
import { DB } from './DB';
import { Node } from '@/model/interface/node';

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

async function getFunctionDump(node: Node, sessionId: string, options: Required<FunctionDumpOptions>, functions: Array<string>): Promise<string> {
    const output: Array<string> = [];
    if (functions.length == 0) {
        return "";
    }
    const getSchemaMultiQuery = functions.map(fun => {
        return node.dialect.showFunctionSource(node.database, fun)
    }).join("")
    const result = await node.multiExecute(getSchemaMultiQuery, sessionId) as ShowCreateFunction[][];
    result.forEach(r => {
        const res = r[0]
        // clean up the generated SQL
        let sql = `${res['Create Function']}`;

        if (!options || !options.definer) {
            sql = sql.replace(/CREATE DEFINER=.+?@.+? /, 'CREATE ');
        }

        // drop stored Function should go outside the delimiter mods
        if (!options || options.dropIfExist) {
            sql = `DROP Function IF EXISTS ${res.Function};\n${sql}`;
        }

        output.push(`\n${sql};\n`);
    });

    return output.join("\n");
}

export { ShowFunctions, ShowCreateFunction, getFunctionDump };