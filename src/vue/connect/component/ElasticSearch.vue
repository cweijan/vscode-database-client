<template>
  <div>
    <section class="mb-2">
      <div class="inline-block mr-10">
        <label class="font-bold mr-5 inline-block w-32"><span class="text-red-600 mr-1">*</span>
          <span>URL</span>
        </label>
        <input class="field__input" style="width:28rem" placeholder="The host of connection" required v-model="connectionOption.host" />
      </div>
    </section>
    <section class="mb-2">
      <section class="mb-2">
        <label class="font-bold mr-5 inline-block w-36">Basic Auth(Optional)</label>
        <el-radio v-model="connectionOption.esAuth" label="none">Not Auth</el-radio>
        <el-radio v-model="connectionOption.esAuth" label="account">Account</el-radio>
        <el-radio v-model="connectionOption.esAuth" label="token">Token</el-radio>
      </section>
    </section>
    <section class="mb-2" v-if="connectionOption.esAuth=='account'">
      <div class="inline-block mr-10" >
        <label class="font-bold mr-5 inline-block w-32">Username</label>
        <input class="w-64 field__input" placeholder="Username" required v-model="connectionOption.user" />
      </div>
      <div class="inline-block mr-10">
        <label class="font-bold mr-5 inline-block w-32">Password</label>
        <input class="w-64 field__input" placeholder="Password" type="password" v-model="connectionOption.password" />
      </div>
    </section>
    <section class="mb-2">
      <div class="inline-block mr-10" v-if="connectionOption.esAuth=='token'">
        <label class="font-bold mr-5 inline-block w-32">Token</label>
        <input class="field__input" style="width:40rem" placeholder="Basic Auth Token. e.g Bearer <token>" required v-model="connectionOption.esToken" />
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