<template>
  <div>
    <section class="flex items-center mb-2">
      <div class="inline-block mr-10">
        <label class="font-bold mr-5 inline-block w-32">CA Certificate</label>
        <input class="w-64 field__input" placeholder="SSL CA Certificate Path" v-model="connectionOption.caPath" />
      </div>
    </section>
    <section class="flex items-center mb-2">
      <div class="inline-block mr-10">
        <label class="font-bold mr-5 inline-block w-32">Client Cert</label>
        <input class="w-64 field__input" placeholder="SSL Client Certificate Path" v-model="connectionOption.clientCertPath" />
      </div>
      <div class="inline-block mr-10">
        <label class="font-bold mr-5 inline-block w-32">Client Key</label>
        <input class="w-64 field__input" placeholder="SSL Client Key Path" v-model="connectionOption.clientKeyPath" />
      </div>
    </section>
  </div>
</template>

<script>
export default {
  props: ["connectionOption"],
};
</script>

<style>
</style>