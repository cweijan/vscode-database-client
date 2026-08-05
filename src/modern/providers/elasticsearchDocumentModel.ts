import { parse, stringify } from "comment-json";

export interface ElasticRequest {
  readonly method: string;
  readonly path: string;
  readonly start: number;
  readonly end: number;
  readonly methodStart: number;
  readonly methodEnd: number;
  readonly pathStart: number;
  readonly pathEnd: number;
  readonly bodyStart?: number;
  readonly bodyEnd?: number;
  readonly bodyText?: string;
  readonly body?: unknown;
  readonly error?: string;
}

const requestLine = /^\s*(GET|POST|PUT|PATCH|DELETE|HEAD)\s+([^\s]+)\s*$/i;

function lineOffsets(source: string): number[] {
  const offsets = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") {
      offsets.push(index + 1);
    }
  }
  return offsets;
}

function lineEnd(source: string, start: number): number {
  const end = source.indexOf("\n", start);
  return end < 0 ? source.length : end;
}

function findJsonEnd(source: string, start: number): number {
  const opening = source[start];
  if (opening !== "{" && opening !== "[") {
    return start;
  }

  const stack: string[] = [opening === "{" ? "}" : "]"];
  let quote: '"' | undefined;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (character === "\n") {
        lineComment = false;
      }
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }
    if (character === '"') {
      quote = character;
      continue;
    }
    if (character === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === "{" || character === "[") {
      stack.push(character === "{" ? "}" : "]");
      continue;
    }
    if (character === "}" || character === "]") {
      if (stack.at(-1) !== character) {
        return source.length;
      }
      stack.pop();
      if (stack.length === 0) {
        return index + 1;
      }
    }
  }

  return source.length;
}

function parseBody(bodyText: string): { body?: unknown; error?: string } {
  try {
    return { body: parse(bodyText) as unknown };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export function parseElasticRequests(source: string): ElasticRequest[] {
  const offsets = lineOffsets(source);
  const requests: ElasticRequest[] = [];

  for (let lineIndex = 0; lineIndex < offsets.length; lineIndex += 1) {
    const start = offsets[lineIndex];
    const end = lineEnd(source, start);
    const text = source.slice(start, end);
    const match = requestLine.exec(text);
    if (!match) {
      continue;
    }

    const leadingWhitespace = text.search(/\S/);
    const methodStart = start + Math.max(0, leadingWhitespace);
    const pathStart = methodStart + match[1].length + 1;
    const pathEnd = pathStart + match[2].length;
    const nextLine = lineIndex + 1;
    let bodyStart: number | undefined;
    let bodyEnd: number | undefined;
    let bodyText: string | undefined;
    let body: unknown;
    let error: string | undefined;

    if (nextLine < offsets.length) {
      let bodyLine = nextLine;
      while (bodyLine < offsets.length) {
        const candidateStart = offsets[bodyLine];
        const candidateEnd = lineEnd(source, candidateStart);
        const candidate = source.slice(candidateStart, candidateEnd);
        if (candidate.trim()) {
          if (candidate.trimStart().startsWith("{") || candidate.trimStart().startsWith("[")) {
            bodyStart = candidateStart + candidate.search(/\S/);
            bodyEnd = findJsonEnd(source, bodyStart);
            bodyText = source.slice(bodyStart, bodyEnd).trimEnd();
            const parsed = parseBody(bodyText);
            body = parsed.body;
            error = parsed.error;
          }
          break;
        }
        bodyLine += 1;
      }
    }

    requests.push({
      method: match[1].toUpperCase(),
      path: match[2],
      start: methodStart,
      end: bodyEnd ?? end,
      methodStart,
      methodEnd: methodStart + match[1].length,
      pathStart,
      pathEnd,
      bodyStart,
      bodyEnd,
      bodyText,
      body,
      error,
    });
  }

  return requests;
}

export function formatElasticBody(body: unknown): string {
  return stringify(body, null, 2);
}

export const ELASTIC_PATH_COMPLETIONS = [
  "_analyze",
  "_bulk",
  "_cat/",
  "_cluster/",
  "_count",
  "_field_caps",
  "_mapping",
  "_nodes",
  "_search",
  "_settings",
  "_aliases",
  "{index}/_doc",
  "{index}/_mapping",
  "{index}/_search",
  "{index}/_settings",
] as const;

export const ELASTIC_QUERY_COMPLETIONS = [
  "allow_no_indices",
  "analyze_wildcard",
  "from",
  "ignore_unavailable",
  "pretty",
  "q",
  "size",
  "sort",
  "track_total_hits",
] as const;
