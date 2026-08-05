export interface SqlBlock {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

function isWordCharacter(value: string | undefined): boolean {
  return value !== undefined && /[A-Za-z0-9_$]/.test(value);
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

const formattingKeywords = [
  "select",
  "from",
  "where",
  "group by",
  "order by",
  "having",
  "left join",
  "right join",
  "inner join",
  "full join",
  "join",
  "insert into",
  "values",
  "update",
  "set",
  "delete from",
  "create table",
  "alter table",
  "drop table",
];

export function formatSql(source: string): string {
  const compact = source.trim().replace(/\s+/g, " ");
  const keywords = [...formattingKeywords].sort(
    (left, right) => right.length - left.length,
  );
  let formatted = "";
  let quote: "'" | '"' | undefined;

  for (let index = 0; index < compact.length; ) {
    const character = compact[index];
    if (quote) {
      formatted += character;
      if (character === quote) {
        if (compact[index + 1] === quote) {
          formatted += compact[index + 1];
          index += 2;
          continue;
        }
        quote = undefined;
      }
      index += 1;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      formatted += character;
      index += 1;
      continue;
    }

    const match = keywords.find((keyword) => {
      const candidate = compact.slice(index, index + keyword.length);
      const before = compact[index - 1];
      const after = compact[index + keyword.length];
      return (
        candidate.toLocaleLowerCase() === keyword &&
        !isWordCharacter(before) &&
        !isWordCharacter(after)
      );
    });
    if (match) {
      formatted += match.toUpperCase();
      index += match.length;
    } else {
      formatted += character;
      index += 1;
    }
  }
  return formatted;
}
