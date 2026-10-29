import type { App } from "vue";

import PayBadge from "./PayBadge.vue";
import RedMark from "./RedMark.vue";
import TwForm from "./TwForm.vue";
import TwFormItem from "./TwFormItem.vue";
import VscButton from "./VscButton.vue";
import VscSwitch from "./VscSwitch.vue";
import VscTooltip from "./VscTooltip.vue";

/**
 * Mirrors the component set the 9.0.2 webview registers globally, so markup can use
 * `<VscButton>`, `<VscTooltip>`, `<VscSwitch>`, `<TwForm>`, `<TwFormItem>`, `<RedMark>`
 * and `<PayBadge>` exactly like the target build does.
 */
export const targetComponentsPlugin = {
  install(app: App): void {
    app.component("RedMark", RedMark);
    app.component("PayBadge", PayBadge);
    app.component("VscButton", VscButton);
    app.component("VscSwitch", VscSwitch);
    app.component("VscTooltip", VscTooltip);
    app.component("TwForm", TwForm);
    app.component("TwFormItem", TwFormItem);
  },
};
