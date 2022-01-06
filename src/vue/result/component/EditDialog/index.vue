<template>
  <el-dialog ref="editDialog" :title="editorTilte" :visible.sync="visible" width="60%" top="3vh" size="mini" :closeOnClickModal="false">
    <el-form ref="infoForm" :model="editModel" :inline="true">
      <el-form-item :prop="column.name" :key="column.name" v-for="column in columnList" size="mini" :label="column.name">
        <template>
          <!-- <span>
            {{ column.name }} : {{ column.type }} &nbsp;
            <span style="color: red !important;">{{ column.key }}{{ column.nullable == 'YES' ? '' : ' NOT NULL' }}</span>&nbsp;
            <span>{{ column.defaultValue ? ` Default : ${column.defaultValue}` : "" }}</span>
            <span>{{ column.extra == "auto_increment" ? ` AUTO_INCREMENT` : "" }}</span>
          </span> -->
          <CellEditor v-if="editModel" v-model="editModel[column.name]" :type="column.type"></CellEditor>
        </template>
      </el-form-item>
    </el-form>
    <span slot="footer" class="dialog-footer">
      <el-button @click="showPreview" type="success">Preview</el-button>
      <el-button @click="visible = false">Cancel</el-button>
      <el-button v-if="model=='update'" type="primary" :loading="loading" @click="confirmUpdate(editModel)">
        Update</el-button>
      <el-button v-if="model=='insert'||model=='copy'" type="primary" :loading="loading" @click="confirmInsert(editModel)">
        Insert</el-button>
      <br /> <br /> <br />
      <div style="width:100%;" v-if="previewSQL">
        <el-input type="textarea" :autosize="{ minRows:2, maxRows:6}" v-model="previewSQL" class="sql-pannel" />
      </div>
    </span>
  </el-dialog>
</template>

<script>
import CellEditor from "./CellEditor.vue";
import { util } from "../../mixin/util";
import { buildInsertSQL, buildUpdateSql, getTypeByColumn } from '../../util/sqlGenerator';

export default {
  mixins: [util],
  components: { CellEditor },
  props: [
    "result",
    "dbType",
    "database",
    "table",
    "primaryKey",
    "primaryKeyList",
    "columnList",
  ],
  data() {
    return {
      previewSQL: null,
      model: "insert",
      originModel: {},
      editModel: {},
      visible: false,
      loading: false,
    };
  },
  methods: {
    openEdit(originModel) {
      this.previewSQL = null;
      if (!originModel) {
        this.$message.error("Edit row cannot be null!");
        return;
      }
      this.originModel = originModel;
      this.editModel = { ...originModel };
      this.model = "update";
      this.loading = false;
      this.visible = true;
    },
    openCopy(originModel) {
      this.previewSQL = null;
      if (!originModel) {
        this.$message.error("Edit row cannot be null!");
        return;
      }
      this.originModel = originModel;
      this.editModel = { ...originModel };
      this.editModel[this.primaryKey] = null;
      this.model = "copy";
      this.loading = false;
      this.visible = true;
    },
    openInsert() {
      this.previewSQL = null;
      if (this.result.tableCount != 1) {
        this.$message({
          type: "warning",
          message: "Not table found!",
        });
        return;
      }
      this.model = "insert";
      this.editModel = {};
      this.loading = false;
      this.visible = true;
    },
    showPreview() {
      this.previewSQL = this.model == "update" ? this.buildUpdateSql(this.editModel, this.originModel) : this.buildInsertSQL()
      if (!this.previewSQL) {
        this.previewSQL = "Not Any Change"
      }
    },
    close() {
      this.visible = false;
    },
    getTypeByColumn(key) {
      return getTypeByColumn(key, this.columnList)
    },
    confirmInsert() {
      const insertSQL = this.buildInsertSQL();
      if (insertSQL) {
        this.loading = true;
        this.$emit("execute", insertSQL);
      } else {
        this.$message("Not any input, insert fail!");
      }
    },
    buildInsertSQL(row) {
      if(!row)row=this.editModel;
      return buildInsertSQL({ row, dbType: this.dbType, database: this.database, table: this.table, columnList: this.columnList })
    },
    buildUpdateSql(currentNew, oldRow) {
      try {
        return buildUpdateSql({
          currentNew, oldRow, database: this.database, dbType: this.dbType, table: this.table, primaryKeyList: this.primaryKeyList,
          primaryKey: this.primaryKey, columnList: this.columnList, database: this.database
        })
      } catch (error) {
        this.$message.error(error);
        throw error;
      }
    },
    confirmUpdate(row, oldRow) {
      if (!oldRow) {
        oldRow = this.originModel;
      }
      const currentNew = row ? row : this.editModel;

      const sql = this.buildUpdateSql(currentNew, oldRow);
      if (sql) {
        this.$emit("execute", sql);
        this.loading = true;
      } else {
        this.$message("Not any change, update fail!");
      }
    }
  },
  computed: {
    editorTilte() {
      if (this.model == "insert") {
        return `Insert To ${this.table}`;
      } else if (this.model == "update") {
        return (`Edit For ${this.table} : ${this.primaryKey}=${this.originModel[this.primaryKey]}`);
      } else {
        return `Copy To ${this.table}`;
      }
    },
  },
};
</script>

<style>
</style>