import { Node } from "@/model/interface/node";

interface ConnectionOptions {
    /**
     * The database host to connect to.
     * Defaults to 'localhost'.
     */
    host?: string;
    /**
     * The port on the host to connect to.
     * Defaults to 3306.
     */
    port?: number;
    /**
     * The database to dump.
     */
    database: string;
    /**
     * The DB username to use to connect.
     */
    user: string;
    /**
     * The password to use to connect.
     */
    password: string;
    /**
     * The charset to use for the connection.
     * Defaults to 'UTF8_GENERAL_CI'.
     */
    charset?: string;
    /**
     * SSL configuration options.
     * Passing 'Amazon RDS' will use Amazon's RDS CA certificate.
     *
     * Otherwise you can pass the options which get passed to tls.createSecureContext.
     * See: https://nodejs.org/api/tls.html#tls_tls_createsecurecontext_options
     */
    ssl?:
    | 'Amazon RDS'
    | null
    | {
        /**
         * Optionally override the trusted CA certificates. Default is to trust the well-known CAs curated by Mozilla.
         */
        ca?: string | Buffer;
        /**
         * Optional cert chains in PEM format.
         */
        cert?: string | Buffer;
        /**
         * Optional cipher suite specification, replacing the default.
         */
        ciphers?: string;
        /**
         * Optional PEM formatted CRLs (Certificate Revocation Lists).
         */
        crl?: string | Array<string>;
        /**
         * Attempt to use the server's cipher suite preferences instead of the client's.
         */
        honorCipherOrder?: boolean;
        /**
         * Optional private keys in PEM format.
         */
        key?: string | Buffer;
        /**
         * Optional shared passphrase used for a single private key and/or a PFX.
         */
        passphrase?: string;
        /**
         * Optional PFX or PKCS12 encoded private key and certificate chain.
         */
        pfx?: string | Buffer;
        /**
         * DO NOT USE THIS OPTION UNLESS YOU REALLY KNOW WHAT YOU ARE DOING!!!
         * Set to false to allow connection to a MySQL server without properly providing the appropraite CA to trust.
         */
        rejectUnauthorized?: boolean;
    };
}

interface SchemaDumpOptions {
    /**
     * True to include engine values in schema, false otherwise.
     * Defaults to true.
     */
    engine?: boolean;
    /**
     * Options for table dumps
     */
    table?: {
        /**
         * Guard create table calls with an "IF NOT EXIST"
         * Defaults to true.
         */
        ifNotExist?: boolean;
        /**
         * Drop tables before creation (overrides `ifNotExist`).
         * Defaults to false.
         */
        dropIfExist?: boolean;
    };
    view?: {
        /**
         * Uses `CREATE OR REPLACE` to define views.
         * Defaults to true.
         */
        createOrReplace?: boolean;
        /**
         * Include the `DEFINER = {\`user\`@\`host\` | CURRENT_USER}` in the view definition or not
         * Defaults to false.
         */
        definer?: boolean;
        /**
         * Include the `ALGORITHM = {UNDEFINED | MERGE | TEMPTABLE}` in the view definition or not
         * Defaults to false.
         */
        algorithm?: boolean;
        /**
         * Incldue the `SQL SECURITY {DEFINER | INVOKER}` in the view definition or not
         * Defaults to false.
         */
        sqlSecurity?: boolean;
    };
}

interface TriggerDumpOptions {
    /**
     * Drop triggers before creation.
     * Defaults to false.
     */
    dropIfExist?: boolean;
    /**
     * Include the `DEFINER = {\`user\`@\`host\` | CURRENT_USER}` in the view definition or not
     * Defaults to false.
     */
    definer?: boolean;
}

interface FunctionDumpOptions {
    /**
     * Drop function before creation.
     * Defaults to false.
     */
    dropIfExist?: boolean;
    /**
     * Include the `DEFINER = {\`user\`@\`host\` | CURRENT_USER}` in the sp definition or not
     * Defaults to false.
     */
    definer?: boolean;
}

interface ProcedureDumpOptions {
    /**
     * Drop procedure before creation.
     * Defaults to false.
     */
    dropIfExist?: boolean;
    /**
     * Include the `DEFINER = {\`user\`@\`host\` | CURRENT_USER}` in the sp definition or not
     * Defaults to false.
     */
    definer?: boolean;
}

interface DataDumpOptions {
    /**
     * Include file headers in output
     * Defaults to true.
     */
    verbose?: boolean;
    /**
     * Use a read lock during the data dump (see: https://dev.mysql.com/doc/refman/5.7/en/replication-solutions-backups-read-only.html)
     * Defaults to false.
     */
    lockTables?: boolean;
    /**
     * Dump data from views.
     * Defaults to false.
     */
    includeViewData?: boolean;
    /**
     * Maximum number of rows to include in each multi-line insert statement
     * Defaults to 1 (i.e. new statement per row).
     */
    maxRowsPerInsertStatement?: number;
    /**
     * A map of tables to additional where strings to add.
     * Use this to limit the number of data that is dumped.
     * Defaults to no limits
     */
    where?: {
        [k: string]: string;
    };
}

interface DumpOptions {
    /**
     * The list of tables that you want to dump.
     * Defaults to all tables (signalled by passing an empty array).
     */
    tables?: Array<string>;
    viewList?: Array<string>;
    procedureList?: Array<string>;
    functionList?: Array<string>;
    triggerList?: Array<string>;
    /**
     * Dump file with database
     */
    withDatabase?: boolean;
    /**
     * True to use the `tables` options as a blacklist, false to use it as a whitelist.
     * Defaults to false.
     */
    excludeTables?: boolean;
    /**
     * Explicitly set to false to not include the schema in the dump.
     * Defaults to including the schema.
     */
    schema?: false | SchemaDumpOptions;
    /**
     * Explicitly set to false to not include data in the dump.
     * Defaults to including the data.
     */
    data?: false | DataDumpOptions;
    /**
     * Explicitly set to false to not include triggers in the dump.
     * Defaults to including the triggers.
     */
    trigger?: false | TriggerDumpOptions;
    /**
     * Explicitly set to false to not include procedures in the dump.
     * Defaults to including the procedures.
     */
    procedure?: false | ProcedureDumpOptions;
    
    /**
     * Explicitly set to false to not include function in the dump.
     * Defaults to including the function.
     */
    function?: null | FunctionDumpOptions;
}

interface Options {
    /**
     * Database connection options
     */
    connection: ConnectionOptions;
    /**
     * Dump configuration options
     */
    dump?: DumpOptions;
    /**
     * Set to a path to dump to a file.
     * Exclude to just return the string.
     */
    dumpToFile?: string | null;
    /**
     * Should the output file be compressed (gzip)?
     * Defaults to false.
     */
    compressFile?: boolean;
}

// Recursively requires all properties on an object
type RequiredRecursive<T> = {
    [TK in keyof T]-?: Exclude<T[TK], undefined> extends (
        | string
        | number
        | boolean
        | Array<string>
        | Array<number>
        | Array<boolean>)
    ? T[TK]
    : RequiredRecursive<T[TK]>
};

interface CompletedOptions {
    connection: Required<ConnectionOptions>;
    dump: RequiredRecursive<DumpOptions>;
    dumpToFile: string | null;
}

export {
    CompletedOptions,
    ConnectionOptions,
    DataDumpOptions,
    DumpOptions,
    Options,
    SchemaDumpOptions,
    TriggerDumpOptions,
    ProcedureDumpOptions,
    FunctionDumpOptions
};
