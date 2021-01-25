<template>
  <div>
    <div class="design-toolbar">
      <el-button @click="column.visible=true" type="primary" title="Insert" icon="el-icon-circle-plus-outline" size="mini" circle> </el-button>
    </div>
    <ux-grid :data="designData.editColumnList" stripe style="width: 100%" :cell-style="{height: '35px'}">
      <ux-table-column align="center" field="name" title="name" show-overflow-tooltip="true"></ux-table-column>
      <ux-table-column align="center" field="key" title="key" show-overflow-tooltip="true"></ux-table-column>
      <ux-table-column align="center" field="nullable" title="nullable" show-overflow-tooltip="true"></ux-table-column>
      <ux-table-column align="center" field="type" title="type" show-overflow-tooltip="true"></ux-table-column>
      <ux-table-column align="center" field="simpleType" title="simpleType" show-overflow-tooltip="true"></ux-table-column>
      <ux-table-column title="Operation" width="120">
        <template v-slot="{ row }">
          <el-button @click="deleteConfirm(row)" title="delete" type="danger" size="mini" icon="el-icon-delete" circle> </el-button>
        </template>
      </ux-table-column>
    </ux-grid>
    <el-dialog :title="'Add Column'" :visible.sync="column.visible" width="30%" top="3vh" size="mini">
      <el-form>
        <el-form-item label="Column Name">
          <el-input v-model="column.name"></el-input>
        </el-form-item>
        <el-form-item label="Column type">
          <el-input v-model="column.type"></el-input>
        </el-form-item>
      </el-form>
      <span slot="footer" class="dialog-footer">
        <el-button type="primary" :loading="column.loading" @click="createcolumn">Create</el-button>
        <el-button @click="column.visible=false">Cancel</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import { getVscodeEvent } from "../util/vscode";
import { wrapByDb } from "@/common/wrapper";
let vscodeEvent;
export default {
  data() {
    return {
      designData: {
        table: null,
        dbType: null,
        columnList: [],
        editColumnList: [],
      },
      column: {
        visible: false,
        loading: false,
        column: null,
        type: null,
      },
    };
  },
  mounted() {
    vscodeEvent = getVscodeEvent();
    vscodeEvent
      .on("design-data", (data) => {
        this.designData = data;
        this.designData.editColumnList = [...this.designData.columnList];
      })
      .on("success", () => {
        this.column.loading = false;
        this.column.visible = false;
        this.refresh();
      })
      .on("error", (msg) => {
        this.$message.error(msg);
      });
    vscodeEvent.emit("route-" + this.$route.name);
  },
  methods: {
    createcolumn() {
      this.column.loading = true;
      this.execute(
        `ALTER TABLE ${wrapByDb(
          this.designData.table,
          this.designData.dbType
        )} ADD ${wrapByDb(
          this.column.name,
          this.designData.dbType
        )} ${this.column.type}`
      );
    },
    deleteConfirm(row) {
      this.$confirm("Are you sure you want to delete this column?", "Warning", {
        confirmButtonText: "OK",
        cancelButtonText: "Cancel",
        type: "warning",
      }).then(() => {
        this.execute(
          `ALTER TABLE ${wrapByDb(
            this.designData.table,
            this.designData.dbType
          )} DROP COLUMN ${row.name}`
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