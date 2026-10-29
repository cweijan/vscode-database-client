import { parse } from "comment-json";
import { type Consumer, type Producer } from "kafkajs";
import * as path from "node:path";
import * as vscode from "vscode";

import type { ActiveConnectionStore } from "../core/activeConnection";
import type { Disposable } from "../core/contracts";
import type { ConnectionManager } from "./connectionManager";
import { createKafkaClient } from "./messageFactories";
import { parseMessageTemplateContext } from "./messageTemplates";
import type { ConnectionOptions } from "./types";

interface MessageDocument {
  readonly uri: { readonly fsPath: string };
  getText(): string;
}

interface ConsumerConfig {
  readonly group: string;
  readonly countPerRequest: number;
  readonly receiveMaximum?: number;
  readonly receiveInterval: number;
  readonly ackMode: string;
  readonly vhost?: string;
}

interface KafkaConsumerRecord {
  readonly kind: "kafka";
  readonly consumer: Consumer;
  readonly editor: vscode.TextEditor;
  readonly maxMessages?: number;
  count: number;
}

interface RabbitConsumerRecord {
  readonly kind: "rabbit";
  timer?: ReturnType<typeof setInterval>;
  readonly editor: vscode.TextEditor;
  readonly connection: ConnectionOptions;
  readonly queue: string;
  readonly config: ConsumerConfig;
  count: number;
  busy: boolean;
}

type ConsumerRecord = KafkaConsumerRecord | RabbitConsumerRecord;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value);
}

