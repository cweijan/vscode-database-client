export interface SqlBlock {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/**
 * Mirrors the target parser's filterBlock boundary for the language features
 * that operate on executable SQL blocks.
 */
export function isExecutableSqlBlock(block: SqlBlock): boolean {
  const source = block.text.trim();
  if (!source || /^delimiter\b/i.test(source)) {
    return false;
  }

  let quote: "'" | '"' | "`" | "[" | undefined;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (quote) {
      if ((quote === "[" && character === "]") || (quote !== "[" && character === quote)) {
        if (source[index + 1] === character && quote !== "[") {
          index += 1;
          continue;
        }
        quote = undefined;
      }
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      return true;
    }
    if (character === "[") {
      quote = character;
      return true;
    }
    if (character === "-" && next === "-") {
      const lineEnd = source.indexOf("\n", index + 2);
      index = lineEnd < 0 ? source.length : lineEnd;
      continue;
    }
    if (character === "#") {
      const lineEnd = source.indexOf("\n", index + 1);
      index = lineEnd < 0 ? source.length : lineEnd;
      continue;
    }
    if (character === "/" && next === "*") {
      if (/^\/\*!\d+/.test(source.slice(index))) {
        return true;
      }
      const commentEnd = source.indexOf("*/", index + 2);
      index = commentEnd < 0 ? source.length : commentEnd + 1;
      continue;
    }
    if (!/\s/.test(character)) {
      return true;
    }
  }
  return false;
}

export interface SqlTableReference {
  readonly name: string;
  readonly schema?: string;
  readonly start: number;
  readonly end: number;
}

export interface SqlFunctionSignature {
  readonly name: string;
  readonly label: string;
  readonly documentation: string;
  readonly parameters: readonly string[];
}

export function parseSqlBlocks(text: string, delimiter = ";"): SqlBlock[] {
  const blocks: SqlBlock[] = [];
  let start = -1;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  const finish = (end: number): void => {
    if (start < 0) {
      return;
    }
    const source = text.slice(start, end).trim();
    if (source) {
      const leadingWhitespace = text.slice(start, end).search(/\S/);
      const actualStart = start + Math.max(0, leadingWhitespace);
      blocks.push({ text: source, start: actualStart, end });
    }
    start = -1;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (inLineComment) {
      if (character === "\n") {
        inLineComment = false;
      }
      continue;
    }
    if (inBlockComment) {
      if (character === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }
    if (!inSingleQuote && !inDoubleQuote && character === "-" && next === "-") {
      inLineComment = true;
      index += 1;
      continue;
    }
    if (!inSingleQuote && !inDoubleQuote && character === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }
    if (character === "'" && !inDoubleQuote) {
      if (inSingleQuote && next === "'") {
        index += 1;
      } else {
        inSingleQuote = !inSingleQuote;
      }
    } else if (character === '"' && !inSingleQuote) {
      if (inDoubleQuote && next === '"') {
        index += 1;
      } else {
        inDoubleQuote = !inDoubleQuote;
      }
    }

    if (start < 0 && !/\s/.test(character)) {
      start = index;
    }
    if (character === delimiter && !inSingleQuote && !inDoubleQuote) {
      finish(index + 1);
    }
  }

  finish(text.length);
  return blocks;
}

const sqlIdentifierPattern = String.raw`(?:"[^"]+"|` + "`[^`]+`" + String.raw`|\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_$]*)`;
const sqlTablePattern = new RegExp(
  String.raw`\b(?:from|join|update|into|table)\s+((?:${sqlIdentifierPattern})(?:\s*\.\s*${sqlIdentifierPattern})?)`,
  "gi",
);

function unquoteSqlIdentifier(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("`") && trimmed.endsWith("`")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseSqlTableReferences(text: string): SqlTableReference[] {
  const references: SqlTableReference[] = [];
  for (const match of text.matchAll(sqlTablePattern)) {
    const raw = match[1];
    if (!raw || match.index === undefined) {
      continue;
    }
    const parts = raw
      .match(new RegExp(sqlIdentifierPattern, "g"))
      ?.map(unquoteSqlIdentifier);
    if (!parts || parts.length === 0) {
      continue;
    }
    const start = match.index + match[0].length - raw.length;
    references.push({
      name: parts[parts.length - 1],
      schema: parts.length > 1 ? parts[parts.length - 2] : undefined,
      start,
      end: start + raw.length,
    });
  }
  return references;
}

export function sqlWordAt(
  text: string,
  offset: number,
): { readonly word: string; readonly start: number; readonly end: number } | undefined {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  let start = safeOffset;
  let end = safeOffset;
  while (start > 0 && /[A-Za-z0-9_$]/.test(text[start - 1] || "")) {
    start -= 1;
  }
  while (end < text.length && /[A-Za-z0-9_$]/.test(text[end] || "")) {
    end += 1;
  }
  return start === end
    ? undefined
    : { word: text.slice(start, end), start, end };
}

export const SQL_FUNCTION_SIGNATURES: readonly SqlFunctionSignature[] = [
  {
    name: "COUNT",
    label: "COUNT(expression)",
    documentation: "Returns the number of rows or non-null values.",
    parameters: ["expression"],
  },
  {
    name: "COALESCE",
    label: "COALESCE(value, fallback)",
    documentation: "Returns the first non-null argument.",
    parameters: ["value", "fallback"],
  },
  {
    name: "CONCAT",
    label: "CONCAT(value, ...values)",
    documentation: "Concatenates the supplied values.",
    parameters: ["value", "...values"],
  },
  {
    name: "DATE_FORMAT",
    label: "DATE_FORMAT(date, format)",
    documentation: "Formats a date using a database-specific format string.",
    parameters: ["date", "format"],
  },
  {
    name: "NOW",
    label: "NOW()",
    documentation: "Returns the current database server timestamp.",
    parameters: [],
  },
  {
    name: "SUM",
    label: "SUM(expression)",
    documentation: "Returns the sum of a numeric expression.",
    parameters: ["expression"],
  },
  {
    name: "AVG",
    label: "AVG(expression)",
    documentation: "Returns the average of a numeric expression.",
    parameters: ["expression"],
  },
] as const;

export { formatSql } from "./sqlFormatter";
