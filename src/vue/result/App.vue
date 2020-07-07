<template>
  <div id="app">
    <div class="hint">
      <!-- sql input -->
      <el-row style="margin-bottom: 10px;">
        <el-input type="textarea" :autosize="{ minRows:3, maxRows:5}" v-model="toolbar.sql" style="width:90vw">
        </el-input>
      </el-row>
      <!-- tool panel -->
      <el-row>
        <el-button type="primary" @click='count(toolbar.sql);'>Count</el-button>
        <el-button type="primary" @click='info.visible = false;execute(toolbar.sql);'>Execute</el-button>
        <el-tag>Table :</el-tag>
        <span v-if="result.table">
          {{result.table}}
        </span>
        <el-tag type="success">CostTime :</el-tag>
        <span v-text="toolbar.costTime"></span>ms
        <span v-if="result.table">, <el-tag type="warning">Row :</el-tag> {{result.data.length-1}},<el-tag type="danger"> Col :</el-tag> {{columnCount}}</span>
      </el-row>
      <!-- info panel -->
      <div v-if="info.visible ">
        <div v-if="info.error" class="info-panel" style="color:red" v-html="info.message"></div>
        <div v-if="!info.error" class="info-panel" style="color: green;" v-html="info.message"></div>
      </div>
    </div>
    <!-- talbe result -->
    <el-table id="dataTable" v-loading='table.loading' size='small' @sort-change="sort" element-loading-text="Loading Data" :row-class-name="tableRowClassName" ref="dataTable" :height="remainHeight" width="100vh" stripe :data="result.data.filter(data => !table.search || JSON.stringify(data).toLowerCase().includes(table.search.toLowerCase()))" border @row-dblclick="row=>openEdit(row)" @row-click="row=>updateEdit(row)">
      <!-- tool bar -->
      <el-table-column fixed="left" width="200" align="center">
        <template slot="header" slot-scope="scope">
          <el-input v-model="table.search" placeholder="Input To Search Data" />
        </template>
        <template slot-scope="scope">
          <div v-if="scope.row.isFilter" style="text-align: center;">
            <el-button @click="exportData()" type="primary" size="small" icon="el-icon-orange" circle title="Export"></el-button>
            <el-button type="info" icon="el-icon-circle-plus-outline" size="small" circle @click="insertRequest">
            </el-button>
            <el-popover placement="bottom" title="Select columns to show" width="200" trigger="click">
              <el-checkbox-group v-model="toolbar.showColumns">
                <el-checkbox v-for="(column,index) in result.fields" :label="column.name" :key="index">
                  {{column.name}}
                </el-checkbox>
              </el-checkbox-group>
              <el-button icon="el-icon-search" circle title="Select columns to show" size="small" slot="reference">
              </el-button>
            </el-popover>
            <el-button @click="resetFilter" title="Reset filter" type="warning" size="small" icon="el-icon-refresh" circle>
            </el-button>
          </div>
          <div v-if="result.primaryKey && scope.row[result.primaryKey]">
            <el-button @click="openEdit(scope.row)" type="primary" size="small" icon="el-icon-edit" title="edit" circle>
            </el-button>
            <el-button @click.stop="openCopy(scope.row)" type="info" size="small" title="copy" icon="el-icon-document-copy" circle>
            </el-button>
            <el-button @click="deleteConfirm(scope.row[result.primaryKey])" title="delete" type="danger" size="small" icon="el-icon-delete" circle>
            </el-button>
          </div>
        </template>
      </el-table-column>
      <!-- data  -->
      <el-table-column :label="field.name" v-for="(field,index) in result.fields" :key="index" align="center" sortable v-if="result.fields && field.name && toolbar.showColumns.includes(field.name.toLowerCase())" :width="computeWidth(field.name,0,index,toolbar.filter[field.name])">
        <template slot-scope="scope">
          <el-input v-if="scope.row.isFilter" v-model="toolbar.filter[field.name]" placeholder="filter" v-on:keyup.enter.native="filter($event,field.name)">
          </el-input>
          <span v-if="!scope.row.isFilter" v-html='dataformat(scope.row[field.name])'></span>
        </template>
      </el-table-column>
    </el-table>
    <el-dialog ref="editDialog" :title="editorTilte" :visible.sync="editor.visible" width="90%" top="3vh" size="small">
      <el-form ref="infoForm" :model="update.currentNew">
        <el-form-item :prop="column.name" :key="column.name" v-for="column in result.columnList" size="mini">
          <template>
            <span>
              {{column.name}} : {{column.type}} : <span style="color: red;">{{column.key}}{{column.nullable=='YES'?'':' Required'}}</span>&nbsp;
              {{column.comment?column.comment:''}}
            </span>
            <el-input v-model="update.currentNew[column.name]"></el-input>
          </template>
        </el-form-item>
      </el-form>
      <span slot="footer" class="dialog-footer">
        <el-button @click="editor.visible = false">Cancel</el-button>
        <el-button v-if="update.primary!=null" type="primary" :loading="editor.loading" @click="confirmUpdate">
          Update</el-button>
        <el-button v-if="update.primary==null" type="primary" :loading="editor.loading" @click="confirmInsert">
          Insert</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
