<template>
  <div>
    <section class="mb-2">
      <section class="mb-2">
        <label class="font-bold mr-5 inline-block w-32">Scheme</label>
        <el-radio v-model="connectionOption.scheme" label="http">Http</el-radio>
        <el-radio v-model="connectionOption.scheme" label="https">Https</el-radio>
      </section>
      <div class="inline-block mr-10">
        <label class="font-bold mr-5 inline-block w-32"><span class="text-red-600 mr-1">*</span>
          <span v-if="connectionOption.dbType=='ElasticSearch'">URL</span>
          <span v-if="connectionOption.dbType!='ElasticSearch'">Host</span>
        </label>
        <input class="w-64 field__input" placeholder="The host of connection" required v-model="connectionOption.host" />
      </div>
    </section>
    <section class="mb-2">
      <div class="inline-block mr-10" v-if="connectionOption.dbType!='Redis'">
        <label class="font-bold mr-5 inline-block w-32"><span class="text-red-600 mr-1" v-if="connectionOption.dbType!='ElasticSearch'">*</span>Username</label>
        <input class="w-64 field__input" placeholder="Username" required v-model="connectionOption.user" />
      </div>
      <div class="inline-block mr-10">
        <label class="font-bold mr-5 inline-block w-32"><span class="text-red-600 mr-1" v-if="connectionOption.dbType!='ElasticSearch'">*</span>Password</label>
        <input class="w-64 field__input" placeholder="Password" type="password" v-model="connectionOption.password" />
      </div>
    </section>
    <div class="inline-block mr-10">
      <label class="font-bold mr-5 inline-block w-32">ConnectTimeout</label>
      <input class="w-64 field__input" placeholder="2000" required v-model="connectionOption.connectTimeout" />
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