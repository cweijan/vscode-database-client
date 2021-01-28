import { SchemaDumpOptions } from './interfaces/Options';
import { Table } from './interfaces/Table';
import { DB } from './DB';

interface ShowCreateView {
    View: string;
    'Create View': string;
    character_set_client: string;
    collation_connection: string;
}
interface ShowCreateTable {
    Table: string;
    'Create Table': string;
}
type ShowCreateTableStatementRes = ShowCreateView | ShowCreateTable;

async function getSchemaDump( connection: DB, options: Required<SchemaDumpOptions>, tables: Array<Table> ): Promise<Array<Table>> {
    // we create a multi query here so we can query all at once rather than in individual connections
    const getSchemaMultiQuery = tables
        .map(t => `SHOW CREATE TABLE \`${t.name}\`;`)
        .join('\n');
    const createStatements = (await connection.multiQuery<
        ShowCreateTableStatementRes
    >(getSchemaMultiQuery))
        // mysql2 returns an array of arrays which will all have our one row
        .map(r => r[0])
        .map((res, i) => {
            const table = tables[i];
            if ('View' in res) {
                return {
                    ...table,
                    name: res.View,
                    schema: res['Create View'],
                    data: null,
                    isView: true,
                };
            }
            return {
                ...table,
                name: res.Table,
                schema: res['Create Table'],
                data: null,
                isView: false,
            };
        })
        .map(s => {
            // clean up the generated SQL as per the options
            if (!options.engine) {
                s.schema = s.schema.replace(/ENGINE\s*=\s*\w+ /, '');
            }
            if (s.isView) {
                if (options.view.createOrReplace) {
                    s.schema = s.schema.replace(/^CREATE/, 'CREATE OR REPLACE');
                }
                if (!options.view.algorithm) {
                    s.schema = s.schema.replace(
                        /^CREATE( OR REPLACE)? ALGORITHM[ ]?=[ ]?\w+/,
                        'CREATE$1',
                    );
                }
                if (!options.view.definer) {
                    s.schema = s.schema.replace(
                        /^CREATE( OR REPLACE)?( ALGORITHM[ ]?=[ ]?\w+)? DEFINER[ ]?=[ ]?.+?@.+?( )/,
                        'CREATE$1$2$3',
                    );
                }
                if (!options.view.sqlSecurity) {
                    s.schema = s.schema.replace(
                        /^CREATE( OR REPLACE)?( ALGORITHM[ ]?=[ ]?\w+)?( DEFINER[ ]?=[ ]?.+?@.+)? SQL SECURITY (?:DEFINER|INVOKER)/,
                        'CREATE$1$2$3',
                    );
                }
            } else {
                if (options.table.dropIfExist) {
                    s.schema = s.schema.replace(
                        /^CREATE TABLE/,
                        `DROP TABLE IF EXISTS \`${s.name}\`;\nCREATE TABLE`,
                    );
                } else if (options.table.ifNotExist) {
                    s.schema = s.schema.replace(
                        /^CREATE TABLE/,
                        'CREATE TABLE IF NOT EXISTS',
                    );
                }
            }

            s.schema = `${s.schema};\n`;
            return s;
        })
        .sort((a, b) => {
            // sort the views to be last

            if (a.isView && !b.isView) {
                return 1;
            }
            if (!a.isView && b.isView) {
                return -1;
            }

            return 0;
        });

    return createStatements;
}

export {
    ShowCreateView,
    ShowCreateTable,
    ShowCreateTableStatementRes,
    getSchemaDump,
};