const vscode =
  typeof acquireVsCodeApi != "undefined" ? acquireVsCodeApi() : null;
const postMessage = message => {
  if (vscode) {
    vscode.postMessage(message);
  }
};
export default {
  name: "App",
  data() {
    return {
      result: {
        data: [],
        sql: "",
        primaryKey: null,
        columnList: null,
        database: null,
        table: null,
        pageSize: null
      },
      page: {
        pageNum: 1,
        pageSize: -1,
        isEnd: false,
        lock: false
      },
      table: {
        search: "",
        loading: true,
        widthItem: {}
      },
      toolbar: {
        sql: null,
        costTime: 0,
        filter: {},
        showColumns: []
      },
      editor: {
        visible: false,
        loading: false
      },
      info: {
        sql: null,
        message: null,
        visible: false,
        error: false
      },
      update: {
        current: {},
        currentNew: {},
        primary: null
      }
    };
  },
  mounted() {
    setTimeout(() => {
      const table = document.querySelector(".el-table__fixed-body-wrapper");
      table.addEventListener("scroll", event => {
        if (
          table.scrollHeight -
            table.scrollTop -
            document.documentElement.clientHeight <=
          200
        ) {
          this.nextPage();
        }
      });
    }, 1000);
    const handlerData = (data, sameTable) => {
      this.result = data;
      this.toolbar.sql = data.sql;

      if (sameTable) {
        this.clear();
      } else {
        this.reset();
      }
    };

    const handlerCommon = res => {
      this.editor.loading = false;
      this.editor.visible = false;
      this.info.visible = true;
      this.info.message = res.message;
      // this.$message({ type: 'success', message: `EXECUTE ${res.sql} SUCCESS, affectedRows:${res.affectedRows}` });
    };

    window.addEventListener("message", ({ data }) => {
      if (!data) return;
      const response = data.res;
      this.table.loading = false;
      if (response && response.costTime) {
        this.toolbar.costTime = response.costTime;
      }
      switch (data.type) {
        case "RUN":
          this.toolbar.sql = response.sql;
          this.table.loading = true;
          break;
        case "DATA":
          handlerData(response);
          break;
        case "NEXT_PAGE":
          if (response.data && response.data.length > 0) {
            this.result.data.push(...response.data);
          } else {
            this.page.isEnd = true;
          }
          setTimeout(() => {
            this.page.lock = false;
          }, 100);
          break;
        case "DML":
        case "DDL":
          handlerCommon(response);
          this.info.error = false;
          this.refresh();
          break;
        case "ERROR":
          handlerCommon(response);
          this.info.error = true;
          break;
        case "MESSAGE":
          if (response.message) {
            if (response.success) {
              this.$message.success(response.message);
            } else {
              this.$message.error(response.message);
            }
          }
          this.refresh();
          break;
        default:
          this.$message(JSON.stringify(data));
      }
    });
    postMessage({ type: "init" });
  },
  methods: {
    exportData() {
      this.$confirm("Export without limit?", "Export", {
        confirmButtonText: "Yes",
        cancelButtonText: "No",
        type: "warning"
      })
        .then(() => {
          postMessage({
            type: "export",
            sql: this.result.sql.replace(/\blimit\b.+/gi, "")
          });
        })
        .catch(() => {
          postMessage({
            type: "export",
            sql: this.result.sql
          });
        });
    },
    filter(event, column) {
      let inputvalue = "" + event.target.value;

      let filterSql =
        this.result.sql.replace(/\n/, " ").replace(";", " ") + " ";

      let existsCheck = new RegExp(
        `(WHERE|AND)?\\s*\\b${column}\\b\\s*(=|is)\\s*.+?\\s`,
        "igm"
      );

      if (inputvalue) {
        const condition=inputvalue.toLowerCase()=="null"?`${column} is null`:`${column}='${inputvalue}'`;
        if (existsCheck.exec(filterSql)) {
          // condition present
          filterSql = filterSql.replace(
            existsCheck,
            `$1 ${condition} `
          );
        } else if (filterSql.match(/\bwhere\b/gi)) {
          //have where
          filterSql = filterSql.replace(
            /\b(where)\b/gi,
            `\$1 ${condition} AND `
          );
        } else {
          //have not where
          filterSql = filterSql.replace(
            new RegExp(`(from\\s*.+?)\\s`, "ig"),
            `\$1 WHERE ${condition} `
          );
        }
      } else {
        // empty value, clear filter
        let beforeAndCheck = new RegExp(`\\b${column}\\b\\s*(=|is)\\s*.+?\\s*AND`, "igm");
        if (beforeAndCheck.exec(filterSql)) {
          filterSql = filterSql.replace(beforeAndCheck, "");
        } else {
          filterSql = filterSql.replace(existsCheck, " ");
        }
      }

      this.execute(filterSql + ";");
    },
    resetFilter() {
      this.execute(
        this.result.sql.replace(/where.+?\b(order|limit|group)\b/gi, "$1")
      );
    },
    sort(row) {
      let order = row.order == "ascending" ? "asc" : "desc";
      let sortSql = this.result.sql
        .replace(/\n/, " ")
        .replace(";", "")
        .replace(/order by .+? (desc|asc)?/gi, "")
        .replace(
          /\s?(limit.+)?$/i,
          ` ORDER BY ${row.column.label} ${order} \$1 `
        );
      this.execute(sortSql + ";");
    },
    insertRequest() {
      this.editor.visible = true;
      this.update.primary = null;
      this.update.currentNew = {};
    },
    wrapQuote(columnName, value) {
      if(value==""){
        return "null";
      }
      if (typeof value == "string") {
        value = value.replace(/'/g, "\\'");
      }
      const type = this.getTypeByColumn(columnName).toLowerCase();
      switch (type) {
        case "varchar":
        case "char":
        case "date":
        case "time":
        case "timestamp":
        case "datetime":
        case "set":
        case "json":
          return `'${value}'`;
        default:
          if (
            type.indexOf("text") != -1 ||
            type.indexOf("blob") != -1 ||
            type.indexOf("binary") != -1
          ) {
            return `'${value}'`;
          }
      }
      return value;
    },
    getTypeByColumn(key) {
      if (!this.result.columnList) return;
      for (const column of this.result.columnList) {
        if (column.name == key) {
          return column.simpleType;
        }
      }
    },
    confirmInsert() {
      let columns = "";
      let values = "";
      for (const key in this.update.currentNew) {
        const newEle = this.update.currentNew[key];
        if (newEle!=null) {
          columns += `${this.wrap(key)},`;
          values += `${this.wrapQuote(key, newEle)},`;
        }
      }
      if (values) {
        const insertSql = `INSERT INTO ${this.result.table}(${columns.replace(
          /,$/,
          ""
        )}) VALUES(${values.replace(/,$/, "")})`;
        this.execute(insertSql);
      } else {
        this.$message("Not any input, update fail!");
      }
    },
    confirmUpdate() {
      let change = "";
      for (const key in this.update.currentNew) {
        const oldEle = this.update.current[key];
        const newEle = this.update.currentNew[key];
        if (oldEle != newEle) {
          change += `${this.wrap(key)}=${this.wrapQuote(key, newEle)},`;
        }
      }
      if (change) {
        const updateSql = `UPDATE ${this.result.table} SET ${change.replace(
          /,$/,
          ""
        )} WHERE ${this.result.primaryKey}=${this.wrapQuote(this.result.primaryKey,this.update.primary)}`;
        this.execute(updateSql);
      } else {
        this.$message("Not any change, update fail!");
      }
    },
    updateEdit(row) {
      if (row.isFilter) {
        return;
      }
      this.update = {
        current: row,
        currentNew: this.clone(row),
        primary: row[this.result.primaryKey]
      };
    },
    openEdit(row) {
      this.editor.visible = true;
    },
    openCopy(row) {
      this.updateEdit(row);
      this.update.currentNew[this.result.primaryKey] = null;
      this.update.primary = null;
      this.editor.visible = true;
    },
    deleteConfirm(primaryValue) {
      this.$confirm("Are you sure you want to delete this data?", "Warning", {
        confirmButtonText: "OK",
        cancelButtonText: "Cancel",
        type: "warning"
      })
        .then(() => {
          const deleteSql = `DELETE FROM ${this.result.table} WHERE ${this.result.primaryKey}=${this.wrapQuote(this.result.primaryKey,primaryValue)}`;
          this.execute(deleteSql);
        })
        .catch(() => {
          this.$message({ type: "info", message: "Update canceled" });
        });
    },
    tableRowClassName({ row, rowIndex }) {
      if (!this.result.primaryKey || !this.update.primary) return "";
      if (row[this.result.primaryKey] == this.update.primary) {
        return "edit-row";
      }
      return "";
    },
    computeWidth(key, index, keyIndex, value) {
      if (this.table.widthItem[keyIndex]) return this.table.widthItem[keyIndex];
      if (!index) index = 0;
      if (!this.result.data[index] || index > 10) return 60;
      if (!value) {
        value = this.result.data[index][key];
      }
      var dynamic = value ? (value + "").length * 10 : (key + "").length * 10;
      if (dynamic > 600) dynamic = 600;
      if (dynamic < 60) dynamic = 60;
      var nextDynamic = this.computeWidth(key, index + 1, keyIndex);
      if (dynamic < nextDynamic) dynamic = nextDynamic;
      this.table.widthItem[keyIndex] = dynamic;
      return dynamic;
    },
    celledit(row, column, cell, event) {
      if (row.isFilter) {
        return;
      }
      cell.contentEditable = true;
      if (this.result.primaryKey) {
        this.update.primary = row[this.result.primaryKey];
      }
    },
    refresh() {
      if (this.result.sql) {
        this.execute(this.result.sql);
      }
    },
    count(sql){
      this.info.visible = false;
      let countSql=sql.replace(/select (.+?) from/i,"SELECT count(*) FROM")
          .replace(/\blimit\b.+$/gi, "");
      this.execute(countSql)
    },
    execute(sql) {
      if (!sql) return;
      postMessage({
        type: "execute",
        sql: sql.replace(/ +/gi, " ")
      });
      this.table.loading = true;
    },
    deleteTemplate() {
      this.result.sql = `DELETE FROM [table] WHERE id= `;
    },
    dataformat0(origin) {
      if (origin == null) return null;
      if (origin.hasOwnProperty("type")) {
        return String.fromCharCode.apply(null, new Uint16Array(origin.data));
      }
      return origin;
    },
    wrap(origin) {
      if (origin == null) {
        return origin;
      }

      if (
        origin.match(/\b[-\.]\b/gi) ||
        origin.match(/^(if|key|desc|length)$/i)
      ) {
        return `\`${origin}\``;
      }

      return origin;
    },
    nextPage() {
      if (this.page.isEnd || this.page.lock) return;

      if (!this.result.sql.match(/^\s*select/i)) {
        return;
      }

      postMessage({
        type: "next",
        sql: this.result.sql,
        pageNum: ++this.page.pageNum,
        pageSize: this.page.pageSize
      });
      this.table.loading = true;
      this.page.lock = true;
    },
    dataformat(origin) {
      if (origin == undefined || origin == null) {
        return "<b>(NULL)</b>";
      }

      const preFormat = this.dataformat0(origin);
      if (preFormat != origin) return preFormat;

      return origin;
    },
    clone(obj) {
      let objClone = Array.isArray(obj) ? [] : {};
      if (obj && typeof obj === "object") {
        for (let key in obj) {
          if (obj.hasOwnProperty(key)) {
            objClone[key] = this.dataformat0(obj[key]);
          }
        }
      }
      return objClone;
    },
    initShowColumn() {
      const fields = this.result.fields;
      if (!fields) return;
      this.toolbar.showColumns = [];
      for (let i = 0; i < fields.length; i++) {
        if (!fields[i].name) continue;
        this.toolbar.showColumns.push(fields[i].name.toLowerCase());
      }
    },
    // show call when load same table data
    clear() {
      // reset page
      this.page.pageNum = 1;
      this.page.isEnd = false;
      this.page.lock = false;
      this.page.pageSize = this.result.pageSize;
      // info
      this.info.visible = false;
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
      if (this.result.columnList) {
        this.result.data.unshift({ isFilter: true, content: "" });
      }
      // toolbar
      if (!this.result.sql.match(/\bwhere\b/gi)) {
        this.toolbar.filter = {};
        this.$refs.dataTable.clearSort();
      }
    }
  },
  computed: {
    columnCount() {
      if (this.result.data == undefined || this.result.data[0] == undefined)
        return 0;
      return Object.keys(this.result.data[0]).length;
    },
    editorTilte() {
      if (this.update.primary == null) {
        return "Insert To " + this.result.table;
      }
      return (
        "Edit For " +
        this.result.table +
        " : " +
        this.result.primaryKey +
        "=" +
        this.update.primary
      );
    },
    remainHeight() {
      return window.innerHeight - 185;
    }
  }
};
</script>

<style>
body {
  /* background-color: var(--vscode-editor-background); */
  background-color: #f0f0f0;
  font-family: "Helvetica Neue", Helvetica, "PingFang SC", "Hiragino Sans GB",
    "Microsoft YaHei", Arial, sans-serif;
}

.hint {
  padding: 5px;
  font-size: 17px;
  color: #444;
  display: inline-block;
  margin-top: 8px;
}

.cell {
  overflow: hidden !important;
  text-overflow: unset !important;
  white-space: nowrap !important;
  user-select: text !important;
  padding: 1px !important;
}

.info-panel {
  color: #444;
  font-size: 14px;
  border: 1px solid #dcdfe6;
  border-radius: 5px;
  padding: 10px;
  margin-left: 6px;
}

/* 滚动条样式（高宽及背景）*/
::-webkit-scrollbar {
  background-color: #ccc;
  width: 12px;
  height: 12px;
}

/* 滚动条轨道（凹槽）样式*/
::-webkit-scrollbar-track {
  /* -webkit-box-shadow: inset 0 0 6px rgba(0,0,0,0.3);   */
  border-radius: 8px;
  background-color: #424242;
}

/* 滑块样式*/
::-webkit-scrollbar-thumb {
  border-radius: 8px;
  background-color: #b0b0b0;
}
::-webkit-scrollbar-thumb:hover {
  border-radius: 8px;
  background-color: #ccc;
}

.el-table .edit-row td {
  background: oldlace !important;
}

.el-textarea__inner,
.el-table,
.el-table tr,
.el-table th,
.el-dialog__header,
.el-el-dialog__body,
.el-dialog__footer {
  background-color: #f8f8f8;
}

.el-table--striped .el-table__body tr.el-table__row--striped td {
  background-color: #f0fdf0;
}

.el-table th.is-leaf {
  border: 1px solid #eae7e7;
  border-radius: 3px;
}
</style>