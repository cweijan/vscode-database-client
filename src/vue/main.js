import Vue from 'vue'
import App from './App'
import ElementUI from 'element-ui';
import locale from 'element-ui/lib/locale/lang/en'
import VueRouter from 'vue-router'
import UmyTable from 'umy-table'

import 'umy-table/lib/theme-chalk/index.css';
import '@/../public/theme/auto.css'
import '@/../public/theme/umyui.css'
import "tailwindcss/tailwind.css"

Vue.use(VueRouter)
Vue.use(ElementUI, { locale });
Vue.use(UmyTable);

Vue.config.productionTip = false

import Gojs from "./diagram/Gojs";
import Selector from "./diagram/Selector";
import connect from "./connect";
import status from "./status";
import overview from "./overview";


const router = new VueRouter({
  routes: [
    { path: '/connect', component: connect, name: 'connect' },
    { path: '/status', component: status, name: 'status' },
    { path: '/diagram', component: Gojs, name: 'diagram' },
    { path: '/selector', component: Selector, name: 'selector' },
    { path: '/overview', component: overview, name: 'overview' },
  ]
})

new Vue({
  el: '#app',
  components: { App },
  router,
  template: '<App/>'
})
