interface SqlFormatToken {
  readonly kind: "word" | "quoted" | "number" | "comment" | "operator" | "punctuation";
  readonly text: string;
}

const clausePhrases = [
  "delete from",
  "insert into",
  "group by",
  "order by",
  "left outer join",
  "right outer join",
  "full outer join",
  "left join",
  "right join",
  "full join",
  "inner join",
  "cross join",
  "returning",
  "select",
  "from",
  "where",
  "having",
  "values",
  "update",
  "set",
  "limit",
  "offset",
  "union all",
  "union",
] as const;

const newlineKeywords = new Set([
  "and",
  "or",
  "xor",
  "when",
  "else",
]);

const uppercaseKeywords = new Set([
  ...clausePhrases.flatMap((phrase) => phrase.split(" ")),
  "as",
  "asc",
  "desc",
  "distinct",
  "exists",
  "in",
  "is",
  "join",
  "not",
  "null",
  "on",
  "only",
  "over",
  "partition",
  "then",
  "case",
  "end",
  "between",
  "like",
  "ilike",
  "create",
  "alter",
  "drop",
  "table",
  "view",
  "index",
  "procedure",
  "function",
  "trigger",
  "primary",
  "key",
  "foreign",
  "references",
  "default",
  "unique",
  "check",
  "with",
]);

const multiCharacterOperators = [
  "!~~*",
  "!~~",
  "~~*",
  "!~*",
  "!~",
  "->>",
  "->",
  "::",
  "||",
  "!=",
  "<>",
  "<=",
  ">=",
  "==",
];

function readQuotedToken(source: string, start: number): number {
  const opening = source[start];
  const closing = opening === "[" ? "]" : opening;
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] !== closing) {
      continue;
    }
    if (source[index + 1] === closing) {
      index += 1;
      continue;
    }
    return index + 1;
  }
  return source.length;
}

function tokenizeSql(source: string): SqlFormatToken[] {
  const tokens: SqlFormatToken[] = [];
  for (let index = 0; index < source.length; ) {
    const character = source[index];
    const next = source[index + 1];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if ((character === "-" && next === "-") || character === "#") {
      const lineEnd = source.indexOf("\n", index + (character === "#" ? 1 : 2));
      const end = lineEnd < 0 ? source.length : lineEnd;
      tokens.push({ kind: "comment", text: source.slice(index, end).trim() });
      index = end;
      continue;
    }
    if (character === "/" && next === "*") {
      const commentEnd = source.indexOf("*/", index + 2);
      const end = commentEnd < 0 ? source.length : commentEnd + 2;
      tokens.push({ kind: "comment", text: source.slice(index, end).trim() });
      index = end;
      continue;
    }
    if (character === "'" || character === '"' || character === "`" || character === "[") {
      const end = readQuotedToken(source, index);
      tokens.push({ kind: "quoted", text: source.slice(index, end) });
      index = end;
      continue;
    }
    if (/[A-Za-z_$@]/.test(character)) {
      const start = index;
      index += 1;
      while (index < source.length && /[A-Za-z0-9_$@]/.test(source[index] || "")) {
        index += 1;
      }
      tokens.push({ kind: "word", text: source.slice(start, index) });
      continue;
    }
    if (/[0-9]/.test(character)) {
      const start = index;
      index += 1;
      while (index < source.length && /[A-Za-z0-9._]/.test(source[index] || "")) {
        index += 1;
      }
      tokens.push({ kind: "number", text: source.slice(start, index) });
      continue;
    }
    const operator = multiCharacterOperators.find((candidate) => source.startsWith(candidate, index));
    if (operator) {
      tokens.push({ kind: "operator", text: operator });
      index += operator.length;
      continue;
    }
    const kind = "=<>+-*/%!~&|^".includes(character) ? "operator" : "punctuation";
    tokens.push({ kind, text: character });
    index += 1;
  }
  return tokens;
}

function isWordLike(token: SqlFormatToken | undefined): boolean {
  return token !== undefined && ["word", "quoted", "number"].includes(token.kind);
}

function compactSql(tokens: readonly SqlFormatToken[]): string {
  let result = "";
  let previous: SqlFormatToken | undefined;
  for (const token of tokens) {
    const lower = token.text.toLocaleLowerCase();
    const value = token.kind === "word" && uppercaseKeywords.has(lower)
      ? token.text.toLocaleUpperCase()
      : token.text;
    if (token.text === ".") {
      result = result.trimEnd() + ".";
    } else if (token.text === ",") {
      result = result.trimEnd() + ", ";
    } else if (token.text === ")") {
      result = result.trimEnd() + ")";
    } else if (token.text === ";") {
      result = result.trimEnd() + ";";
    } else if (token.text === "(") {
      const functionCall = isWordLike(previous) && previous?.text.toLocaleLowerCase() !== "in";
      result = result.trimEnd() + (functionCall ? "" : " ") + "(";
    } else if (token.kind === "operator") {
      result = result.trimEnd() + ` ${value} `;
    } else {
      const needsSpace = Boolean(result)
        && isWordLike(previous)
        && !result.endsWith(" ");
      result += `${needsSpace ? " " : ""}${value}`;
    }
    previous = token;
  }
  return result.trim();
}

