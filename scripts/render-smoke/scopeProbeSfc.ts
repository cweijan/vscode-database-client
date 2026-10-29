import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";

import Probe from "./scopeProbeSfc.vue";

const html = await renderToString(createSSRApp({ render: () => h(Probe) }));
console.log(html);
if (!html.includes('data-v-bf970f93')) throw new Error("__scopeId from defineOptions was not applied");
if (!html.includes('class="es-status"')) throw new Error("markup missing");
