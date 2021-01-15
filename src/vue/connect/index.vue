<template>
  <div class="container flex flex-col mx-auto">
    <h1 class="py-4 text-2xl">Connect to Database server</h1>

    <blockquote class="p-3 mb-2 panel" id="error" v-if="error">
      <section class="panel__text">
        <div class="block font-bold">Connection error!</div>
        <span id="errorMessage" v-text="errorMessage"></span>
      </section>
    </blockquote>

    <section class="mb-2">
      <label class="block font-bold" for="connection-name">Connection Name</label>
      <input class="w-full field__input" id="connection-name" placeholder="The name of connection, it can be empty" v-model="connectionOption.name" />
    </section>

    <section class="mb-2">
      <label class="block font-bold" for="connection-type">Connection Type</label>
      <el-radio v-model="connectionOption.dbType" label="MySQL">MySQL</el-radio>
      <el-radio v-model="connectionOption.dbType" label="PostgreSQL">PostgreSQL</el-radio>
      <el-radio v-model="connectionOption.dbType" label="SqlServer">SQL Server</el-radio>
      <el-radio v-model="connectionOption.dbType" label="ElasticSearch">ElasticSearch</el-radio>
      </el-select>
    </section>

    <template v-if="connectionOption.dbType=='ElasticSearch'">
      <section class="mb-2">
        <label class="block font-bold" for="connection-scheme">Scheme</label>
        <el-radio v-model="connectionOption.scheme" label="http">Http</el-radio>
        <el-radio v-model="connectionOption.scheme" label="https">Https</el-radio>
      </section>
    </template>

    <section class="mb-2">
      <label class="block font-bold" for="connection-host">Host</label>
      <input class="w-full field__input" id="connection-host" placeholder="The host of connection" required v-model="connectionOption.host" />
    </section>

    <section class="mb-2">
      <label class="block font-bold" for="connection-port">Port</label>
      <input class="w-full field__input" id="connection-port" placeholder="The port of connection" required type="number" v-model="connectionOption.port" />
    </section>

    <template v-if="connectionOption.dbType!='ElasticSearch'">

      <section class="mb-2">
        <label class="block font-bold" for="connection-user">Username</label>
        <input class="w-full field__input" id="connection-user" placeholder="Username" required v-model="connectionOption.user" />
      </section>

      <section class="mb-2">
        <label class="block font-bold" for="connection-password">Password</label>
        <input class="w-full field__input" id="connection-password" placeholder="Password" type="password" v-model="connectionOption.password" />
      </section>

      <section class="mb-2">
        <label class="block font-bold" for="databases">Databases</label>
        <input class="w-full field__input" id="databases" placeholder="Default is all databases" v-model="connectionOption.database" />
      </section>

      <section class="mb-2">
        <label class="block font-bold" for="timezone">Timezone</label>
        <input class="w-full field__input" id="timezone" placeholder="+HH:MM" v-model="connectionOption.timezone" />
      </section>

    </template>

    <section class="flex items-center mb-2">
      <label class="mr-2 font-bold" for="global">Global</label>
      <el-switch id="global" v-model="connectionOption.global"></el-switch>
    </section>

    <section class="flex items-center mb-2">
      <label class="mr-2 font-bold" for="ssh-connection">Using SSH</label>
      <el-switch id="ssh-connection" v-model="connectionOption.usingSSH"></el-switch>
    </section>

    <div v-if="connectionOption.usingSSH">
      <section class="mb-2">
        <label class="block font-bold" for="connection-ssh-host">SSH Host</label>
        <input class="w-full field__input" id="connection-ssh-host" placeholder="SSH Host" required v-model="connectionOption.ssh.host" />
      </section>

      <section class="mb-2">
        <label class="block font-bold" for="connection-ssh-port">SSH Port</label>
        <input class="w-full field__input" id="connection-ssh-port" placeholder="SSH Port" required type="number" v-model="connectionOption.ssh.port" />
      </section>

      <section class="mb-2">
        <label class="block font-bold" for="connection-ssh-username">SSH Username</label>
        <input class="w-full field__input" id="connection-ssh-username" placeholder="SSH Username" required v-model="connectionOption.ssh.username" />
      </section>

      <section class="mb-2">
        <label class="block font-bold" for="connection-ssh-username">SSH Cipher</label>
        <el-select v-model="connectionOption.ssh.algorithms.cipher[0]" placeholder="Default">
          <el-option value="aes128-cbc">aes128-cbc</el-option>
          <el-option value="aes192-cbc">aes192-cbc</el-option>
          <el-option value="aes256-cbc">aes256-cbc</el-option>
          <el-option value="3des-cbc">3des-cbc</el-option>
          <el-option value="aes128-ctr">aes128-ctr</el-option>
          <el-option value="aes192-ctr">aes192-ctr</el-option>
          <el-option value="aes256-ctr">aes256-ctr</el-option>
        </el-select>
      </section>

      <section class="mb-2">
        <label class="block font-bold" for="connection-ssh-type">Type</label>
        <select class="w-full field__input" v-model="type">
          <option class="p-1" value="password">Password</option>
          <option class="p-1" value="privateKey">Private Key</option>
        </select>
      </section>

      <div v-if="type == 'password'">
        <section class="mb-2">
          <label class="block font-bold" for="connection-ssh-password">Password</label>
          <input class="w-full field__input" id="connection-ssh-password" placeholder="Password" required type="password" v-model="connectionOption.ssh.password" />
        </section>
      </div>
      <div v-else>
        <section class="mb-2">
          <label class="block font-bold" for="connection-ssh-private-key-path">Private Key Path</label>
          <input class="w-full field__input" id="connection-ssh-private-key-path" placeholder="Private Key Path" v-model="connectionOption.ssh.privateKeyPath" />
        </section>
        <section class="mb-2">
          <label class="block font-bold" for="connection-ssh-passphrase">Passphrase</label>
          <input class="w-full field__input" id="connection-ssh-passphrase" placeholder="Passphrase" type="passphrase" v-model="connectionOption.ssh.passphrase" />
        </section>
      </div>
    </div>

    <div id="fields" data-type="none"></div>

    <button class="button button--primary" @click="tryConnect">Connect</button>
  </div>
