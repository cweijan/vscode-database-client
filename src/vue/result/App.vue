<template>
  <div id="app">
    <div class="hint">
      <div style="width:95%;">
        <el-input type="textarea" :autosize="{ minRows:2, maxRows:5}" v-model="toolbar.sql" class="sql-pannel" />
      </div>
      <div class="toolbar">
        <el-button size="mini" icon="el-icon-loading" title="Buy the author a cup of coffee" circle @click='openCoffee'></el-button>
        <el-input v-model="table.search" size="mini" placeholder="Input To Search Data" style="width:200px" :clearable="true" />
        <el-button @click="$refs.editor.openInsert()" type="info" title="Insert new row" icon="el-icon-circle-plus-outline" size="mini" circle>
        </el-button>
        <el-button @click="$refs.editor.openEdit(update.current)" type="primary" size="mini" icon="el-icon-edit" title="edit" circle :disabled="!toolbar.show">
        </el-button>
        <el-button @click.stop="$refs.editor.openCopy(update.current)" type="info" size="mini" title="copy" icon="el-icon-document-copy" circle :disabled="!toolbar.show">
        </el-button>
        <el-button @click="deleteConfirm" title="delete" type="danger" size="mini" icon="el-icon-delete" circle :disabled="!toolbar.show">
        </el-button>
        <el-button @click="exportOption.visible = true" type="primary" size="mini" icon="el-icon-bottom" circle title="Export"></el-button>
        <el-button type="success" size="mini" icon="el-icon-caret-right" title="Execute Sql" circle @click='info.visible = false;execute(toolbar.sql);'></el-button>
        <div style="display:inline-block">
          <el-pagination @size-change="changePageSize" @current-change="page=>changePage(page,true)" @next-click="()=>changePage(1)" @prev-click="()=>changePage(-1)" :current-page.sync="page.pageNum" :small="true" :page-size="page.pageSize" :page-sizes="[100,200,300,400,500,1000]" :layout="page.total!=null?'sizes,prev,pager, next, total, jumper':'sizes,prev, next, jumper'" :total="page.total">
          </el-pagination>
        </div>
      </div>
      <div v-if="info.visible ">
        <div v-if="info.error" class="info-panel" style="color:red !important" v-html="info.message"></div>
        <div v-if="!info.error" class="info-panel" style="color: green !important;" v-html="info.message"></div>
      </div>
    </div>
    <!-- trigger when click -->
    <ux-grid ref="dataTable" v-loading='table.loading' size='small' :cell-style="{height: '35px'}" @sort-change="sort" :height="remainHeight" width="100vh" stripe @selection-change="selectionChange" :edit-config="{trigger: 'click', mode: 'row',autoClear:false}" :checkboxConfig="{ highlight: true}" :data="result.data.filter(data => !table.search || JSON.stringify(data).toLowerCase().includes(table.search.toLowerCase()))" @row-click="updateEdit" :show-header-overflow="false" :show-overflow="false">
      <ux-table-column type="checkbox" width="40" fixed="left"> </ux-table-column>
      <ux-table-column type="index" width="40" :seq-method="({row,rowIndex})=>(rowIndex||!row.isFilter)?rowIndex:undefined">
        <template slot="header" slot-scope="scope">
          <el-popover placement="bottom" title="Select columns to show" width="200" trigger="click" type="primary">
            <el-checkbox-group v-model="toolbar.showColumns">
              <el-checkbox v-for="(column,index) in result.fields" :label="column.name" :key="index">
                {{ column.name }}
              </el-checkbox>
            </el-checkbox-group>
            <el-button icon="el-icon-search" circle title="Select columns to show" size="mini" slot="reference">
            </el-button>
          </el-popover>
        </template>
      </ux-table-column>
      <ux-table-column v-if="result.fields && field.name && toolbar.showColumns.includes(field.name.toLowerCase())" v-for="(field,index) in result.fields" :key="index" :resizable="true" :field="field.name" :title="field.name" :sortable="true" :width="computeWidth(field.name,0,index,toolbar.filter[field.name])" edit-render>
        <template slot="header" slot-scope="scope">
          <el-tooltip class="item" effect="dark" :content="(result.columnList[index]&&result.columnList[index].comment)?result.columnList[index].comment:scope.column.title" placement="left-start">
            <span>
              <span v-if="result.columnList[index]&& (result.columnList[index].nullable != 'YES')" style="color: #f94e4e; position: relative; top: .2em;">
                *
              </span>
              {{ scope.column.title }}
            </span>
          </el-tooltip>
        </template>
        <template slot-scope="scope">
          <el-input class='edit-filter' v-if="scope.row.isFilter" v-model="toolbar.filter[scope.column.title]" :clearable='true' placeholder="Filter" @clear="filter(null,scope.column.title)" @keyup.enter.native="filter($event,scope.column.title)">
          </el-input>
          <span v-if="!scope.row.isFilter" v-html='dataformat(scope.row[scope.column.title])'></span>
        </template>
        <template slot="edit" slot-scope="scope">
          <el-input v-if="scope.row.isFilter" v-model="toolbar.filter[scope.column.title]" placeholder="Filter" v-on:keyup.enter.native="filter($event,scope.column.title)">
          </el-input>
          <el-input v-if="!scope.row.isFilter" v-model="scope.row[scope.column.title]" @keypress.enter.native="$refs.editor.confirmUpdate(scope.row)" :disabled="result.tableCount!=1"></el-input>
        </template>
      </ux-table-column>
    </ux-grid>
    <!-- table result -->
    <EditDialog ref="editor" :dbType="result.dbType" :table="result.table" :primaryKey="result.primaryKey" :columnList="result.columnList" @execute="execute" />
    <ExportDialog :visible.sync="exportOption.visible" @exportHandle="confirmExport" />
  </div>
