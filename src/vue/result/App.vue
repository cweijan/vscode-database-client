<template>
  <div id="app">
    <div class="hint" ref="hint">
      <el-image v-if="result.showUgly" style="width: 225px; height: 300px" :src="result.uglyPath"></el-image>
      <div style="width:100%;" >
        <el-input type="textarea" :autosize="{ minRows:2, maxRows:6}" v-model="toolbar.sql" :style="{fontFamily:result.fontFamily,fontSize:result.fontSize+'px'}" class="sql-pannel" @keypress.native="panelInput" />
      </div>
      <Toolbar :page="page" :showFullBtn="showFullBtn" :search.sync="table.search" :result="result" @changePage="changePage" @sendToVscode="sendToVscode" @export="exportOption.visible = true" @insert="$refs.editor.openInsert()" @deleteConfirm="deleteConfirm" @run="info.message = false;execute(toolbar.sql);" />
      <div v-if="info.message ">
        <div v-if="info.error" class="info-panel" style="color:red !important" v-html="info.message"></div>
        <div v-if="!info.error" class="info-panel" style="color: green !important;" v-html="info.message"></div>
      </div>
    </div>
    <!-- trigger when click -->
    <ux-grid ref="dataTable" :data="filterData" v-loading='table.loading' size='small' :cell-style="{height: '35px'}" @sort-change="sort" :height="remainHeight" width="100vh" stripe :checkboxConfig="{ checkMethod: selectable}">
      <ux-table-column type="checkbox" width="40" fixed="left"></ux-table-column>
      <ux-table-column type="index" width="40" :seq-method="({row,rowIndex})=>(rowIndex||!row.isFilter)?rowIndex:undefined">
        <template #header>  
          <el-popover placement="bottom" width="200" trigger="hover" type="primary">
            <el-checkbox-group v-model="toolbar.showColumns">
              <el-checkbox v-for="(column,index) in result.fields" :label="column.name" :key="index">
                {{ column.name }}
              </el-checkbox>
            </el-checkbox-group>
            <!-- <el-button icon="el-icon-search" circle title="Select columns to show" size="mini" slot="reference">
            </el-button> -->
            <el-button icon="el-icon-search" title="Select columns to show."  slot="reference"/>
          </el-popover>
        </template>
        <!-- <Controller slot="header" :result="result" :toolbar="toolbar" /> -->
      </ux-table-column>
      <ux-table-column v-for="(field,index) in (result.fields||[]).filter(field=>toolbar.showColumns.includes(field.name))" :key="index" :resizable="true" :field="field.name" :title="field.name" :sortable="true" :width="computeWidth(field,0)" edit-render>
        <Header slot="header" slot-scope="scope" :result="result" :scope="scope" :index="index" />
        <Row slot-scope="scope" :scope="scope" :result="result" :filterObj="toolbar.filter" :editList.sync="update.editList" @execute="execute" @sendToVscode="sendToVscode" @openEditor="openEditor" />
      </ux-table-column>
    </ux-grid>
    <EditDialog ref="editor" :dbType="result.dbType" :result="result" :database="result.database" :table="result.table" :primaryKey="result.primaryKey" :primaryKeyList="result.primaryKeyList" :columnList="result.columnList" @execute="execute" />
    <ExportDialog :visible.sync="exportOption.visible" @exportHandle="confirmExport" />
  </div>
</template>

<script>
import { getVscodeEvent } from "../util/vscode";
import Row from "./component/Row";
import Controller from "./component/Row/Controller.vue";
import Header from "./component/Row/Header.vue";
import ExportDialog from "./component/ExportDialog.vue";
import Toolbar from "./component/Toolbar";
import EditDialog from "./component/EditDialog";
import { util } from "./mixin/util";
import { wrapByDb } from "@/common/wrapper";
let vscodeEvent;

