export type SqlBookCellKind = "Code" | "Markup";

export interface SqlBookCell {
  readonly kind: SqlBookCellKind;
  readonly value: string;
  readonly language: string;
}

const marker = "-- SQLBook: ";

export function deserializeSqlBook(
  source: string,
  language = "sql",
): SqlBookCell[] {
  const cells: SqlBookCell[] = [];
  let kind: SqlBookCellKind = "Code";
  let lines: string[] = [];
  const flush = (): void => {
    if (lines.length === 0) return;
    cells.push({ kind, value: lines.join("\n"), language });
    lines = [];
  };

  for (const line of source.split(/\r\n|\r|\n/)) {
    const match = line.match(/^-- SQLBook: (Code|Markup)$/);
    if (match) {
      flush();
      kind = match[1] as SqlBookCellKind;
      continue;
    }
    lines.push(line);
  }
  flush();
  return cells;
}

export function serializeSqlBook(cells: readonly SqlBookCell[]): string {
  return cells
    .map((cell) => `${marker}${cell.kind}\n${cell.value}`)
    .join("\n");
}
