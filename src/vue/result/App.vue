<template>
  <div id="app">
    <div class="hint">
      <!-- sql input -->
      <el-row>
        <el-col :span="12">
          <el-input type="textarea" :autosize="{ minRows:3, maxRows:5}" v-model="toolbar.sql" style="width:100%">
          </el-input>
        </el-col>
        <el-col :span="11">
          <div style="width:90%;margin-left: 20px; height: 60px; line-height: 60px;">
            <template v-if="result.table">
              <el-tag>Table :</el-tag>
              <span>
                {{ result.table }}
              </span>
            </template>
            <el-tag type="success">CostTime :</el-tag>
            <span v-text="toolbar.costTime"></span>ms
            <span v-if="result.table">, <el-tag type="warning">Row :</el-tag>{{ result.data.length - 1 }}, <el-tag type="danger"> Col :</el-tag> {{ columnCount }}</span>
          </div>
        </el-col>
      </el-row>
      <div v-if="info.visible " >
        <div v-if="info.error" class="info-panel" style="color:red !important" v-html="info.message"></div>
        <div v-if="!info.error" class="info-panel" style="color: green !important;" v-html="info.message"></div>
      </div>
    </div>
    <!-- toolbar -->
    <div style="margin-bottom: 8px; margin-left: 20px;">
      <el-button type="success" size="small" @click='count(toolbar.sql);'>Count</el-button>
      <el-button type="primary" size="small" @click='info.visible = false;execute(toolbar.sql);'>Execute</el-button>
      <el-input v-model="table.search" placeholder="Input To Search Data" style="width:200px" />
      <el-button @click="exportData()" type="primary" size="small" icon="el-icon-share" circle title="Export"></el-button>
      <el-button type="info" icon="el-icon-circle-plus-outline" size="small" circle @click="insertRequest">
      </el-button>
      <el-popover placement="bottom" title="Select columns to show" width="200" trigger="click">
        <el-checkbox-group v-model="toolbar.showColumns">
          <el-checkbox v-for="(column,index) in result.fields" :label="column.name" :key="index">
            {{ column.name }}
          </el-checkbox>
        </el-checkbox-group>
        <el-button icon="el-icon-search" circle title="Select columns to show" size="small" slot="reference">
        </el-button>
      </el-popover>
      <el-button @click="resetFilter" title="Reset filter" type="warning" size="small" icon="el-icon-refresh" circle>
      </el-button>
      <template v-if="result.primaryKey && (toolbar.row[result.primaryKey]||toolbar.show)">
        <el-tag type="warning" style="margin:0 10px">Row :</el-tag>
        <el-button @click="openEdit(toolbar.row)" type="primary" size="small" icon="el-icon-edit" title="edit" circle>
        </el-button>
        <el-button @click.stop="openCopy(toolbar.row)" type="info" size="small" title="copy" icon="el-icon-document-copy" circle>
        </el-button>
        <el-button @click="deleteConfirm(toolbar.row[result.primaryKey])" title="delete" type="danger" size="small" icon="el-icon-delete" circle>
        </el-button>
      </template>
    </div>
    <!-- trigger when click -->
    <ux-grid ref="dataTable" v-loading='table.loading' size='small' :cell-style="{height: '35px'}" @sort-change="sort" @table-body-scroll="(_,e)=>scrollChange(e)" :height="remainHeight" width="100vh" stripe @select-all="toolbar.show=true" :edit-config="{trigger: 'click', mode: 'cell',autoClear:false}" :checkboxConfig="{ highlight: true}" :data="result.data.filter(data => !table.search || JSON.stringify(data).toLowerCase().includes(table.search.toLowerCase()))" @row-click="updateEdit" :show-header-overflow="false" :show-overflow="false">
      <ux-table-column type="checkbox" width="40" fixed="left" />
      <ux-table-column type="index" width="40" :seq-method="({row,rowIndex})=>(rowIndex||!row.isFilter)?rowIndex:undefined" />
      <ux-table-column v-if="result.fields && field.name && toolbar.showColumns.includes(field.name.toLowerCase())" v-for="(field,index) in result.fields" :key="index" :resizable="true" :field="field.name" :title="field.name" :sortable="true" :width="computeWidth(field.name,0,index,toolbar.filter[field.name])" edit-render>
        <template slot="header" slot-scope="scope">
          <el-tooltip class="item" effect="dark" :content="scope.column.title" placement="left-start">
            <span v-text="scope.column.title">
              {{ scope.column.title }}
            </span>
          </el-tooltip>
        </template>
        <template slot-scope="scope">
          <el-input v-if="scope.row.isFilter" v-model="toolbar.filter[scope.column.title]" placeholder="Filter" v-on:keyup.enter.native="filter($event,scope.column.title)">
          </el-input>
          <span v-if="!scope.row.isFilter" v-html='dataformat(scope.row[scope.column.title])'></span>
        </template>
        <template slot="edit" slot-scope="scope">
          <el-input v-if="scope.row.isFilter" v-model="toolbar.filter[scope.column.title]" placeholder="Filter" v-on:keyup.enter.native="filter($event,scope.column.title)">
          </el-input>
          <el-input v-if="!scope.row.isFilter" v-model="update.currentNew[scope.column.title]" @keypress.enter.native="confirmUpdate"></el-input>
        </template>
      </ux-table-column>
    </ux-grid>
    <!-- talbe result -->
    <el-dialog ref="editDialog" :title="editorTilte" :visible.sync="editor.visible" width="90%" top="3vh" size="small">
      <el-form ref="infoForm" :model="update.currentNew" :inline="true">
        <el-form-item :prop="column.name" :key="column.name" v-for="column in result.columnList" size="mini">
          <template>
            <span>
              {{ column.name }} : {{ column.type }} &nbsp;
              <span style="color: red !important;">{{ column.key }}{{ column.nullable == 'YES' ? '' : ' NOT NULL' }}</span>&nbsp;
              <span>{{ column.defaultValue ? ` Default : ${column.defaultValue}` : "" }}</span>
              <span>{{ column.extra == "auto_increment" ? ` AUTO_INCREMENT` : "" }}</span>
            </span>
            <template v-if="column.type=='date'">
              <br />
              <el-date-picker value-format="yyyy-MM-dd" v-model="update.currentNew[column.name]"></el-date-picker>
            </template>
            <template v-else-if="column.type=='time'">
              <br />
              <el-time-picker value-format="HH:mm:ss" v-model="update.currentNew[column.name]"></el-time-picker>
            </template>
            <template v-else-if="column.type=='datetime'">
              <br />
              <el-date-picker value-format="yyyy-MM-dd HH:mm:ss" type="datetime" v-model="update.currentNew[column.name]"></el-date-picker>
            </template>
            <el-input v-else="column.type" v-model="update.currentNew[column.name]"></el-input>
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
    <el-dialog :title="'Export Option'" :visible.sync="exportOption.visible" width="30%" top="3vh" size="small">
      <el-form :model="exportOption">
        <el-form-item label="Export File Type">
          <el-radio v-model="exportOption.type" label="excel">Excel</el-radio>
        </el-form-item>
        <el-form-item label="With Out Limit">
          <el-switch v-model="exportOption.withOutLimit"></el-switch>
        </el-form-item>
      </el-form>
      <span slot="footer" class="dialog-footer">
        <el-button type="primary" :loading="exportOption.loading" @click="confirmExport">Export</el-button>
        <el-button @click="exportOption.visible = false">Cancel</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import { getVscodeEvent } from "../util/vscode";
