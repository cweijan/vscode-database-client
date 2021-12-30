<template>
  <div class="root-container flex mx-auto" @contextmenu.prevent="onContextmenu($event)">
    <div class="connect-container">
      <h1 class="py-4 text-2xl">{{$t("connect.title")}}</h1>
      <blockquote class="p-3 mb-2 panel error" v-if="connect.error">
        <section class="panel__text">
          <div class="font-bold mr-5 inline-block w-32">{{$t("connect.error")}}</div>
          <span v-text="connect.errorMessage"></span>
        </section>
      </blockquote>

      <blockquote class="p-3 mb-2 panel success" v-if="connect.success">
        <section class="panel__text">
          <div class="font-bold mr-5 inline-block w-36">{{$t("connect.success")}}</div>
          <span v-text="connect.successMessage"></span>
        </section>
      </blockquote>

      <section class="mb-2">
        <label class="font-bold mr-5 inline-block ">{{$t("connect.name")}}</label>
        <input class="w-1/4 field__input" placeholder="Connection name" v-model="connectionOption.name" />
        <label class="font-bold ml-4 mr-5 inline-block ">{{$t("connect.scope")}}</label>
        <el-radio v-model="connectionOption.global" :label="true">{{$t("connect.global")}}</el-radio>
        <el-radio v-model="connectionOption.global" :label="false">{{$t("connect.current")}}</el-radio>
      </section>

      <section class="mb-2">
        <label class="block font-bold">{{$t("config.serverType")}}</label>
        <ul class="tab">
          <li class="tab__item " :class="{'tab__item--active':supportDatabase==connectionOption.dbType}" v-for="supportDatabase in supportDatabases" :key="supportDatabase" @click="connectionOption.dbType=supportDatabase">
            {{supportDatabase}}
          </li>
        </ul>
      </section>

      <ElasticSearch v-if="connectionOption.dbType=='ElasticSearch'" :connectionOption="connectionOption" />
      <SQLite v-else-if="connectionOption.dbType=='SQLite'" :connectionOption="connectionOption" :sqliteState="sqliteState" @installSqlite="installSqlite" @choose="choose" />
      <SSH v-else-if="connectionOption.dbType=='SSH'" :connectionOption="connectionOption" @choose="choose" />

      <template v-else>

        <section class="mb-2">
          <div class="inline-block mr-10">
            <label class="font-bold mr-5 inline-block w-32"><span class="text-red-600 mr-1">*</span>
              <span>{{$t("config.host")}}</span>
            </label>
            <input class="w-64 field__input" placeholder="The host of connection" required v-model="connectionOption.host" />
          </div>
          <div class="inline-block mr-10">
            <label class="font-bold mr-5 inline-block w-32"><span class="text-red-600 mr-1">*</span>{{$t("config.port")}}</label>
            <input class="w-64 field__input" placeholder="The port of connection" required type="number" v-model="connectionOption.port" />
          </div>
        </section>

        <SQLServer :connectionOption="connectionOption" v-if="connectionOption.dbType=='SqlServer'" />

        <section class="mb-2">
          <div class="inline-block mr-10" v-if="connectionOption.dbType!='Redis'">
            <label class="font-bold mr-5 inline-block w-32"><span class="text-red-600 mr-1">*</span>{{$t("config.username")}}</label>
            <input class="w-64 field__input" placeholder="Username" required v-model="connectionOption.user" />
          </div>
          <div class="inline-block mr-10">
            <label class="font-bold mr-5 inline-block w-32"><span class="text-red-600 mr-1">*</span>{{$t("config.password")}}</label>
            <input class="w-64 field__input" placeholder="Password" type="password" v-model="connectionOption.password" />
          </div>
          <div class="inline-block mr-10" v-if="connectionOption.dbType=='Redis'">
            <label class="font-bold mr-5 inline-block w-32"><span class="text-red-600 mr-1"></span>IsCluster</label>
            <el-switch v-model="connectionOption.isCluster"></el-switch>
          </div>
        </section>

        <section class="mb-2" v-if="connectionOption.dbType!='FTP' && connectionOption.dbType!='MongoDB'">
          <div class="inline-block mr-10">
            <label class="font-bold mr-5 inline-block w-32">{{$t("config.database")}}</label>
            <input class="w-64 field__input" placeholder="Connection database" v-model="connectionOption.database" />
          </div>
          <div class="inline-block mr-10" v-if="connectionOption.dbType!='Redis'">
            <label class="font-bold mr-5 inline-block w-32">{{$t("config.showedDatabases")}}</label>
            <input class="w-64 field__input" placeholder="e.g mysql,information_schema" v-model="connectionOption.includeDatabases" />
          </div>
        </section>

        <FTP v-if="connectionOption.dbType=='FTP'" :connectionOption="connectionOption" />

        <section class="mb-2">
          <div class="inline-block mr-10">
            <label class="font-bold mr-5 inline-block w-32">{{$t("connect.connectTimeout")}}</label>
            <input class="w-64 field__input" placeholder="5000" required v-model="connectionOption.connectTimeout" />
          </div>
          <div class="inline-block mr-10" v-if="connectionOption.dbType!='Redis' && connectionOption.dbType!='MySQL'">
            <label class="font-bold mr-5 inline-block w-32">{{$t("connect.requestTimeout")}}</label>
            <input class="w-64 field__input" required type="number" v-model="connectionOption.requestTimeout" />
          </div>
        </section>

        <section class="flex items-center mb-2" v-if="connectionOption.dbType=='MySQL'">
          <div class="inline-block mr-10">
            <label class="font-bold mr-5 inline-block w-32">Socket Path</label>
            <input class="w-64 field__input" placeholder="Unix Socket Path" v-model="connectionOption.socketPath" />
          </div>
          <div class="inline-block mr-10">
            <label class="font-bold mr-5 inline-block w-32">{{$t("config.timeZone")}}</label>
            <input class="w-64 field__input" placeholder="+HH:MM" v-model="connectionOption.timezone" />
          </div>
        </section>
      </template>

      <section class="flex items-center mb-2">
        <div class="inline-block mr-10" v-if="connectionOption.dbType!='SSH' && connectionOption.dbType!='SQLite'">
          <label class="mr-2 font-bold">{{$t("connect.sshTunnel")}}</label>
          <el-switch v-model="connectionOption.usingSSH"></el-switch>
        </div>
        <div class="inline-block mr-10" v-if="connectionOption.dbType=='MySQL' || connectionOption.dbType=='PostgreSQL' || connectionOption.dbType=='MongoDB' || connectionOption.dbType=='Redis' ">
          <label class="font-bold mr-5 inline-block w-18">{{$t("connect.useSSL")}}</label>
          <el-switch v-model="connectionOption.useSSL"></el-switch>
        </div>
        <div class="inline-block mr-10" v-if="connectionOption.dbType === 'MongoDB'">
          <label class="inline-block mr-5 font-bold w-18">SRV Record</label>
          <el-switch v-model="connectionOption.srv"></el-switch>
        </div>
        <div class="inline-block mr-10" v-if="connectionOption.dbType === 'MongoDB' || connectionOption.dbType=='PostgreSQL' || connectionOption.dbType=='MySQL'">
          <label class="inline-block mr-5 font-bold w-18">Use Connection String</label>
          <el-switch v-model="connectionOption.useConnectionString"></el-switch>
        </div>
        <div class="inline-block mr-10" v-if="connectionOption.dbType=='MySQL' || connectionOption.dbType=='PostgreSQL'">
          <label class="font-bold mr-5 inline-block w-40">Hide System Schema</label>
          <el-switch v-model="connectionOption.hideSystemSchema"></el-switch>
        </div>
      </section>
      <section class="flex items-center mb-2" v-if="connectionOption.useConnectionString">
        <div class="flex w-full mr-10">
          <label class="inline-block w-32 mr-5 font-bold">Connection String</label>
          <input class="w-4/5 field__input" :placeholder="connectUrlExample" v-model="connectionOption.connectionUrl" />
        </div>
      </section>

      <SSL :connectionOption="connectionOption" v-if="connectionOption.useSSL" @choose="choose" />
      <SSH :connectionOption="connectionOption" v-if="connectionOption.usingSSH" @choose="choose" />

      <div class="connect-bar">
        <el-button size="mini" :loading="connect.loading" @click="tryConnect">{{$t("connect.connecting")}}</el-button>
        <el-button size="mini" @click="close">{{$t("connect.close")}}</el-button>
      </div>
    </div>

  </div>
