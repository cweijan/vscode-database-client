<template>
  <div>
    <div class="inline-block mr-10">
      <label class="font-bold mr-5 inline-block w-32">Encoding</label>
      <input class="w-64 field__input" placeholder="UTF8" required v-model="connectionOption.encoding" />
    </div>
    <div class="inline-block mr-10">
      <label class="font-bold mr-5 inline-block w-32">Show Hidden File</label>
      <el-switch v-model="connectionOption.showHidden"></el-switch>
    </div>
  </div>
</template>

<script>
export default {
  props: ["connectionOption"],
};
</script>

<style>
</style>