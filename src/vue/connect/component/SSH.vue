<template>
  <div>
    <section class="mb-2">
      <div class="inline-block mr-10">
        <label class="font-bold mr-5 inline-block w-28"><span class="text-red-600 mr-1">*</span>SSH Host</label>
        <input class="w-64 field__input" placeholder="SSH Host" required v-model="connectionOption.ssh.host" />
      </div>
      <div class="inline-block mr-10">
        <label class="font-bold mr-5 inline-block w-28"><span class="text-red-600 mr-1">*</span>SSH Port</label>
        <input class="w-64 field__input" placeholder="SSH Port" required type="number" v-model="connectionOption.ssh.port" />
      </div>
    </section>

    <section class="mb-2">
      <div class="inline-block mr-10">
        <label class="font-bold mr-5 inline-block w-28"><span class="text-red-600 mr-1">*</span>SSH Username</label>
        <input class="w-64 field__input" placeholder="SSH Username" required v-model="connectionOption.ssh.username" />
      </div>

      <div class="inline-block mr-10">
        <label class="font-bold mr-5 inline-block w-28">SSH Cipher</label>
        <el-select v-model="connectionOption.ssh.algorithms.cipher[0]" placeholder="Default">
          <el-option value="aes128-cbc">aes128-cbc</el-option>
          <el-option value="aes192-cbc">aes192-cbc</el-option>
          <el-option value="aes256-cbc">aes256-cbc</el-option>
          <el-option value="3des-cbc">3des-cbc</el-option>
          <el-option value="aes128-ctr">aes128-ctr</el-option>
          <el-option value="aes192-ctr">aes192-ctr</el-option>
          <el-option value="aes256-ctr">aes256-ctr</el-option>
        </el-select>
      </div>
    </section>

    <section class="mb-2" v-if="connectionOption.dbType=='SSH'">
      <div class="inline-block mr-10">
        <label class="font-bold mr-5 inline-block w-32">Show Hidden File</label>
        <el-switch v-model="connectionOption.showHidden"></el-switch>
      </div>
    </section>

    <section class="mb-2">
      <label class="font-bold mr-5 inline-block w-28">Type</label>
      <el-radio v-model="connectionOption.ssh.type" label="password">Password</el-radio>
      <el-radio v-model="connectionOption.ssh.type" label="privateKey">Private Key</el-radio>
      <el-radio v-model="connectionOption.ssh.type" label="native">Native SSH</el-radio>
    </section>

    <div v-if="connectionOption.ssh.type == 'password'">
      <section class="mb-2">
        <label class="font-bold mr-5 inline-block w-28">Password</label>
        <input class="w-64 field__input" placeholder="Password" required type="password" v-model="connectionOption.ssh.password" />
      </section>
    </div>
    <div v-else>
      <section class="mb-2">
        <div class="inline-block mr-10">
          <label class="font-bold mr-5 inline-block w-28">Private Key Path</label>
          <input class="w-52 field__input" placeholder="Private Key Path" v-model="connectionOption.ssh.privateKeyPath" />
          <button @click="choose('privateKey')" class=" w-12">Choose</button>
        </div>
        <div class="inline-block mr-10">
          <label class="font-bold mr-5 inline-block w-28">Passphrase</label>
          <input class="w-64 field__input" placeholder="Passphrase" type="passphrase" v-model="connectionOption.ssh.passphrase" />
        </div>
      </section>
      <section class="mb-2" v-if="connectionOption.ssh.type == 'native'">
        <div class="inline-block mr-10">
          <label class="font-bold mr-5 inline-block w-28">Waiting Time</label>
          <input class="w-64 field__input" placeholder="Waiting time for ssh command." v-model="connectionOption.ssh.watingTime" />
        </div>
      </section>
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