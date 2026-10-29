import { createApp } from "vue";

import App from "./App.vue";
import { targetComponentsPlugin } from "./components/target";
import { createWebviewRouter } from "./router";
import "./codicon.css";
import "./style.css";
import "./styles/target-app.css";

const app = createApp(App);
app.use(createWebviewRouter());
app.use(targetComponentsPlugin);
app.mount("#app-container");
