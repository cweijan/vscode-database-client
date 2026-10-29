import type { DatabaseType, Dialect } from "../types";

const publicSynonymExcludedOwners = [
  "SYS",
  "SYSTEM",
  "XDB",
  "MDSYS",
  "CTXSYS",
  "ORDSYS",
  "DBSNMP",
  "WMSYS",
  "OUTLN",
];

function normalizeOwner(owner: string): string {
  return owner.trim().toUpperCase();
}

function ownerLiteral(dialect: OracleDialect, owner?: string | null): string {
  return owner ? dialect.escapeLiteral(normalizeOwner(owner)) : "USER";
}

function objectLiteral(value: string): string {
  return `'${value.trim().toUpperCase().replaceAll("'", "''")}'`;
}

function processNumber(
  process: Record<string, unknown>,
  ...names: string[]
): number | undefined {
  const key = Object.keys(process).find((candidate) =>
    names.some((name) => candidate.toLowerCase() === name.toLowerCase()),
  );
  if (!key) return undefined;
  const value = Number(process[key]);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

export class OracleDialect implements Dialect {
  public readonly id = "oracle";

  public supports(type: DatabaseType): boolean {
    return type === "Oracle";
  }

  public quoteIdentifier(identifier: string): string {
    const value = identifier.trim();
    if (!value) {
      throw new Error("Oracle identifier cannot be empty");
    }
    return '"' + value.replaceAll('"', '""') + '"';
  }

  public escapeLiteral(value: string): string {
    return "'" + value.replaceAll("'", "''") + "'";
  }

  public buildPageSql(
    _schema: string | null,
    table: string,
    limit: number,
  ): string {
    const safeLimit = Math.max(1, Math.floor(limit));
    return "SELECT * FROM " + table + " FETCH FIRST " + safeLimit + " ROWS ONLY";
  }

  public showTables(schema?: string | null): string {
    const owner = ownerLiteral(this, schema);
    return [
      "select",
      "  o.object_name \"name\",",
      "  nvl(t.num_rows, -1) \"table_rows\",",
      "  c.comments \"comment\",",
      "  nvl(t.blocks, 0) * 8192 \"data_length\"",
      "from all_objects o",
      "left join all_tables t on o.owner = t.owner and o.object_name = t.table_name",
      "left join all_tab_comments c on o.owner = c.owner and o.object_name = c.table_name",
      "where o.owner = " + owner + " and o.object_type = 'TABLE'",
      "order by \"name\"",
    ].join("\n");
  }

  public showDatabases(): string {
    return 'select username as "Database" from sys.all_users order by username';
  }

  public showSchemas(): string {
    return this.showDatabases();
  }

  public showViews(schema?: string | null): string {
    const owner = ownerLiteral(this, schema);
    return `select object_name "name" from all_objects where object_type = 'VIEW' and owner = ${owner} order by object_name`;
  }

  public showProcedures(schema?: string | null): string {
    const owner = ownerLiteral(this, schema);
    return `select object_name "name" from all_objects where object_type = 'PROCEDURE' and owner = ${owner} order by object_name`;
  }

  public showFunctions(schema?: string | null): string {
    const owner = ownerLiteral(this, schema);
    return `select object_name "name" from all_objects where object_type = 'FUNCTION' and owner = ${owner} order by object_name`;
  }

  public showTriggers(
    schema?: string | null,
    table?: string | null,
  ): string {
    const owner = ownerLiteral(this, schema);
    const tableFilter = table
      ? ` and table_name = ${objectLiteral(table)}`
      : "";
    return [
      'select trigger_name "trigger_name", table_name "table_name",',
      '       triggering_event "event"',
      "from all_triggers",
      `where owner = ${owner}${tableFilter}`,
      "order by trigger_name",
    ].join("\n");
  }

  public showIndex(schema: string | null, table: string): string {
    const owner = ownerLiteral(this, schema);
    return [
      'select',
      '  col.column_name "column_name",',
      '  col.index_name "index_name",',
      '  idx.uniqueness "uniqueness"',
      "from all_ind_columns col",
      "join all_indexes idx on col.index_name = idx.index_name and col.index_owner = idx.owner",
      `where col.table_owner = ${owner}`,
      `  and col.table_name = ${objectLiteral(table)}`,
      'order by col.index_name, col.column_position',
    ].join("\n");
  }

  public showChecks(schema: string | null, table: string): string {
    const owner = ownerLiteral(this, schema);
    return [
      'select c.constraint_name "name", c.search_condition "clause"',
      "from all_constraints c",
      `where c.owner = ${owner}`,
      `  and c.table_name = ${objectLiteral(table)}`,
      "  and c.constraint_type = 'C'",
      'order by c.constraint_name',
    ].join("\n");
  }

  public showVersion(): string {
    return `select RTRIM(SUBSTR(REPLACE(banner,'Oracle Database ',''),1,3)) "server_version" from v$version where rownum=1`;
  }

  public truncateDatabase(database: string): string {
    const owner = this.escapeLiteral(normalizeOwner(database));
    return `SELECT 'TRUNCATE TABLE "' || owner || '"."' || object_name || '";' AS trun FROM all_objects WHERE owner = ${owner} AND object_type = 'TABLE';`;
  }

  public createDatabase(): string {
    return 'CREATE USER "username" IDENTIFIED BY "password";\nGRANT CREATE SESSION TO "username";';
  }

  public dropDatabase(database: string): string {
    return `DROP USER ${this.quoteIdentifier(normalizeOwner(database))} CASCADE;`;
  }

  public processList(): string {
    return [
      "SELECT",
      '  SID, SERIAL# as SERIAL,',
      '  s.username "User", s.schemaname "Schema",',
      '  s.status "Status",',
      '  sql.sql_text SQL',
      "FROM v$session s, v$sql sql",
      "WHERE sql.sql_id(+) = s.sql_id",
      "  AND s.type = 'USER'",
    ].join("\n");
  }

  public kill(process: Record<string, unknown>): string | null {
    const sid = processNumber(process, "sid");
    const serial = processNumber(process, "serial", "serial#");
    return sid && serial
      ? `ALTER SYSTEM KILL SESSION '${sid},${serial}' IMMEDIATE;`
      : null;
  }

  public showUsers(): string {
    return 'select username "user" from all_users order by username';
  }

  public showRoles(): string {
    return 'select role "role" from dba_roles order by role';
  }

  public showPackages(schema?: string | null): string {
    const owner = ownerLiteral(this, schema);
    return [
      'select object_name "name", status "status"',
      "from all_objects",
      `where object_type = 'PACKAGE' and owner = ${owner}`,
      'order by "name"',
    ].join("\n");
  }

  public showMaterialViews(schema?: string | null): string {
    const owner = ownerLiteral(this, schema);
    return `select object_name "name" from all_objects where object_type = 'MATERIALIZED VIEW' and owner = ${owner} order by object_name`;
  }

  public showTableSource(schema: string | null, table: string): string {
    const owner = ownerLiteral(this, schema);
    return `select DBMS_METADATA.GET_DDL('TABLE', ${objectLiteral(table)}, ${owner}) "definition" from dual`;
  }

  public showViewSource(schema: string | null, view: string): string {
    const owner = ownerLiteral(this, schema);
    return `select DBMS_METADATA.GET_DDL('VIEW', ${objectLiteral(view)}, ${owner}) "definition" from dual`;
  }

  public showRoutineSource(
    kind: "procedure" | "function" | "trigger",
    schema: string | null,
    name: string,
  ): string {
    const owner = ownerLiteral(this, schema);
    const objectName = objectLiteral(name);
    if (kind === "trigger") {
      return `select trigger_body "definition" from all_triggers where owner = ${owner} and trigger_name = ${objectName}`;
    }
    return `select text "definition" from all_source where owner = ${owner} and name = ${objectName} and type = '${kind.toUpperCase()}' order by line`;
  }

  public showPackageSource(schema: string | null, name: string): string {
    return `select text from all_source where owner = ${this.escapeLiteral(normalizeOwner(schema || ""))} and name = ${this.escapeLiteral(name.trim().toUpperCase())} and type = 'PACKAGE' order by line`;
  }

  public createUser(): string {
    return 'CREATE USER "username" IDENTIFIED BY "password";\nGRANT CREATE SESSION TO "username";';
  }

  public packageTemplate(): string {
    return "CREATE OR REPLACE PACKAGE package_name AS\n  PROCEDURE process(arg VARCHAR2);\nEND;\n/";
  }

  public updateUser(username: string): string {
    return `ALTER USER ${this.quoteIdentifier(username)} IDENTIFIED BY "newPassword";`;
  }

  public createRole(): string {
    return 'CREATE ROLE "role_name";\nGRANT "role_name" TO "username";';
  }

  public updateRole(role: string): string {
    return `ALTER ROLE ${this.quoteIdentifier(role)} IDENTIFIED BY "newPassword";`;
  }

  public grantRole(role: string): string {
    return `GRANT ${this.quoteIdentifier(role)} TO "username";`;
  }

  public showColumns(schema: string | null, table: string): string {
    const escapedTable = this.escapeLiteral(table.trim().toUpperCase());
    if (schema) {
      const escapedOwner = this.escapeLiteral(normalizeOwner(schema));
      return [
        "with target as (",
        "  select owner, table_name",
        "  from (",
        "    select " +
          escapedOwner +
          " owner, " +
          escapedTable +
          " table_name, 0 priority from dual",
        "    where exists (",
        "      select 1 from all_tab_columns",
        "      where owner = " +
          escapedOwner +
          " and table_name = " +
          escapedTable,
        "    )",
        "    union all",
        "    select s.table_owner owner, s.table_name,",
        "           case when s.owner = " +
          escapedOwner +
          " then 1 else 2 end priority",
        "    from all_synonyms s",
        "    where s.synonym_name = " +
          escapedTable +
          " and s.owner in (" +
          escapedOwner +
          ", 'PUBLIC')",
        "      and s.db_link is null",
        "    order by priority",
        "  )",
        "  where rownum = 1",
        ")",
        "select",
        "  a.column_name \"name\",",
        "  a.data_default \"defaultValue\",",
        "  a.data_precision \"precision\",",
        "  a.data_scale \"scale\",",
        "  a.data_type \"type\",",
        "  coalesce(a.data_precision, a.data_length) \"maximum_length\",",
        "  a.nullable \"nullable\"",
        "from all_tab_columns a",
        "join target on a.owner = target.owner and a.table_name = target.table_name",
        "order by a.column_id",
      ].join("\n");
    }

    return [
      "with target as (",
      "  select owner, table_name",
      "  from (",
      "    select USER owner, " +
        escapedTable +
        " table_name, 0 priority from dual",
      "    where exists (",
      "      select 1 from user_tab_columns where table_name = " +
        escapedTable,
      "    )",
      "    union all",
      "    select s.table_owner owner, s.table_name,",
      "           case when s.owner = USER then 1 else 2 end priority",
      "    from all_synonyms s",
      "    where s.synonym_name = " +
        escapedTable +
        " and s.owner in (USER, 'PUBLIC')",
      "      and s.db_link is null",
      "    order by priority",
      "  )",
      "  where rownum = 1",
      ")",
      "select",
      "  a.column_name \"name\",",
      "  a.data_default \"defaultValue\",",
      "  a.data_precision \"precision\",",
      "  a.data_scale \"scale\",",
      "  a.data_type \"type\",",
      "  coalesce(a.data_precision, a.data_length) \"maximum_length\",",
      "  a.nullable \"nullable\"",
      "from all_tab_columns a",
      "join target on a.owner = target.owner and a.table_name = target.table_name",
      "order by a.column_id",
    ].join("\n");
  }

  public showForeignKeys(schema: string | null, table?: string): string {
    const owner = schema ? this.escapeLiteral(normalizeOwner(schema)) : "USER";
    const tableFilter = table
      ? " and a.table_name = " + this.escapeLiteral(table.trim().toUpperCase())
      : "";
    return [
      "select",
      "  a.table_name \"table_name\",",
      "  acc.column_name \"column_name\",",
      "  c_pk.table_name \"referenced_table\",",
      "  acc_pk.column_name \"referenced_column\",",
      "  a.constraint_name \"constraint_name\",",
      "  acc.position \"ordinal_position\"",
      "from all_constraints a",
      "join all_cons_columns acc on acc.owner = a.owner and acc.constraint_name = a.constraint_name",
      "join all_constraints c_pk on c_pk.owner = a.r_owner and c_pk.constraint_name = a.r_constraint_name",
      "join all_cons_columns acc_pk on acc_pk.owner = c_pk.owner and acc_pk.constraint_name = c_pk.constraint_name and acc_pk.position = acc.position",
      "where a.owner = " + owner + " and a.constraint_type = 'R'" + tableFilter,
      "order by a.table_name, a.constraint_name, acc.position",
    ].join("\n");
  }

  public showSynonyms(owner: string): string {
    const escapedOwner = this.escapeLiteral(normalizeOwner(owner));
    const excludedOwners = publicSynonymExcludedOwners
      .map((item) => this.escapeLiteral(item))
      .join(", ");
    return [
      "select \"name\", \"owner\", \"table_owner\", \"table_name\", \"db_link\", \"comment\"",
      "from (",
      "  select s.synonym_name \"name\",",
      "         s.owner \"owner\",",
      "         s.table_owner \"table_owner\",",
      "         s.table_name \"table_name\",",
      "         s.db_link \"db_link\",",
      "         'Synonym -> ' || s.table_owner || '.' || s.table_name ||",
      "           nvl2(s.db_link, '@' || s.db_link, '') \"comment\",",
      "         row_number() over (",
      "           partition by s.synonym_name",
      "           order by case when s.owner = " +
        escapedOwner +
        " then 0 else 1 end",
      "         ) rn",
      "  from all_synonyms s",
      "  where s.owner in (" + escapedOwner + ", 'PUBLIC')",
      "    and (s.db_link is not null or exists (",
      "      select 1",
      "      from all_tab_columns c",
      "      where c.owner = s.table_owner",
      "        and c.table_name = s.table_name",
      "    ))",
      "    and (s.owner <> 'PUBLIC' or",
      "         s.table_owner not in (" + excludedOwners + "))",
      ")",
      "where rn = 1",
      "order by \"name\"",
    ].join("\n");
  }
}
