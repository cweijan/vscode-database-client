<template>
  <div>
    <template v-if="scope.row.isFilter">
      <el-input class='edit-filter' v-model="filterObj[scope.column.title]" :clearable='true' placeholder="Filter" @clear="filter(null,scope.column.title)" @keyup.enter.native="filter($event,scope.column.title)">
      </el-input>
    </template>
    <template v-else>
      <div class="edit-column" :contenteditable="editable" @input="editListen($event,scope)" @contextmenu.prevent="onContextmenu($event,scope)" @paste="onPaste" @focus="focus" @blur="bluer">
        <template v-if="result.dbType=='ElasticSearch'">
          <div v-html='dataformat(scope.row[scope.column.title])'>
          </div>
        </template>
        <template v-else-if="isNull">
          <span class='null-column'>{{nullText}}</span>
        </template>
        <template v-else>
          <span v-html='dataformat(scope.row[scope.column.title],scope.row.title)'></span>
        </template>
      </div>
    </template>
  </div>
</template>

<script>
import { util } from "../../mixin/util";
import { wrapByDb } from "@/common/wrapper";

export default {
  props: ["result", "scope", "editList", "filterObj"],
  mixins: [util],
  data() {
    return {
      nullText: '(NULL)',
    }
  },
  methods: {
    focus(e) {
      if (!this.isNull || e.srcElement.innerText != '(NULL)') return;
      this.nullText = ""
    },
    bluer(e) {
      if (!this.isNull || e.srcElement.innerText) return;
      this.nullText = '(NULL)';
    },
    dataformat(origin) {
      if (origin == undefined || origin == null) {
        return "<span class='null-column'>(NULL)</span>";
      }
      const originType = origin.constructor.name;

      if (origin.hasOwnProperty("type")) {
        return String.fromCharCode.apply(null, new Uint16Array(origin.data));
      }
      if (originType == "String") {
        return origin.replace(/ /g, "&nbsp;").replace(/</g, "&lt;");
      } else if (this.result.dbType == "PostgreSQL") {
        const type = this.getTypeByColumn(this.scope.column.title);
        if (type == 'ARRAY') {
          const parsedArray = JSON.stringify(origin).replace(/\[/g, '{').replace(/\]/g, '}');
          this.scope.row[this.scope.column.title] = parsedArray;
          return parsedArray;
        }
      }
      return origin;
    },
    onPaste(e) {
      let text = "";
      e.preventDefault();
      text = (e.originalEvent || e).clipboardData.getData("text/plain");
      e.clipboardData.setData("text/plain", "");
      setTimeout(() => {
        window.document.execCommand(
          "insertHTML",
          false,
          text.replace("/\x0D/g", "\\n")
        ); // /\x0D/g return ASCII
      }, 1);
    },
    editListen(event, scope) {
      const { row, column, rowIndex } = scope;
      const editList = this.editList.concat([]);
      if (!editList[rowIndex]) {
        editList[rowIndex] = { ...row };
        delete editList[rowIndex]._XID;
        // console.log(editList[rowIndex]);
      }
      editList[rowIndex][column.title] = event.target.textContent;
      this.$emit("sendToVscode", "dataModify");
      this.$emit("update:editList", editList);
    },
    getTypeByColumn(key) {
      if (!this.result.columnList) return;
      for (const column of this.result.columnList) {
        if (column.name === key) {
          return column.simpleType || column.type;
        }
      }
    },
    filter(event, column, operation) {
      const type = this.getTypeByColumn(column);
      let inputvalue = "" + (event ? event.target.value : "");
      if (this.result.dbType == "ElasticSearch") {
        this.$emit("sendToVscode", "esFilter", {
          match: { [column]: inputvalue },
        });
        return;
      }

      if (!operation) {
        if (this.isDbNumber(type)) {
          operation = "=";
        } else {
          operation = "like";
          if (inputvalue) inputvalue = `%${inputvalue}%`;
        }
      }
      let filterSql =
        this.result.sql.replace(/\n/, " ").replace(";", " ") + " ";

      let existsCheck = new RegExp(
        `(WHERE|AND)?\\s*\`?${column}\`?\\s*(=|is|>=|<=|<>|like)\\s*.+?\\s`,
        "igm"
      );

      if (inputvalue) {
        const condition =
          inputvalue.toLowerCase() === "null"
            ? `${column} is null`
            : `${wrapByDb(
              column,
              this.result.dbType
            )} ${operation} '${inputvalue.replace(/'/g, "''")}'`;
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
          `\\b${column}\\b\\s*(=|is|>=|<=|<>|like)\\s*.+?\\s*AND`,
          "igm"
        );
        if (beforeAndCheck.exec(filterSql)) {
          filterSql = filterSql.replace(beforeAndCheck, "");
        } else {
          filterSql = filterSql.replace(existsCheck, " ");
        }
      }
      this.$emit("execute", filterSql + ";");
    },
    onContextmenu(event, scope) {
      const { row, column } = scope;
      const name = column.title;
      const value = event.target.textContent;
      event.target.value = value;
      this.$contextmenu({
        items: [
          {
            label: this.$t("result.copy"),
            onClick: () => {
              this.$emit("sendToVscode", "copy", value);
            },
            divided: true,
          },
          {
            label: this.$t("result.editDialog"),
            onClick: () => {
              this.$emit("openEditor", row, false);
            },
          },
          {
            label: this.$t("result.copyDialog"),
            onClick: () => {
              this.$emit("openEditor", row, true);
            },
            divided: true,
          },
          {
            label: `Filter by ${name} = '${value}'`,
            onClick: () => {
              this.filter(event, name, "=");
            },
          },
          {
            label: "Filter by",
            divided: true,
            children: [
              {
                label: `Filter by ${name} > '${value}'`,
                onClick: () => {
                  this.filter(event, name, ">");
                },
              },
              {
                label: `Filter by ${name} >= '${value}'`,
                onClick: () => {
                  this.filter(event, name, ">=");
                },
                divided: true,
              },
              {
                label: `Filter by ${name} < '${value}'`,
                onClick: () => {
                  this.filter(event, name, "<");
                },
              },
              {
                label: `Filter by ${name} <= '${value}'`,
                onClick: () => {
                  this.filter(event, name, "<=");
                },
                divided: true,
              },
              {
                label: `Filter by ${name} LIKE '%${value}%'`,
                onClick: () => {
                  event.target.value = `%${value}%`;
                  this.filter(event, name, "LIKE");
                },
              },
              {
                label: `Filter by ${name} NOT LIKE '%${value}%'`,
                onClick: () => {
                  event.target.value = `%${value}%`;
                  this.filter(event, name, "NOT LIKE");
                },
              },
            ],
          },
        ],
        event,
        customClass: "class-a",
        zIndex: 3,
        minWidth: 230,
      });
      return false;
    },
  },
  computed: {
    isNull() {
      return this.scope.row[this.scope.column.title] == undefined;
    },
    editable() {
      return this.result.primaryKey && this.result.tableCount == 1;
    },
  },
};
</script>

<style >
.col--edit .plx-cell {
  text-align: unset !important;
}
.edit-column {
  padding-left: 10px !important;
}
.edit-column {
  height: 100%;
  line-height: 33px;
}
</style>