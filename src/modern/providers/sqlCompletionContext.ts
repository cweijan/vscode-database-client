import {
  parseSqlBlocks,
  parseSqlTableReferences,
  type SqlTableReference,
} from "./sqlDocumentModel";

interface SqlCompletionTargetBase {
  readonly prefix: string;
  readonly qualifier?: string;
  readonly column?: string;
  readonly references?: readonly SqlTableReference[];
  readonly cteColumns?: readonly string[];
}

export interface SqlValueCompletionTarget extends SqlCompletionTargetBase {
  readonly kind: "values";
  readonly column: string;
  readonly references: readonly SqlTableReference[];
}

export interface SqlVariableCompletionTarget extends SqlCompletionTargetBase {
  readonly kind: "variables";
  readonly marker: "@" | "@@";
}

export interface SqlProcedureVariable {
  readonly name: string;
  readonly type: string;
  readonly direction?: "IN" | "OUT" | "INOUT";
}

export interface SqlProcedureVariableCompletionTarget extends SqlCompletionTargetBase {
  readonly kind: "procedureVariables";
  readonly variables: readonly SqlProcedureVariable[];
}

export interface SqlCteDefinition {
  readonly name: string;
  readonly columns: readonly string[];
  readonly references: readonly SqlTableReference[];
}

export type SqlCompletionTarget =
  | (SqlCompletionTargetBase & { readonly kind: "tables" })
  | (SqlCompletionTargetBase & { readonly kind: "columns" })
  | SqlValueCompletionTarget
  | SqlVariableCompletionTarget
  | SqlProcedureVariableCompletionTarget
  | (SqlCompletionTargetBase & { readonly kind: "keywords" });

function identifier(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("`") && trimmed.endsWith("`"))
    || (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function currentSqlSource(source: string, offset: number): string {
  const prefix = source.slice(0, Math.max(0, Math.min(offset, source.length)));
  const block = parseSqlBlocks(prefix).at(-1)?.text;
  if (!block) return prefix;
  const start = prefix.lastIndexOf(block);
  return start >= 0 ? prefix.slice(start) : prefix;
}

function currentWord(source: string): string {
  return /[A-Za-z_][A-Za-z0-9_$]*$/.exec(source)?.[0] ?? "";
}

const sqlValueIdentifier = String.raw`(?:"[^"]+"|` + "`[^`]+`" + String.raw`|\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_$]*)`;

function openSingleQuote(source: string): { readonly start: number; readonly value: string } | undefined {
  let start = -1;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "'") {
      continue;
    }
    if (source[index + 1] === "'") {
      index += 1;
      continue;
    }
    if (start < 0) {
      start = index;
    } else {
      start = -1;
    }
  }
  return start < 0 ? undefined : { start, value: source.slice(start + 1) };
}

function parseSqlValueTarget(
  sql: string,
  references: readonly SqlTableReference[],
): SqlValueCompletionTarget | undefined {
  const quote = openSingleQuote(sql);
  if (!quote) {
    return undefined;
  }
  const beforeQuote = sql.slice(0, quote.start);
  const match = new RegExp(
    String.raw`(?:^|[^A-Za-z0-9_$])((?:${sqlValueIdentifier})\s*\.)?(${sqlValueIdentifier})\s*(?:=|<>|!=|<=|>=|<|>|LIKE|ILIKE|IN\s*\([^)]*)\s*$`,
    "i",
  ).exec(beforeQuote);
  if (!match?.[2]) {
    return undefined;
  }
  const column = identifier(match[2]);
  const qualifier = match[1]
    ? identifier(match[1].replace(/\s*\.\s*$/, ""))
    : undefined;
  const selectedReference = qualifier
    ? aliasesForReferences(sql, references).get(qualifier.toLocaleLowerCase())
    : undefined;
  return {
    kind: "values",
    prefix: quote.value,
    column,
    qualifier,
    references: selectedReference ? [selectedReference] : references,
  };
}

function parseSqlVariableTarget(sql: string): SqlVariableCompletionTarget | undefined {
  const match = /(?:^|\bSELECT\b|,)\s*(@@?)([A-Za-z_][A-Za-z0-9_]*)?$/i.exec(sql);
  if (!match?.[1]) {
    return undefined;
  }
  return {
    kind: "variables",
    prefix: match[2] ?? "",
    marker: match[1] as "@" | "@@",
  };
}

