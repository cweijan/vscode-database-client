<template>
  <div class="container flex flex-col mx-auto">
    <h1 class="py-4 text-2xl">Connect to Database Server</h1>

    <blockquote class="p-3 mb-2 panel error" v-if="connect.error">
      <section class="panel__text">
        <div class="font-bold mr-5 inline-block w-32">Connection error!</div>
        <span v-text="connect.errorMessage"></span>
      </section>
    </blockquote>

    <blockquote class="p-3 mb-2 panel success" v-if="connect.success">
      <section class="panel__text">
        <div class="font-bold mr-5 inline-block w-32">Connection success!</div>
        <span v-text="connect.successMessage"></span>
      </section>
    </blockquote>

    <section class="mb-2">
      <label class="font-bold mr-5 inline-block " for="connection-name">Connection Name</label>
      <input class="w-1/3 field__input" id="connection-name" placeholder="The name of connection, it can be empty" v-model="connectionOption.name" />
    </section>

    <section class="mb-2">
      <label class="block font-bold" for="connection-type">Database Type</label>
      <ul class="tab" id="tabs">
        <li class="tab__item " :class="{'tab__item--active':supportDatabase==connectionOption.dbType}" v-for="supportDatabase in supportDatabases" @click="connectionOption.dbType=supportDatabase">
          {{supportDatabase}}
        </li>
      </ul>
      </el-select>
    </section>

    <template v-if="connectionOption.dbType=='ElasticSearch'">
      <section class="mb-2">
        <label class="font-bold mr-5 inline-block w-14" for="connection-scheme">Scheme</label>
        <el-radio v-model="connectionOption.scheme" label="http">Http</el-radio>
        <el-radio v-model="connectionOption.scheme" label="https">Https</el-radio>
      </section>
    </template>

    <section class="mb-2">
      <div class="inline-block mr-10">
        <label class="font-bold mr-5 inline-block w-14" for="connection-host">Host</label>
        <input class="w-64 field__input" id="connection-host" placeholder="The host of connection" required v-model="connectionOption.host" />
      </div>
      <div class="inline-block mr-10">
        <label class="font-bold mr-5 inline-block w-14" for="connection-port">Port</label>
        <input class="w-64 field__input" id="connection-port" placeholder="The port of connection" required type="number" v-model="connectionOption.port" />
      </div>
    </section>

    <template v-if="connectionOption.dbType!='ElasticSearch'">

      <section class="mb-2" v-if="connectionOption.dbType!='Redis'">
        <div class="inline-block mr-10">
          <label class="font-bold mr-5 inline-block w-14" for="connection-user">Username</label>
          <input class="w-64 field__input" id="connection-user" placeholder="Username" required v-model="connectionOption.user" />
        </div>
        <div class="inline-block mr-10">
          <label class="font-bold mr-5 inline-block w-14" for="databases">Databases</label>
          <input class="w-64 field__input" id="databases" placeholder="Default is all databases" v-model="connectionOption.database" />
        </div>

      </section>

      <section class="mb-2">
        <div class="inline-block mr-10">
          <label class="font-bold mr-5 inline-block w-14" for="connection-password">Password</label>
          <input class="w-64 field__input" id="connection-password" placeholder="Password" type="password" v-model="connectionOption.password" />
        </div>

        <template v-if="connectionOption.dbType=='MySQL'">
          <div class="inline-block mr-10">
            <label class="font-bold mr-5 inline-block w-14" for="timezone">Timezone</label>
            <input class="w-64 field__input" id="timezone" placeholder="+HH:MM" v-model="connectionOption.timezone" />
          </div>
        </template>
      </section>

    </template>

    <section class="flex items-center mb-2">
      <div class="inline-block mr-10">
        <label class="mr-2 font-bold" for="ssh-connection">Using SSH</label>
        <el-switch id="ssh-connection" v-model="connectionOption.usingSSH"></el-switch>
      </div>
      <div class="inline-block mr-10">
        <label class="mr-2 font-bold" for="global">Global</label>
        <el-switch id="global" v-model="connectionOption.global"></el-switch>
      </div>
    </section>

    <div v-if="connectionOption.usingSSH">
      <section class="mb-2">
        <div class="inline-block mr-10">
          <label class="font-bold mr-5 inline-block w-28" for="connection-ssh-host">SSH Host</label>
          <input class="w-64 field__input" id="connection-ssh-host" placeholder="SSH Host" required v-model="connectionOption.ssh.host" />
        </div>
        <div class="inline-block mr-10">
          <label class="font-bold mr-5 inline-block w-28" for="connection-ssh-port">SSH Port</label>
          <input class="w-64 field__input" id="connection-ssh-port" placeholder="SSH Port" required type="number" v-model="connectionOption.ssh.port" />
        </div>
      </section>

      <section class="mb-2">
        <div class="inline-block mr-10">
          <label class="font-bold mr-5 inline-block w-28" for="connection-ssh-username">SSH Username</label>
          <input class="w-64 field__input" id="connection-ssh-username" placeholder="SSH Username" required v-model="connectionOption.ssh.username" />
        </div>

        <div class="inline-block mr-10">
          <label class="font-bold mr-5 inline-block w-28" for="connection-ssh-username">SSH Cipher</label>
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

      <section class="mb-2">
        <label class="font-bold mr-5 inline-block w-28" for="connection-ssh-type">Type</label>
        <el-radio v-model="type" label="password">Password</el-radio>
        <el-radio v-model="type" label="privateKey">Private Key</el-radio>
      </section>

      <div v-if="type == 'password'">
        <section class="mb-2">
          <label class="font-bold mr-5 inline-block w-28" for="connection-ssh-password">Password</label>
          <input class="w-64 field__input" id="connection-ssh-password" placeholder="Password" required type="password" v-model="connectionOption.ssh.password" />
        </section>
      </div>
      <div v-else>
        <section class="mb-2">
          <div class="inline-block mr-10">
            <label class="font-bold mr-5 inline-block w-28" for="connection-ssh-private-key-path">Private Key Path</label>
            <input class="w-64 field__input" id="connection-ssh-private-key-path" placeholder="Private Key Path" v-model="connectionOption.ssh.privateKeyPath" />
          </div>
          <div class="inline-block mr-10">
            <label class="font-bold mr-5 inline-block w-28" for="connection-ssh-passphrase">Passphrase</label>
            <input class="w-64 field__input" id="connection-ssh-passphrase" placeholder="Passphrase" type="passphrase" v-model="connectionOption.ssh.passphrase" />
          </div>
        </section>
      </div>
    </div>

    <div>
      <button class="button button--primary w-28 inline mr-4" @click="tryConnect" v-loading="connect.loading">Connect</button>
      <button class="button button--primary w-28 inline" @click="close">Close</button>
    </div>
  </div>
