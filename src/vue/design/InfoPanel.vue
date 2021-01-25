<template>
  <div>
    <el-form>
      <el-form-item label="Table">
        <el-input v-model="table.name"></el-input>
      </el-form-item>
      <el-form-item label="Comment">
        <el-input v-model="table.comment"></el-input>
      </el-form-item>
      <el-button>Update</el-button>
    </el-form>
  </div>
</template>

<script>
import { getVscodeEvent } from "../util/vscode";
import { wrapByDb } from "@/common/wrapper";
let vscodeEvent;
export default {
  data() {
    return {
      designData: { table: null, dbType: null },
      table: {
        name: null,
        comment: null,
        visible: false,
        loading: false,
        type: null,
      },
    };
  },
  mounted() {
    vscodeEvent = getVscodeEvent();
    vscodeEvent
      .on("design-data", (data) => {
        this.designData = data;
        this.table.name = data.table;
        this.table.comment = data.comment;
        this.designData.editIndex = [...this.designData.indexs];
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
    execute(sql) {
      if (!sql) return;
      vscodeEvent.emit("execute", sql);
    },
  },
  destroyed() {
    vscodeEvent.destroy();
  },
};
</script>

<style>
</style>