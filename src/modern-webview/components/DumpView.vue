<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";

import { WEBVIEW_BRIDGE_KEY, type BridgeDisposable } from "../bridge";
import type { DumpKind } from "../../modern/database/dumpService";
import UiInput from "./UiInput.vue";
import UiSelect from "./UiSelect.vue";

interface DumpProps {
  readonly dbType: string;
}

interface MysqlDumpForm {
  kind: "mysql";
  executablePath: string;
  outputPath: string;
  databases: string;
  tables: string;
  addDropTable: boolean;
  disableKeys: boolean;
  addLocks: boolean;
  addDropTrigger: boolean;
  noData: boolean;
  completeInsert: boolean;
  createOptions: boolean;
  routines: boolean;
  lockAllTables: boolean;
}

interface PostgresDumpForm {
  kind: "postgresql";
  executablePath: string;
  outputPath: string;
  statements: "copy" | "insert" | "column-insert";
  databases: string;
  schemas: string;
  tables: string;
  format: "file" | "custom" | "directory" | "tar";
  addDrop: boolean;
  useDropIfExists: boolean;
  createDatabase: boolean;
  schemaOnly: boolean;
  dataOnly: boolean;
}

type DumpForm = MysqlDumpForm | PostgresDumpForm;

const props = defineProps<DumpProps>();
const bridge = inject(WEBVIEW_BRIDGE_KEY);
const kind = ref<DumpKind>("mysql");
const title = ref("");
const platform = ref("");
const loading = ref(true);
const running = ref(false);
const status = ref("");
const dependencyMessage = ref("");
const mysqlForm = reactive<MysqlDumpForm>({
  kind: "mysql",
  executablePath: "",
  outputPath: "",
  databases: "",
  tables: "",
  addDropTable: true,
  disableKeys: true,
  addLocks: true,
  addDropTrigger: false,
  noData: false,
  completeInsert: false,
  createOptions: true,
  routines: false,
  lockAllTables: true,
});
const postgresForm = reactive<PostgresDumpForm>({
  kind: "postgresql",
  executablePath: "",
  outputPath: "",
  statements: "copy",
  databases: "",
  schemas: "public",
  tables: "",
  format: "file",
  addDrop: false,
  useDropIfExists: false,
  createDatabase: false,
  schemaOnly: false,
  dataOnly: false,
});
let subscriptions: BridgeDisposable[] = [];

const currentConfig = computed<DumpForm>(() => kind.value === "mysql"
  ? { ...mysqlForm }
  : { ...postgresForm });
const executablePath = computed<string>({
  get: () => currentConfig.value.executablePath,
  set: (value) => {
    mysqlForm.executablePath = value;
    postgresForm.executablePath = value;
  },
});
const outputPath = computed<string>({
  get: () => currentConfig.value.outputPath,
  set: (value) => {
    mysqlForm.outputPath = value;
    postgresForm.outputPath = value;
  },
});
const canRun = computed(() => {
  const form = currentConfig.value;
  return Boolean(form.executablePath.trim() && form.outputPath.trim() && form.databases.trim());
});

const statementOptions = [
  { value: "copy", label: "COPY" },
  { value: "insert", label: "INSERT" },
  { value: "column-insert", label: "Column INSERT" },
];
const formatOptions = [
  { value: "file", label: "Plain file" },
  { value: "custom", label: "Custom archive" },
  { value: "directory", label: "Directory" },
  { value: "tar", label: "Tar archive" },
];

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function postgresType(value: string): boolean {
  return [
    "PostgreSQL",
    "Redshift",
    "Kingbase",
    "GaussDB",
    "Cockroach",
    "PostgreCompatible",
  ].includes(value);
}

