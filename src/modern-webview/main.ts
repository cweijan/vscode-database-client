import { createApp } from "vue";

import App from "./App.vue";
import { createWebviewRouter } from "./router";
import "./style.css";

const app = createApp(App);
app.use(createWebviewRouter());
app.mount("#app-container");
