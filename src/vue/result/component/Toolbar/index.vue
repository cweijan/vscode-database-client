<template>
  <div class="toolbar">
    <el-button v-if="showFullBtn" @click="()=>$emit('sendToVscode','full')" type="primary" title="Full Result View" icon="el-icon-rank" size="mini" circle>
    </el-button>
    <el-input v-model="searchInput" size="mini" placeholder="Input To Search Data" style="width:200px" :clearable="true" />
    <el-button icon="icon-github" title="Star the project to represent support." @click='()=>$emit("sendToVscode", "openGithub")'></el-button>
    <el-button icon="el-icon-circle-plus-outline" @click="$emit('insert')" title="Insert new row"></el-button>
    <el-button icon="el-icon-delete" style="color:#f56c6c" @click="$emit('deleteConfirm');" title="delete"></el-button>
    <el-button icon="el-icon-bottom" @click="$emit('export');" style="color:#4ba3ff;" title="Export"></el-button>
    <el-button icon="el-icon-caret-right" title="Execute Sql" style="color: #54ea54;margin-left:0;" @click="$emit('run');"></el-button>
    <div style="display:inline-block;font-size:14px;padding-left: 8px;" class="el-pagination__total">
      Cost: {{costTime}}ms
    </div>
    <div style="display:inline-block">
      <el-pagination @size-change="changePageSize" @current-change="page=>$emit('changePage',page,true)" @next-click="()=>$emit('changePage',1)" @prev-click="()=>$emit('changePage',-1)" :current-page.sync="page.pageNum" :small="true" :page-size="page.pageSize"  :layout="page.total!=null?'prev,pager, next, total':'prev, next'" :total="page.total">
      </el-pagination>
    </div>
  </div>
</template>

<script>
export default {
  props: ["costTime", "search", "showFullBtn", "page"],
  data() {
    return {
      searchInput: null,
    };
  },
  methods: {
    changePageSize(size) {
      this.page.pageSize = size;
      vscodeEvent.emit("changePageSize", size);
      this.changePage(0);
    },
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
  margin-top: 3px;
  margin-bottom: 3px;
}

.el-button--mini.is-circle {
  padding: 6px;
}

.el-button--default {
  padding: 0;
  border: none;
  font-size: 19px;
  margin-left: 7px;
}

.el-button:focus{
  color: inherit !important;
  background-color: var(--vscode-editor-background);
}

.el-button:hover {
  color: #409eff !important;
  border-color: #c6e2ff;
  background-color: var(--vscode-editor-background);
}

.el-pagination {
  padding: 0;
}
>>> .el-input{
  bottom: 2px;
}
>>> .el-input--mini .el-input__inner{
  height: 24px;
}

</style>

<style>
.el-pagination span,.el-pagination li,
.btn-prev i,.btn-next i{
  line-height: 27px !important;
}
</style>