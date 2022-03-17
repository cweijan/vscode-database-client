<template>
<div>
  <el-popover placement="bottom" title="Select columns to show" width="200" trigger="click" type="primary">
    <el-checkbox-group v-model="toolbar.showColumns">
      <el-checkbox v-for="(column,index) in result.fields" :label="column.name" :key="index">
        {{ column.name }}
      </el-checkbox>
    </el-checkbox-group>
    <el-button icon="el-icon-search" circle title="Select columns to show" size="mini" slot="reference">
    </el-button>
  </el-popover>
</div>
</template>

<script>
export default {
    props:['result','toolbar'],
    mounted(){
        console.log(this.result)
    }
};
</script>

<style>
</style>