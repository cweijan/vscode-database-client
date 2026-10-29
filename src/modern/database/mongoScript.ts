import { runInNewContext } from "node:vm";

import {
  Binary,
  Decimal128,
  Long,
  ObjectId,
  Timestamp,
  type AbstractCursor,
  type AnyBulkWriteOperation,
  type Collection,
  type Db,
  type Document,
  type IndexDescription,
  type IndexDirection,
  type IndexInformationOptions,
  type IndexSpecification,
  type MongoClient,
  type Sort,
  type SortDirection,
  type UpdateFilter,
} from "mongodb";

type MongoRecord = Record<string, unknown>;

export interface MongoScriptExecution {
  readonly value: unknown;
  readonly rows: MongoRecord[];
  readonly affectedRows?: number;
}

export interface MongoScriptOptions {
  readonly defaultDatabase?: string;
  readonly timeoutMs?: number;
}

interface MongoCursorFacade {
  readonly __mongoCursor: true;
  toArray(): Promise<unknown[]>;
  next(): Promise<unknown | null>;
  count(): Promise<number>;
  limit(value: unknown): MongoCursorFacade;
  skip(value: unknown): MongoCursorFacade;
  sort(value: unknown, direction?: unknown): MongoCursorFacade;
  project(value: unknown): MongoCursorFacade;
  explain(): Promise<unknown>;
}

interface CursorOperations {
  readonly count?: () => Promise<number>;
  readonly limit?: (value: number) => void;
  readonly skip?: (value: number) => void;
  readonly sort?: (value: Sort) => void;
  readonly project?: (value: Document) => void;
  readonly explain?: () => Promise<unknown>;
}

interface MongoCollectionFacade {
  find(filter?: unknown, projection?: unknown): MongoCursorFacade;
  findOne(filter?: unknown): Promise<unknown>;
  aggregate(pipeline?: unknown): MongoCursorFacade;
  insertOne(document: unknown): Promise<unknown>;
  insertMany(documents: unknown): Promise<unknown>;
  bulkWrite(operations: unknown): Promise<unknown>;
  updateOne(filter: unknown, update: unknown, options?: unknown): Promise<unknown>;
  updateMany(filter: unknown, update: unknown, options?: unknown): Promise<unknown>;
  replaceOne(filter: unknown, replacement: unknown, options?: unknown): Promise<unknown>;
  deleteOne(filter?: unknown): Promise<unknown>;
  deleteMany(filter?: unknown): Promise<unknown>;
  findOneAndUpdate(filter: unknown, update: unknown, options?: unknown): Promise<unknown>;
  findOneAndDelete(filter: unknown, options?: unknown): Promise<unknown>;
  findOneAndReplace(filter: unknown, replacement: unknown, options?: unknown): Promise<unknown>;
  rename(name: unknown, options?: unknown): Promise<MongoCollectionFacade>;
  drop(): Promise<boolean>;
  options(): Promise<Document>;
  createIndex(specification: unknown, options?: unknown): Promise<string>;
  createIndexes(specifications: unknown, options?: unknown): Promise<string[]>;
  dropIndex(name: unknown): Promise<unknown>;
  dropIndexes(): Promise<boolean>;
  listIndexes(): MongoCursorFacade;
  indexExists(names: unknown): Promise<boolean>;
  indexInformation(options?: unknown): Promise<unknown>;
  indexes(options?: unknown): Promise<unknown>;
  count(filter?: unknown): Promise<number>;
  countDocuments(filter?: unknown): Promise<number>;
  estimatedDocumentCount(): Promise<number>;
  distinct(field: unknown, filter?: unknown): Promise<unknown[]>;
  getName(): string;
  getFullName(): string;
}

interface MongoDatabaseFacade {
  collection(name: unknown): MongoCollectionFacade;
  getCollectionNames(): Promise<string[]>;
  listCollections(filter?: unknown): MongoCursorFacade;
  aggregate(pipeline?: unknown): MongoCursorFacade;
  createCollection(name: unknown, options?: unknown): Promise<MongoCollectionFacade>;
  renameCollection(from: unknown, to: unknown, options?: unknown): Promise<MongoCollectionFacade>;
  dropCollection(name: unknown): Promise<boolean>;
  dropDatabase(): Promise<boolean>;
  stats(): Promise<Document>;
  command(command: unknown): Promise<Document>;
  getName(): string;
}

