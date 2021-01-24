<template>
  <div>
    <div class="opt-panel">
      <el-form>
        <el-form-item label="Target">
          <el-select v-model="option.from.connection">
            <el-option :label="node.label" :value="node.label" :key="node.label" v-for="node in init.nodes"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="database">
          <el-select v-model="option.from.database">
            <el-option :label="db.label" :value="db.label" :key="db.label" v-for="db in init.databaseList[option.from.connection]"></el-option>
          </el-select>
        </el-form-item>
      </el-form>
    </div>
    <div class="opt-panel">
      <el-form>
        <el-form-item label="Sync From">
          <el-select v-model="option.to.connection">
            <el-option :label="node.label" :value="node.label" :key="node.label" v-for="node in init.nodes"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="database">
          <el-select v-model="option.to.database">
            <el-option :label="db.label" :value="db.label" :key="db.label" v-for="db in init.databaseList[option.to.connection]"></el-option>
          </el-select>
        </el-form-item>
      </el-form>
    </div>
    <el-button @click="startCompare" title="Start Compare" type="danger" size="mini">Start Compare
    </el-button>
    <el-button @click="sync" title="Confrim Sync" type="danger" size="mini">Confirm Sync
    </el-button>
  </div>
</template>

<script>
import { getVscodeEvent } from "../util/vscode";
import { wrapByDb } from "@/common/wrapper";
const vscodeEvent = getVscodeEvent();
export default {
  data() {
    return {
      init: {
        nodes: [],
        databaseList: {},
      },
      option: {
        from: { connection: null, database: null },
        to: {},
      },
      compareResult: { sqlList: [] },
      designData: { indexs: [], table: null, dbType: null },
      index: {
        visible: false,
        loading: false,
        column: null,
        type: null,
      },
      activePanel: "index",
    };
  },
  destroyed() {
    vscodeEvent.destroy();
  },
  mounted() {
    vscodeEvent
      .on("structDiff-data", (data) => {
        this.init = data;
      })
      .on("compareResult", (compareResult) => {
        this.compareResult = compareResult;
      })
      .on("syncSuccess", () => {
        this.$message.success("syncSuccess");
      })
      .on("success", () => {
        this.index.loading = false;
        this.index.visible = false;
        this.refresh();
      })
      .on("error", (msg) => {
        this.$message.error(msg);
      });
    vscodeEvent.emit("route-" + this.$route.name);
  },
  methods: {
    createIndex() {
      this.index.loading = true;
      this.execute(
        `ALTER TABLE ${wrapByDb(
          this.designData.table,
          this.designData.dbType
        )} ADD ${this.index.type} (${wrapByDb(
          this.index.column,
          this.designData.dbType
        )})`
      );
    },
    startCompare() {
      vscodeEvent.emit("start", this.option);
    },
    sync(){
      vscodeEvent.emit("sync",{sqlList:this.compareResult.sqlList,option:this.option})
    },
    execute(sql) {
      if (!sql) return;
      vscodeEvent.emit("execute", sql);
    },
    refresh() {
      vscodeEvent.emit("route-" + this.$route.name);
    },
  },
  computed: {
    remainHeight() {
      return window.outerHeight - 130;
    },
  },
};
</script>

<style>
.opt-panel {
  width: 400px;
  display: inline-block;
}
</style>