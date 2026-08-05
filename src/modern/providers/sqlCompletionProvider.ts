export interface CompletionItem {
  readonly label: string;
  readonly kind: "keyword" | "table" | "column";
  readonly detail?: string;
}

export interface CompletionContext {
  readonly text: string;
  readonly offset: number;
  readonly tables?: readonly string[];
  readonly columns?: readonly string[];
}

const keywords = [
  "SELECT",
  "FROM",
  "WHERE",
  "GROUP BY",
  "ORDER BY",
  "HAVING",
  "INSERT",
  "UPDATE",
  "DELETE",
  "JOIN",
  "LEFT JOIN",
  "RIGHT JOIN",
  "CREATE",
  "ALTER",
  "DROP",
];

export class SqlCompletionProvider {
  public provide(context: CompletionContext): CompletionItem[] {
    const prefix = this.readPrefix(context.text, context.offset).toLocaleLowerCase();
    const candidates: CompletionItem[] = [
      ...keywords.map((label) => ({ label, kind: "keyword" as const })),
      ...(context.tables ?? []).map((label) => ({
        label,
        kind: "table" as const,
        detail: "table",
      })),
      ...(context.columns ?? []).map((label) => ({
        label,
        kind: "column" as const,
        detail: "column",
      })),
    ];
    return candidates.filter(
      (item) =>
        !prefix || item.label.toLocaleLowerCase().startsWith(prefix),
    );
  }

  private readPrefix(text: string, offset: number): string {
    const beforeCursor = text.slice(0, Math.max(0, offset));
    const match = beforeCursor.match(/[A-Za-z_][A-Za-z0-9_$]*$/);
    return match?.[0] ?? "";
  }
}
