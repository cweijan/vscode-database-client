import Vue from 'vue'
import App from './App'
import ElementUI from 'element-ui';
import './theme/dark/dark.cssx';
import './theme/dark/dark-custom.css';
Vue.use(ElementUI);

Vue.config.productionTip = false

/* eslint-disable no-new */
new Vue({
  el: '#app',
  components: { App },
  template: '<App/>'
})