export default {
  mixins: [util],
  components: {
    ExportDialog,
    EditDialog,
    Toolbar,
    Controller,
    Row,
    Header,
  },
  data() {
    return {
      showFullBtn: false,
      remainHeight: 0,
      connection: {},
      result: {
        data: [],
        dbType: "",
        single:true,
        costTime: 0,
        sql: "",
        primaryKey: null,
        columnList: null,
        columnTypeMap: null,
        primaryKeyList: null,
        database: null,
        table: null,
        tableCount: null,
      },
      page: {
        pageNum: 1,
        pageSize: -1,
        total: null,
      },
      table: {
        search: "",
        loading: true,
        widthItem: {},
      },
      toolbar: {
        sql: null,
        // using to clear filter input value
        filter: {},
        showColumns: [],
      },
      exportOption: {
        visible: false,
      },
      info: {
        sql: null,
        message: null,
        error: false,
        needRefresh: true,
      },
      update: {
        editList: {},
        lock: false,
      },
    };
  },
  mounted() {
    const hint=this.$refs.hint;
    const updateHeight=()=>{
      this.remainHeight = window.innerHeight -10 - hint.clientHeight ;
      this.showFullBtn = window.outerWidth / window.innerWidth >= 2;
    }
    updateHeight()
    new ResizeObserver(updateHeight).observe(hint)
    window.addEventListener("resize", updateHeight);
    const handlerData = (data, sameTable) => {
      this.result = data;
      this.toolbar.sql = data.sql;

      if (sameTable) {
        this.clear();
      } else {
        this.reset();
      }
      // only es have.
      if (data.total != null) {
        this.page.total = parseInt(data.total);
      } else if (
        this.result.tableCount == 1 &&
        this.page.pageSize < this.result.data.length + 1
      ) {
        this.count();
      } else {
        this.page.total = this.result.data.length - 1;
      }
      this.update.editList = [];
      this.update.lock = false;
    };
    const handlerCommon = (res) => {
      this.table.loading = false;
      if (this.$refs.editor) {
        this.$refs.editor.close();
      }
      this.info.message = res.message;
    };
    vscodeEvent = getVscodeEvent();

    vscodeEvent.on("updateSuccess", () => {
      this.update.editList = [];
      this.result.data=[]
      this.refresh()
      this.update.lock = false;
      this.$message({
        showClose: true,
        duration: 500,
        message: "Update Success",
        type: "success",
      });
    })
    .on("isSingle",(isSingle)=>{
      this.result.single=isSingle;
    })
    
    window.onkeypress = (e) => {
      if (
        (e.code == "Enter" && e.target.classList.contains("edit-column")) ||
        (e.ctrlKey && e.code == "KeyS")
      ) {
        this.save();
        e.stopPropagation();
        e.preventDefault();
      }
    };
    window.addEventListener("message", ({ data }) => {
      if (!data) return;
      console.log(data);
      const response = data.content;
      const runLoading=this.result.transId==null || (response && response.transId > this.result.transId);
      if(response){
        this.result.transId=response.transId; 
        if(response.language){
          this.$i18n.locale = response.language
        }
      }
      switch (data.type) {
        case "EXPORT_DONE":
          this.exportOption.visible = false;
          break;
        case "RUN":
          this.toolbar.sql = response.sql;
          this.table.loading = runLoading;
          break;
        case "DATA":
          handlerData(response);
          break;
        case "NEXT_PAGE":
          this.table.loading = false;
          this.result.data = response.data;
          this.result.costTime=response.costTime;
          this.toolbar.sql = response.sql;
          this.result.data.unshift({ isFilter: true, content: "" });
          break;
        case "COUNT":
          this.page.total = parseInt(response.data);
          break;
        case "DML":
        case "DDL":
        case "MESSAGE_BLOCK":
          handlerCommon(response);
          this.info.error = false;
          this.info.needRefresh = false;
          if (
            response.message.indexOf("AffectedRows") != -1 ||
            response.isInsert
          ) {
            this.refresh();
          }
          break;
        case "ERROR":
          handlerCommon(response);
          this.info.error = true;
          break;
        case "MESSAGE":
          if (response.message) {
            this.$message({
              showClose: true,
              duration: 1000,
              message: response.message,
              type: response.success ? "success" : "error",
            });
          }
          this.refresh();
          break;
      }
    });
    vscodeEvent.emit("init");
    window.addEventListener("keyup", (event) => {
      if (event.key == "c" && event.ctrlKey) {
        document.execCommand("copy");
      }
    });
  },
  methods: {
    panelInput(event){
      if(event.code=='Enter' && event.ctrlKey){
        this.execute(this.toolbar.sql)
        event.stopPropagation()
      }
    },
    selectable({row}) {
      return this.editable && !row.isFilter;
    },
    save() {
      if (Object.keys(this.update.editList).length == 0 && this.update.lock) {
        return;
      }
      this.update.lock = true;
      let sql = "";
      for (const index in this.update.editList) {
        const element = this.update.editList[index];
        sql += this.$refs.editor.buildUpdateSql(
          element,
          this.result.data[index]
        );
      }
      if (sql) {
        vscodeEvent.emit("saveModify", sql);
      }
    },
    sendToVscode(event, param) {
      vscodeEvent.emit(event, param);
    },
    openEditor(row, isCopy) {
      if (isCopy) {
        this.$refs.editor.openCopy(row);
      } else {
        this.$refs.editor.openEdit(row);
      }
    },
    confirmExport(exportOption) {
      vscodeEvent.emit("export", {
        option: {
          ...exportOption,
          sql: this.result.sql,
          table: this.result.table,
        },
      });
    },
    sort(row) {
      if (this.result.dbType == "ElasticSearch") {
        vscodeEvent.emit("esSort", [{ [row.prop]: { order: row.order } }]);
        return;
      }
      
      if(this.result.dbType == "MongoDB"){
        let sortSql = this.result.sql
        .replace(/.sort\(.+?\)/gi, "")
        .replace(/\s?(limit.+)?$/i, `sort({"${row.prop}": ${row.order.toLowerCase()=='desc'?-1:1}}).\$1 `);
        this.execute(sortSql);
        return;
      }

      let sortSql = this.result.sql
        .replace(/order by .+? (desc|asc)?/gi, "")
        .replace(/\s?(limit.+)?$/i, ` ORDER BY ${row.prop} ${row.order} \$1 `);
      this.execute(sortSql);
    },
    getTypeByColumn(key) {
      if (!this.result.columnList) return;
      for (const column of this.result.columnList) {
        if (column.name === key) {
          return column.simpleType || column.type;
        }
      }
    },
    deleteConfirm() {
      const datas = this.$refs.dataTable.getCheckboxRecords();
      if (!datas || datas.length == 0) {
        this.$message({
          type: "warning",
          message: this.$t("result.deleteNotice"),
        });
        return;
      }
      this.$confirm("Are you sure you want to delete this data?", "Warning", {
        confirmButtonText: "OK",
        cancelButtonText: "Cancel",
        type: "warning",
      })
        .then(() => {
          let checkboxRecords = datas
            .filter(
              (checkboxRecord) => checkboxRecord[this.result.primaryKey] != null
            )
            .map((checkboxRecord) =>
              this.wrapQuote(
                this.result.dbType,
                this.getTypeByColumn(this.result.primaryKey),
                checkboxRecord[this.result.primaryKey]
              )
            );
          let deleteSql = null;
          if (this.result.dbType == "ElasticSearch") {
            deleteSql =
              checkboxRecords.length > 1
                ? `POST /_bulk\n${checkboxRecords
                    .map(
                      (c) =>
                        `{ "delete" : { "_index" : "${this.result.table}", "_id" : "${c}" } }`
                    )
                    .join("\n")}`
                : `DELETE /${this.result.table}/_doc/${checkboxRecords[0]}`;
          } else if (this.result.dbType == "MongoDB") {
            deleteSql = `db('${this.result.database}').collection("${
              this.result.table
            }")
              .deleteMany({_id:{$in:[${checkboxRecords.join(",")}]}})`;
          } else {
            const table=wrapByDb(this.result.table,this.result.dbType);
            deleteSql =
              checkboxRecords.length > 1
                ? `DELETE FROM ${table} WHERE ${this.result.primaryKey} in (${checkboxRecords.join(",")})`
                : `DELETE FROM ${table} WHERE ${this.result.primaryKey}=${checkboxRecords[0]}`;
          }
          this.execute(deleteSql);
        })
        .catch((e) => {
          if (e) {
            this.$message.error(e);
          } else {
            this.$message({ type: "warning", message: "Delete canceled" });
          }
        });
    },
    /**
     * compute column row width, get maxium of fieldName or value or fieldType by top 10 row.
     */
    computeWidth(field, index) {
      // only compute once.
      let key = field.name;
      if (this.table.widthItem[key]) return this.table.widthItem[key];
      if (!index) index = 0;
      if (!this.result.data[index] || index > 10) return 70;
      const value = this.result.data[index][key];
      var dynamic = Math.max(
        (key + "").length * 10,
        (value + "").length * 10,
        (field.type + "").length * 10
      );
      if (dynamic > 150) dynamic = 150;
      if (dynamic < 70) dynamic = 70;
      var nextDynamic = this.computeWidth(field, index + 1);
      if (dynamic < nextDynamic) dynamic = nextDynamic;
      // cache column width
      this.table.widthItem[key] = dynamic;
      return dynamic;
    },
    refresh() {
      if (this.result.sql) {
        this.execute(this.result.sql);
      }
    },
    count() {
      if (!this.result.table) return;
      this.info.message = null;
      vscodeEvent.emit("count", { sql: this.result.sql });
    },
    execute(sql) {
      if (!sql) return;
      vscodeEvent.emit("execute", {
        sql,
      });
      this.table.loading = true;
    },
    changePage(pageNum, jump) {
      vscodeEvent.emit("next", {
        sql: this.result.sql,
        pageNum: jump ? pageNum : this.page.pageNum + pageNum,
        pageSize: this.page.pageSize,
      });
      this.table.loading = true;
    },

    initShowColumn() {
      const fields = this.result.fields;
      if (!fields) return;
      this.toolbar.showColumns = [];
      for (let i = 0; i < fields.length; i++) {
        if (!fields[i].name) continue;
        this.toolbar.showColumns.push(fields[i].name);
      }
    },
    // show call when load same table data
    clear() {
      // reset page
      this.page.pageNum = 1;
      this.page.pageSize = this.result.pageSize;
      this.page.total = null;
      // info
      if (this.info.needRefresh) {
        this.info.message = null;
      } else {
        this.info.needRefresh = true;
      }
      // loading
      this.table.loading = false;
    },
    // show call when change table
    reset() {
      this.clear();
      // table
      this.table.widthItem = {};
      this.initShowColumn();
      // add filter row
      if(!Array.isArray(this.result.data)){
        this.$message.error("Unrecognized data!")
      }else if (this.result.columnList) {
        this.result.data.unshift({ isFilter: true, content: "" });
      }
      // toolbar
      if (!this.result.sql.match(/\bwhere\b/gi)) {
        this.toolbar.filter = {};
        this.$refs.dataTable.clearSort();
      }
    },
  },
  computed: {
    filterData() {
      if(!Array.isArray(this.result.data))return[]
      return this.result.data.filter(
        (data) =>
          !this.table.search ||
          JSON.stringify(data)
            .toLowerCase()
            .includes(this.table.search.toLowerCase())
      );
    },
    editable() {
      return this.result.primaryKey && this.result.tableCount == 1;
    },
    columnCount() {
      if (this.result.data == undefined || this.result.data[0] == undefined)
        return 0;
      return Object.keys(this.result.data[0]).length;
    },
  },
};
</script>


<style scoped>
.el-button--default {
  padding: 0;
  border: none;
  font-size: 17px;
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

</style>