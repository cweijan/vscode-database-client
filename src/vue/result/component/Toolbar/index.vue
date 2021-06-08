<template>
  <div class="toolbar">
    <el-button v-if="showFullBtn" @click="()=>$emit('sendToVscode','full')" type="primary" title="Full Result View" icon="el-icon-rank" size="mini" circle>
    </el-button>
    <el-input v-model="searchInput" size="mini" placeholder="Input To Search Data" style="width:200px" :clearable="true" />
    <i class="icon-github" title="Star the project to represent support." @click='()=>$emit("sendToVscode", "openGithub")'></i>
    <!-- :disabled="result.tableCount!=1"  -->
    <i class="el-icon-circle-plus-outline" @click="$emit('insert')" title="Insert new row"></i>
    <i class="el-icon-delete" @click="$emit('deleteConfirm');" title="delete"></i>
    <i class="el-icon-bottom" @click="$emit('export');" title="Export"></i>
    <i class="el-icon-caret-right" title="Execute Sql" @click="$emit('run');"></i>
    <div style="display:inline-block;font-size:14px;padding-left: 8px;" class="el-pagination__total">
      CostTime: {{costTime}}ms
    </div>
  </div>
</template>

<script>
export default {
  props: ["costTime", "search", "showFullBtn"],
  data() {
    return {
      searchInput: null,
    };
  },
  watch: {
    searchInput: function () {
      this.$emit("update:search", this.searchInput); // 将子组件的输入框的值传递给父组件 父组件需要用.sync
    },
  },
};
</script>

<style scoped>
.toolbar {
  display: inline-block;
}
.toolbar>i {
  margin-right: 3px;
  font-size: 19px;
}
</style>
