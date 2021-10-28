import Vue from 'vue'
import App from './App'
import ElementUI from 'element-ui';
import locale from 'element-ui/lib/locale/lang/en'
import UmyTable from 'umy-table'
import 'umy-table/lib/theme-chalk/index.css';
import '@/../public/theme/element.css'
import '@/../public/theme/custom.css'
import "tailwindcss/tailwind.css"
import Contextmenu from "./Contextmenu"
import VueI18n from 'vue-i18n'
import {messages} from "./message"
import VueRouter from 'vue-router'
import connect from "./connect";
import status from "./status";
import design from "./design";
import structDiff from "./structDiff";
import keyView from "./redis/keyView";
import terminal from "./redis/terminal";
import redisStatus from "./redis/redisStatus";
import forward from "./forward";
import sshTerminal from "./xterm";

Vue.use(Contextmenu).use(VueRouter)
  .use(VueI18n)
  .use(ElementUI, { locale })
  .use(UmyTable);

Vue.config.productionTip = false


const i18n = new VueI18n({
  locale:'en',
  fallbackLocale: 'en',
  messages
})

const router = new VueRouter({
  routes: [
    { path: '/connect', component: connect, name: 'connect' },
    { path: '/status', component: status, name: 'status' },
    { path: '/design', component: design, name: 'design' },
    { path: '/structDiff', component: structDiff, name: 'structDiff' },
    // redis
    { path: '/keyView', component: keyView, name: 'keyView' },
    { path: '/terminal', component: terminal, name: 'terminal' },
    { path: '/redisStatus', component: redisStatus, name: 'redisStatus' },
    // ssh
    { path: '/forward', component: forward, name: 'forward' },
    { path: '/sshTerminal', component: sshTerminal, name: 'sshTerminal' },
  ]
})

new Vue({
  el: '#app',i18n,
  components: { App },
  router,
  template: '<App/>'
})
