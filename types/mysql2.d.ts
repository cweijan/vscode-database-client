/* eslint-disable import/no-duplicates, import/no-unresolved, import/no-extraneous-dependencies */
declare module 'mysql2' {
    export * from 'mysql';

    import { FieldInfo } from 'mysql';

    export interface IQueryReturn<T> {
        0: T[];
        1: FieldInfo[];

        [Symbol.iterator](): T[] | FieldInfo[];
        [index: number]: T[] | FieldInfo[];
    }

    // for some reason typescript doesn't export the non-js items using the above export....
    export {
        Connection,
        EscapeFunctions,
        FieldInfo,
        GeometryType,
        MysqlError,
        packetCallback,
        Pool,
        PoolCluster,
        PoolClusterConfig,
        PoolConfig,
        PoolConnection,
        Query,
        queryCallback,
        QueryFunction,
        QueryOptions,
        TypeCast,
    } from 'mysql';
    export { TypecastField, IConnectionConfig } from 'mysql2/promise';
}

declare module 'mysql2/promise' {
    import * as mysql from 'mysql2';

    export * from 'mysql';

    export interface IQueryReturn<T> {
        0: T[];
        1: mysql.FieldInfo[];

        [Symbol.iterator](): T[] | mysql.FieldInfo[];
        [index: number]: T[] | mysql.FieldInfo[];
    }

    export interface IExecuteOptions extends mysql.QueryOptions {
        values: any[];
    }

    export type IPromiseQueryFunction = <T>(
        arg1: string | mysql.QueryOptions,
        values?: any | any[],
    ) => Promise<IQueryReturn<T>>;

    export type IPromiseExecuteFunction = <T>(
        arg1: string | IExecuteOptions,
        values?: any | any[],
    ) => Promise<IQueryReturn<T>>;

    export interface IPromiseConnection {
        connection: mysql.Connection;
        query: IPromiseQueryFunction;
        execute: IPromiseExecuteFunction;

        release(): void;

        end(): Promise<void>;
        end(options: any): Promise<void>;
    }

    export interface IPromisePool extends IPromiseConnection {
        connection: mysql.Connection;

        getConnection(): Promise<IPromiseConnection>;
        query: IPromiseQueryFunction;
        execute: IPromiseExecuteFunction;
    }

    type FieldTypes =
        | 'DECIMAL'
        | 'TINY'
        | 'SHORT'
        | 'LONG'
        | 'FLOAT'
        | 'DOUBLE'
        | 'NULL'
        | 'TIMESTAMP'
        | 'LONGLONG'
        | 'INT24'
        | 'DATE'
        | 'TIME'
        | 'DATETIME'
        | 'YEAR'
        | 'NEWDATE'
        | 'VARCHAR'
        | 'BIT'
        | 'JSON'
        | 'NEWDECIMAL'
        | 'ENUM'
        | 'SET'
        | 'TINY_BLOB'
        | 'MEDIUM_BLOB'
        | 'LONG_BLOB'
        | 'BLOB'
        | 'VAR_STRING'
        | 'STRING'
        | 'GEOMETRY';

    export interface TypecastField {
        buffer(): Buffer;
        string(): string;
        geometry(): any;
        db: string;
        length: number;
        name: string;
        table: string;
        type: FieldTypes;
    }
    export interface IConnectionConfig extends mysql.ConnectionOptions {
        /**
         * The hostname of the database you are connecting to. (Default: localhost)
         */
        host?: string;

        /**
         * The port number to connect to. (Default: 3306)
         */
        port?: number;

        /**
         * The source IP address to use for TCP connection
         */
        localAddress?: string;

        /**
         * The path to a unix domain socket to connect to. When used host and port are ignored
         */
        socketPath?: string;

        /**
         * The timezone used to store local dates. (Default: 'local')
         */
        timezone?: string;

        /**
         * The milliseconds before a timeout occurs during the initial connection to the MySQL server. (Default: 10 seconds)
         */
        connectTimeout?: number;

        /**
         * Stringify objects instead of converting to values. (Default: 'false')
         */
        stringifyObjects?: boolean;

        /**
         * Allow connecting to MySQL instances that ask for the old (insecure) authentication method. (Default: false)
         */
        insecureAuth?: boolean;

        /**
         * Determines if column values should be converted to native JavaScript types. It is not recommended (and may go away / change in the future)
         * to disable type casting, but you can currently do so on either the connection or query level. (Default: true)
         *
         * You can also specify a function (field: any, next: () => void) => {} to do the type casting yourself.
         *
         * WARNING: YOU MUST INVOKE the parser using one of these three field functions in your custom typeCast callback. They can only be called once.
         *
         * field.string()
         * field.buffer()
         * field.geometry()
         *
         * are aliases for
         *
         * parser.parseLengthCodedString()
         * parser.parseLengthCodedBuffer()
         * parser.parseGeometryValue()
         *
         * You can find which field function you need to use by looking at: RowDataPacket.prototype._typeCast
         */
        typeCast?: (field: TypecastField, next: () => void) => any;

        /**
         * A custom query format function
         */
        queryFormat?: (query: string, values: any) => void;

        /**
         * When dealing with big numbers (BIGINT and DECIMAL columns) in the database, you should enable this option
         * (Default: false)
         */
        supportBigNumbers?: boolean;

        /**
         * Enabling both supportBigNumbers and bigNumberStrings forces big numbers (BIGINT and DECIMAL columns) to be
         * always returned as JavaScript String objects (Default: false). Enabling supportBigNumbers but leaving
         * bigNumberStrings disabled will return big numbers as String objects only when they cannot be accurately
         * represented with [JavaScript Number objects] (http://ecma262-5.com/ELS5_HTML.htm#Section_8.5)
         * (which happens when they exceed the [-2^53, +2^53] range), otherwise they will be returned as Number objects.
         * This option is ignored if supportBigNumbers is disabled.
         */
        bigNumberStrings?: boolean;

        /**
         * Force date types (TIMESTAMP, DATETIME, DATE) to be returned as strings rather then inflated into JavaScript Date
         * objects. (Default: false)
         */
        dateStrings?: boolean;

        /**
         * This will print all incoming and outgoing packets on stdout.
         * You can also restrict debugging to packet types by passing an array of types (strings) to debug;
         *
         * (Default: false)
         */
        debug?: any;

        /**
         * Generates stack traces on Error to include call site of library entrance ("long stack traces"). Slight
         * performance penalty for most calls. (Default: true)
         */
        trace?: boolean;

        /**
         * Allow multiple mysql statements per query. Be careful with this, it exposes you to SQL injection attacks. (Default: false)
         */
        multipleStatements?: boolean;

        /**
         * List of connection flags to use other than the default ones. It is also possible to blacklist default ones
         */
        flags?: string[];

        /**
         * object with ssl parameters or a string containing name of ssl profile
         */
        ssl?: any;
    }

    export function createConnection(
        options: IConnectionConfig,
    ): Promise<IPromiseConnection>;
    export function createPool(options: IConnectionConfig): IPromisePool;
}
