<template>
  <!-- <el-tooltip class="item" effect="dark" :content="getTip(result.columnTypeMap[scope.column.title],scope.column)" placement="left-start"> -->
    <div>
      <span>
        <span v-if="result.columnTypeMap[scope.column.title]&& (result.columnTypeMap[scope.column.title].nullable != 'YES')" style="color: #f94e4e; position: relative; top: .2em;">
          *
        </span>
        <span class="column-name">
          {{ scope.column.title }}
        </span>
      </span>
      <br />
      <span class="column-type" v-if="result.columnTypeMap[scope.column.title]">
        {{result.columnTypeMap[scope.column.title].type}}
      </span>
    </div>
  <!-- </el-tooltip> -->
</template>

<script>
export default {
  props: ["scope", "result","index"],
  methods: {
    getTip(column, scopeColumn) {
      if (!column || !column.comment) return scopeColumn.title;
      return column.comment;
    },
  },
};
</script>

<style>
</style>