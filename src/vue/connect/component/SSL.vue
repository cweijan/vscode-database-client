<template>
  <div>
    <section class="flex items-center mb-2">
      <div class="inline-block mr-10">
        <label class="font-bold mr-5 inline-block w-28">CA Certificate</label>
        <input class="w-52 field__input" placeholder="SSL CA Certificate Path" v-model="connectionOption.caPath" />
        <button @click="$emit('choose','caPath')" class=" w-12">Choose</button>
      </div>
    </section>
    <section class="flex items-center mb-2">
      <div class="inline-block mr-10">
        <label class="font-bold mr-5 inline-block w-28">Client Cert</label>
        <input class="w-52 field__input" placeholder="SSL Client Certificate Path" v-model="connectionOption.clientCertPath" />
        <button @click="$emit('choose','clientCertPath')" class=" w-12">Choose</button>
      </div>
      <div class="inline-block mr-10">
        <label class="font-bold mr-5 inline-block w-28">Client Key</label>
        <input class="w-52 field__input" placeholder="SSL Client Key Path" v-model="connectionOption.clientKeyPath" />
        <button @click="$emit('choose','clientKeyPath')" class=" w-12">Choose</button>
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