<template>
  <div>
    <div class="design-toolbar">
      <el-button @click="index.visible=true" type="primary" title="Insert" icon="el-icon-circle-plus-outline" size="mini" circle> </el-button>
    </div>
    <ux-grid :data="designData.editIndex" stripe style="width: 100%">
      <ux-table-column align="center" field="index_name" title="index_name" show-overflow-tooltip="true"></ux-table-column>
      <ux-table-column align="center" field="column_name" title="column_name" show-overflow-tooltip="true"></ux-table-column>
      <ux-table-column align="center" field="non_unique" title="non_unique" show-overflow-tooltip="true"></ux-table-column>
      <ux-table-column align="center" field="index_type" title="index_type" show-overflow-tooltip="true"></ux-table-column>
      <ux-table-column title="Operation" width="120">
        <template v-slot="{ row }">
          <el-button @click="deleteConfirm(row)" title="delete" type="danger" size="mini" icon="el-icon-delete" circle> </el-button>
        </template>
      </ux-table-column>
    </ux-grid>
    <el-dialog :title="'Add Index'" :visible.sync="index.visible" width="30%" top="3vh" size="mini">
      <el-form>
        <el-form-item label="Export File Type">
          <el-select v-model="index.type">
            <el-option :label="'UNIQUE'" value="UNIQUE"></el-option>
            <el-option :label="'INDEX'" value="INDEX"></el-option>
            <el-option :label="'PRIMARY KEY'" value="PRIMARY KEY"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="Column">
          <el-input v-model="index.column"></el-input>
        </el-form-item>
      </el-form>
      <span slot="footer" class="dialog-footer">
        <el-button type="primary" :loading="index.loading" @click="createIndex">Create</el-button>
        <el-button @click="index.visible=false">Cancel</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import { getVscodeEvent } from "../util/vscode";
import { wrapByDb } from "@/common/wrapper";
const vscodeEvent = getVscodeEvent();
export default {
  data() {
    return {
      designData: { indexs: [], table: null, dbType: null },
      index: {
        visible: false,
        loading: false,
        column: null,
        type: null,
      },
    };
  },
  mounted() {
    vscodeEvent
      .on("design-data", (data) => {
        console.log(123123)
        this.designData = data;
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
    deleteConfirm(row) {
      this.$confirm("Are you sure you want to delete this data?", "Warning", {
        confirmButtonText: "OK",
        cancelButtonText: "Cancel",
        type: "warning",
      }).then(() => {
        this.execute(
          `ALTER TABLE ${wrapByDb(
            this.designData.table,
            this.designData.dbType
          )} DROP INDEX ${row.index_name}`
        );
      });
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