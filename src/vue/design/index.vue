<template>
  <div>
    table:{{table}}
    <div v-if="activePanel=='info'"></div>
    <ul class="tab">
      <li class="tab__item " :class="{'tab__item--active':activePanel=='info'}" @click="activePanel='info'">Info </li>
      <li class="tab__item " :class="{'tab__item--active':activePanel=='column'}" @click="activePanel='column'">Column </li>
      <li class="tab__item " :class="{'tab__item--active':activePanel=='index'}" @click="activePanel='index'">Index </li>
    </ul>
    <div v-if="activePanel=='info'">
      <InfoPanel />
    </div>
    <div v-if="activePanel=='column'">
      <ColumnPanel />
    </div>
    <div v-if="activePanel=='index'">
      <IndexPanel />
    </div>
  </div>
</template>

<script>
import { inject } from "../mixin/vscodeInject";
import IndexPanel from "./IndexPanel";
import ColumnPanel from "./ColumnPanel";
import InfoPanel from "./InfoPanel";
export default {
  mixins: [inject],
  components: { IndexPanel, ColumnPanel, InfoPanel },
  data() {
    return {
      table: null,
      activePanel: "info",
    };
  },
  mounted() {
    this.on("design-data", (data) => {
      this.table=data.table
    });
  }
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
</style>