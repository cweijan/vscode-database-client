<template>
  <div class="connect-container flex flex-col mx-auto">
    <h1 class="py-4 text-2xl">Connect to Database Server</h1>

    <blockquote class="p-3 mb-2 panel error" v-if="connect.error">
      <section class="panel__text">
        <div class="font-bold mr-5 inline-block w-32">Connection error!</div>
        <span v-text="connect.errorMessage"></span>
      </section>
    </blockquote>

    <blockquote class="p-3 mb-2 panel success" v-if="connect.success">
      <section class="panel__text">
        <div class="font-bold mr-5 inline-block w-36">Success!</div>
        <span v-text="connect.successMessage"></span>
      </section>
    </blockquote>

    <section class="mb-2">
      <label class="font-bold mr-5 inline-block ">Connection Name</label>
      <input class="w-1/4 field__input" placeholder="Connection name" v-model="connectionOption.name" />
      <label class="font-bold ml-4 mr-5 inline-block ">Connection Target</label>
      <el-radio v-model="connectionOption.global" :label="true">Global</el-radio>
      <el-radio v-model="connectionOption.global" :label="false">Current Workspace</el-radio>
    </section>

    <section class="mb-2">
      <label class="block font-bold">Database Type</label>
      <ul class="tab">
        <li class="tab__item " :class="{'tab__item--active':supportDatabase==connectionOption.dbType}"
          v-for="supportDatabase in supportDatabases" :key="supportDatabase"
          @click="connectionOption.dbType=supportDatabase">
          {{supportDatabase}}
        </li>
      </ul>
    </section>

    <template v-if="connectionOption.dbType=='SQLite'">
      <div>
        <section class="mb-2" v-if="!sqliteState">
          <div class="font-bold mr-5 inline-block w-1/4">
            <el-alert title="sqlite not installed" type="warning" show-icon/>
          </div>
          <div class="font-bold mr-5 inline-block w-36">
            <button class="button button--primary w-128 inline" @click="installSqlite">Install Sqlite</button>
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
    </template>

    <template v-if="connectionOption.dbType!='SQLite'">

      <template v-if="connectionOption.dbType!='SSH'">
        <template v-if="connectionOption.dbType=='ElasticSearch'">
          <section class="mb-2">
            <label class="font-bold mr-5 inline-block w-32">Scheme</label>
            <el-radio v-model="connectionOption.scheme" label="http">Http</el-radio>
            <el-radio v-model="connectionOption.scheme" label="https">Https</el-radio>
          </section>
        </template>

        <section class="mb-2">
          <div class="inline-block mr-10">
            <label class="font-bold mr-5 inline-block w-32"><span class="text-red-600 mr-1">*</span>
              <span v-if="connectionOption.dbType=='ElasticSearch'">URL</span>
              <span v-if="connectionOption.dbType!='ElasticSearch'">Host</span>
            </label>
            <input class="w-64 field__input" placeholder="The host of connection" required
              v-model="connectionOption.host" />
          </div>
          <div class="inline-block mr-10" v-if="connectionOption.dbType!='ElasticSearch'">
            <label class="font-bold mr-5 inline-block w-32"><span class="text-red-600 mr-1">*</span>Port</label>
            <input class="w-64 field__input" placeholder="The port of connection" required type="number"
              v-model="connectionOption.port" />
          </div>
        </section>

        <section class="mb-2" v-if="connectionOption.dbType=='SqlServer'">
          <div class="inline-block mr-10">
            <label class="font-bold mr-5 inline-block w-32">Instance Name</label>
            <input class="w-64 field__input" placeholder="Connection named instance"
              title="The instance name to connect to. The SQL Server Browser service must be running on the database server, and UDP port 1434 on the database server must be reachable.(no default)"
              v-model="connectionOption.instanceName" />
          </div>
          <span>
            (If instance name is specified, the port config is ignored)
          </span>
        </section>

        <template v-if="connectionOption.dbType!='ElasticSearch'">

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

          <section class="mb-2">
            <div class="inline-block mr-10" v-if="connectionOption.dbType!='Redis'">
              <label class="font-bold mr-5 inline-block w-32"><span class="text-red-600 mr-1">*</span>Username</label>
              <input class="w-64 field__input" placeholder="Username" required v-model="connectionOption.user" />
            </div>
            <div class="inline-block mr-10">
              <label class="font-bold mr-5 inline-block w-32"><span class="text-red-600 mr-1">*</span>Password</label>
              <input class="w-64 field__input" placeholder="Password" type="password"
                v-model="connectionOption.password" />
            </div>
          </section>

          <section class="mb-2" v-if="connectionOption.dbType!='FTP' && connectionOption.dbType!='MongoDB'">
            <div class="inline-block mr-10">
              <label class="font-bold mr-5 inline-block w-32">Databases</label>
              <input class="w-64 field__input" placeholder="Special connection database"
                v-model="connectionOption.database" />
            </div>
            <div class="inline-block mr-10" v-if="connectionOption.dbType!='Redis' ">
              <label class="font-bold mr-5 inline-block w-32">Include Databases</label>
              <input class="w-64 field__input" placeholder="Which databases need to be displayed"
                title="Example: mysql,test" v-model="connectionOption.includeDatabases" />
            </div>
          </section>

          <section class="mb-2" v-if="connectionOption.dbType=='FTP'">
            <div class="inline-block mr-10">
              <label class="font-bold mr-5 inline-block w-32">Encoding</label>
              <input class="w-64 field__input" placeholder="UTF8" required v-model="connectionOption.encoding" />
            </div>
            <div class="inline-block mr-10">
              <label class="font-bold mr-5 inline-block w-32">Show Hidden File</label>
              <el-switch v-model="connectionOption.showHidden"></el-switch>
            </div>
          </section>

          <section class="mb-2">
            <div class="inline-block mr-10">
              <label class="font-bold mr-5 inline-block w-32">ConnectTimeout</label>
              <input class="w-64 field__input" placeholder="5000" required v-model="connectionOption.connectTimeout" />
            </div>
            <div class="inline-block mr-10">
              <label class="font-bold mr-5 inline-block w-32">RequestTimeout</label>
              <input class="w-64 field__input" placeholder="10000" required type="number"
                v-model="connectionOption.requestTimeout" />
            </div>
          </section>

        </template>

        <section class="flex items-center mb-2" v-if="connectionOption.dbType=='MySQL'">
          <div class="inline-block mr-10">
            <label class="font-bold mr-5 inline-block w-32">Timezone</label>
            <input class="w-64 field__input" placeholder="+HH:MM" v-model="connectionOption.timezone" />
          </div>
        </section>

        <section class="flex items-center mb-2">
          <div class="inline-block mr-10">
            <label class="mr-2 font-bold">SSH Tunnel</label>
            <el-switch v-model="connectionOption.usingSSH"></el-switch>
          </div>
          <div class="inline-block mr-10"
            v-if="connectionOption.dbType=='MySQL' || connectionOption.dbType=='PostgreSQL' || connectionOption.dbType=='MongoDB' || connectionOption.dbType=='Redis' ">
            <label class="font-bold mr-5 inline-block w-18">Use SSL</label>
            <el-switch v-model="connectionOption.useSSL"></el-switch>
          </div>
        </section>
      </template>

      <section class="flex items-center mb-2" v-if="connectionOption.useSSL">
        <div class="inline-block mr-10">
          <label class="font-bold mr-5 inline-block w-32">SSL Client Cert</label>
          <input class="w-64 field__input" placeholder="SSL Client Certificate Path"
            v-model="connectionOption.clientCertPath" />
        </div>
        <div class="inline-block mr-10">
          <label class="font-bold mr-5 inline-block w-32">SSL Client Key</label>
          <input class="w-64 field__input" placeholder="SSL Client Key Path" v-model="connectionOption.clientKeyPath" />
        </div>
      </section>

      <div v-if="connectionOption.usingSSH || connectionOption.dbType=='SSH'">
        <section class="mb-2">
          <div class="inline-block mr-10">
            <label class="font-bold mr-5 inline-block w-28">SSH Host</label>
            <input class="w-64 field__input" placeholder="SSH Host" required v-model="connectionOption.ssh.host" />
          </div>
          <div class="inline-block mr-10">
            <label class="font-bold mr-5 inline-block w-28">SSH Port</label>
            <input class="w-64 field__input" placeholder="SSH Port" required type="number"
              v-model="connectionOption.ssh.port" />
          </div>
        </section>

        <section class="mb-2">
          <div class="inline-block mr-10">
            <label class="font-bold mr-5 inline-block w-28">SSH Username</label>
            <input class="w-64 field__input" placeholder="SSH Username" required
              v-model="connectionOption.ssh.username" />
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
          <el-radio v-model="type" label="password">Password</el-radio>
          <el-radio v-model="type" label="privateKey">Private Key</el-radio>
        </section>

        <div v-if="type == 'password'">
          <section class="mb-2">
            <label class="font-bold mr-5 inline-block w-28">Password</label>
            <input class="w-64 field__input" placeholder="Password" required type="password"
              v-model="connectionOption.ssh.password" />
          </section>
        </div>
        <div v-else>
          <section class="mb-2">
            <div class="inline-block mr-10">
              <label class="font-bold mr-5 inline-block w-28">Private Key Path</label>
              <input class="w-52 field__input" placeholder="Private Key Path"
                v-model="connectionOption.ssh.privateKeyPath" />
              <button @click="choose('privateKey')" class=" w-12">Choose</button>
            </div>
            <div class="inline-block mr-10">
              <label class="font-bold mr-5 inline-block w-28">Passphrase</label>
              <input class="w-64 field__input" placeholder="Passphrase" type="passphrase"
                v-model="connectionOption.ssh.passphrase" />
            </div>
          </section>
        </div>
      </div>
    </template>
    <div>
      <button class="button button--primary w-28 inline mr-4" @click="tryConnect"
        v-loading="connect.loading">Connect</button>
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
          dbPath: '',
          port: "3306",
          user: "root",
          authType: "default",
          password: "",
          encoding: "utf8",
          database: null,
          usingSSH: false,
          showHidden: false,
          includeDatabases: null,
          dbType: "MySQL",
          encrypt: true,
          global: true,
          key: null,
          scheme: "http",
          timezone: "+00:00",
          ssh: {
            host: "",
            privateKeyPath: "",
            port: 22,
            username: "root",
            algorithms: {
              cipher: [],
            },
          },
        },
        sqliteState: false,
        type: "password",
        supportDatabases: [
          "MySQL",
          "PostgreSQL",
          "SqlServer",
          "SQLite",
          "MongoDB",
          "Redis",
          "ElasticSearch",
          "SSH",
          "FTP"
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
          console.log(node)
          this.connectionOption = node;
        })
        .on("connect", (node) => {
          this.editModel = false;
        })
        .on("choose", ({ event, path }) => {
          switch (event) {
            case 'sqlite':
              this.connectionOption.dbPath = path;
              break;
            case 'privateKey':
              this.connectionOption.ssh.privateKeyPath = path;
              break;
          }
          this.$forceUpdate()
        })
        .on("sqliteState", sqliteState => {
          this.sqliteState = sqliteState;
        })
        .on("error", (err) => {
          this.connect.loading = false;
          this.connect.success = false;
          this.connect.error = true;
          this.connect.errorMessage = err;
        })
        .on("success", (res) => {
          this.connect.loading = false;
          this.connect.error = false;
          this.connect.success = true;
          this.connect.successMessage = res.message;
          this.connectionOption.key = res.key;
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
      installSqlite() {
        vscodeEvent.emit("installSqlite")
        this.sqliteState=true;
      },
      tryConnect() {
        this.connect.loading = true;
        vscodeEvent.emit("connecting", {
          connectionOption: this.connectionOption,
        });
      },
      choose(event) {
        let filters = {};
        switch (event) {
          case 'sqlite':
            filters["SQLiteDb"] = ["db"]
            break;
          case 'privateKey':
            filters["PrivateKey"] = ["key", "cer", "crt", "der", "pub", "pem", "pk"]
            break;
        }
        filters["File"] = ["*"]
        vscodeEvent.emit("choose", {
          event, filters
        })
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
        this.connectionOption.host = "127.0.0.1"
        switch (value) {
          case "MySQL":
            this.connectionOption.user = "root";
            this.connectionOption.port = 3306;
            this.connectionOption.database = null;
            break;
          case "PostgreSQL":
            this.connectionOption.user = "postgres";
            this.connectionOption.encrypt = false;
            this.connectionOption.port = 5432;
            this.connectionOption.database = "postgres";
            break;
          case "Oracle":
            this.connectionOption.user = "system";
            this.connectionOption.port = 1521;
            break;
          case "SqlServer":
            this.connectionOption.user = "sa";
            this.connectionOption.encrypt = true;
            this.connectionOption.port = 1433;
            this.connectionOption.database = "master";
            break;
          case "ElasticSearch":
            this.connectionOption.host = "127.0.0.1:9200"
            this.connectionOption.user = null;
            this.connectionOption.port = null;
            this.connectionOption.database = null;
            break;
          case "Redis":
            this.connectionOption.port = 6379;
            this.connectionOption.user = null;
            this.connectionOption.database = "0";
            break;
          case "MongoDB":
            this.connectionOption.user = null;
            this.connectionOption.password = null;
            this.connectionOption.port = 27017;
            break;
          case "FTP":
            this.connectionOption.port = 21;
            this.connectionOption.user = null;
            break;
          case "SSH":
            break;
        }
        this.$forceUpdate()
      },
    },
  };
</script>

<style scoped>
  .connect-container {
    width: 100%;
    max-width: 1300px;
  }

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