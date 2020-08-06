import Vue from 'vue'
import App from './App'
import ElementUI from 'element-ui';
import VueRouter from 'vue-router'

import 'element-ui/lib/theme-chalk/index.css';

Vue.use(VueRouter)
Vue.use(ElementUI);

import connect from "./connect";

Vue.config.productionTip = false

const router = new VueRouter({
  routes: [
    { path: '/connect', component: connect, name: 'connect' },
  ]
})

new Vue({
  el: '#app',
  components: { App },
  router,
  template: '<App/>'
})
