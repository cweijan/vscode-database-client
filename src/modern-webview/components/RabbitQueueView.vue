<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import UiButton from "./UiButton.vue";
import UiInput from "./UiInput.vue";

interface RabbitMessage {
  readonly [key: string]: unknown;
}

interface RabbitDetail {
  queue?: string;
  vhost?: string;
  messagesReady?: unknown;
  queues?: unknown;
}

type RabbitSection = "messages" | "bindings" | "exchanges" | "consumers";

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const bootstrap = readWebviewBootstrap();
const initial = bootstrap.state as RabbitDetail;
const detail = reactive<RabbitDetail>({
  queue: typeof initial.queue === "string" ? initial.queue : "",
  vhost: typeof initial.vhost === "string" ? initial.vhost : "/",
  messagesReady: initial.messagesReady,
  queues: initial.queues,
});
const section = ref<RabbitSection>("messages");
const count = ref("30");
const targetQueue = ref("");
const publishExchange = ref("amq.default");
const routingKey = ref("");
const publishBody = ref("");
const bindingExchange = ref("");
const bindingRoutingKey = ref("");
const selectedMessage = ref<number>();
const selectedBinding = ref<number>();
const messages = ref<RabbitMessage[]>([]);
const bindings = ref<RabbitMessage[]>([]);
const exchanges = ref<RabbitMessage[]>([]);
const consumers = ref<RabbitMessage[]>([]);
const status = ref("");
let detailSubscription: BridgeDisposable | undefined;
let messagesSubscription: BridgeDisposable | undefined;
let bindingsSubscription: BridgeDisposable | undefined;
let exchangesSubscription: BridgeDisposable | undefined;
let consumersSubscription: BridgeDisposable | undefined;
let successSubscription: BridgeDisposable | undefined;
let errorSubscription: BridgeDisposable | undefined;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value);
}

function records(value: unknown): RabbitMessage[] {
  return Array.isArray(value)
    ? value.map((item) => record(item))
    : [];
}