function applyInit(content: unknown): void {
  const source = record(content);
  const nextKind: DumpKind = source.kind === "postgresql" || postgresType(props.dbType)
    ? "postgresql"
    : "mysql";
  kind.value = nextKind;
  title.value = text(source.title, nextKind === "mysql" ? "Dump with mysqldump" : "Dump with pg_dump");
  platform.value = text(source.platform);
  if (nextKind === "mysql") {
    Object.assign(mysqlForm, {
      executablePath: text(source.executablePath),
      outputPath: text(source.outputPath),
      databases: text(source.databases),
      tables: text(source.tables),
      addDropTable: flag(source.addDropTable, true),
      disableKeys: flag(source.disableKeys, true),
      addLocks: flag(source.addLocks, true),
      addDropTrigger: flag(source.addDropTrigger, false),
      noData: flag(source.noData, false),
      completeInsert: flag(source.completeInsert, false),
      createOptions: flag(source.createOptions, true),
      routines: flag(source.routines, false),
      lockAllTables: flag(source.lockAllTables, true),
    });
  } else {
    const statements = text(source.statements, "copy");
    const format = text(source.format, "file");
    Object.assign(postgresForm, {
      executablePath: text(source.executablePath),
      outputPath: text(source.outputPath),
      statements: statements === "insert" || statements === "column-insert" ? statements : "copy",
      databases: text(source.databases),
      schemas: text(source.schemas, "public"),
      tables: text(source.tables),
      format: format === "custom" || format === "directory" || format === "tar" ? format : "file",
      addDrop: flag(source.addDrop, false),
      useDropIfExists: flag(source.useDropIfExists, false),
      createDatabase: flag(source.createDatabase, false),
      schemaOnly: flag(source.schemaOnly, false),
      dataOnly: flag(source.dataOnly, false),
    });
  }
  dependencyMessage.value = "";
  status.value = "";
  loading.value = false;
}

function choose(event: "executable" | "output"): void {
  bridge?.emit("dumpChoose", { event });
}

function setStatements(value: string): void {
  postgresForm.statements = value === "insert" || value === "column-insert" ? value : "copy";
}

function setFormat(value: string): void {
  postgresForm.format = value === "custom" || value === "directory" || value === "tar" ? value : "file";
}

function installDependency(): void {
  const command = postgresType(props.dbType)
    ? "pg_dump"
    : props.dbType === "MariaDB" ? "mariadb-dump" : "mysqldump";
  dependencyMessage.value = `Checking ${command}…`;
  bridge?.emit("installDependency", command);
}

function runDump(): void {
  if (!canRun.value || running.value) return;
  running.value = true;
  status.value = "Dumping…";
  bridge?.emit("dumpRun", currentConfig.value);
}

function reset(): void {
  loading.value = true;
  status.value = "";
  dependencyMessage.value = "";
  bridge?.emit("dumpInit");
}

onMounted(() => {
  subscriptions = [
    bridge?.on("dumpInit", applyInit),
    bridge?.on("dumpChoose", (content) => {
      const source = record(content);
      const event = text(source.event);
      const selectedPath = text(source.path);
      if (!selectedPath) return;
      if (event === "executable") {
        mysqlForm.executablePath = selectedPath;
        postgresForm.executablePath = selectedPath;
      }
      if (event === "output") {
        mysqlForm.outputPath = selectedPath;
        postgresForm.outputPath = selectedPath;
      }
    }),
    bridge?.on("dependencyStatus", (content) => {
      const source = record(content);
      dependencyMessage.value = text(source.message, source.installed === true
        ? `Dependency found: ${text(source.path)}`
        : "Dump dependency was not found.");
    }),
    bridge?.on("dumpResult", (content) => {
      const source = record(content);
      running.value = false;
      status.value = `Dump completed: ${text(source.outputPath)}`;
    }),
    bridge?.on("error", (content) => {
      const source = record(content);
      running.value = false;
      loading.value = false;
      status.value = text(source.message, text(content, "Dump request failed."));
    }),
  ].filter((item): item is BridgeDisposable => Boolean(item));
  bridge?.emit("dumpInit");
});

watch(() => props.dbType, (next, previous) => {
  if (next && next !== previous) bridge?.emit("dumpInit");
});

onBeforeUnmount(() => {
  for (const subscription of subscriptions) subscription.dispose();
});
</script>

