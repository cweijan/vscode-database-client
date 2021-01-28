import { Node } from '@/model/interface/node';
import { TriggerDumpOptions } from './interfaces/Options';

interface ShowTriggers {
    Trigger: string;
    Event: 'INSERT' | 'UPDATE' | 'DELETE';
    Table: string;
    Statement: string;
    Timing: 'BEFORE' | 'AFTER';
    sql_mode: string;
    Definer: string;
    character_set_client: string;
    coallation_connection: string;
    'Database Collation': string;
}
interface ShowCreateTrigger {
    Trigger: string;
    sql_mode: string;
    'SQL Original Statement': string;
    character_set_client: string;
    coallation_connection: string;
    'Database Collation': string;
}

async function getTriggerDump(node: Node, sessionId: string, options: Required<TriggerDumpOptions>, triggers: Array<string>): Promise<string> {
    const output: Array<string> = [];
    if (triggers.length === 0) {
        return "";
    }

    // we create a multi query here so we can query all at once rather than in individual connections
    const getSchemaMultiQuery = triggers.map(trigger => {
        return node.dialect.showTriggerSource(node.database, trigger)
    }).join("")

    const result = await node.multiExecute(getSchemaMultiQuery, sessionId) as ShowCreateTrigger[][];
    result.forEach(r => {
        const res = r[0]
        // clean up the generated SQL
        let sql = `${res['SQL Original Statement']}`;
        if (!options.definer) {
            sql = sql.replace(/CREATE DEFINER=.+?@.+? /, 'CREATE ');
        }
        // drop trigger statement should go outside the delimiter mods
        if (options.dropIfExist) {
            sql = `DROP TRIGGER IF EXISTS ${res.Trigger};\n${sql}`;
        }
        output.push(`\n${sql};\n`);
    });

    return output.join("\n");
}

export { ShowTriggers, ShowCreateTrigger, getTriggerDump };