function phraseAt(tokens: readonly SqlFormatToken[], index: number, phrase: string): number {
  const parts = phrase.split(" ");
  for (let offset = 0; offset < parts.length; offset += 1) {
    const token = tokens[index + offset];
    if (!token || token.kind !== "word" || token.text.toLocaleLowerCase() !== parts[offset]) {
      return 0;
    }
  }
  return parts.length;
}

/**
 * Formats the same practical SQL boundaries used by the target formatter:
 * clauses become readable lines, lists break at top level commas, and quoted
 * values/comments are preserved byte-for-byte.
 */
export function formatSql(source: string): string {
  const tokens = tokenizeSql(source);
  if (
    source.trim().length < 70
    && !tokens.some((token) => token.kind === "comment")
    && !/^delimiter\b/i.test(source.trim())
  ) {
    return compactSql(tokens);
  }
  const lines: string[] = [];
  let current = "";
  let indent = 0;
  let currentIndent = 0;
  let parenDepth = 0;
  let clauseNeedsContentLine = false;
  let previous: SqlFormatToken | undefined;

  const flush = (level = currentIndent): void => {
    const value = current.trim();
    if (value) {
      lines.push(`${"    ".repeat(Math.max(0, level))}${value}`);
    }
    current = "";
  };
  const ensureContentLine = (): void => {
    if (clauseNeedsContentLine && current) {
      flush();
      currentIndent = indent;
    }
    clauseNeedsContentLine = false;
  };
  const write = (value: string, spaceBefore = false): void => {
    if (!current) {
      currentIndent = indent;
    }
    if (spaceBefore && current && !current.endsWith(" ")) {
      current += " ";
    }
    current += value;
  };

  for (let index = 0; index < tokens.length; ) {
    const token = tokens[index];
    if (token.kind === "comment") {
      if (current) flush();
      write(token.text);
      flush();
      previous = token;
      index += 1;
      continue;
    }

    const phrase = clausePhrases.find((candidate) => phraseAt(tokens, index, candidate));
    if (phrase) {
      if (current) flush();
      const count = phraseAt(tokens, index, phrase);
      write(phrase.toLocaleUpperCase());
      flush(parenDepth);
      indent = parenDepth + 1;
      clauseNeedsContentLine = true;
      previous = tokens[index + count - 1];
      index += count;
      continue;
    }

    ensureContentLine();
    const lower = token.text.toLocaleLowerCase();
    if (token.kind === "word" && newlineKeywords.has(lower)) {
      if (current) flush();
      write(lower.toLocaleUpperCase(), false);
      previous = token;
      index += 1;
      continue;
    }
    if (token.text === ",") {
      write(",");
      if (parenDepth === 0) {
        flush();
      } else {
        current += " ";
      }
      previous = token;
      index += 1;
      continue;
    }
    if (token.text === ".") {
      write(".");
      previous = token;
      index += 1;
      continue;
    }
    if (token.text === "(") {
      const functionCall = isWordLike(previous) && previous?.text.toLocaleLowerCase() !== "in";
      write("(", !functionCall && Boolean(current));
      parenDepth += 1;
      previous = token;
      index += 1;
      continue;
    }
    if (token.text === ")") {
      current = current.trimEnd();
      write(")");
      parenDepth = Math.max(0, parenDepth - 1);
      indent = Math.max(0, parenDepth + (current ? 1 : 0));
      previous = token;
      index += 1;
      continue;
    }
    if (token.text === ";") {
      current = current.trimEnd();
      write(";");
      flush();
      indent = 0;
      parenDepth = 0;
      previous = token;
      index += 1;
      continue;
    }
    if (token.kind === "operator") {
      current = current.trimEnd();
      write(token.text, Boolean(current));
      current += " ";
      previous = token;
      index += 1;
      continue;
    }

    const formatted = token.kind === "word" && uppercaseKeywords.has(lower)
      ? token.text.toLocaleUpperCase()
      : token.text;
    const needsSpace = Boolean(current)
      && isWordLike(previous)
      && !current.endsWith(" ");
    write(formatted, needsSpace);
    previous = token;
    index += 1;
  }
  if (current) flush();
  return lines.join("\n").trim();
}