let vscodeEvent;

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
        pageSize: null,
      },
      page: {
        pageNum: 1,
        pageSize: -1,
        isEnd: false,
        lock: false,
      },
      table: {
        search: "",
        loading: true,
        widthItem: {},
      },
      toolbar: {
        row: {},
        sql: null,
        show: false,
        costTime: 0,
        filter: {},
        showColumns: [],
      },
      editor: {
        visible: false,
        loading: false,
      },
      exportOption: {
        visible: false,
        loading: false,
        type: "excel",
        withOutLimit: true,
      },
      info: {
        sql: null,
        message: null,
        visible: false,
        error: false,
        needRefresh: true,
      },
      update: {
        current: {},
        currentNew: {},
        primary: null,
      },
    };
  },
  mounted() {
    const handlerData = (data, sameTable) => {
      this.result = data;
      this.toolbar.sql = data.sql;

      if (sameTable) {
        this.clear();
      } else {
        this.reset();
      }
    };
    const handlerCommon = (res) => {
      this.editor.loading = false;
      this.editor.visible = false;
      this.info.visible = true;
      this.info.message = res.message;
      // this.$message({ type: 'success', message: `EXECUTE ${res.sql} SUCCESS, affectedRows:${res.affectedRows}` });
    };
    vscodeEvent = getVscodeEvent();
    window.addEventListener("message", ({ data }) => {
      if (!data) return;
      const response = data.content;
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
          this.info.needRefresh = false;
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
    vscodeEvent.emit("init");
    window.addEventListener("keyup", (event) => {
      if (event.key == "c" && event.ctrlKey) {
        document.execCommand("copy");
      }
    });
  },
  methods: {
    output(obj) {
      console.log(obj);
    },
    scrollChange(event) {
      const table = event.target;
      if (
        table.scrollHeight -
          table.scrollTop -
          document.documentElement.clientHeight <=
        50
      ) {
        this.nextPage();
      }
    },
    confirmExport() {
      vscodeEvent.emit("export", {
        option: {
          ...this.exportOption,
          sql: this.result.sql,
        },
      });
      this.exportOption.visible = false;
    },
    exportData() {
      this.exportOption.visible = true;
    },
    filter(event, column) {
      let inputvalue = "" + event.target.value;

      let filterSql =
        this.result.sql.replace(/\n/, " ").replace(";", " ") + " ";

      let existsCheck = new RegExp(
        `(WHERE|AND)?\\s*\`?${column}\`?\\s*(=|is)\\s*.+?\\s`,
        "igm"
      );

      if (inputvalue) {
        const condition =
          inputvalue.toLowerCase() === "null"
            ? `${column} is null`
            : `\`${column}\`='${inputvalue}'`;
        if (existsCheck.exec(filterSql)) {
          // condition present
          filterSql = filterSql.replace(existsCheck, `$1 ${condition} `);
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
        let beforeAndCheck = new RegExp(
          `\\b${column}\\b\\s*(=|is)\\s*.+?\\s*AND`,
          "igm"
        );
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
      let sortSql = this.result.sql
        .replace(/\n/, " ")
        .replace(";", "")
        .replace(/order by .+? (desc|asc)?/gi, "")
        .replace(/\s?(limit.+)?$/i, ` ORDER BY ${row.prop} ${row.order} \$1 `);
      this.execute(sortSql + ";");
    },
    insertRequest() {
      this.editor.visible = true;
      this.update.primary = null;
      this.update.currentNew = {};
    },
    wrapQuote(columnName, value) {
      if (value === "") {
        return "null";
      }
      if (/\(.*?\)/.exec(value)) {
        return value;
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
            type.indexOf("text") !== -1 ||
            type.indexOf("blob") !== -1 ||
            type.indexOf("binary") !== -1
          ) {
            return `'${value}'`;
          }
      }
      return value;
    },
    getTypeByColumn(key) {
      if (!this.result.columnList) return;
      for (const column of this.result.columnList) {
        if (column.name === key) {
          return column.simpleType;
        }
      }
    },
    confirmInsert() {
      let columns = "";
      let values = "";
      for (const key in this.update.currentNew) {
        if (this.getTypeByColumn(key) == null) continue;
        const newEle = this.update.currentNew[key];
        if (newEle != null) {
          columns += `\`${key}\`,`;
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
      if (!this.result.primaryKey) {
        this.$message.error("This table has not primary key, update fail!");
        return;
      }
      let change = "";
      for (const key in this.update.currentNew) {
        if (this.getTypeByColumn(key) == null) continue;
        const oldEle = this.update.current[key];
        const newEle = this.update.currentNew[key];
        if (oldEle !== newEle) {
          change += `\`${key}\`=${this.wrapQuote(key, newEle)},`;
        }
      }
      if (change) {
        const updateSql = `UPDATE ${this.result.table} SET ${change.replace(
          /,$/,
          ""
        )} WHERE ${this.result.primaryKey}=${this.wrapQuote(
          this.result.primaryKey,
          this.update.primary
        )}`;
        this.execute(updateSql);
      } else {
        this.$message("Not any change, update fail!");
      }
    },
    updateEdit(row, column, event) {
      if (row.isFilter) {
        return;
      }
      this.toolbar.row = row;
      this.update = {
        current: row,
        currentNew: this.clone(row),
        primary: row[this.result.primaryKey],
      };
      if (this.result.data.length > 24 && column.type != "checkbox") {
        // this.openEdit();
      }
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
        type: "warning",
      })
        .then(() => {
          let checkboxRecords = this.$refs.dataTable.getCheckboxRecords();
          if (checkboxRecords.length > 0) {
            checkboxRecords = checkboxRecords
              .filter(
                (checkboxRecord) =>
                  checkboxRecord[this.result.primaryKey] != null
              )
              .map((checkboxRecord) =>
                this.wrapQuote(
                  this.result.primaryKey,
                  checkboxRecord[this.result.primaryKey]
                )
              );
          }
          const deleteSql =
            checkboxRecords.length > 0
              ? `DELETE FROM ${this.result.table} WHERE ${
                  this.result.primaryKey
                } in (${checkboxRecords.join(",")})`
              : `DELETE FROM ${this.result.table} WHERE ${
                  this.result.primaryKey
                }=${this.wrapQuote(this.result.primaryKey, primaryValue)}`;
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
    tableRowClassName({ row, rowIndex }) {
      if (!this.result.primaryKey || !this.update.primary) return "";
      if (row[this.result.primaryKey] === this.update.primary) {
        return "edit-row";
      }
      return "";
    },
    computeWidth(key, index, keyIndex, value) {
      if (this.table.widthItem[keyIndex]) return this.table.widthItem[keyIndex];
      if (!index) index = 0;
      if (!this.result.data[index] || index > 10) return 70;
      if (!value) {
        value = this.result.data[index][key];
      }
      var dynamic = value ? (value + "").length * 10 : (key + "").length * 10;
      if (dynamic > 600) dynamic = 600;
      if (dynamic < 70) dynamic = 70;
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
    count(sql) {
      this.info.visible = false;
      let countSql = sql
        .replace(/select (.+?) from/i, "SELECT count(*) FROM")
        .replace(/\blimit\b.+$/gi, "");
      this.execute(countSql);
    },
    execute(sql) {
      if (!sql) return;
      vscodeEvent.emit("execute", {
        sql: sql.replace(/ +/gi, " "),
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

      if (!this.result.sql.match(/\blimit\b/i)) {
        this.page.isEnd = true;
        return;
      }

      if (!this.result.sql.match(/^\s*select/i)) {
        return;
      }

      vscodeEvent.emit("next", {
        sql: this.result.sql,
        pageNum: ++this.page.pageNum,
        pageSize: this.page.pageSize,
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
      if (this.info.needRefresh) {
        this.info.visible = false;
      } else {
        this.info.needRefresh = true;
      }
      // loading
      this.table.loading = false;
      // toolbar
      this.toolbar.row = {};
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
    },
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
      return window.outerHeight - 250;
    },
  },
};
</script>

<style>
body {
  /* background-color: var(--vscode-editor-background); */
  background-color: #f8f6f6;
  font-family: "Helvetica Neue", Helvetica, "PingFang SC", "Hiragino Sans GB",
    "Microsoft YaHei", Arial, sans-serif;
  padding: 0;
}

#tool-panel * {
  margin-right: 10px;
}

.title-info,
.plx-cell--title {
  user-select: all;
}

.hint {
  box-sizing: border-box;
  padding: 5px;
  padding-left: 20px;
  font-size: 17px;
  color: #444;
  width: 100vw;
  display: inline-block;
  margin-top: 8px;
}

.plx-cell,
.plx-cell--title {
  text-overflow: unset !important;
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
  background-color: var(--vscode-scrollbarSlider-background);
  width: 12px;
  height: 12px;
}

/* 滚动条轨道（凹槽）样式*/
::-webkit-scrollbar-track {
  /* -webkit-box-shadow: inset 0 0 6px rgba(0,0,0,0.3);   */
  /* border-radius: 8px; */
  /* background-color: #424242; */
  background-color: var(--vscode-editor-background);
}

/* 滑块样式*/
::-webkit-scrollbar-thumb {
  border-radius: 8px;
  background-color: var(--vscode-scrollbarSlider-background);
}

::-webkit-scrollbar-thumb:hover {
  border-radius: 8px;
  background-color: var(--vscode-scrollbarSlider-hoverBackground);
}
.plx-cell {
  padding: 0px !important;
  text-align: center !important;
}
.plx-table--body .el-input__inner {
  line-height: 35px !important;
  height: 35px !important;
}

.plx-cell span {
  margin: auto !important;
}
.plx-table.size--small .plx-cell--checkbox .plx-checkbox--icon,
.plx-table .plx-cell--checkbox .plx-checkbox--icon:before {
  height: 1.3em !important;
  width: 1.3em !important;
}
</style>