function json(value: unknown): string {
  try {
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function messageText(message: RabbitMessage): string {
  return text(message.payload || message.message || message.body, json(message));
}

function messageColumns(rows: RabbitMessage[]): string[] {
  const names = new Set<string>();
  for (const row of rows.slice(0, 30)) {
    for (const name of Object.keys(row)) names.add(name);
  }
  return [...names].filter((name) => name !== "payload");
}

const columns = computed(() => messageColumns(messages.value));
const queueChoices = computed(() => (
  Array.isArray(detail.queues) ? detail.queues.map(String).filter(Boolean) : []
));

function emit(type: string, content?: unknown): void {
  bridge?.emit(type, content);
}

function applyDetail(content: unknown): void {
  const next = record(content);
  Object.assign(detail, next);
  if (!targetQueue.value) targetQueue.value = text(next.queue);
  if (!routingKey.value) routingKey.value = text(next.queue);
}

function applyMessages(content: unknown): void {
  const payload = record(content);
  messages.value = records(payload.messages);
  if ("messagesReady" in payload) detail.messagesReady = payload.messagesReady;
  selectedMessage.value = undefined;
}

function applyBindings(content: unknown): void {
  bindings.value = records(record(content).bindings);
  selectedBinding.value = undefined;
}

function applyExchanges(content: unknown): void {
  exchanges.value = records(record(content).exchanges);
}

function applyConsumers(content: unknown): void {
  consumers.value = records(record(content).consumers);
}

function loadMessages(): void {
  section.value = "messages";
  emit("loadMessages", { count: Math.max(1, Number(count.value) || 30) });
}

function moveSelected(): void {
  if (selectedMessage.value == null || !targetQueue.value.trim()) return;
  emit("moveMessage", {
    indices: [selectedMessage.value],
    targetQueue: targetQueue.value.trim(),
  });
}

function deleteSelectedMessage(): void {
  if (selectedMessage.value == null) return;
  emit("deleteMessage", { indices: [selectedMessage.value] });
}

function publishMessage(): void {
  if (!publishBody.value.trim()) {
    status.value = "Message payload cannot be empty.";
    return;
  }
  emit("publishMessage", {
    exchange: publishExchange.value.trim() || "amq.default",
    routingKey: routingKey.value.trim() || detail.queue,
    payload: publishBody.value,
    deliveryMode: 2,
  });
}

function createBinding(): void {
  emit("createBinding", {
    exchange: bindingExchange.value.trim(),
    routingKey: bindingRoutingKey.value,
  });
}

function deleteSelectedBinding(): void {
  if (selectedBinding.value == null) return;
  emit("deleteBindings", { items: [bindings.value[selectedBinding.value]] });
}

onMounted(() => {
  detailSubscription = bridge?.on("detail", applyDetail);
  messagesSubscription = bridge?.on("messages", applyMessages);
  bindingsSubscription = bridge?.on("bindings", applyBindings);
  exchangesSubscription = bridge?.on("exchanges", applyExchanges);
  consumersSubscription = bridge?.on("consumers", applyConsumers);
  successSubscription = bridge?.on("success", (content) => { status.value = text(content); });
  errorSubscription = bridge?.on("error", (content) => {
    status.value = text(record(content).message || content, "RabbitMQ action failed.");
  });
  bridge?.init("rabbitQueueView");
});

onBeforeUnmount(() => {
  detailSubscription?.dispose();
  messagesSubscription?.dispose();
  bindingsSubscription?.dispose();
  exchangesSubscription?.dispose();
  consumersSubscription?.dispose();
  successSubscription?.dispose();
  errorSubscription?.dispose();
});
</script>

<template>
  <section
    class="route-workspace rabbit-queue-view"
    data-route="rabbitQueueView"
  >
    <header class="route-workspace__header">
      <div>
        <h1>{{ detail.queue || "RabbitMQ queue" }}</h1>
        <p class="route-workspace__subline">
          vhost {{ detail.vhost || "/" }} · ready {{ detail.messagesReady ?? "-" }}
        </p>
      </div>
      <UiButton
        type="button"
        @click="emit('refresh')"
      >
        Refresh queue
      </UiButton>
    </header>

    <div class="route-workbench__protocol-actions">
      <UiButton
        type="button"
        :variant="section === 'messages' ? 'primary' : 'default'"
        @click="loadMessages"
      >
        Messages
      </UiButton>
      <UiButton
        type="button"
        :variant="section === 'bindings' ? 'primary' : 'default'"
        @click="section = 'bindings'; emit('loadBindings')"
      >
        Bindings
      </UiButton>
      <UiButton
        type="button"
        :variant="section === 'exchanges' ? 'primary' : 'default'"
        @click="section = 'exchanges'; emit('loadExchanges')"
      >
        Exchanges
      </UiButton>
      <UiButton
        type="button"
        :variant="section === 'consumers' ? 'primary' : 'default'"
        @click="section = 'consumers'; emit('loadConsumers')"
      >
        Consumers
      </UiButton>
    </div>

    <template v-if="section === 'messages'">
      <div class="connection-view__grid">
        <UiInput
          v-model="count"
          label="Peek count"
          type="number"
        />
        <UiInput
          v-model="targetQueue"
          label="Target queue"
          :placeholder="queueChoices[0] || 'Queue for moving messages'"
        />
        <div class="route-workspace__actions">
          <UiButton
            type="button"
            @click="loadMessages"
          >
            Load
          </UiButton>
          <UiButton
            type="button"
            :disabled="selectedMessage == null || !targetQueue.trim()"
            @click="moveSelected"
          >
            Move selected
          </UiButton>
          <UiButton
            type="button"
            variant="danger"
            :disabled="selectedMessage == null"
            @click="deleteSelectedMessage"
          >
            Delete selected
          </UiButton>
        </div>
      </div>
      <div class="result-view__table-wrap">
        <table class="result-view__table">
          <thead>
            <tr>
              <th>Select</th>
              <th>Payload</th>
              <th
                v-for="column in columns"
                :key="column"
              >
                {{ column }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(message, index) in messages"
              :key="index"
            >
              <td>
                <input
                  v-model="selectedMessage"
                  type="radio"
                  name="rabbit-message"
                  :value="index"
                >
              </td>
              <td>{{ messageText(message) }}</td>
              <td
                v-for="column in columns"
                :key="column"
              >
                {{ json(message[column]) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <template v-else-if="section === 'bindings'">
      <div class="connection-view__grid">
        <UiInput
          v-model="bindingExchange"
          label="Exchange"
          placeholder="amq.default"
        />
        <UiInput
          v-model="bindingRoutingKey"
          label="Routing key"
        />
        <div class="route-workspace__actions">
          <UiButton
            type="button"
            @click="createBinding"
          >
            Create binding
          </UiButton>
          <UiButton
            type="button"
            variant="danger"
            :disabled="selectedBinding == null"
            @click="deleteSelectedBinding"
          >
            Delete selected
          </UiButton>
        </div>
      </div>
      <pre class="route-workbench__state">{{ json(bindings) }}</pre>
      <label
        v-for="(_binding, index) in bindings"
        :key="index"
        class="route-workspace__subline"
      >
        <input
          v-model="selectedBinding"
          type="radio"
          name="rabbit-binding"
          :value="index"
        >
        Binding {{ index + 1 }}
      </label>
    </template>

    <pre
      v-else
      class="route-workbench__state"
    >{{ json(section === 'exchanges' ? exchanges : consumers) }}</pre>

    <div class="connection-view__grid">
      <UiInput
        v-model="publishExchange"
        label="Publish exchange"
      />
      <UiInput
        v-model="routingKey"
        label="Publish routing key"
        :placeholder="detail.queue || 'Queue name'"
      />
      <label class="vsc-field vsc-field--wide">
        <span class="vsc-field__label">Publish payload</span>
        <textarea
          v-model="publishBody"
          class="console-view__editor"
          placeholder="Message body"
        />
      </label>
      <UiButton
        type="button"
        @click="publishMessage"
      >
        Publish message
      </UiButton>
    </div>

    <p
      v-if="status"
      class="route-workspace__status"
    >
      {{ status }}
    </p>
  </section>
</template>
