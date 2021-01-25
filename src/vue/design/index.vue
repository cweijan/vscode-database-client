<template>
  <div>
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
import { getVscodeEvent } from "../util/vscode";
import IndexPanel from "./IndexPanel";
import ColumnPanel from "./ColumnPanel";
import InfoPanel from "./InfoPanel";
const vscodeEvent = getVscodeEvent();
export default {
  components: { IndexPanel, ColumnPanel,InfoPanel },
  data() {
    return {
      activePanel: "index",
    };
  },
  destroyed() {
    vscodeEvent.destroy();
  },
  mounted() {
    
  },
  methods: {
    refresh() {
      vscodeEvent.emit("route-" + this.$route.name);
    },
  },
  computed: {
    remainHeight() {
      return window.outerHeight - 130;
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
</style>