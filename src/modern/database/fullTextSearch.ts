import type { Dialect } from "./types";

export interface FullTextColumn {
  readonly name: string;
  readonly type?: string;
}

export interface FullTextSearchTarget {
  readonly label?: unknown;
  readonly fullTextSQL?: (term: string) => Promise<string | null> | string | null;
  readonly getChildren?: () => Promise<readonly unknown[]> | readonly unknown[];
}

function asFullTextSearchTarget(value: unknown): FullTextSearchTarget | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as FullTextSearchTarget
    : undefined;
}

export function buildTableFullTextSql(
  dialect: Dialect,
  schema: string | null,
  table: string,
  columns: readonly FullTextColumn[],
  term: string,
  limit = 10,
): string | null {
  const normalizedTerm = term.trim();
  if (!normalizedTerm) return null;

  const numericSearch = /^\d+$/.test(normalizedTerm);
  const conditions = columns
    .filter((column) => {
      const type = column.type?.trim() || "";
      return Boolean(column.name.trim()) && Boolean(type)
        && (numericSearch || !/binary|blob|json|geometry/i.test(type));
    })
    .map((column) => {
      const name = dialect.quoteIdentifier(column.name);
      const type = column.type || "";
      return numericSearch && /bigint|bool|decimal|double|float|int|numeric|number|real|serial|smallint/i.test(type)
        ? `${name} = ${normalizedTerm}`
        : `${name} LIKE ${dialect.escapeLiteral(`%${normalizedTerm}%`)}`;
    });
  if (!conditions.length) return null;

  const pageSql = dialect.buildPageSql(schema, table, limit);
  return pageSql.replace(table, `${table} WHERE ${conditions.join(" OR ")}`);
}

export async function collectFullTextSearchTargets(
  root: unknown,
  maxDepth = 2,
): Promise<FullTextSearchTarget[]> {
  const targets: FullTextSearchTarget[] = [];
  const visitChildren = async (parent: FullTextSearchTarget, depth: number): Promise<void> => {
    if (!parent.getChildren || depth >= maxDepth) return;
    const children = await parent.getChildren();
    for (const childValue of children) {
      const child = asFullTextSearchTarget(childValue);
      if (!child) continue;
      if (typeof child.fullTextSQL === "function") {
        targets.push(child);
        continue;
      }
      await visitChildren(child, depth + 1);
    }
  };

  const target = asFullTextSearchTarget(root);
  if (target) await visitChildren(target, 0);
  return targets;
}