export function parseSqlProcedureVariables(source: string): SqlProcedureVariable[] {
  const result = new Map<string, SqlProcedureVariable>();
  const add = (
    name: string,
    type: string,
    direction?: "IN" | "OUT" | "INOUT",
  ): void => {
    const normalized = identifier(name);
    if (normalized && !result.has(normalized.toLocaleLowerCase())) {
      result.set(normalized.toLocaleLowerCase(), {
        name: normalized,
        type: type.trim(),
        direction,
      });
    }
  };
  const createIndex = /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:PROCEDURE|FUNCTION)\b/i.exec(source)?.index;
  const opening = createIndex === undefined ? -1 : source.indexOf("(", createIndex);
  let header: string | undefined;
  if (opening >= 0) {
    let depth = 0;
    let quote: "'" | '"' | "`" | undefined;
    for (let index = opening; index < source.length; index += 1) {
      const character = source[index];
      const next = source[index + 1];
      if (quote) {
        if (character === quote && next === quote) {
          index += 1;
        } else if (character === quote) {
          quote = undefined;
        }
        continue;
      }
      if (character === "'" || character === '"' || character === "`") {
        quote = character;
      } else if (character === "(") {
        depth += 1;
      } else if (character === ")") {
        depth -= 1;
        if (depth === 0) {
          header = source.slice(opening + 1, index);
          break;
        }
      }
    }
  }
  if (header) {
    for (const match of header.matchAll(
      new RegExp(
        String.raw`\b(INOUT|IN|OUT)\s+(${sqlValueIdentifier})\s+([A-Za-z][A-Za-z0-9_]*(?:\s*\([^)]*\))?)`,
        "gi",
      ),
    )) {
      if (match[1] && match[2] && match[3]) {
        add(match[2], match[3], match[1].toUpperCase() as "IN" | "OUT" | "INOUT");
      }
    }
  }
  for (const match of source.matchAll(
    new RegExp(
      String.raw`\bDECLARE\s+((?:${sqlValueIdentifier}\s*,\s*)*${sqlValueIdentifier})\s+([A-Za-z][A-Za-z0-9_]*(?:\s*\([^)]*\))?)`,
      "gi",
    ),
  )) {
    if (!match[1] || !match[2]) {
      continue;
    }
    for (const name of match[1].split(",")) {
      add(name, match[2]);
    }
  }
  return [...result.values()];
}

function parseSqlProcedureVariableTarget(
  sql: string,
): SqlProcedureVariableCompletionTarget | undefined {
  if (!/\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:PROCEDURE|FUNCTION)\b/i.test(sql)) {
    return undefined;
  }
  if (!/\b(?:BEGIN|DECLARE)\b/i.test(sql)) {
    return undefined;
  }
  const variables = parseSqlProcedureVariables(sql);
  if (variables.length === 0) {
    return undefined;
  }
  return {
    kind: "procedureVariables",
    prefix: currentWord(sql),
    variables,
  };
}

