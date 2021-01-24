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
    <div>
      <el-button class="m-2" @click="startCompare" title="Start Compare" type="danger" size="mini" v-loading="loading.compare">Compare
      </el-button>
      <template v-if="compareResult.sqlList">
        <el-card>
          <el-button @click="confrimSync" v-loading="loading.sync" title="Confrim Sync" type="success" size="mini">Sync
          </el-button>
          <ux-grid :data="compareResult.sqlList" :height="remainHeight" ref="dataTable" stripe style="width: 100%" @selection-change="selectionChange">
            <ux-table-column type="checkbox" width="40" fixed="left"> </ux-table-column>
            <ux-table-column align="center" width="60" field="type" title="type" show-overflow-tooltip="true"></ux-table-column>
            <ux-table-column align="center" field="sql" title="sql" show-overflow-tooltip="true"></ux-table-column>
          </ux-grid>
        </el-card>
      </template>
    </div>
  </div>
</template>

<script>
import { getVscodeEvent } from "../util/vscode";
const vscodeEvent = getVscodeEvent();
export default {
  data() {
    return {
      init: { nodes: [], databaseList: {} },
      option: { from: { connection: null, database: null }, to: {} },
      loading: { compare: false, sync: false },
      compareResult: { sqlList: null },
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
        this.loading.compare = false;
      })
      .on("syncSuccess", () => {
        this.$message.success("syncSuccess");
        this.loading.sync = false;
      })
      .on("success", () => {
        this.refresh();
      })
      .on("error", (msg) => {
        this.$message.error(msg);
        this.loading.sync = false;
      });
    vscodeEvent.emit("route-" + this.$route.name);
  },
  methods: {
    startCompare() {
      this.loading.compare = true;
      vscodeEvent.emit("start", this.option);
    },
    confrimSync() {
      const sqlList = this.$refs.dataTable.getCheckboxRecords();
      if (!sqlList || sqlList.length == 0) {
        this.$message.error("Need to select at least one sql!");
        return;
      }
      this.loading.sync = true;
      vscodeEvent.emit("sync", {
        sqlList: sqlList,
        option: this.option,
      });
    },
    selectionChange(selection) {
      // this.toolbar.show = selection.length > 0
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
      return window.outerHeight - 340;
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