function isRecord(value: unknown): value is MongoRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): MongoRecord {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireDocument(value: unknown, label: string): Document {
  return requireRecord(value, label) as Document;
}

function optionalDocument(value: unknown, label: string): Document {
  return value === undefined || value === null ? {} : requireDocument(value, label);
}

function requireDocumentArray(value: unknown, label: string): Document[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value.map((item, index) => requireDocument(item, `${label}[${index}]`));
}

function requirePositiveNumber(value: unknown, label: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number) || number < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return number;
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function sortDirection(value: unknown): IndexDirection {
  if (
    value === 1 ||
    value === -1 ||
    value === "2d" ||
    value === "2dsphere" ||
    value === "text" ||
    value === "geoHaystack" ||
    value === "hashed"
  ) {
    return value;
  }
  const number = Number(value);
  if (Number.isFinite(number)) return number;
  throw new Error("MongoDB index direction is invalid");
}

function indexSpecification(value: unknown): IndexSpecification {
  if (typeof value === "string") return value;
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, direction]) => [key, sortDirection(direction)]),
    );
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      if (typeof item === "string") return item;
      if (Array.isArray(item) && item.length === 2 && typeof item[0] === "string") {
        return [item[0], sortDirection(item[1])] as [string, IndexDirection];
      }
      throw new Error(`MongoDB index specification item ${index} is invalid`);
    });
  }
  throw new Error("MongoDB index specification is invalid");
}

function mongoSortDirection(value: unknown): SortDirection {
  if (value === 1 || value === -1 || value === "asc" || value === "desc" || value === "ascending" || value === "descending") {
    return value;
  }
  throw new Error("MongoDB sort direction is invalid");
}

function sortSpecification(value: unknown, direction?: unknown): Sort {
  if (typeof value === "string") {
    if (direction === undefined) return value;
    const normalizedDirection = mongoSortDirection(direction);
    return { [value]: normalizedDirection };
  }
  const object = requireRecord(value, "MongoDB sort");
  return Object.fromEntries(
    Object.entries(object).map(([key, item]) => [key, mongoSortDirection(item)]),
  );
}

function updateValue(value: unknown): UpdateFilter<Document> | Document[] {
  if (Array.isArray(value)) return requireDocumentArray(value, "MongoDB update pipeline");
  return requireDocument(value, "MongoDB update");
}

function createCursor<TSchema>(
  cursor: AbstractCursor<TSchema>,
  operations: CursorOperations = {},
): MongoCursorFacade {
  const facade: MongoCursorFacade = {
    __mongoCursor: true,
    async toArray() {
      return cursor.toArray();
    },
    async next() {
      return cursor.next();
    },
    async count() {
      if (!operations.count) throw new Error("This MongoDB cursor does not support count()");
      return operations.count();
    },
    limit(value) {
      if (!operations.limit) throw new Error("This MongoDB cursor does not support limit()");
      operations.limit(requirePositiveNumber(value, "MongoDB limit"));
      return facade;
    },
    skip(value) {
      if (!operations.skip) throw new Error("This MongoDB cursor does not support skip()");
      operations.skip(requirePositiveNumber(value, "MongoDB skip"));
      return facade;
    },
    sort(value, direction) {
      if (!operations.sort) throw new Error("This MongoDB cursor does not support sort()");
      operations.sort(sortSpecification(value, direction));
      return facade;
    },
    project(value) {
      if (!operations.project) throw new Error("This MongoDB cursor does not support project()");
      operations.project(requireDocument(value, "MongoDB projection"));
      return facade;
    },
    async explain() {
      if (!operations.explain) throw new Error("This MongoDB cursor does not support explain()");
      return operations.explain();
    },
  };
  return facade;
}

