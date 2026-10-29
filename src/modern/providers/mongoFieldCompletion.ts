import type { QueryResult } from "../database/types";

export interface MongoCollectionReference {
  readonly database: string;
  readonly collection: string;
}

function skipWhitespace(source: string, offset: number): number {
  while (/\s/.test(source[offset] ?? "")) offset += 1;
  return offset;
}

function readQuotedString(
  source: string,
  offset: number,
): { value: string; end: number } | undefined {
  const quote = source[offset];
  if (quote !== "'" && quote !== '"') return undefined;
  const value: string[] = [];
  for (let index = offset + 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === quote) {
      return { value: value.join(""), end: index + 1 };
    }
    if (character !== "\\") {
      value.push(character);
      continue;
    }
    const escaped = source[index + 1];
    if (escaped === undefined) return undefined;
    const replacements: Record<string, string> = {
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t",
      v: "\v",
    };
    value.push(replacements[escaped] ?? escaped);
    index += 1;
  }
  return undefined;
}

function readMongoCall(
  source: string,
  offset: number,
  functionName: string,
): { value: string; end: number } | undefined {
  const open = source.slice(offset).match(new RegExp(`^${functionName}\\s*\\(`));
  if (!open) return undefined;
  const argumentStart = skipWhitespace(source, offset + open[0].length);
  const argument = readQuotedString(source, argumentStart);
  if (!argument) return undefined;
  const close = skipWhitespace(source, argument.end);
  return source[close] === ")"
    ? { value: argument.value, end: close + 1 }
    : undefined;
}

/** Parse the target MongoDB `db("...").collection("...")` reference. */
export function parseMongoCollectionReference(
  source: string,
): MongoCollectionReference | undefined {
  const databaseCalls = [...source.matchAll(/\bdb\s*\(/g)];
  for (let index = databaseCalls.length - 1; index >= 0; index -= 1) {
    const call = databaseCalls[index];
    if (!call || call.index === undefined) continue;
    const database = readMongoCall(source, call.index, "db");
    if (!database) continue;
    const afterDatabase = source.slice(database.end).match(/^\s*\.\s*collection\s*\(/);
    if (!afterDatabase) continue;
    const collectionOffset = database.end + afterDatabase[0].lastIndexOf("collection");
    const collection = readMongoCall(
      source,
      collectionOffset,
      "collection",
    );
    if (collection) return { database: database.value, collection: collection.value };
  }
  return undefined;
}

/** Return the currently typed field prefix only when the cursor is inside a quote. */
export function mongoFieldPrefix(linePrefix: string): string | undefined {
  const match = /(?:^|[\s([{,:])(["'])([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)?$/.exec(linePrefix);
  return match ? match[2] ?? "" : undefined;
}

export function buildMongoFieldProbe(reference: MongoCollectionReference): string {
  return `db(${JSON.stringify(reference.database)}).collection(${JSON.stringify(reference.collection)}).find({}).limit(1)`;
}

export function mongoFieldNames(
  result: Pick<QueryResult<Record<string, unknown>>, "fields" | "rows">,
): string[] {
  const names = new Set<string>();
  for (const field of result.fields) {
    if (field.name && field.name !== "_id") names.add(field.name);
  }
  for (const row of result.rows) {
    for (const name of Object.keys(row)) {
      if (name !== "_id") names.add(name);
    }
  }
  return [...names];
}
