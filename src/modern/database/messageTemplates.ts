export type MessageTemplateKind = "producer" | "consumer";
export type MessageTemplateProtocol = "Kafka" | "RabbitMQ";

export interface MessageTemplateContext {
  readonly protocol: MessageTemplateProtocol;
  readonly connectionId: string;
  readonly resource: string;
  readonly vhost?: string;
  readonly broker?: string;
}

export interface MessageTemplate {
  readonly fileName: string;
  readonly content: string;
  readonly language: "json" | "dbclient-mq-consumer";
}

export interface ParsedMessageTemplateContext {
  readonly connectionId?: string;
  readonly vhost?: string;
}

const CONTEXT_PREFIX = "// Database Client MQ Context: ";

function contextComment(context: MessageTemplateContext): string {
  return `${CONTEXT_PREFIX}${JSON.stringify({
    connectionId: context.connectionId,
    ...(context.vhost === undefined ? {} : { vhost: context.vhost }),
  })}`;
}

function producerContent(context: MessageTemplateContext): string {
  const greeting = context.protocol === "Kafka" ? "Hello Kafka" : "Hello RabbitMQ";
  return [
    contextComment(context),
    JSON.stringify([
      { content: greeting },
      "Fill this array with any data you want to send to MQ.",
    ], null, 4),
  ].join("\n");
}

function consumerContent(context: MessageTemplateContext): string {
  const vhost = context.vhost || "/";
  const info = context.protocol === "Kafka"
    ? {
      Topic: context.resource,
      Broker: context.broker || "localhost:9092",
      receiveMaximum: 100,
      group: "vscode-dbclient-consumer",
    }
    : {
      Queue: context.resource,
      VHost: vhost,
      countPerRequest: 5,
      receiveMaximum: 100,
      receiveinterval: 500,
      ackmode: "ack_requeue_false",
    };
  return [
    contextComment(context),
    "Consumer Info:",
    JSON.stringify(info, null, 4),
  ].join("\n");
}

export function buildMessageTemplate(
  kind: MessageTemplateKind,
  context: MessageTemplateContext,
): MessageTemplate {
  return {
    fileName: `${encodeURIComponent(context.resource)}.${kind}`,
    content: kind === "producer" ? producerContent(context) : consumerContent(context),
    language: kind === "producer" ? "json" : "dbclient-mq-consumer",
  };
}

export function parseMessageTemplateContext(
  source: string,
): ParsedMessageTemplateContext {
  const value = source.match(/^[ \t]*\/\/ Database Client MQ Context: (\{[^\r\n]*\})[ \t]*$/m)?.[1];
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const record = parsed as Record<string, unknown>;
    return {
      ...(typeof record.connectionId === "string" && record.connectionId
        ? { connectionId: record.connectionId }
        : {}),
      ...(typeof record.vhost === "string" ? { vhost: record.vhost } : {}),
    };
  } catch {
    return {};
  }
}
