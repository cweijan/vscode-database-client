<template>
  <div>
    <el-form>
      <el-form-item label="Table">
        <el-input v-model="table.name"></el-input>
      </el-form-item>
      <!-- <el-form-item label="Comment">
        <el-input v-model="table.comment"></el-input>
      </el-form-item> -->
      <el-button @click="rename">Update</el-button>
    </el-form>
  </div>
</template>

<script>
import { wrapByDb } from "@/common/wrapper";
import { inject } from "../mixin/vscodeInject";
export default {
  mixins: [inject],
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
    this.on("design-data", (data) => {
      this.designData = data;
      this.table.name = data.table;
      this.table.comment = data.comment;
      this.designData.editIndex = [...this.designData.indexs];
    })
      .on("success", () => {
        this.$message.success("Rename success!");
        this.refresh();
      })
      .on("error", (msg) => {
        this.$message.error(msg);
      })
      .init();
  },
  methods: {
    rename() {
      this.emit("rename", this.table.name);
    },
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
      this.emit("execute", sql);
    },
  },
};
</script>

<style>
</style>