function findCursor(collection: Collection<Document>, filter: Document, projection?: Document): MongoCursorFacade {
  const cursor = collection.find(filter, projection ? { projection } : undefined);
  return createCursor(cursor, {
    count: () => cursor.count(),
    limit: (value) => cursor.limit(value),
    skip: (value) => cursor.skip(value),
    sort: (value) => cursor.sort(value),
    project: (value) => cursor.project(value),
    explain: () => cursor.explain(),
  });
}

function aggregateCursor(collection: Collection<Document>, pipeline: Document[]): MongoCursorFacade {
  const cursor = collection.aggregate<Document>(pipeline);
  return createCursor(cursor, {
    limit: (value) => cursor.limit(value),
    skip: (value) => cursor.skip(value),
    sort: (value) => cursor.sort(value),
    project: (value) => cursor.project(value),
    explain: () => cursor.explain(),
  });
}

function collectionFacade(collection: Collection<Document>): MongoCollectionFacade {
  return {
    find(filter, projection) {
      return findCursor(
        collection,
        optionalDocument(filter, "MongoDB filter"),
        projection === undefined ? undefined : requireDocument(projection, "MongoDB projection"),
      );
    },
    async findOne(filter) {
      return filter === undefined
        ? collection.findOne()
        : collection.findOne(requireDocument(filter, "MongoDB filter"));
    },
    aggregate(pipeline) {
      return aggregateCursor(collection, pipeline === undefined ? [] : requireDocumentArray(pipeline, "MongoDB pipeline"));
    },
    async insertOne(document) {
      return collection.insertOne(requireDocument(document, "MongoDB document"));
    },
    async insertMany(documents) {
      return collection.insertMany(requireDocumentArray(documents, "MongoDB documents"));
    },
    async bulkWrite(operations) {
      const documents = requireDocumentArray(operations, "MongoDB bulk operations");
      return collection.bulkWrite(
        documents as unknown as ReadonlyArray<AnyBulkWriteOperation<Document>>,
      );
    },
    async updateOne(filter, update, options) {
      return collection.updateOne(
        requireDocument(filter, "MongoDB filter"),
        updateValue(update),
        options === undefined ? undefined : requireDocument(options, "MongoDB update options"),
      );
    },
    async updateMany(filter, update, options) {
      return collection.updateMany(
        requireDocument(filter, "MongoDB filter"),
        updateValue(update),
        options === undefined ? undefined : requireDocument(options, "MongoDB update options"),
      );
    },
    async replaceOne(filter, replacement, options) {
      return collection.replaceOne(
        requireDocument(filter, "MongoDB filter"),
        requireDocument(replacement, "MongoDB replacement"),
        options === undefined ? undefined : requireDocument(options, "MongoDB replace options"),
      );
    },
    async deleteOne(filter) {
      return collection.deleteOne(filter === undefined ? {} : requireDocument(filter, "MongoDB filter"));
    },
    async deleteMany(filter) {
      return collection.deleteMany(filter === undefined ? {} : requireDocument(filter, "MongoDB filter"));
    },
    async findOneAndUpdate(filter, update, options) {
      const filterDocument = requireDocument(filter, "MongoDB filter");
      const updateDocument = updateValue(update);
      return options === undefined
        ? collection.findOneAndUpdate(filterDocument, updateDocument)
        : collection.findOneAndUpdate(
          filterDocument,
          updateDocument,
          requireDocument(options, "MongoDB update options"),
        );
    },
    async findOneAndDelete(filter, options) {
      const filterDocument = requireDocument(filter, "MongoDB filter");
      return options === undefined
        ? collection.findOneAndDelete(filterDocument)
        : collection.findOneAndDelete(
          filterDocument,
          requireDocument(options, "MongoDB delete options"),
        );
    },
    async findOneAndReplace(filter, replacement, options) {
      const filterDocument = requireDocument(filter, "MongoDB filter");
      const replacementDocument = requireDocument(replacement, "MongoDB replacement");
      return options === undefined
        ? collection.findOneAndReplace(filterDocument, replacementDocument)
        : collection.findOneAndReplace(
          filterDocument,
          replacementDocument,
          requireDocument(options, "MongoDB replace options"),
        );
    },
    async rename(name, options) {
      const renamed = await collection.rename(
        requireText(name, "MongoDB collection name"),
        options === undefined ? undefined : requireDocument(options, "MongoDB rename options"),
      );
      return collectionFacade(renamed);
    },
    drop: () => collection.drop(),
    options: () => collection.options(),
    async createIndex(specification, options) {
      return collection.createIndex(
        indexSpecification(specification),
        options === undefined ? undefined : requireDocument(options, "MongoDB index options"),
      );
    },
    async createIndexes(specifications, options) {
      const values = requireDocumentArray(specifications, "MongoDB index specifications").map(
        (item) => {
          const key = item.key;
          if (!key) throw new Error("MongoDB index description requires key");
          return {
            ...item,
            key: requireRecord(key, "MongoDB index key"),
          } as unknown as IndexDescription;
        },
      );
      return collection.createIndexes(
        values,
        options === undefined ? undefined : requireDocument(options, "MongoDB index options"),
      );
    },
    dropIndex: (name) => collection.dropIndex(requireText(name, "MongoDB index name")),
    dropIndexes: () => collection.dropIndexes(),
    listIndexes: () => createCursor(collection.listIndexes()),
    indexExists: (names) => {
      if (Array.isArray(names)) {
        return collection.indexExists(names.map((name) => requireText(name, "MongoDB index name")));
      }
      return collection.indexExists(requireText(names, "MongoDB index name"));
    },
    async indexInformation(options) {
      if (options === undefined) return collection.indexInformation();
      return collection.indexInformation(
        requireDocument(options, "MongoDB index information options") as IndexInformationOptions,
      );
    },
    async indexes(options) {
      if (options === undefined) return collection.indexes();
      return collection.indexes(requireDocument(options, "MongoDB index options"));
    },
    count: (filter) => collection.count(filter === undefined ? {} : requireDocument(filter, "MongoDB filter")),
    countDocuments: (filter) => collection.countDocuments(filter === undefined ? {} : requireDocument(filter, "MongoDB filter")),
    estimatedDocumentCount: () => collection.estimatedDocumentCount(),
    distinct: (field, filter) => collection.distinct(
      requireText(field, "MongoDB distinct field"),
      filter === undefined ? {} : requireDocument(filter, "MongoDB filter"),
    ),
    getName: () => collection.collectionName,
    getFullName: () => collection.namespace,
  };
}