</template>

<script>
import ElasticSearch from "./component/ElasticSearch.vue";
import SQLite from "./component/SQLite.vue";
import SQLServer from "./component/SQLServer.vue";
import SSH from "./component/SSH.vue";
import FTP from "./component/FTP.vue";
import SSL from "./component/SSL.vue";
import { getVscodeEvent } from "../util/vscode";
let vscodeEvent;
export default {
  name: "Connect",
  components: { ElasticSearch, SQLite, SQLServer, SSH, SSL, FTP },
  data() {
    return {
      connectionOption: {
        host: "127.0.0.1",
        dbPath: "",
        port: "3306",
        user: "root",
        authType: "default",
        password: "",
        encoding: "utf8",
        clientKeyPath: null,
        clientCertPath: null,
        caPath: null,
        database: null,
        useSSL: false,
        usingSSH: false,
        showHidden: false,
        includeDatabases: null,
        dbType: "MySQL",
        encrypt: true,
        isCluster: false,
        connectionUrl: "",
        srv: false,
        esAuth: 'none',
        global: true,
        key: null,
        // scheme: "http",
        timezone: "+00:00",
        ssh: {
          host: "",
          privateKeyPath: "",
          port: 22,
          username: "root",
          type: "password",
          connectTimeout: 10000,
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
        "FTP",
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
    this.focusHolder();
    vscodeEvent = getVscodeEvent();
    vscodeEvent
      .on("edit", (node) => {
        this.editModel = true;
        console.log(node);
        this.connectionOption = node;
      })
      .on("connect", (node) => {
        this.editModel = false;
      })
      .on("choose", ({ event, path }) => {
        switch (event) {
          case "sqlite":
            this.connectionOption.dbPath = path;
            break;
          case "privateKey":
            this.connectionOption.ssh.privateKeyPath = path;
            break;
          default:
            this.connectionOption[event] = path;
            break;
        }
        this.$forceUpdate();
      })
      .on("sqliteState", (sqliteState) => {
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
        this.connectionOption.connectionKey = res.connectionKey;
        this.connectionOption.key = res.key;
        this.connectionOption.isGlobal = this.connectionOption.global;
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
    focusHolder() {
      let lastElement;
      window.onfocus = () => {
        setTimeout(() => {
          if (lastElement) {
            lastElement.focus()
          }
        }, 10)
      }
      window.onblur = () => {
        const ae = document.activeElement;
        if (ae && ae instanceof HTMLInputElement) {
          lastElement = ae;
        }
      }
    },
    installSqlite() {
      vscodeEvent.emit("installSqlite");
      this.sqliteState = true;
    },
    tryConnect() {
      this.connect.error = false;
      this.connect.loading = true;
      vscodeEvent.emit("connecting", {
        connectionOption: this.connectionOption,
      });
    },
    onContextmenu(event) {
      const obj = event.target;
      if (!obj || !(obj instanceof HTMLInputElement) || !obj.select) {
        return;
      }
      const value = obj.value;
      this.$contextmenu({
        items: [
          {
            label: `Copy`,
            onClick: () => {
              vscodeEvent.emit("copy", value);
            }
          }
          // ,{
          //   label: `Paste`,
          //   onClick: () => {
          //     document.execCommand("paste")
          //   }
          // }
        ],
        event,
        customClass: "class-a",
        zIndex: 3,
        minWidth: 230,
      });
      return false;
    },
    choose(event) {
      let filters = {};
      switch (event) {
        case "sqlite":
          filters["SQLiteDb"] = ["db"];
          break;
      }
      filters["File"] = ["*"];
      vscodeEvent.emit("choose", {
        event,
        filters,
      });
    },
    close() {
      vscodeEvent.emit("close");
    },
  },
  computed: {
    connectUrlExample() {
      switch (this.connectionOption.dbType) {
        case 'MySQL':
          return 'e.g mysql://root:root@127.0.0.1:3306/db'
        case 'PostgreSQL':
          return 'e.g postgresql://dbuser:secretpassword@127.0.0.1:3211/mydb'
      }
      return 'e.g mongodb+srv://username:password@server-url/admin'
    }
  },
  watch: {
    "connectionOption.dbType"(value) {
      if (this.editModel) {
        return;
      }
      this.connectionOption.host = "127.0.0.1";
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
          this.connectionOption.useSSL = false;
          break;
        case "ElasticSearch":
          this.connectionOption.host = "127.0.0.1:9200";
          this.connectionOption.user = null;
          this.connectionOption.port = null;
          this.connectionOption.database = null;
          this.connectionOption.useSSL = false;
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
          this.connectionOption.useSSL = false;
          break;
        case "SQLite":
        case "SSH":
          this.connectionOption.usingSSH = false;
          this.connectionOption.useSSL = false;
          break;
      }
      this.$forceUpdate();
    },
    "connectionOption.connectionUrl"(value) {
      let connectionUrl = this.connectionOption.connectionUrl;
      if (!connectionUrl) return;

      const srvRegex = /(?<=mongodb\+).+?(?=:\/\/)/;
      const srv = connectionUrl.match(srvRegex);
      if (srv) {
        this.connectionOption.srv = true;
        connectionUrl = connectionUrl.replace(srvRegex, "");
      }
      const userRegex = /(?<=\/\/).+?(?=\:)/;
      const user = connectionUrl.match(userRegex);
      if (user) {
        this.connectionOption.user = user[0];
        connectionUrl = connectionUrl.replace(userRegex, "");
      }
      const passwordRegex = /(?<=\/\/:).+?(?=@)/;
      const password = connectionUrl.match(passwordRegex);
      if (password) {
        this.connectionOption.password = password[0];
        connectionUrl = connectionUrl.replace(passwordRegex, "");
      }

      const hostRegex = /(?<=@).+?(?=[:\/])/;
      const host = connectionUrl.match(hostRegex);
      if (host) {
        this.connectionOption.host = host[0];
        connectionUrl = connectionUrl.replace(hostRegex, "");
      }

      if (!this.connectionOption.srv) {
        const portRegex = /(?<=\:).\d+/;
        const port = connectionUrl.match(portRegex);
        if (port) {
          this.connectionOption.port = port[0];
          connectionUrl = connectionUrl.replace(portRegex, "");
        }
      }

      this.$forceUpdate();
    },
  },
};
</script>

<style scoped>
.root-container {
  width: 100%;
  justify-content: center;
}

.connect-container {
  width: 100%;
  max-width: 1100px;
}

@media screen and (min-width: 1860px) {
  .connect-container {
    width: 100%;
    max-width: 1500px;
  }
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
  cursor: pointer;
}

.connect-bar {
  display: flex;
  justify-content: center;
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