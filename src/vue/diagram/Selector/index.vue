<template>
  <div>
    <p style="text-align: center; margin: 0 0 20px">Select Tables To Render</p>
    <div style="text-align: center">
      <el-transfer style="text-align: left; display: inline-block;" v-model="tables" filterable :titles="['Tables', 'Target']" :button-texts="['To left', 'To right']" :format="{ noChecked: '${total}',hasChecked: '${checked}/${total}' }" :data="data">
        <div slot="left-footer"></div>
        <template slot="right-footer">
          <el-button style="margin-left:70px" type="primary" @click="confirm">Confirm</el-button>
        </template>
      </el-transfer>
    </div>
  </div>
</template>

<script>
import { getVscodeEvent } from "../../util/vscode";
let vscodeEvent;
export default {
  name: "Selector",
  data() {
    return {
      nodeDataArray: [],
      data: [],
      tables: []
    };
  },
  destroyed() {
    vscodeEvent.destroy();
  },
  mounted() {
    vscodeEvent = getVscodeEvent();
    vscodeEvent.on("selector-load", nodeDataArray => {
      this.data = nodeDataArray.map(table => {
        return { ...table, label: table.key };
      });
      this.nodeDataArray = nodeDataArray;
    });
    vscodeEvent.emit("route-" + this.$route.name);
  },
  methods: {
    confirm() {
      if (this.tables.length == 0) {
        this.$message.error("You choose at least one table!");
        return;
      }
      localStorage.setItem(
        "gojs-data",
        JSON.stringify({
          nodeDataArray: this.nodeDataArray.filter(nodeData =>
            this.tables.includes(nodeData.key)
          ),
          copiesArrays: true,
          copiesArrayObjects: true,
          linkDataArray: []
        })
      );
      this.$router.push({ path: `/diagram`, query: { new: true } });
    }
  }
};
</script>

<style>
.el-transfer-panel {
  width: 250px !important;
  height: 700px !important;
}
.el-transfer-panel__list {
  height: 550px !important;
}
</style>