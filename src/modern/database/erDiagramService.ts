import type { Dialect, MetadataQueryExecutor } from "./types";

export interface ErDiagramOffset {
  readonly x: number;
  readonly y: number;
}

export interface ErDiagramColumn {
  readonly name: string;
  readonly type: string;
  readonly nullable?: boolean;
  readonly key?: string;
  readonly defaultValue?: string;
}

export interface ErDiagramNode {
  readonly name: string;
  readonly columns: readonly ErDiagramColumn[];
  readonly offset: ErDiagramOffset;
  readonly main: boolean;
}

export interface ErDiagramEdge {
  readonly from: string;
  readonly fromColumns: string;
  readonly target: string;
  readonly targetColumns: string;
  readonly constraintName?: string;
}

export interface ErDiagramData {
  readonly nodes: readonly ErDiagramNode[];
  readonly edges: readonly ErDiagramEdge[];
}

export interface ErDiagramRequest {
  readonly table: string;
  readonly schema?: string | null;
  readonly database?: string | null;
}

interface ForeignKeyRecord {
  readonly sourceTable: string;
  readonly sourceColumn: string;
  readonly targetTable: string;
  readonly targetColumn: string;
  readonly constraintName?: string;
}

const MAX_TABLES = 60;

function rowValue(row: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    if (row[name] !== undefined) {
      return row[name];
    }
    const matchingKey = Object.keys(row).find(
      (key) => key.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    if (matchingKey) {
      return row[matchingKey];
    }
  }
  return undefined;
}

function textValue(
  row: Record<string, unknown>,
  names: readonly string[],
): string {
  const value = rowValue(row, ...names);
  return value == null ? "" : String(value).trim();
}

function tableKey(value: string): string {
  return value.toLocaleLowerCase();
}

function rowsOf<Row extends Record<string, unknown>>(
  result: { rows: Row[] },
): Row[] {
  return Array.isArray(result.rows) ? result.rows : [];
}

function tableName(row: Record<string, unknown>): string {
  return textValue(row, ["name", "table_name", "TABLE_NAME"]);
}

function columnName(row: Record<string, unknown>): string {
  return textValue(row, ["name", "column_name", "COLUMN_NAME", "from"]);
}

function columnType(row: Record<string, unknown>): string {
  return textValue(
    row,
    ["type", "columnType", "originType", "data_type", "DATA_TYPE", "simpleType"],
  ) || "TEXT";
}

function normalizeColumn(row: Record<string, unknown>): ErDiagramColumn {
  const nullableValue = textValue(row, ["nullable", "is_nullable", "IS_NULLABLE"]);
  const key = textValue(row, ["key", "COLUMN_KEY", "constraintType"]);
  const defaultValue = rowValue(
    row,
    "defaultValue",
    "default",
    "column_default",
    "COLUMN_DEFAULT",
  );
  return {
    name: columnName(row),
    type: columnType(row),
    nullable: nullableValue ? nullableValue.toUpperCase() !== "NO" : undefined,
    key: key || undefined,
    defaultValue: defaultValue == null ? undefined : String(defaultValue),
  };
}

function normalizeForeignKey(
  row: Record<string, unknown>,
  sourceTable?: string,
): ForeignKeyRecord | undefined {
  const source = textValue(row, [
    "table_name",
    "TABLE_NAME",
    "source_table",
  ]) || sourceTable || "";
  const sourceColumn = textValue(row, [
    "column_name",
    "COLUMN_NAME",
    "source_column",
    "from",
  ]);
  const target = textValue(row, [
    "referenced_table",
    "REFERENCED_TABLE_NAME",
    "target_table",
    "table",
  ]);
  const targetColumn = textValue(row, [
    "referenced_column",
    "REFERENCED_COLUMN_NAME",
    "target_column",
    "to",
  ]);
  if (!source || !sourceColumn || !target || !targetColumn) {
    return undefined;
  }
  const constraintName = textValue(row, [
    "constraint_name",
    "CONSTRAINT_NAME",
    "constraintName",
  ]);
  return {
    sourceTable: source,
    sourceColumn,
    targetTable: target,
    targetColumn,
    constraintName: constraintName || undefined,
  };
}

