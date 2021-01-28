import { Node } from '@/model/interface/node';
import { all as merge } from 'deepmerge';
import * as fs from 'fs';
import { DB } from './DB';
import { ERRORS } from './Errors';
import { getDataDump } from './getDataDump';
import { getFunctionDump } from './getFunctionDump';
import { getProcedureDump } from './getProcedureDump';
import { getSchemaDump } from './getSchemaDump';
import { getTriggerDump } from './getTriggerDump';
import { DumpReturn } from './interfaces/DumpReturn';
import {
    CompletedOptions, Options
} from './interfaces/Options';


export {
    Options
};

const defaultOptions: Options = {
    connection: {
        host: 'localhost',
        port: 3306,
        user: '',
        password: '',
        database: '',
        charset: 'UTF8_GENERAL_CI',
        ssl: null,
    },
    dump: {
        tables: [],
        excludeTables: false,
        schema: {
            engine: true,
            table: {
                ifNotExist: false,
                dropIfExist: true
            },
            view: {
                createOrReplace: true,
                algorithm: false,
                definer: false,
                sqlSecurity: false,
            },
        },
        data: {
            verbose: true,
            lockTables: false,
            includeViewData: false,
            where: {},
            maxRowsPerInsertStatement: 5000,
        },
        trigger: {
            dropIfExist: true,
            definer: false,
        },
    },
    dumpToFile: null,
};

function assert(condition: unknown, message: string): void {
    if (!condition) {
        throw new Error(message);
    }
}
export default async function main(inputOptions: Options, node: Node): Promise<DumpReturn> {
    try {
        // assert the given options have all the required properties
        assert(inputOptions.connection, ERRORS.MISSING_CONNECTION_CONFIG);
        assert(inputOptions.connection.host, ERRORS.MISSING_CONNECTION_HOST);
        assert(inputOptions.connection.database, ERRORS.MISSING_CONNECTION_DATABASE,);
        assert(inputOptions.connection.user, ERRORS.MISSING_CONNECTION_USER);
        // note that you can have empty string passwords, hence the type assertion
        assert(typeof inputOptions.connection.password === 'string', ERRORS.MISSING_CONNECTION_PASSWORD,);

        const options = merge([defaultOptions, inputOptions]) as CompletedOptions;

        // make sure the port is a number
        options.connection.port = parseInt(`${options.connection.port}`, 10);

        // write to the destination file (clear it)
        if (options.dumpToFile) {
            fs.writeFileSync(options.dumpToFile, '');
        }

        // list the tables
        const res: DumpReturn = {
            dump: {
                schema: null,
                data: null
            },
            tables: null,
        };

        if (options.dumpToFile && options.connection.database && options.dump.withDatabase) {
            fs.appendFileSync(options.dumpToFile, `CREATE DATABASE /*!32312 IF NOT EXISTS*/ \`${options.connection.database}\` /*!40100 DEFAULT CHARACTER SET utf8mb4 */;
USE \`${options.connection.database}\`;\n\n`);
        }

        const sessionId = new Date().getTime() + ""

        // dump the schema if requested
        if (options.dump.schema !== false) {
            res.tables = await getSchemaDump(
                node, sessionId,
                options.dump.schema,
                options.dump.tables
            );
            const tableResult = res.tables
                .map(t => t.schema)
                .join('\n');
            fs.appendFileSync(options.dumpToFile, `${tableResult}\n\n`);

        }

        if (options.dump.data !== false) {
            const tables = res.tables;
            res.tables = await getDataDump(options.connection, options.dump.data, tables, options.dumpToFile,);
            res.dump.data = res.tables.map(t => t.data).join('\n');
        }

        if (options.dump.procedure !== false) {
            const predecureDatas = await getProcedureDump(node, sessionId, options.dump.procedure, options.dump.procedureList);
            fs.appendFileSync(options.dumpToFile, `${predecureDatas}\n`);
        }

        if (options.dump.procedure !== false) {
            const functionDatas = await getFunctionDump(node, sessionId, options.dump.function, options.dump.functionList);
            fs.appendFileSync(options.dumpToFile, `${functionDatas}\n`);
        }

        if (options.dump.trigger !== false) {
            const triggerDatas = await getTriggerDump(node, sessionId, options.dump.trigger, options.dump.triggerList);
            fs.appendFileSync(options.dumpToFile, `${triggerDatas}\n`);
        }

        return res;
    } finally {
        DB.cleanup();
    }
}

// a hacky way to make the package work with both require and ES modules
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(main as any).default = main;
