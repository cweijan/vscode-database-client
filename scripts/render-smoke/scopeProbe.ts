import { createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";

const Scoped = defineComponent({
  __scopeId: "data-v-test12345",
  render() {
    return h("div", { class: "probe" }, [h("span", null, "x")]);
  },
});

const html = await renderToString(createSSRApp({ render: () => h(Scoped) }));
console.log(html);
if (!html.includes("data-v-test12345")) throw new Error("__scopeId was not applied");