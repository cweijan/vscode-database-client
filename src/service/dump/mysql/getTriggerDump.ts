import { TriggerDumpOptions } from './interfaces/Options';
import { Table } from './interfaces/Table';
import { DB } from './DB';

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

async function getTriggerDump(
    connection: DB,
    dbName: string,
    options: Required<TriggerDumpOptions>,
    tables: Array<Table>,
): Promise<Array<Table>> {
    const triggers = (await connection.query<ShowTriggers>(
        `SHOW TRIGGERS FROM \`${dbName}\``,
    ))
        // only include triggers from the tables that we have
        .filter(trig => tables.some(t => t.name === trig.Table))
        // convert to a trigger name => table index map for easy lookup
        .reduce((acc, trig) => {
            tables.some((t, i) => {
                if (t.name === trig.Table) {
                    acc.set(trig.Trigger, i);

                    return true;
                }

                return false;
            });

            return acc;
        }, new Map<string, number>());

    if (triggers.size === 0) {
        // no triggers to process
        return tables;
    }

    // we create a multi query here so we can query all at once rather than in individual connections
    const getSchemaMultiQuery: Array<string> = [];
    triggers.forEach((_, t) =>
        getSchemaMultiQuery.push(`SHOW CREATE TRIGGER \`${t}\`;`),
    );

    const result = await connection.multiQuery<ShowCreateTrigger>(
        getSchemaMultiQuery.join('\n'),
    );
    // mysql2 returns an array of arrays which will all have our one row
    result
        .map(r => r[0])
        .forEach(res => {
            const table = tables[triggers.get(res.Trigger)!];
            // clean up the generated SQL
            let sql = `${res['SQL Original Statement']}`;
            if (!options.definer) {
                sql = sql.replace(/CREATE DEFINER=.+?@.+? /, 'CREATE ');
            }
            // drop trigger statement should go outside the delimiter mods
            if (options.dropIfExist) {
                sql = `DROP TRIGGER IF EXISTS ${res.Trigger};\n${sql}`;
            }
            table.triggers.push(`\n${sql};\n`);
            return table;
        });

    return tables;
}

export { ShowTriggers, ShowCreateTrigger, getTriggerDump };