</template>

<script>
import { getVscodeEvent } from "../util/vscode"
let vscodeEvent
export default {
  name: "Connect",
  data() {
    return {
      connectionOption: {
        host: "127.0.0.1",
        port: "3306",
        user: "root",
        password: "",
        database: null,
        usingSSH: false,
        dbType: "MySQL",
        global: true,
        scheme:'http',
        timezone: "+00:00",
        ssh: {
          host: "",
          port: 22,
          username: "root",
          algorithms: {
            cipher: [],
          },
        },
      },
      type: "password",
      databaseType: "mysql",
      error: false,
      errorMessage: "",
    }
  },
  mounted() {
    vscodeEvent = getVscodeEvent()
    vscodeEvent
      .on("edit", (node) => {
        this.connectionOption = node
      })
      .on("error", (err) => {
        this.error = true
        this.errorMessage = err
      })
    vscodeEvent.emit("route-" + this.$route.name)
    window.onkeydown = (e) => {
      if (e.key == "Enter" && e.target.tagName == "INPUT") {
        this.tryConnect()
      }
    }
  },
  destroyed() {
    vscodeEvent.destroy()
  },
  methods: {
    tryConnect() {
      vscodeEvent.emit("connecting", {
        databaseType: this.databaseType,
        connectionOption: this.connectionOption,
      })
    },
  },
  watch: {
    "connectionOption.dbType"(value) {
      switch (value) {
        case "MySQL":
          this.connectionOption.user = "root"
          this.connectionOption.port = 3306
          break
        case "PostgreSQL":
          this.connectionOption.user = "postgres"
          this.connectionOption.port = 5432
          break
        case "Oracle":
          this.connectionOption.user = "system"
          this.connectionOption.port = 1521
          break
        case "SqlServer":
          this.connectionOption.user = "sa"
          this.connectionOption.port = 1433
          break
        case "ElasticSearch":
          this.connectionOption.port = 9200
          break
      }
    },
  },
}
</script>

<style scoped>
/* .tab {
  border-bottom: 1px solid var(--vscode-dropdown-border);
  display: flex;
  padding: 0;
}

.tab__item {
  list-style: none;
  cursor: pointer;
  font-size: 13px;
  padding: 7px 8px;
  color: var(--vscode-foreground);
  border-bottom: 1px solid transparent;
  margin: 0 0 -1px 0;
}

.tab__item:hover {
  color: var(--vscode-panelTitle-activeForeground);
}

.tab__item--active {
  color: var(--vscode-panelTitle-activeForeground);
  border-bottom-color: var(--vscode-panelTitle-activeForeground);
} */

input::-webkit-outer-spin-button,
input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.field__input {
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-dropdown-border);
  color: var(--vscode-input-foreground);
  padding: 4px;
  margin: 2px 0;
}

.field__input:focus {
  border-color: inherit;
  outline: 0;
}

.button {
  width: auto;
  padding: 4px 14px;
  border: 0;
  display: inline-block;
  outline: none;
  @apply font-bold;
  cursor: pointer;
}

.button--primary {
  color: var(--vscode-button-foreground);
  background-color: var(--vscode-button-background);
}

.button--primary:hover {
  background-color: var(--vscode-button-hoverBackground);
}

.panel {
  border-left-width: 5px;
  border-left-style: solid;
  background: var(--vscode-textBlockQuote-background);
  border-color: var(--vscode-inputValidation-errorBorder);
}

.panel__text {
  line-height: 2;
}
</style>