function matchingParenthesis(source: string, opening: number): number {
  let depth = 0;
  let quote: "'" | '"' | "`" | undefined;
  for (let index = opening; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (quote) {
      if (character === quote && next === quote) {
        index += 1;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
    } else if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function splitSqlList(source: string): string[] {
  const values: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: "'" | '"' | "`" | undefined;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (quote) {
      if (character === quote && next === quote) {
        index += 1;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
    } else if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth = Math.max(0, depth - 1);
    } else if (character === "," && depth === 0) {
      values.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  values.push(source.slice(start).trim());
  return values.filter(Boolean);
}

function cteColumns(source: string): string[] {
  const selectList = /\bSELECT\b([\s\S]*?)\bFROM\b/i.exec(source)?.[1];
  if (!selectList) {
    return [];
  }
  const names: string[] = [];
  for (const expression of splitSqlList(selectList)) {
    if (expression.includes("*")) {
      continue;
    }
    const alias = new RegExp(
      String.raw`\s+AS\s+(${sqlValueIdentifier})$`,
      "i",
    ).exec(expression)?.[1];
    const simple = new RegExp(String.raw`(${sqlValueIdentifier})(?:\s+AS\s+${sqlValueIdentifier})?$`, "i")
      .exec(expression)?.[1];
    const name = identifier(alias || simple || "");
    if (name) names.push(name);
  }
  return [...new Set(names)];
}

export function parseSqlCteDefinitions(source: string): SqlCteDefinition[] {
  const withMatch = /\bWITH\s+(?:RECURSIVE\s+)?/i.exec(source);
  if (!withMatch) {
    return [];
  }
  const definitions: SqlCteDefinition[] = [];
  let offset = withMatch.index + withMatch[0].length;
  while (offset < source.length) {
    const match = new RegExp(
      String.raw`(${sqlValueIdentifier})\s+AS\s*\(`,
      "gi",
    );
    match.lastIndex = offset;
    const cteMatch = match.exec(source);
    if (!cteMatch || cteMatch.index < offset) {
      break;
    }
    const opening = source.indexOf("(", cteMatch.index + cteMatch[0].length - 1);
    const closing = matchingParenthesis(source, opening);
    if (opening < 0 || closing < 0 || !cteMatch[1]) {
      break;
    }
    const content = source.slice(opening + 1, closing);
    definitions.push({
      name: identifier(cteMatch[1]),
      columns: cteColumns(content),
      references: parseSqlTableReferences(content),
    });
    offset = closing + 1;
    while (/\s/.test(source[offset] || "")) offset += 1;
    if (source[offset] !== ",") break;
    offset += 1;
  }
  return definitions;
}

export function parseSqlEnumValues(type: string | undefined): string[] {
  const match = /^\s*enum\s*\((.*)\)\s*$/is.exec(type ?? "");
  if (!match) {
    return [];
  }
  const values: string[] = [];
  let value = "";
  let quote: "'" | '"' | undefined;
  for (let index = 0; index < match[1].length; index += 1) {
    const character = match[1][index];
    const next = match[1][index + 1];
    if (quote) {
      if (character === "\\" && next !== undefined) {
        value += next;
        index += 1;
      } else if (character === quote && next === quote) {
        value += quote;
        index += 1;
      } else if (character === quote) {
        quote = undefined;
      } else {
        value += character;
      }
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (character === ",") {
      if (value.trim()) {
        values.push(value.trim());
      }
      value = "";
    } else {
      value += character;
    }
  }
  if (value.trim()) {
    values.push(value.trim());
  }
  return [...new Set(values)];
}

function aliasesForReferences(
  source: string,
  references: readonly SqlTableReference[],
): Map<string, SqlTableReference> {
  const aliases = new Map<string, SqlTableReference>();
  for (const reference of references) {
    aliases.set(reference.name.toLocaleLowerCase(), reference);
    if (reference.schema) {
      aliases.set(`${reference.schema}.${reference.name}`.toLocaleLowerCase(), reference);
    }
    const tail = source.slice(reference.end).match(
      /^\s+(?:AS\s+)?((?:`[^`]+`|"[^"]+"|\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_$]*))/i,
    );
    const alias = tail?.[1] ? identifier(tail[1]) : "";
    if (alias && !/^(?:ON|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|GROUP|ORDER|HAVING|LIMIT|SET)$/i.test(alias)) {
      aliases.set(alias.toLocaleLowerCase(), reference);
    }
  }
  return aliases;
}

export function detectSqlCompletionTarget(
  source: string,
  offset: number,
): SqlCompletionTarget {
  const sql = currentSqlSource(source, offset);
  const prefix = currentWord(sql);
  const qualifierMatch = /(?:^|[^A-Za-z0-9_$])([A-Za-z_][A-Za-z0-9_$]*)\s*\.\s*[A-Za-z_][A-Za-z0-9_$]*?$/.exec(sql)
    || /(?:^|[^A-Za-z0-9_$])([A-Za-z_][A-Za-z0-9_$]*)\s*\.\s*$/.exec(sql);
  const references = parseSqlTableReferences(sql);
  const ctes = parseSqlCteDefinitions(sql);
  const valueTarget = parseSqlValueTarget(sql, references);
  if (valueTarget) {
    return valueTarget;
  }
  const variableTarget = parseSqlVariableTarget(sql);
  if (variableTarget) {
    return variableTarget;
  }
  const procedureTarget = parseSqlProcedureVariableTarget(
    source.slice(0, Math.max(0, Math.min(offset, source.length))),
  );
  if (procedureTarget) {
    return procedureTarget;
  }
  if (qualifierMatch?.[1]) {
    const qualifier = identifier(qualifierMatch[1]);
    const reference = aliasesForReferences(sql, references).get(qualifier.toLocaleLowerCase());
    const cte = ctes.find((item) =>
      item.name.toLocaleLowerCase() === qualifier.toLocaleLowerCase()
      || item.name.toLocaleLowerCase() === reference?.name.toLocaleLowerCase(),
    );
    if (cte) {
      return cte.columns.length > 0
        ? {
          kind: "columns",
          prefix,
          qualifier,
          references: [],
          cteColumns: cte.columns,
        }
        : {
          kind: "columns",
          prefix,
          qualifier,
          references: cte.references,
        };
    }
    return {
      kind: "columns",
      prefix,
      qualifier,
      references: reference ? [reference] : references,
    };
  }
  if (/(?:\bFROM|\bJOIN|\bUPDATE|\bINTO|\bTABLE)\s+[A-Za-z_`"[\]]?[A-Za-z0-9_$`"[\].]*$/i.test(sql)) {
    return { kind: "tables", prefix };
  }
  if (
    references.length > 0
    && /(?:\bWHERE|\bON|\bAND|\bOR|\bSET|\bORDER\s+BY|\bGROUP\s+BY|\bHAVING)\s*(?:[A-Za-z_][A-Za-z0-9_$]*)?$/i.test(sql)
  ) {
    return { kind: "columns", prefix, references };
  }
  return { kind: "keywords", prefix };
}
