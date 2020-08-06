import Vue from 'vue'
import App from './App'
import ElementUI from 'element-ui';
import VueRouter from 'vue-router'

import 'element-ui/lib/theme-chalk/index.css';
import './go.js';

Vue.use(VueRouter)
Vue.use(ElementUI);

import  Gojs  from "./Gojs";
import  Selector  from "./Selector";

Vue.config.productionTip = false

const router = new VueRouter({
  routes: [
    { path: '/diagram', component: Gojs ,name:'diagram'},
    { path: '/selector', component: Selector ,name:'selector'},
  ]
})

new Vue({
  el: '#app',
  components: { App },
  router,
  template: '<App/>'
})