</template>

<script>
import { getVscodeEvent } from "../util/vscode"
import CellEditor from "./component/CellEditor.vue"
import ExportDialog from "./component/ExportDialog.vue"
import EditDialog from "./component/EditDialog.vue"
import { util } from "./mixin/util"
import { wrapByDb } from "@/common/wrapper"
let vscodeEvent

export default {
  mixins: [util],
  components: {
    CellEditor,
    ExportDialog,
    EditDialog,
  },
  data() {
    return {
      connection: {},
      result: {
        data: [],
        dbType: "",
        sql: "",
        primaryKey: null,
        columnList: null,
        database: null,
        table: null,
        tableCount: null,
        pageSize: null,
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
        show: false,
        filter: {},
        showColumns: [],
      },
      exportOption: {
        visible: false,
      },
      info: {
        sql: null,
        message: null,
        visible: false,
        error: false,
        needRefresh: true,
      },
      update: {
        current: null,
        primary: null,
      },
    }
  },
  mounted() {
    const handlerData = (data, sameTable) => {
      this.result = data
      this.toolbar.sql = data.sql

      if (sameTable) {
        this.clear()
      } else {
        this.reset()
      }
      if (this.result.tableCount == 1) {
        this.count()
      }
    }
    const handlerCommon = (res) => {
      if (this.$refs.editor) {
        this.$refs.editor.close()
      }
      this.info.visible = true
      this.info.message = res.message
    }
    vscodeEvent = getVscodeEvent()
    window.addEventListener("message", ({ data }) => {
      if (!data) return
      const response = data.content
      this.table.loading = false
      switch (data.type) {
        case "EXPORT_DONE":
          this.exportOption.visible = false
          break
        case "RUN":
          this.toolbar.sql = response.sql
          this.table.loading = response.transId != this.result.transId
          break
        case "DATA":
          handlerData(response)
          break
        case "NEXT_PAGE":
          this.result.data = response.data
          this.toolbar.sql = response.sql
          break
        case "COUNT":
          this.page.total = parseInt(response.data)
          break
        case "DML":
        case "DDL":
          handlerCommon(response)
          this.info.error = false
          this.info.needRefresh = false
          this.refresh()
          break
        case "ERROR":
          handlerCommon(response)
          this.info.error = true
          break
        case "MESSAGE":
          if (response.message) {
            if (response.success) {
              this.$message.success(response.message)
            } else {
              this.$message.error(response.message)
            }
          }
          this.refresh()
          break
        default:
          this.$message(JSON.stringify(data))
      }
    })
    vscodeEvent.emit("init")
    window.addEventListener("keyup", (event) => {
      if (event.key == "c" && event.ctrlKey) {
        document.execCommand("copy")
      }
    })
  },
  methods: {
    openCoffee() {
      vscodeEvent.emit("openCoffee")
    },
    confirmExport(exportOption) {
      vscodeEvent.emit("export", {
        option: {
          ...exportOption,
          sql: this.result.sql,
          table: this.result.table,
        },
      })
    },
    filter(event, column) {
      let inputvalue = "" + (event ? event.target.value : "")

      let filterSql = this.result.sql.replace(/\n/, " ").replace(";", " ") + " "

      let existsCheck = new RegExp(`(WHERE|AND)?\\s*\`?${column}\`?\\s*(=|is)\\s*.+?\\s`, "igm")

      if (inputvalue) {
        const condition =
          inputvalue.toLowerCase() === "null"
            ? `${column} is null`
            : `${wrapByDb(column, this.result.dbType)}='${inputvalue}'`
        if (existsCheck.exec(filterSql)) {
          // condition present
          filterSql = filterSql.replace(existsCheck, `$1 ${condition} `)
        } else if (filterSql.match(/\bwhere\b/gi)) {
          //have where
          filterSql = filterSql.replace(/\b(where)\b/gi, `\$1 ${condition} AND `)
        } else {
          //have not where
          filterSql = filterSql.replace(new RegExp(`(from\\s*.+?)\\s`, "ig"), `\$1 WHERE ${condition} `)
        }
      } else {
        // empty value, clear filter
        let beforeAndCheck = new RegExp(`\\b${column}\\b\\s*(=|is)\\s*.+?\\s*AND`, "igm")
        if (beforeAndCheck.exec(filterSql)) {
          filterSql = filterSql.replace(beforeAndCheck, "")
        } else {
          filterSql = filterSql.replace(existsCheck, " ")
        }
      }

      this.execute(filterSql + ";")
    },
    changePageSize(size) {
      this.page.pageSize = size
      vscodeEvent.emit("changePageSize", size)
      this.changePage(0)
    },
    sort(row) {
      let sortSql = this.result.sql
        .replace(/\n/, " ")
        .replace(";", "")
        .replace(/order by .+? (desc|asc)?/gi, "")
        .replace(/\s?(limit.+)?$/i, ` ORDER BY ${row.prop} ${row.order} \$1 `)
      this.execute(sortSql + ";")
    },
    getTypeByColumn(key) {
      if (!this.result.columnList) return
      for (const column of this.result.columnList) {
        if (column.name === key) {
          return column.simpleType
        }
      }
    },
    updateEdit(row, column, event) {
      if (row.isFilter) {
        return
      }
      this.update.current = { ...row }
    },
    deleteConfirm() {
      this.$confirm("Are you sure you want to delete this data?", "Warning", {
        confirmButtonText: "OK",
        cancelButtonText: "Cancel",
        type: "warning",
      })
        .then(() => {
          let checkboxRecords = this.$refs.dataTable
            .getCheckboxRecords()
            .filter((checkboxRecord) => checkboxRecord[this.result.primaryKey] != null)
            .map((checkboxRecord) =>
              this.wrapQuote(this.getTypeByColumn(this.result.primaryKey), checkboxRecord[this.result.primaryKey])
            )
          const deleteSql =
            checkboxRecords.length > 1
              ? `DELETE FROM ${this.result.table} WHERE ${this.result.primaryKey} in (${checkboxRecords.join(",")})`
              : `DELETE FROM ${this.result.table} WHERE ${this.result.primaryKey}=${checkboxRecords[0]}`
          this.execute(deleteSql)
        })
        .catch((e) => {
          if (e) {
            this.$message.error(e)
          } else {
            this.$message({ type: "warning", message: "Delete canceled" })
          }
        })
    },
    computeWidth(key, index, keyIndex, value) {
      if (this.table.widthItem[keyIndex]) return this.table.widthItem[keyIndex]
      if (!index) index = 0
      if (!this.result.data[index] || index > 10) return 70
      if (!value) {
        value = this.result.data[index][key]
      }
      var dynamic = value ? (value + "").length * 10 : (key + "").length * 10
      if (dynamic > 600) dynamic = 600
      if (dynamic < 70) dynamic = 70
      var nextDynamic = this.computeWidth(key, index + 1, keyIndex)
      if (dynamic < nextDynamic) dynamic = nextDynamic
      this.table.widthItem[keyIndex] = dynamic
      return dynamic
    },
    refresh() {
      if (this.result.sql) {
        this.execute(this.result.sql)
      }
    },
    count() {
      if (!this.result.table) return
      this.info.visible = false
      vscodeEvent.emit("count", { sql: `SELECT count(*) count FROM ${this.result.table}` })
    },
    execute(sql) {
      if (!sql) return
      vscodeEvent.emit("execute", {
        sql: sql.replace(/ +/gi, " "),
      })
      this.table.loading = true
    },
    changePage(pageNum, jump) {
      if (!this.result.sql.match(/^\s*select/i)) {
        return
      }
      vscodeEvent.emit("next", {
        sql: this.result.sql,
        pageNum: jump ? pageNum : this.page.pageNum + pageNum,
        pageSize: this.page.pageSize,
      })
      this.table.loading = true
    },
    dataformat(origin) {
      if (origin == undefined || origin == null) {
        return "<span class='null-column'>(NULL)</span>"
      }
      if (origin.hasOwnProperty("type")) {
        return String.fromCharCode.apply(null, new Uint16Array(origin.data))
      }
      return origin
    },
    initShowColumn() {
      const fields = this.result.fields
      if (!fields) return
      this.toolbar.showColumns = []
      for (let i = 0; i < fields.length; i++) {
        if (!fields[i].name) continue
        this.toolbar.showColumns.push(fields[i].name.toLowerCase())
      }
    },
    // show call when load same table data
    clear() {
      // reset page
      this.page.pageNum = 1
      this.page.pageSize = this.result.pageSize
      this.page.total = null
      // info
      if (this.info.needRefresh) {
        this.info.visible = false
      } else {
        this.info.needRefresh = true
      }
      // loading
      this.table.loading = false
      // toolbar
      this.toolbar.show = false
    },
    selectionChange(selection) {
      this.toolbar.show = this.result.primaryKey && selection.length > 0 && this.result.tableCount == 1
    },
    // show call when change table
    reset() {
      this.clear()
      // table
      this.table.widthItem = {}
      this.initShowColumn()
      // add filter row
      if (this.result.columnList) {
        this.result.data.unshift({ isFilter: true, content: "" })
      }
      // toolbar
      if (!this.result.sql.match(/\bwhere\b/gi)) {
        this.toolbar.filter = {}
        this.$refs.dataTable.clearSort()
      }
    },
  },
  computed: {
    columnCount() {
      if (this.result.data == undefined || this.result.data[0] == undefined) return 0
      return Object.keys(this.result.data[0]).length
    },
    remainHeight() {
      return window.outerHeight - 230
    },
  },
}
</script>