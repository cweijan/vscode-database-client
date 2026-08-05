import type { BigQuery as BigQueryClient } from "@google-cloud/bigquery";

import { OperationCancelledError } from "../core/errors";
import {
  DriverConnectionFactory,
  type DriverConnector,
} from "./driverConnectionFactory";
import type { ConnectionOptions, QueryField } from "./types";

interface BigQueryField extends QueryField {
  type?: string;
  mode?: string;
  fields?: BigQueryField[];
}

interface BigQueryApiResponse {
  numDmlAffectedRows?: number | string;
  schema?: { fields?: BigQueryField[] };
}

function option(options: ConnectionOptions, key: string): unknown {
  return options.options?.[key];
}

function nestedOption(
  options: ConnectionOptions,
  group: string,
  key: string,
): unknown {
  const value = option(options, group);
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function requiredString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function ensureActive(signal: AbortSignal | undefined, operation: string): void {
  if (signal?.aborted) {
    throw new OperationCancelledError(operation);
  }
}

function scalarValue(value: unknown, fieldType: string | undefined): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  if (fieldType === "BIGNUMERIC") {
    return typeof record.toFixed === "function"
      ? (record.toFixed as () => string)()
      : String(value);
  }

  if (
    fieldType &&
    [
      "NUMERIC",
      "DATE",
      "TIME",
      "INTEGER",
      "DATETIME",
      "TIMESTAMP",
      "GEOGRAPHY",
    ].includes(fieldType) &&
    "value" in record
  ) {
    return record.value;
  }

  return value;
}

function convertValue(value: unknown, field: BigQueryField | undefined): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => convertValue(item, field));
  }
  if (
    field?.type === "RECORD" &&
    value !== null &&
    typeof value === "object" &&
    field.fields?.length
  ) {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(record).map(([name, item]) => [
        name,
        convertValue(item, field.fields?.find((child) => child.name === name)),
      ]),
    );
  }
  return scalarValue(value, field?.type);
}

function normalizeBigQueryRows(
  rows: unknown,
  fields: BigQueryField[],
): Record<string, unknown>[] {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return { value: row };
    }
    const record = row as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(record).map(([name, value]) => [
        name,
        convertValue(value, fields.find((field) => field.name === name)),
      ]),
    );
  });
}

function bigQueryConnector(): DriverConnector {
  return {
    type: "BigQuery",
    async connect(options, signal) {
      ensureActive(signal, "Opening BigQuery connection");
      const { BigQuery } = await import("@google-cloud/bigquery");
      const client: BigQueryClient = new BigQuery({
        projectId:
          requiredString(nestedOption(options, "bigQuery", "projectId")) ||
          requiredString(option(options, "projectId")) ||
          undefined,
        keyFilename:
          requiredString(nestedOption(options, "bigQuery", "accountKeyPath")) ||
          requiredString(option(options, "keyFilename")) ||
          undefined,
        location:
          requiredString(nestedOption(options, "bigQuery", "location")) ||
          requiredString(option(options, "location")) ||
          undefined,
      });

      await client.getDatasets();
      let currentJob: { cancel(): Promise<unknown> } | undefined;
      return {
        async query(sql, queryOptions) {
          ensureActive(queryOptions?.signal, "BigQuery query");
          const [job] = await client.createQueryJob({
            query: sql,
            location:
              requiredString(nestedOption(options, "bigQuery", "location")) ||
              requiredString(option(options, "location")) ||
              undefined,
          });
          currentJob = job;
          const abortHandler = () => {
            void currentJob?.cancel().catch(() => undefined);
          };
          queryOptions?.signal?.addEventListener("abort", abortHandler, {
            once: true,
          });
          try {
            ensureActive(queryOptions?.signal, "BigQuery query");
            const [rows, , apiResponse] = await job.getQueryResults({
              wrapIntegers: true,
            });
            const response = apiResponse as BigQueryApiResponse;
            const fields = response.schema?.fields ?? [];
            const affectedRows = response.numDmlAffectedRows;
            return {
              rows: normalizeBigQueryRows(rows, fields),
              fields,
              affectedRows:
                affectedRows === undefined ? undefined : Number(affectedRows),
              raw: apiResponse,
            };
          } finally {
            queryOptions?.signal?.removeEventListener("abort", abortHandler);
            currentJob = undefined;
          }
        },
        async ping(querySignal) {
          ensureActive(querySignal, "BigQuery ping");
          await client.getDatasets({ maxResults: 1 });
        },
        async close() {
          currentJob = undefined;
        },
      };
    },
  };
}

export function createCloudConnectionFactories(): DriverConnectionFactory[] {
  return [new DriverConnectionFactory(bigQueryConnector())];
}
