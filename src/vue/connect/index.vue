<template>
  <div class="container" id='app'>
    <h1>Connect to MySQL server</h1>
    <blockquote class="panel" id="error" v-if="error">
      <p class="panel__text">
        Connection error! <span id="errorMessage" v-text="errorMessage"></span><br />
      </p>
    </blockquote>
    <el-row>
      <div>
        <div class="field field__input">
          <strong>name:</strong>
          <input class="field__input" placeholder="connection name, can be empty" v-model="connectionOption.name" />
        </div>
      </div>
      <div>
        <div class="field field__input">
          <strong>host:</strong>
          <input class="field__input" v-model="connectionOption.host" />
        </div>
      </div>
      <div>
        <div class="field field__input">
          <strong>port:</strong>
          <input class="field__input" v-model="connectionOption.port" />
        </div>
      </div>
      <div>
        <div class="field field__input">
          <strong>username:</strong>
          <input class="field__input" v-model="connectionOption.user" />
        </div>
      </div>
      <div>
        <div class="field field__input">
          <strong>password:</strong>
          <input class="field__input" type="password" v-model="connectionOption.password" />
        </div>
      </div>
      <div>
        <div class="field field__input">
          <strong>database:</strong>
          <input class="field__input" placeholder="database, can be empty" v-model="connectionOption.database" />
        </div>
      </div>
      <div>
        <div class="field field__input">
          <strong>excludeDatabases:</strong>
          <input class="field__input" v-model="connectionOption.excludeDatabases" />
        </div>
      </div>
      <div>
        <div class="field field__input">
          <strong>timezone:</strong>
          <input class="field__input" placeholder="+HH:MM" v-model="connectionOption.timezone" />
        </div>
      </div>
    </el-row>
    <el-row>
      <div class="field field__input">
        usingSSH:
        <el-switch v-model="connectionOption.usingSSH"></el-switch>
      </div>
      <div v-if="connectionOption.usingSSH">
        <div class="field field__input">
          <strong>ssh-host:</strong>
          <input class="field__input" v-model="connectionOption.ssh.host" />
        </div>
        <div class="field field__input">
          <strong>ssh-port:</strong>
          <input class="field__input" v-model="connectionOption.ssh.port" />
        </div>
        <div class="field field__input">
          <strong>ssh-username:</strong>
          <input class="field__input" v-model="connectionOption.ssh.username" />
        </div>
        <div>
          <div class="field field__input">
            <strong>type:</strong>
            <select v-model="type">
              <option value="password">password</option>
              <option value="privateKey">privateKey</option>
            </select>
          </div>
        </div>
        <div v-if="type=='password'">
          <div class="field field__input">
            <strong>password:</strong>
            <input class="field__input" type="password" v-model="connectionOption.ssh.password" />
          </div>
        </div>
        <div v-if="type=='privateKey'">
          <div>
            <div class="field field__input">
              <strong>privateKeyPath:</strong>
              <input class="field__input" placeholder="input your private key path" v-model="connectionOption.ssh.privateKeyPath" />
            </div>
          </div>
          <div>
            <div class="field field__input">
              <strong>passphrase:</strong>
              <input class="field__input" type="passphrase" v-model="connectionOption.ssh.passphrase" />
            </div>
          </div>
        </div>
      </div>
    </el-row>

    <div id="fields" data-type="none"></div>

    <button class="button button--primary" @click="tryConnect">Connect</button>

  </div>
</template>

<script>
import { getVscodeEvent } from "../util/vscode";
let vscodeEvent;
export default {
  name: "connect",
  data() {
    return {
      connectionOption: {
        host: "127.0.0.1",
        port: "3306",
        user: "root",
        password: "",
        database: null,
        usingSSH: false,
        excludeDatabases: "mysql,performance_schema,information_schema,sys",
        timezone: "+00:00",
        ssh: {
          host: "",
          port: 22,
          username: "root"
        }
      },
      type: "password",
      databaseType: "mysql",
      error: false,
      errorMessage: ""
    };
  },
  mounted() {
    vscodeEvent = getVscodeEvent();
    vscodeEvent
      .on("edit", node => {
        this.connectionOption = node;
      })
      .on("error", err => {
        this.error = true;
        this.errorMessage = err;
      });
    vscodeEvent.emit("route-" + this.$route.name);
  },
  destroyed(){
    vscodeEvent.destroy()
  },
  methods: {
    tryConnect() {
      vscodeEvent.emit("connecting", {
        databaseType: this.databaseType,
        connectionOption: this.connectionOption
      });
    }
  }
};
</script>

<style>
.container {
  margin: auto;
  padding-left: 24px;
  padding-right: 24px;
  max-width: 1000px;
  box-sizing: border-box;
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
}

.field {
  padding: 1em 0;
}

.field--checkbox {
  display: flex;
  justify-content: flex-end;
  flex-direction: row-reverse;
  align-items: center;
}

.field__label {
  display: block;
  margin: 2px 0;
  cursor: pointer;
}

.field--checkbox .field__label {
  margin: 2px 4px;
}

.field input {
  width: 50vw;
}

.field__input {
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-dropdown-border);
  color: var(--vscode-input-foreground);
  padding: 4px;
  margin: 2px 0;
}

.field__input:focus {
  border-color: var(--vscode-focusBorder);
  outline: 0;
}

.button {
  width: auto;
  padding: 2px 14px;
  border: 0;
  display: inline-block;
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
  margin: 0 7px 0 5px;
  padding: 0 16px 0 10px;
  border-left-width: 5px;
  border-left-style: solid;
  background: var(--vscode-textBlockQuote-background);
  border-color: var(--vscode-inputValidation-errorBorder);
}

.panel__text {
  line-height: 2;
}
</style>