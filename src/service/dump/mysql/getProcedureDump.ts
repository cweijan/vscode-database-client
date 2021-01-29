import { Node } from '@/model/interface/node';
import { ProcedureDumpOptions } from './interfaces/Options';

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

async function getProcedureDump(node: Node, sessionId: string, options: Required<ProcedureDumpOptions>, procedures: Array<string>): Promise<string> {
    if (procedures.length == 0) {
        return "";
    }
    const getSchemaMultiQuery = procedures.map(proc => {
        return node.dialect.showProcedureSource(node.schema, proc)
    }).join("")
    const result = await node.multiExecute(getSchemaMultiQuery, sessionId) as ShowCreateProcedure[][];
    const output = result.map(r => {
        const res = r[0]
        let sql = `${res['Create Procedure']}`;
        if (!options || !options.definer) {
            sql = sql.replace(/CREATE DEFINER=.+?@.+? /, 'CREATE ');
        }
        if (!options || options.dropIfExist) {
            sql = `DROP PROCEDURE IF EXISTS ${res.Procedure};\n${sql}`;
        }
        return `${sql};`;
    });

    return output.join("\n\n");
}

export { ShowProcedures, ShowCreateProcedure, getProcedureDump };
