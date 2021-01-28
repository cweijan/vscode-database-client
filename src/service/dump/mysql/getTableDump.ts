import { Node } from '@/model/interface/node';
import { SchemaDumpOptions } from './interfaces/Options';

export interface ShowCreateTable {
    Table: string;
    'Create Table': string;
}

export async function getTableDump(node: Node, sessionId: string, options: Required<SchemaDumpOptions>, tables: Array<string>): Promise<string> {
    if (tables.length == 0) return '';
    const getSchemaMultiQuery = tables
        .map(t => node.dialect.showTableSource(node.database, t))
        .join('');
    if (!getSchemaMultiQuery) return;
    const result = await node.multiExecute(getSchemaMultiQuery, sessionId) as ShowCreateTable[][];
    const createStatements = result
        .map((r) => {
            const res = r[0]
            let schema = res['Create Table'];
            if (!options.engine) {
                schema = schema.replace(/ENGINE\s*=\s*\w+ /, '');
            }
            if (options.table.dropIfExist) {
                schema = schema.replace(
                    /^CREATE TABLE/,
                    `DROP TABLE IF EXISTS ${res.Table};\nCREATE TABLE`,
                );
            } else if (options.table.ifNotExist) {
                schema = schema.replace(
                    /^CREATE TABLE/,
                    'CREATE TABLE IF NOT EXISTS',
                );
            }
            return `${schema};`;
        });
    return createStatements.join("\n\n");
}