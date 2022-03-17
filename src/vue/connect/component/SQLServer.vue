<template>
  <div>
    <section class="mb-2" v-if="connectionOption.dbType=='SqlServer'">
      <div class="inline-block mr-10">
        <label class="font-bold mr-5 inline-block w-32">Instance Name</label>
        <input class="w-64 field__input" placeholder="Connection named instance" title="The instance name to connect to. The SQL Server Browser service must be running on the database server, and UDP port 1434 on the database server must be reachable.(no default)" v-model="connectionOption.instanceName" />
      </div>
      <span>
        (If instance name is specified, the port config is ignored)
      </span>
    </section>

    <section class="mb-2" v-if="connectionOption.dbType=='SqlServer'">
      <div class="inline-block mr-10" v-if="connectionOption.dbType=='SqlServer'">
        <label class="font-bold mr-5 inline-block w-32">Auth Type</label>
        <el-select v-model="connectionOption.authType">
          <el-option :label="'default'" value="default"></el-option>
          <el-option :label="'ntlm(Windows Auth)'" value="ntlm"></el-option>
          <!-- <el-option :label="'azure-active-directory-password'" value="azure-active-directory-password"></el-option>
              <el-option :label="'azure-active-directory-msi-vm'" value="azure-active-directory-msi-vm"></el-option>
              <el-option :label="'azure-active-directory-msi-app-service'" value="azure-active-directory-msi-app-service"></el-option> -->
        </el-select>
      </div>
      <div class="inline-block mr-10">
        <label class="font-bold mr-5 inline-block w-18">Encrypt</label>
        <el-switch v-model="connectionOption.encrypt"></el-switch>
      </div>
    </section>

    <section class="mb-2" v-if="connectionOption.dbType=='SqlServer' && connectionOption.authType=='ntlm'">
      <div class="inline-block mr-10">
        <label class="font-bold mr-5 inline-block w-32"><span class="text-red-600 mr-1">*</span>Domain</label>
        <input class="w-64 field__input" placeholder="Domain" v-model="connectionOption.domain" />
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