function databaseFacade(db: Db): MongoDatabaseFacade {
  return {
    collection: (name) => collectionFacade(db.collection(requireText(name, "MongoDB collection name"))),
    getCollectionNames: async () => (await db.listCollections().toArray()).map((item) => item.name),
    listCollections: (filter) => createCursor(db.listCollections(optionalDocument(filter, "MongoDB collection filter"))),
    aggregate: (pipeline) => createCursor(db.aggregate<Document>(pipeline === undefined ? [] : requireDocumentArray(pipeline, "MongoDB pipeline"))),
    createCollection: async (name, options) => collectionFacade(await db.createCollection(
      requireText(name, "MongoDB collection name"),
      options === undefined ? undefined : requireDocument(options, "MongoDB collection options"),
    )),
    renameCollection: async (from, to, options) => collectionFacade(await db.renameCollection(
      requireText(from, "MongoDB collection name"),
      requireText(to, "MongoDB collection name"),
      options === undefined ? undefined : requireDocument(options, "MongoDB rename options"),
    )),
    dropCollection: (name) => db.dropCollection(requireText(name, "MongoDB collection name")),
    dropDatabase: () => db.dropDatabase(),
    stats: () => db.stats(),
    command: (command) => db.command(requireDocument(command, "MongoDB command")),
    getName: () => db.databaseName,
  };
}

function objectIdFactory(value?: unknown): ObjectId {
  if (value === undefined || value === null || value === "") return new ObjectId();
  if (typeof value === "string" || typeof value === "number") return new ObjectId(value);
  throw new Error("ObjectId() accepts a hexadecimal string or number");
}