async function loadForeignKeys(
  executor: MetadataQueryExecutor,
  dialect: Dialect,
  schema: string | null,
  rootTable: string,
): Promise<ForeignKeyRecord[]> {
  if (!dialect.showForeignKeys || dialect.id === "clickhouse") {
    return [];
  }

  const allTablesSql = dialect.showForeignKeys(schema);
  if (allTablesSql) {
    const result = await executor.query<Record<string, unknown>>(allTablesSql);
    return rowsOf(result)
      .map((row) => normalizeForeignKey(row))
      .filter((item): item is ForeignKeyRecord => item !== undefined);
  }

  const tableSql = dialect.showTables(schema);
  if (!tableSql) {
    return [];
  }
  const tables = await executor.query<Record<string, unknown>>(tableSql);
  const tableNames = [...new Set([
    rootTable,
    ...rowsOf(tables).map(tableName).filter(Boolean),
  ])].slice(0, 200);
  const relations: ForeignKeyRecord[] = [];
  for (const table of tableNames) {
    const sql = dialect.showForeignKeys(schema, table);
    if (!sql) {
      continue;
    }
    const result = await executor.query<Record<string, unknown>>(sql);
    for (const row of rowsOf(result)) {
      const relation = normalizeForeignKey(row, table);
      if (relation) {
        relations.push(relation);
      }
    }
  }
  return relations;
}

function addRelation(
  adjacency: Map<string, ForeignKeyRecord[]>,
  relation: ForeignKeyRecord,
): void {
  const source = tableKey(relation.sourceTable);
  const target = tableKey(relation.targetTable);
  adjacency.set(source, [...(adjacency.get(source) || []), relation]);
  if (source !== target) {
    adjacency.set(target, [...(adjacency.get(target) || []), relation]);
  }
}

export async function loadErDiagram(
  executor: MetadataQueryExecutor,
  dialect: Dialect,
  request: ErDiagramRequest,
): Promise<ErDiagramData> {
  const rootTable = request.table.trim();
  if (!rootTable) {
    throw new Error("An ER diagram requires a table");
  }
  const schema = request.schema || request.database || null;
  const relations = await loadForeignKeys(executor, dialect, schema, rootTable);
  const adjacency = new Map<string, ForeignKeyRecord[]>();
  const names = new Map<string, string>([[tableKey(rootTable), rootTable]]);
  for (const relation of relations) {
    addRelation(adjacency, relation);
    names.set(tableKey(relation.sourceTable), relation.sourceTable);
    names.set(tableKey(relation.targetTable), relation.targetTable);
  }

  const included = new Set<string>([tableKey(rootTable)]);
  const distance = new Map<string, number>([[tableKey(rootTable), 0]]);
  const queue = [tableKey(rootTable)];
  while (queue.length > 0 && included.size < MAX_TABLES) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    const nextDistance = (distance.get(current) || 0) + 1;
    for (const relation of adjacency.get(current) || []) {
      const candidate = tableKey(
        tableKey(relation.sourceTable) === current
          ? relation.targetTable
          : relation.sourceTable,
      );
      if (included.has(candidate)) {
        continue;
      }
      included.add(candidate);
      distance.set(candidate, nextDistance);
      queue.push(candidate);
      if (included.size >= MAX_TABLES) {
        break;
      }
    }
  }

  const tableNames = [...included].map((key) => names.get(key) || key);
  const columnsByTable = new Map<string, ErDiagramColumn[]>();
  await Promise.all(tableNames.map(async (table) => {
    const sql = dialect.showColumns(schema, table);
    if (!sql) {
      columnsByTable.set(tableKey(table), []);
      return;
    }
    const result = await executor.query<Record<string, unknown>>(sql);
    columnsByTable.set(
      tableKey(table),
      rowsOf(result).map(normalizeColumn).filter((column) => column.name),
    );
  }));

  const sourceColumns = new Map<string, Set<string>>();
  for (const relation of relations) {
    const key = tableKey(relation.sourceTable);
    sourceColumns.set(key, new Set([
      ...(sourceColumns.get(key) || []),
      relation.sourceColumn,
    ]));
  }
  const nodes = tableNames.map((table, index) => {
    const key = tableKey(table);
    const level = distance.get(key) || 0;
    const side = level === 0 ? 0 : (index % 2 === 0 ? level : -level);
    const columns = (columnsByTable.get(key) || []).map((column) => {
      if (column.key || !sourceColumns.get(key)?.has(column.name)) {
        return column;
      }
      return { ...column, key: "FK" };
    });
    return {
      name: table,
      columns,
      offset: { x: side, y: level === 0 ? 0 : index },
      main: key === tableKey(rootTable),
    } satisfies ErDiagramNode;
  });

  const edgeKeys = new Set<string>();
  const edges = relations
    .filter((relation) => included.has(tableKey(relation.sourceTable)) && included.has(tableKey(relation.targetTable)))
    .filter((relation) => {
      const key = [
        relation.sourceTable,
        relation.sourceColumn,
        relation.targetTable,
        relation.targetColumn,
        relation.constraintName || "",
      ].join("\u0000");
      if (edgeKeys.has(key)) {
        return false;
      }
      edgeKeys.add(key);
      return true;
    })
    .map((relation) => ({
      from: relation.sourceTable,
      fromColumns: relation.sourceColumn,
      target: relation.targetTable,
      targetColumns: relation.targetColumn,
      constraintName: relation.constraintName,
    } satisfies ErDiagramEdge));

  return { nodes, edges };
}
