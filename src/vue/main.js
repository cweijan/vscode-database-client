import Vue from 'vue'
import App from './App'
import ElementUI from 'element-ui';
import VueRouter from 'vue-router'

import 'element-ui/lib/theme-chalk/index.css';

Vue.use(VueRouter)
Vue.use(ElementUI);

Vue.config.productionTip = false

import connect from "./connect";
import status from "./status";
import  Gojs  from "./diagram/Gojs";
import  Selector  from "./diagram/Selector";


const router = new VueRouter({
  routes: [
    { path: '/connect', component:  connect, name: 'connect' },
    { path: '/status', component:  status, name: 'status' },
    { path: '/diagram', component:  Gojs ,name:'diagram'},
    { path: '/selector', component:  Selector ,name:'selector'},
  ]
})

new Vue({
  el: '#app',
  components: { App },
  router,
  template: '<App/>'
})