</template>

<script>
import { getVscodeEvent } from "../util/vscode";
let vscodeEvent;
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
        scheme: "http",
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
      supportDatabases: [
        "MySQL",
        "PostgreSQL",
        "SqlServer",
        "ElasticSearch",
        "Redis",
      ],
      connect: {
        loading: false,
        success: false,
        successMessage: "",
        error: false,
        errorMessage: "",
      },
      editModel: false,
    };
  },
  mounted() {
    vscodeEvent = getVscodeEvent();
    vscodeEvent
      .on("edit", (node) => {
        this.editModel = true;
        this.connectionOption = node;
      })
      .on("connect", (node) => {
        this.editModel = false;
      })
      .on("error", (err) => {
        this.connect.loading = false;
        this.connect.success = false;
        this.connect.error = true;
        this.connect.errorMessage = err;
      })
      .on("success", (message) => {
        this.connect.loading = false;
        this.connect.error = false;
        this.connect.success = true;
        this.connect.successMessage = message;
      });
    vscodeEvent.emit("route-" + this.$route.name);
    window.onkeydown = (e) => {
      if (e.key == "Enter" && e.target.tagName == "INPUT") {
        this.tryConnect();
      }
    };
  },
  destroyed() {
    vscodeEvent.destroy();
  },
  methods: {
    tryConnect() {
      this.connect.loading=true;
      vscodeEvent.emit("connecting", {
        connectionOption: this.connectionOption,
      });
    },
    close() {
      vscodeEvent.emit("close");
    },
  },
  watch: {
    "connectionOption.dbType"(value) {
      if (this.editModel) {
        return;
      }
      switch (value) {
        case "MySQL":
          this.connectionOption.user = "root";
          this.connectionOption.port = 3306;
          this.connectionOption.database = null;
          break;
        case "PostgreSQL":
          this.connectionOption.user = "postgres";
          this.connectionOption.port = 5432;
          this.connectionOption.database = "postgres";
          break;
        case "Oracle":
          this.connectionOption.user = "system";
          this.connectionOption.port = 1521;
          break;
        case "SqlServer":
          this.connectionOption.user = "sa";
          this.connectionOption.port = 1433;
          this.connectionOption.database = "master";
          break;
        case "ElasticSearch":
          this.connectionOption.user = null;
          this.connectionOption.port = 9200;
          this.connectionOption.database = null;
          break;
        case "Redis":
          this.connectionOption.port = 6379;
          this.connectionOption.user = null;
          this.connectionOption.database = "0";
          break;
      }
    },
  },
};
</script>

<style scoped>
.tab {
  border-bottom: 1px solid var(--vscode-dropdown-border);
  display: flex;
  padding: 0;
}

.tab__item {
  list-style: none;
  cursor: pointer;
  font-size: 13px;
  padding: 7px 10px;
  color: var(--vscode-foreground);
  border-bottom: 1px solid transparent;
}

.tab__item:hover {
  color: var(--vscode-panelTitle-activeForeground);
}

.tab__item--active {
  color: var(--vscode-panelTitle-activeForeground);
  border-bottom-color: var(--vscode-panelTitle-activeForeground);
}

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
}

.error {
  border-color: var(--vscode-inputValidation-errorBorder);
}

.success {
  border-color: green;
}

.panel__text {
  line-height: 2;
}
</style>