<template>
  <section class="manager-dump">
    <header class="manager-dump__header">
      <div>
        <h2>{{ title || "Database dump" }}</h2>
        <p class="route-workspace__subline">
          Use the installed client executable; credentials stay in the process environment.
          <span v-if="platform"> · {{ platform }}</span>
        </p>
      </div>
      <div class="manager-dump__actions">
        <VscButton
          :disabled="loading || running"
          @click="reset"
        >
          Reset
        </VscButton>
        <VscButton
          :disabled="loading || running"
          @click="installDependency"
        >
          Check dependency
        </VscButton>
      </div>
    </header>

    <p
      v-if="status"
      class="route-workspace__status"
    >
      {{ status }}
    </p>
    <p
      v-if="dependencyMessage"
      class="route-workspace__subline manager-dump__dependency"
    >
      {{ dependencyMessage }}
    </p>

    <div
      v-if="loading"
      class="manager-dump__loading"
    >
      Loading dump configuration…
    </div>

    <template v-else>
      <div class="manager-dump__paths">
        <UiInput
          v-model="executablePath"
          label="Executable path"
          placeholder="mysqldump / mariadb-dump / pg_dump"
          :disabled="running"
        />
        <VscButton
          :disabled="running"
          @click="choose('executable')"
        >
          Choose executable
        </VscButton>
        <UiInput
          v-model="outputPath"
          label="Output path"
          placeholder="{data_source}-{timestamp}-dump.sql"
          :disabled="running"
        />
        <VscButton
          :disabled="running"
          @click="choose('output')"
        >
          Choose output
        </VscButton>
      </div>

      <div
        v-if="kind === 'mysql'"
        class="manager-dump__form"
      >
        <UiInput
          v-model="mysqlForm.databases"
          label="Databases"
          :disabled="running"
        />
        <UiInput
          v-model="mysqlForm.tables"
          label="Tables (space separated)"
          :disabled="running"
        />
        <div class="manager-dump__checks">
          <label><input
            v-model="mysqlForm.noData"
            type="checkbox"
          >
            Structure only
          </label>
          <label><input
            v-model="mysqlForm.addDropTable"
            type="checkbox"
          >
            Add drop table
          </label>
          <label><input
            v-model="mysqlForm.disableKeys"
            type="checkbox"
          >
            Disable keys
          </label>
          <label><input
            v-model="mysqlForm.addLocks"
            type="checkbox"
          >
            Add locks
          </label>
          <label><input
            v-model="mysqlForm.addDropTrigger"
            type="checkbox"
          >
            Add drop trigger
          </label>
          <label><input
            v-model="mysqlForm.completeInsert"
            type="checkbox"
          >
            Complete insert
          </label>
          <label><input
            v-model="mysqlForm.createOptions"
            type="checkbox"
          >
            Create options
          </label>
          <label><input
            v-model="mysqlForm.routines"
            type="checkbox"
          >
            Routines
          </label>
          <label><input
            v-model="mysqlForm.lockAllTables"
            type="checkbox"
          >
            Lock all tables
          </label>
        </div>
      </div>

      <div
        v-else
        class="manager-dump__form"
      >
        <UiSelect
          :model-value="postgresForm.statements"
          label="Statements"
          :options="statementOptions"
          :disabled="running"
          @update:model-value="setStatements"
        />
        <UiSelect
          :model-value="postgresForm.format"
          label="Format"
          :options="formatOptions"
          :disabled="running"
          @update:model-value="setFormat"
        />
        <UiInput
          v-model="postgresForm.databases"
          label="Databases"
          :disabled="running"
        />
        <UiInput
          v-model="postgresForm.schemas"
          label="Schemas (space separated)"
          :disabled="running"
        />
        <UiInput
          v-model="postgresForm.tables"
          label="Tables (space separated)"
          :disabled="running"
        />
        <div class="manager-dump__checks">
          <label><input
            v-model="postgresForm.schemaOnly"
            type="checkbox"
          >
            Schema only
          </label>
          <label><input
            v-model="postgresForm.addDrop"
            type="checkbox"
          >
            Clean existing objects
          </label>
          <label><input
            v-model="postgresForm.useDropIfExists"
            type="checkbox"
          >
            Use drop if exists
          </label>
          <label><input
            v-model="postgresForm.createDatabase"
            type="checkbox"
          >
            Create database
          </label>
          <label><input
            v-model="postgresForm.dataOnly"
            type="checkbox"
          >
            Data only
          </label>
        </div>
      </div>

      <footer class="manager-dump__footer">
        <span v-if="!canRun">Executable, output path and database are required.</span>
        <VscButton
          type="primary"
          :disabled="!canRun || running"
          @click="runDump"
        >
          {{ running ? "Dumping…" : "Run dump" }}
        </VscButton>
      </footer>
    </template>
  </section>
</template>