function timestampFactory(value?: unknown): Timestamp {
  if (isRecord(value) && typeof value.t === "number" && typeof value.i === "number") {
    return new Timestamp({ t: value.t, i: value.i });
  }
  if (value === undefined) return Timestamp.fromNumber(0);
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("Timestamp() accepts a finite number");
  return Timestamp.fromNumber(number);
}

function binaryFactory(subType: unknown, base64: unknown): Binary {
  const type = Number(subType);
  if (!Number.isInteger(type) || type < 0 || type > 255) {
    throw new Error("BinData() subtype must be an integer between 0 and 255");
  }
  return Binary.createFromBase64(requireText(base64, "BinData() value"), type);
}

function numberLongFactory(value?: unknown): Long {
  return Long.fromString(value === undefined ? "0" : String(value));
}

function mongoEnvironment(client: MongoClient, defaultDatabase?: string): Record<string, unknown> {
  const db = (name?: unknown): MongoDatabaseFacade =>
    databaseFacade(client.db(name === undefined ? defaultDatabase : requireText(name, "MongoDB database name")));
  const output = (...values: unknown[]): void => {
    console.log("[MongoDB]", ...values);
  };
  return {
    db,
    ObjectId: objectIdFactory,
    ObjectID: objectIdFactory,
    ISODate: (value?: unknown) => value === undefined ? new Date() : new Date(requireText(value, "ISODate() value")),
    Timestamp: timestampFactory,
    BinData: binaryFactory,
    Binary,
    Decimal128,
    NumberLong: numberLongFactory,
    NumberInt: (value?: unknown) => Number(value ?? 0),
    console: { log: output, info: output, warn: output, error: output },
    print: output,
  };
}

function isCursor(value: unknown): value is MongoCursorFacade {
  return isRecord(value) && value.__mongoCursor === true && typeof value.toArray === "function";
}

async function resolveScriptValue(value: unknown): Promise<unknown> {
  if (isCursor(value)) return value.toArray();
  if (isRecord(value) && typeof value.then === "function") {
    return resolveScriptValue(await Promise.resolve(value as unknown as PromiseLike<unknown>));
  }
  return value;
}

export function normalizeMongoValue(value: unknown): unknown {
  if (value instanceof ObjectId) return `ObjectID('${value.toHexString()}')`;
  if (value instanceof Binary) return `BinData(${value.sub_type}, '${value.toString("base64")}')`;
  if (value instanceof Timestamp) return `Timestamp({ t: ${value.t}, i: ${value.i} })`;
  if (value instanceof Decimal128) return `Decimal128('${value.toString()}')`;
  if (value instanceof Long) return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map((item) => normalizeMongoValue(item));
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeMongoValue(item)]),
    );
  }
  return value;
}

function mongoResultRows(value: unknown): MongoRecord[] {
  if (Array.isArray(value)) {
    return value.map((item) => (isRecord(item) ? item : { value: item }));
  }
  if (isRecord(value)) return [value];
  if (value === undefined || value === null) return [];
  return [{ value }];
}

function mongoAffectedRows(value: unknown): number | undefined {
  if (!isRecord(value)) return undefined;
  const countFields = ["insertedCount", "deletedCount", "modifiedCount", "matchedCount"];
  const counts = countFields
    .map((field) => value[field])
    .filter((item): item is number => typeof item === "number" && Number.isFinite(item));
  return counts.length ? counts.reduce((total, item) => total + item, 0) : undefined;
}

export async function executeMongoScript(
  client: MongoClient,
  source: string,
  options: MongoScriptOptions = {},
): Promise<MongoScriptExecution> {
  const script = source.trim();
  if (!script) throw new Error("MongoDB query is empty");
  const rawValue: unknown = runInNewContext(script, mongoEnvironment(client, options.defaultDatabase), {
    timeout: options.timeoutMs ?? 30_000,
    displayErrors: true,
  });
  const value = normalizeMongoValue(await resolveScriptValue(rawValue));
  return {
    value,
    rows: mongoResultRows(value),
    affectedRows: mongoAffectedRows(value),
  };
}
