export {};

declare module "vue" {
  export interface GlobalComponents {
    PayBadge: typeof import("./components/target/PayBadge.vue")["default"];
    RedMark: typeof import("./components/target/RedMark.vue")["default"];
    TwForm: typeof import("./components/target/TwForm.vue")["default"];
    TwFormItem: typeof import("./components/target/TwFormItem.vue")["default"];
    VscButton: typeof import("./components/target/VscButton.vue")["default"];
    VscSwitch: typeof import("./components/target/VscSwitch.vue")["default"];
    VscTooltip: typeof import("./components/target/VscTooltip.vue")["default"];
  }
}
