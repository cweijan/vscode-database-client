<template>
  <div>
    <div>
      <section class="mb-2" v-if="!sqliteState">
        <div class="font-bold mr-5 inline-block w-1/4">
          <el-alert title="sqlite not installed" type="warning" show-icon />
        </div>
        <div class="font-bold mr-5 inline-block w-36">
          <button class="button button--primary w-128 inline" @click="install">Install Sqlite</button>
        </div>
      </section>
      <section class="mb-2">
        <div class="inline-block mr-10">
          <label class="font-bold mr-5 inline-block w-28">SQLite File Path</label>
          <input class="w-80 field__input" placeholder="SQLite File Path" v-model="connectionOption.dbPath" />
          <button class="button button--primary w-128 inline" @click="choose('sqlite')">Choose Database File</button>
        </div>
      </section>
    </div>
  </div>
</template>

<script>
export default {
  props: ["connectionOption","sqliteState"],
  methods:{
    install(){
      this.$emit("installSqlite")
    }
  }
};
</script>

<style>
</style>