function number(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function messageDocument(value: unknown): MessageDocument | undefined {
  const candidate = record(value);
  const source = candidate.document && typeof candidate.document === "object"
    ? candidate.document
    : value;
  if (!source || typeof source !== "object") return undefined;
  const sourceRecord = source as { getText?: unknown; uri?: unknown };
  const getText = sourceRecord.getText;
  const uri = record(sourceRecord.uri);
  if (typeof getText !== "function" || typeof uri.fsPath !== "string") {
    return undefined;
  }
  return {
    uri: { fsPath: uri.fsPath },
    getText: () => String(getText.call(source)),
  };
}

function documentKey(document: MessageDocument): string {
  return document.uri.fsPath;
}

function resourceName(document: MessageDocument, extension: "producer" | "consumer"): string {
  const name = path.basename(document.uri.fsPath);
  const suffix = new RegExp(`\\.${extension}$`, "i");
  const raw = name.replace(suffix, "") || extension;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function parseMessageValues(source: string): unknown[] {
  let value: unknown;
  try {
    value = parse(source) as unknown;
  } catch (error) {
    throw new Error(`Invalid message content: ${error instanceof Error ? error.message : String(error)}`);
  }
  return Array.isArray(value) ? value : [value];
}

function configValue(candidate: Record<string, unknown>, name: string): unknown {
  const key = Object.keys(candidate).find((item) => item.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : candidate[key];
}

function consumerConfig(source: string): ConsumerConfig {
  const json = source.match(/Consumer Info:\s*([\s\S]*)/i)?.[1]?.trim() || source.trim();
  let value: unknown = {};
  try {
    value = json ? parse(json) as unknown : {};
  } catch {
    value = {};
  }
  const candidate = record(value);
  const receiveMaximum = number(configValue(candidate, "receiveMaximum"), 0);
  const context = parseMessageTemplateContext(source);
  return {
    group: text(configValue(candidate, "group"), "vscode-dbclient-consumer"),
    countPerRequest: Math.max(1, Math.min(100, number(configValue(candidate, "countPerRequest"), 5))),
    ...(receiveMaximum > 0 ? { receiveMaximum } : {}),
    receiveInterval: Math.max(100, number(configValue(candidate, "receiveinterval"), 500)),
    ackMode: text(configValue(candidate, "ackmode"), "ack_requeue_false"),
    ...(context.vhost ? { vhost: context.vhost } : {}),
  };
}

function payloadText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

async function outputEditor(title: string): Promise<vscode.TextEditor> {
  const document = await vscode.workspace.openTextDocument({
    content: `// ${title}\n`,
    language: "text",
  });
  return vscode.window.showTextDocument(document, { preview: false });
}

async function appendOutput(editor: vscode.TextEditor, value: string): Promise<void> {
  const lastLine = editor.document.lineCount - 1;
  const line = editor.document.lineAt(lastLine);
  await editor.edit((edit) => {
    edit.insert(new vscode.Position(lastLine, line.text.length), `${value}\n`);
  });
}

function rabbitGetPath(vhost: string, queue: string): string {
  return `/api/queues/${encodeURIComponent(vhost)}/${encodeURIComponent(queue)}/get`;
}

export class MessageCommandService implements Disposable {
  private readonly producers = new Map<string, Producer>();
  private readonly consumers = new Map<string, ConsumerRecord>();

  public constructor(
    private readonly activeConnection: ActiveConnectionStore,
    private readonly connections: ConnectionManager,
  ) {}

  public async send(documentValue: unknown): Promise<void> {
    const document = messageDocument(documentValue);
    if (!document) throw new Error("A producer document is required");
    const connection = this.requireMessageConnection(document);
    const templateContext = parseMessageTemplateContext(document.getText());
    const values = parseMessageValues(document.getText());
    const name = resourceName(document, "producer");

    if (connection.type === "Kafka") {
      let producer = this.producers.get(documentKey(document));
      if (!producer) {
        producer = createKafkaClient(connection).producer();
        await producer.connect();
        this.producers.set(documentKey(document), producer);
      }
      await producer.send({
        topic: name,
        messages: values.map((value) => ({ value: payloadText(value) })),
      });
      void vscode.window.showInformationMessage(`Sent ${values.length} message(s) to Kafka topic ${name}.`);
      return;
    }

    for (const value of values) {
      await this.connections.query(
        connection,
        `POST /api/exchanges/${encodeURIComponent(templateContext.vhost || "/")}/amq.default/publish\n${JSON.stringify({
          vhost: templateContext.vhost || "/",
          name: "amq.default",
          properties: { delivery_mode: 2, headers: {} },
          routing_key: name,
          delivery_mode: "2",
          payload: payloadText(value),
          payload_encoding: "string",
          headers: {},
          props: {},
        })}`,
      );
    }
    void vscode.window.showInformationMessage(`Sent ${values.length} message(s) to RabbitMQ queue ${name}.`);
  }

  public async stopProducer(documentValue: unknown): Promise<void> {
    const document = messageDocument(documentValue);
    if (!document) throw new Error("A producer document is required");
    const key = documentKey(document);
    const producer = this.producers.get(key);
    if (!producer) {
      throw new Error("No Kafka producer is running for this document");
    }
    this.producers.delete(key);
    await producer.disconnect();
    void vscode.window.showInformationMessage("Kafka producer stopped.");
  }

  public async startConsumer(documentValue: unknown): Promise<void> {
    const document = messageDocument(documentValue);
    if (!document) throw new Error("A consumer document is required");
    const key = documentKey(document);
    if (this.consumers.has(key)) throw new Error("Consumer is already running");
    const connection = this.requireMessageConnection(document);
    const config = consumerConfig(document.getText());
    const editor = await outputEditor(`Consumer ${resourceName(document, "consumer")}`);

    if (connection.type === "Kafka") {
      const consumer = createKafkaClient(connection).consumer({ groupId: config.group });
      await consumer.connect();
      await consumer.subscribe({ topic: resourceName(document, "consumer"), fromBeginning: true });
      const state: KafkaConsumerRecord = {
        kind: "kafka",
        consumer,
        editor,
        ...(config.receiveMaximum ? { maxMessages: config.receiveMaximum } : {}),
        count: 0,
      };
      this.consumers.set(key, state);
      void consumer.run({
        eachMessage: async ({ partition, message }) => {
          const current = this.consumers.get(key);
          if (current?.kind !== "kafka") return;
          current.count += 1;
          await appendOutput(
            current.editor,
            `// Partition: ${partition}, Offset: ${message.offset}\n${message.value?.toString("utf8") || ""}`,
          );
          if (current.maxMessages && current.count >= current.maxMessages) {
            await this.stopConsumerByKey(key);
          }
        },
      }).catch((error: unknown) => {
        void this.stopConsumerByKey(key);
        void vscode.window.showErrorMessage(
          `Kafka consumer stopped: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
      void vscode.window.showInformationMessage(`Kafka consumer started for ${resourceName(document, "consumer")}.`);
      return;
    }

    const state: RabbitConsumerRecord = {
      kind: "rabbit",
      editor,
      connection,
      queue: resourceName(document, "consumer"),
      config,
      count: 0,
      busy: false,
    };
    const poll = async (): Promise<void> => {
      if (state.busy || !this.consumers.has(key)) return;
      state.busy = true;
      try {
        const result = await this.connections.query<Record<string, unknown>>(
          state.connection,
          `POST ${rabbitGetPath(state.config.vhost || "/", state.queue)}\n${JSON.stringify({
            count: state.config.countPerRequest,
            ackmode: state.config.ackMode,
            encoding: "auto",
          })}`,
        );
        for (const row of result.rows) {
          state.count += 1;
          await appendOutput(
            state.editor,
            `// Message Count: ${text(row.message_count, "0")}\n${payloadText(row.payload)}`,
          );
          if (state.config.receiveMaximum && state.count >= state.config.receiveMaximum) break;
        }
        if (state.config.receiveMaximum && state.count >= state.config.receiveMaximum) {
          await this.stopConsumerByKey(key);
        }
      } finally {
        state.busy = false;
      }
    };
    const timer = setInterval(() => { void poll(); }, config.receiveInterval);
    state.timer = timer;
    this.consumers.set(key, state);
    try {
      await poll();
    } catch (error) {
      await this.stopConsumerByKey(key);
      throw error;
    }
    void vscode.window.showInformationMessage(`RabbitMQ consumer started for ${state.queue}.`);
  }

  public async stopConsumer(documentValue: unknown): Promise<void> {
    const document = messageDocument(documentValue);
    if (!document) throw new Error("A consumer document is required");
    await this.stopConsumerByKey(documentKey(document));
  }

  public isConsumerRunning(documentValue: unknown): boolean {
    const document = messageDocument(documentValue);
    return document ? this.consumers.has(documentKey(document)) : false;
  }

  public async configureOffset(documentValue: unknown): Promise<void> {
    const document = messageDocument(documentValue);
    if (!document) throw new Error("A consumer document is required");
    const connection = this.requireMessageConnection(document);
    if (connection.type !== "Kafka") {
      throw new Error("Consumer offsets are only supported for Kafka");
    }
    const offset = await vscode.window.showInputBox({ title: "Set consumer offset" });
    if (!offset) return;
    const kafka = createKafkaClient(connection);
    const admin = kafka.admin();
    const topic = resourceName(document, "consumer");
    try {
      await admin.connect();
      const metadata = await admin.fetchTopicMetadata({ topics: [topic] });
      const partitions = metadata.topics[0]?.partitions ?? [];
      await admin.setOffsets({
        groupId: consumerConfig(document.getText()).group,
        topic,
        partitions: partitions.map((partition) => ({
          partition: partition.partitionId,
          offset,
        })),
      });
      void vscode.window.showInformationMessage(`Kafka offset updated for ${topic}.`);
    } finally {
      await admin.disconnect();
    }
  }

  public dispose(): void {
    for (const key of this.consumers.keys()) void this.stopConsumerByKey(key);
    const producers = [...this.producers.values()];
    this.producers.clear();
    void Promise.all(producers.map((producer) => producer.disconnect()));
  }

  private requireMessageConnection(document?: MessageDocument): ConnectionOptions {
    const context = document ? parseMessageTemplateContext(document.getText()) : {};
    const connection = context.connectionId
      ? this.connections.getOptions(context.connectionId) || this.activeConnection.get()
      : this.activeConnection.get();
    if (!connection || !["Kafka", "RabbitMQ"].includes(connection.type)) {
      throw new Error("An active Kafka or RabbitMQ connection is required");
    }
    return connection;
  }

  private async stopConsumerByKey(key: string): Promise<void> {
    const state = this.consumers.get(key);
    if (!state) return;
    this.consumers.delete(key);
    if (state.kind === "kafka") {
      await state.consumer.stop().catch(() => undefined);
      await state.consumer.disconnect().catch(() => undefined);
      return;
    }
    if (state.timer) clearInterval(state.timer);
  }
}
