<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import { readWebviewBootstrap } from "../bootstrap";
import UiInput from "./UiInput.vue";
import UiSelect from "./UiSelect.vue";

interface RabbitRecord {
  readonly [key: string]: unknown;
}

interface RabbitMessage {
  readonly index: number;
  readonly payload: string;
  readonly payloadPreview: string;
  readonly propertiesPreview: string;
  readonly routingKey: string;
  readonly exchange: string;
  readonly redelivered: boolean;
  readonly properties: RabbitRecord;
  readonly raw: RabbitRecord;
}

interface RabbitBinding {
  readonly vhost: string;
  readonly source: string;
  readonly sourceLabel: string;
  readonly destination: string;
  readonly destinationType: string;
  readonly routingKey: string;
  readonly arguments: string;
  readonly propertiesKey: string;
}

interface RabbitExchange {
  readonly name: string;
  readonly label: string;
  readonly type: string;
}

interface RabbitConsumer {
  readonly consumerTag: string;
  readonly channel: string;
  readonly prefetchCount: string;
  readonly ackRequired: boolean;
  readonly exclusive: boolean;
}

interface RabbitDetail {
  queue?: string;
  vhost?: string;
  messagesReady?: unknown;
  queues?: unknown;
}

type RabbitSection = "messages" | "publish" | "bindings" | "addBinding" | "consumers";
type RabbitDialog = "payload" | "properties" | "target" | undefined;

const bridge = inject(WEBVIEW_BRIDGE_KEY);
const bootstrap = readWebviewBootstrap();

function record(value: unknown): RabbitRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as RabbitRecord
    : {};
}

function text(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value);
}

