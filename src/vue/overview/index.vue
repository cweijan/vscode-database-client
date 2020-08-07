<template>
  <div>
    <el-button type="primary" @click="refresh">refresh</el-button>
    <el-table :data="tableData" stripe style="width: 100%" :height="remainHeight">
      <el-table-column align="center" prop="table_name" label="table_name" ></el-table-column>
      <el-table-column align="center" prop="table_comment" label="table_comment"></el-table-column>
      <el-table-column align="center" prop="auto_increment" label="auto_increment" ></el-table-column>
      <el-table-column align="center" prop="create_time" label="create_time" width="180"></el-table-column>
      <el-table-column align="center" prop="update_time" label="update_time" width="180"></el-table-column>
      <el-table-column align="center" prop="engine" label="engine"></el-table-column>
      <el-table-column align="center" prop="table_rows" label="table_rows"></el-table-column>
      <el-table-column align="center" prop="data_length" label="data_length">
        <template slot-scope="scope">
          <span>{{prettyBytes(scope.row.data_length)}}</span>
        </template>
      </el-table-column>
      <el-table-column align="center" prop="index_length" label="index_length">
        <template slot-scope="scope">
          <span>{{prettyBytes(scope.row.index_length)}}</span>
        </template>
      </el-table-column>
      <el-table-column align="center" prop="table_collation" label="table_collation"></el-table-column>
      <el-table-column align="center" prop="row_format" label="row_format"></el-table-column>
    </el-table>
  </div>
</template>

<script>
import { getVscodeEvent } from "../util/vscode";
const prettyBytes = require("pretty-bytes");
let vscodeEvent;

export default {
  data() {
    return {
      tableData: []
    };
  },
  destroyed() {
    vscodeEvent.destroy();
  },
  mounted() {
    vscodeEvent = getVscodeEvent();
    vscodeEvent.on("overview-data", data => {
      console.log(data.infos);
      this.tableData = data.infos;
    });
    vscodeEvent.emit("route-" + this.$route.name);
  },
  methods: {
    prettyBytes,
    refresh() {
      vscodeEvent.emit("route-" + this.$route.name);
    }
  },
  computed: {
    remainHeight() {
      return window.outerHeight -130;
    }
  }
};
</script>