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
    const owner = schema ? this.escapeLiteral(normalizeOwner(schema)) : "USER";
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