function json(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function compact(value: unknown): string {
  const result = json(value).replace(/\s+/g, " ").trim();
  return result.length > 120 ? `${result.slice(0, 120)}...` : result;
}

function records(value: unknown): RabbitRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function parseJsonRecord(value: string, label: string): RabbitRecord | undefined {
  if (!value.trim()) return {};
  try {
    return record(JSON.parse(value));
  } catch {
    status.value = `${label} must be valid JSON.`;
    return undefined;
  }
}

const initial = record(bootstrap.state);
const detail = reactive<RabbitDetail>({
  queue: typeof initial.queue === "string" ? initial.queue : "",
  vhost: typeof initial.vhost === "string" ? initial.vhost : "/",
  messagesReady: initial.messagesReady,
  queues: initial.queues,
});
const section = ref<RabbitSection>("messages");
const loadCount = ref("50");
const targetQueue = ref("");
const publishExchange = ref("amq.default");
const routingKey = ref("");
const deliveryMode = ref("2");
const publishHeaders = ref("");
const publishProperties = ref("");
const publishBody = ref("");
const bindingExchange = ref("");
const bindingRoutingKey = ref("");
const selectedMessages = ref<number[]>([]);
const messages = ref<RabbitMessage[]>([]);
const bindings = ref<RabbitBinding[]>([]);
const exchanges = ref<RabbitExchange[]>([]);
const consumers = ref<RabbitConsumer[]>([]);
const status = ref("");
const dialog = ref<RabbitDialog>();
const dialogRow = ref<RabbitMessage>();
const targetAction = ref<"move" | "send">("move");
const loading = ref(true);
const bindingsLoading = ref(false);
const consumersLoading = ref(false);
const moving = ref(false);
const publishing = ref(false);

const rabbitTabs: ReadonlyArray<{ id: RabbitSection; label: string; icon: string }> = [
  { id: "messages", label: "Messages", icon: "codicon codicon-arrow-down blue" },
  { id: "publish", label: "Publish", icon: "codicon codicon-debug-start green" },
  { id: "bindings", label: "Bindings", icon: "codicon codicon-link yellow" },
  { id: "addBinding", label: "Add binding", icon: "codicon codicon-add green" },
  { id: "consumers", label: "Consumers", icon: "codicon codicon-device-desktop purple" },
];
const pageSizeOptions = ["10", "30", "50", "100"];

let detailSubscription: BridgeDisposable | undefined;
let messagesSubscription: BridgeDisposable | undefined;
let bindingsSubscription: BridgeDisposable | undefined;
let exchangesSubscription: BridgeDisposable | undefined;
let consumersSubscription: BridgeDisposable | undefined;
let successSubscription: BridgeDisposable | undefined;
let errorSubscription: BridgeDisposable | undefined;

const queueChoices = computed(() => (
  Array.isArray(detail.queues) ? detail.queues.map(String).filter(Boolean) : []
));
const selectedMessageRows = computed(() => messages.value.filter((row) => selectedMessages.value.includes(row.index)));
const exchangeChoices = computed(() => {
  const values = [{ value: "amq.default", label: "amq.default" }];
  for (const exchange of exchanges.value) {
    if (exchange.name !== "amq.default") values.push({ value: exchange.name, label: exchange.label });
  }
  return values;
});

function emit(type: string, content?: unknown): void {
  bridge?.emit(type, content);
}

function mapMessages(value: unknown): RabbitMessage[] {
  return records(value).map((item, index) => {
    const properties = record(item.properties);
    return {
      index,
      payload: text(item.payload || item.body),
      payloadPreview: compact(item.payload || item.body || ""),
      propertiesPreview: compact(properties),
      routingKey: text(item.routing_key),
      exchange: text(item.exchange),
      redelivered: Boolean(item.redelivered),
      properties,
      raw: item,
    };
  });
}

function mapBindings(value: unknown): RabbitBinding[] {
  return records(value).map((item) => {
    const source = text(item.source);
    return {
      vhost: text(item.vhost, "/"),
      source,
      sourceLabel: source || "(AMQP default)",
      destination: text(item.destination),
      destinationType: text(item.destination_type),
      routingKey: text(item.routing_key),
      arguments: compact(item.arguments || {}),
      propertiesKey: text(item.properties_key || item.routing_key),
    };
  });
}

function mapExchanges(value: unknown): RabbitExchange[] {
  return records(value)
    .map((item): RabbitExchange => ({
      name: text(item.name),
      label: text(item.name),
      type: text(item.type),
    }))
    .filter((exchange) => exchange.name);
}

function mapConsumers(value: unknown): RabbitConsumer[] {
  return records(value).map((item) => {
    const channel = record(item.channel_details);
    return {
      consumerTag: text(item.consumer_tag),
      channel: channel.name ? `${text(channel.name)}:${text(channel.number)}` : "",
      prefetchCount: text(item.prefetch_count, "0"),
      ackRequired: Boolean(item.ack_required),
      exclusive: Boolean(item.exclusive),
    };
  });
}

function applyDetail(content: unknown): void {
  const next = record(content);
  Object.assign(detail, next);
  if (!targetQueue.value) targetQueue.value = text(next.queue);
  if (!routingKey.value) routingKey.value = text(next.queue);
  loading.value = false;
}

function applyMessages(content: unknown): void {
  const payload = record(content);
  messages.value = mapMessages(payload.messages);
  if ("messagesReady" in payload) detail.messagesReady = payload.messagesReady;
  selectedMessages.value = [];
  loading.value = false;
  moving.value = false;
}

function applyBindings(content: unknown): void {
  bindings.value = mapBindings(record(content).bindings);
  bindingsLoading.value = false;
}

function applyExchanges(content: unknown): void {
  exchanges.value = mapExchanges(record(content).exchanges);
}

function applyConsumers(content: unknown): void {
  consumers.value = mapConsumers(record(content).consumers);
  consumersLoading.value = false;
}

function loadMessages(): void {
  section.value = "messages";
  loading.value = true;
  emit("loadMessages", { count: Math.max(1, Number(loadCount.value) || 50) });
}

function selectSection(next: RabbitSection): void {
  section.value = next;
  if (next === "messages") {
    loadMessages();
  } else if (next === "bindings") {
    bindingsLoading.value = true;
    emit("loadBindings");
  } else if (next === "publish" || next === "addBinding") {
    emit("loadExchanges");
  } else {
    consumersLoading.value = true;
    emit("loadConsumers");
  }
}

function toggleMessage(index: number, checked: boolean): void {
  selectedMessages.value = checked
    ? [...new Set([...selectedMessages.value, index])]
    : selectedMessages.value.filter((selected) => selected !== index);
}

function openTargetDialog(action: "move" | "send"): void {
  if (selectedMessageRows.value.length === 0) {
    status.value = "Select at least one message first.";
    return;
  }
  targetAction.value = action;
  targetQueue.value = queueChoices.value[0] || "";
  dialog.value = "target";
}

function confirmTargetAction(): void {
  const target = targetQueue.value.trim();
  if (!target) {
    status.value = "Target queue is required.";
    return;
  }
  const indices = selectedMessageRows.value.map((message) => message.index);
  if (targetAction.value === "send") {
    emit("sendMessage", {
      messages: selectedMessageRows.value.map((message) => message.raw),
      targetQueue: target,
    });
  } else {
    emit("moveMessage", { indices, targetQueue: target });
  }
  moving.value = true;
  dialog.value = undefined;
}

function deleteSelectedMessage(): void {
  if (selectedMessageRows.value.length === 0) return;
  if (!window.confirm(`Delete ${selectedMessageRows.value.length} selected message(s)?`)) return;
  moving.value = true;
  emit("deleteMessage", { indices: selectedMessageRows.value.map((message) => message.index) });
}

async function copyText(value: unknown): Promise<void> {
  const content = json(value);
  try {
    await navigator.clipboard.writeText(content);
    status.value = "Copied.";
  } catch {
    emit("copyText", content);
  }
}

function openPayload(message: RabbitMessage): void {
  dialogRow.value = message;
  dialog.value = "payload";
}

function openProperties(message: RabbitMessage): void {
  dialogRow.value = message;
  dialog.value = "properties";
}

function publishMessage(): void {
  const payload = publishBody.value.trim();
  if (!payload) {
    status.value = "Message payload cannot be empty.";
    return;
  }
  const headers = parseJsonRecord(publishHeaders.value, "Headers");
  const properties = parseJsonRecord(publishProperties.value, "Properties");
  if (!headers || !properties) return;
  publishing.value = true;
  emit("publishMessage", {
    exchange: publishExchange.value || "amq.default",
    routingKey: routingKey.value.trim() || detail.queue,
    payload,
    deliveryMode: Number(deliveryMode.value) === 1 ? 1 : 2,
    headers,
    properties,
  });
}

function createBinding(): void {
  const exchange = bindingExchange.value.trim();
  if (!exchange) {
    status.value = "Select an exchange first.";
    return;
  }
  emit("createBinding", {
    exchange,
    routingKey: bindingRoutingKey.value,
  });
}

function deleteBinding(binding: RabbitBinding): void {
  if (!window.confirm(`Delete binding from ${binding.sourceLabel}?`)) return;
  bindingsLoading.value = true;
  emit("deleteBindings", { items: [{ source: binding.source, propertiesKey: binding.propertiesKey }] });
}

onMounted(() => {
  detailSubscription = bridge?.on("detail", applyDetail);
  messagesSubscription = bridge?.on("messages", applyMessages);
  bindingsSubscription = bridge?.on("bindings", applyBindings);
  exchangesSubscription = bridge?.on("exchanges", applyExchanges);
  consumersSubscription = bridge?.on("consumers", applyConsumers);
  successSubscription = bridge?.on("success", (content) => {
    status.value = text(content);
    moving.value = false;
    publishing.value = false;
  });
  errorSubscription = bridge?.on("error", (content) => {
    status.value = text(record(content).message || content, "RabbitMQ action failed.");
    loading.value = false;
    moving.value = false;
    publishing.value = false;
    bindingsLoading.value = false;
    consumersLoading.value = false;
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
    <div
      v-if="loading && section === 'messages' && messages.length === 0"
      class="rabbit-loading"
    >
      Refreshing...
    </div>
    <div class="rabbit-body">
      <ul
        id="rabbitMainTab"
        class="tab rabbit-main-tabs"
      >
        <li
          v-for="tab in rabbitTabs"
          :key="tab.id"
          class="tab__item"
          :class="{ 'tab__item--active': section === tab.id }"
          @click="selectSection(tab.id)"
        >
          <i
            class="panel-icon"
            :class="tab.icon"
            aria-hidden="true"
          />
          {{ tab.label }}
        </li>
      </ul>

      <div
        v-if="section === 'messages'"
        id="rabbitMessagesToolbar"
        class="rabbit-messages-tab"
      >
        <div class="rabbit-messages-toolbar">
          <div class="rabbit-messages-toolbar__left">
            <span class="rabbit-messages-stat">
              <i
                class="codicon codicon-inbox blue"
                aria-hidden="true"
              />
              <span class="rabbit-messages-stat__label">Messages ready</span>
              <strong class="rabbit-messages-stat__value">{{ detail.messagesReady ?? 0 }}</strong>
            </span>
            <span class="rabbit-messages-sep" />
            <label class="rabbit-messages-field">
              <span class="rabbit-messages-field__label">Load count</span>
              <select
                v-model="loadCount"
                class="field__input rabbit-messages-count"
              >
                <option
                  v-for="option in pageSizeOptions"
                  :key="option"
                  :value="option"
                >
                  {{ option }}
                </option>
              </select>
            </label>
            <VscButton
              title="Refresh"
              :disabled="moving"
              @click="loadMessages"
            >
              <i
                class="codicon codicon-refresh"
                aria-hidden="true"
              />
            </VscButton>
          </div>
          <div class="rabbit-messages-toolbar__right">
            <VscButton
              :disabled="selectedMessageRows.length === 0 || moving"
              @click="openTargetDialog('send')"
            >
              <i
                class="codicon codicon-arrow-up"
                aria-hidden="true"
              />
              Send
            </VscButton>
            <VscButton
              type="default"
              :disabled="selectedMessageRows.length === 0 || moving"
              @click="openTargetDialog('move')"
            >
              <i
                class="codicon codicon-arrow-right"
                aria-hidden="true"
              />
              Move
            </VscButton>
            <VscButton
              type="danger"
              :disabled="selectedMessageRows.length === 0 || moving"
              @click="deleteSelectedMessage"
            >
              <i
                class="codicon codicon-trash"
                aria-hidden="true"
              />
              Delete
            </VscButton>
          </div>
        </div>
        <div class="result-view__table-wrap rabbit-table-wrap">
          <table class="result-view__table">
            <thead>
              <tr>
                <th>Select</th>
                <th>Index</th>
                <th>Payload</th>
                <th>Properties</th>
                <th>Routing key</th>
                <th>Exchange</th>
                <th>Redelivered</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="message in messages"
                :key="message.index"
              >
                <td>
                  <input
                    :checked="selectedMessages.includes(message.index)"
                    type="checkbox"
                    :aria-label="`Select message ${message.index + 1}`"
                    @change="toggleMessage(message.index, ($event.target as HTMLInputElement).checked)"
                  >
                </td>
                <td>{{ message.index }}</td>
                <td>
                  <button
                    type="button"
                    class="rabbit-payload-cell"
                    :title="message.payload"
                    @click="openPayload(message)"
                  >
                    {{ message.payloadPreview || "-" }}
                  </button>
                </td>
                <td>
                  <button
                    type="button"
                    class="rabbit-payload-cell"
                    :title="message.propertiesPreview"
                    @click="openProperties(message)"
                  >
                    {{ message.propertiesPreview || "-" }}
                  </button>
                </td>
                <td class="rabbit-cell-ellipsis">
                  {{ message.routingKey }}
                </td>
                <td class="rabbit-cell-ellipsis">
                  {{ message.exchange }}
                </td>
                <td>
                  <span
                    class="rabbit-tag"
                    :class="{ 'rabbit-tag--warn': message.redelivered }"
                  >
                    {{ message.redelivered ? "Yes" : "No" }}
                  </span>
                </td>
              </tr>
              <tr v-if="messages.length === 0">
                <td
                  colspan="7"
                  class="rabbit-empty"
                >
                  <i
                    class="codicon codicon-inbox"
                    aria-hidden="true"
                  />
                  No messages
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div
        v-else-if="section === 'publish'"
        id="rabbitPublishForm"
        class="rabbit-publish-tab"
      >
        <div class="rabbit-publish-section">
          <div class="rabbit-publish-form rabbit-publish-form--inline">
            <label class="rabbit-publish-field rabbit-publish-field--inline">
              <span class="rabbit-publish-label">Exchange</span>
              <UiSelect
                :model-value="publishExchange"
                class="rabbit-publish-control"
                :options="exchangeChoices"
                @update:model-value="publishExchange = $event"
              />
            </label>
            <label class="rabbit-publish-field rabbit-publish-field--inline">
              <span class="rabbit-publish-label">Routing key</span>
              <UiInput
                v-model="routingKey"
                class="rabbit-publish-control"
              />
            </label>
            <label class="rabbit-publish-field rabbit-publish-field--inline">
              <span class="rabbit-publish-label">Delivery mode</span>
              <UiSelect
                :model-value="deliveryMode"
                class="rabbit-publish-control"
                :options="[{ value: '1', label: 'Non-persistent' }, { value: '2', label: 'Persistent' }]"
                @update:model-value="deliveryMode = $event"
              />
            </label>
          </div>
        </div>
        <div class="rabbit-publish-section">
          <div class="rabbit-publish-form">
            <label class="rabbit-publish-field rabbit-publish-field--grow">
              <span class="rabbit-publish-label">Headers (optional)</span>
              <textarea
                v-model="publishHeaders"
                class="field__input rabbit-publish-textarea"
                placeholder="{}"
              />
            </label>
            <label class="rabbit-publish-field rabbit-publish-field--grow">
              <span class="rabbit-publish-label">Properties (optional)</span>
              <textarea
                v-model="publishProperties"
                class="field__input rabbit-publish-textarea"
                placeholder="{}"
              />
            </label>
          </div>
        </div>
        <div class="rabbit-publish-section rabbit-publish-section--payload">
          <div class="rabbit-publish-section__header">
            <i
              class="codicon codicon-arrow-up green"
              aria-hidden="true"
            />
            <span class="rabbit-publish-label">Payload</span>
          </div>
          <textarea
            v-model="publishBody"
            class="console-view__editor rabbit-editor-panel"
            placeholder="Message body"
            spellcheck="false"
          />
        </div>
        <div class="rabbit-publish-footer">
          <VscButton
            :disabled="publishing"
            @click="publishMessage"
          >
            <i
              class="codicon codicon-arrow-up"
              aria-hidden="true"
            />
            Publish
          </VscButton>
        </div>
      </div>

      <div
        v-else-if="section === 'bindings'"
        class="rabbit-bindings-tab"
      >
        <div class="rabbit-toolbar">
          <VscButton
            :disabled="bindingsLoading"
            @click="selectSection('bindings')"
          >
            <i
              class="codicon codicon-refresh"
              aria-hidden="true"
            />
            Refresh
          </VscButton>
        </div>
        <div class="result-view__table-wrap rabbit-table-wrap">
          <table class="result-view__table">
            <thead>
              <tr>
                <th>Vhost</th>
                <th>Source</th>
                <th>Destination</th>
                <th>Destination type</th>
                <th>Routing key</th>
                <th>Arguments</th>
                <th>Operation</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="binding in bindings"
                :key="binding.propertiesKey"
              >
                <td>{{ binding.vhost }}</td>
                <td>{{ binding.sourceLabel }}</td>
                <td>{{ binding.destination }}</td>
                <td>{{ binding.destinationType }}</td>
                <td>{{ binding.routingKey }}</td>
                <td>{{ binding.arguments }}</td>
                <td>
                  <VscButton
                    type="danger"
                    title="Delete"
                    :disabled="bindingsLoading"
                    @click="deleteBinding(binding)"
                  >
                    <i
                      class="codicon codicon-trash"
                      aria-hidden="true"
                    />
                  </VscButton>
                </td>
              </tr>
              <tr v-if="bindings.length === 0">
                <td
                  colspan="7"
                  class="rabbit-empty"
                >
                  <i
                    class="codicon codicon-link"
                    aria-hidden="true"
                  />
                  No bindings
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div
        v-else-if="section === 'addBinding'"
        class="rabbit-add-binding-tab"
      >
        <section class="rabbit-add-binding-section">
          <div class="rabbit-add-binding-section__header">
            <i
              class="codicon codicon-add green"
              aria-hidden="true"
            />
            <span class="rabbit-add-binding-title">Add binding</span>
            <span class="rabbit-add-binding-hint">Choose an exchange and routing key.</span>
          </div>
          <div class="rabbit-add-binding-form">
            <label class="rabbit-publish-field">
              <span class="rabbit-publish-label">Exchange</span>
              <UiSelect
                :model-value="bindingExchange"
                class="rabbit-add-binding-control"
                :options="exchangeChoices"
                @update:model-value="bindingExchange = $event"
              />
            </label>
            <label class="rabbit-publish-field">
              <span class="rabbit-publish-label">Routing key</span>
              <UiInput
                v-model="bindingRoutingKey"
                class="rabbit-add-binding-control"
                placeholder="Routing key"
              />
            </label>
            <VscButton
              :disabled="exchanges.length === 0"
              @click="createBinding"
            >
              <i
                class="codicon codicon-add"
                aria-hidden="true"
              />
              Create binding
            </VscButton>
          </div>
          <div
            v-if="exchanges.length === 0"
            class="rabbit-empty rabbit-add-binding-empty"
          >
            No exchanges
          </div>
        </section>
      </div>

      <div
        v-else
        class="rabbit-consumers-tab"
      >
        <div class="rabbit-toolbar">
          <VscButton
            :disabled="consumersLoading"
            @click="selectSection('consumers')"
          >
            <i
              class="codicon codicon-refresh"
              aria-hidden="true"
            />
            Refresh
          </VscButton>
        </div>
        <div class="result-view__table-wrap rabbit-table-wrap">
          <table class="result-view__table">
            <thead>
              <tr>
                <th>Consumer tag</th>
                <th>Channel</th>
                <th>Prefetch</th>
                <th>Ack required</th>
                <th>Exclusive</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="consumer in consumers"
                :key="consumer.consumerTag"
              >
                <td class="rabbit-cell-ellipsis">
                  {{ consumer.consumerTag }}
                </td>
                <td class="rabbit-cell-ellipsis">
                  {{ consumer.channel }}
                </td>
                <td>{{ consumer.prefetchCount }}</td>
                <td>{{ consumer.ackRequired ? "Yes" : "No" }}</td>
                <td>{{ consumer.exclusive ? "Yes" : "No" }}</td>
              </tr>
              <tr v-if="consumers.length === 0">
                <td
                  colspan="5"
                  class="rabbit-empty"
                >
                  <i
                    class="codicon codicon-person"
                    aria-hidden="true"
                  />
                  No consumers
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p
        v-if="status"
        class="route-workspace__status"
      >
        {{ status }}
      </p>
    </div>

    <div
      v-if="dialog"
      class="rabbit-modal"
      role="presentation"
      @click.self="dialog = undefined"
    >
      <div
        class="rabbit-modal__panel"
        role="dialog"
        aria-modal="true"
      >
        <div class="rabbit-modal__header">
          <strong>
            {{ dialog === 'payload' ? 'Message payload' : dialog === 'properties' ? 'Message properties' : targetAction === 'send' ? 'Select target queue' : 'Move messages' }}
          </strong>
          <button
            type="button"
            class="rabbit-modal__close"
            @click="dialog = undefined"
          >
            ×
          </button>
        </div>
        <div class="rabbit-modal__body">
          <template v-if="dialog === 'target'">
            <label class="inline-block mr-10">
              <span class="common_input_label">Target queue</span>
              <UiSelect
                v-model="targetQueue"
                :options="queueChoices"
              />
            </label>
          </template>
          <template v-else>
            <div
              v-if="dialogRow && dialog === 'payload'"
              class="rabbit-payload-dialog__meta"
            >
              <span>Routing key: {{ dialogRow.routingKey || '-' }}</span>
              <span>Exchange: {{ dialogRow.exchange || '-' }}</span>
            </div>
            <pre class="rabbit-payload-editor">{{ dialog === 'payload' ? dialogRow?.payload : json(dialogRow?.properties) }}</pre>
            <VscButton
              type="default"
              @click="copyText(dialog === 'payload' ? dialogRow?.payload : dialogRow?.properties)"
            >
              <i
                class="codicon codicon-copy"
                aria-hidden="true"
              />
              Copy
            </VscButton>
          </template>
        </div>
        <div
          v-if="dialog === 'target'"
          class="rabbit-modal__footer"
        >
          <VscButton
            type="default"
            @click="dialog = undefined"
          >
            Cancel
          </VscButton>
          <VscButton @click="confirmTargetAction">
            Confirm
          </VscButton>
        </div>
      </div>
    </div>
  </section>
</template>
