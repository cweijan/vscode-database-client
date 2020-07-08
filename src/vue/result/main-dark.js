import Vue from 'vue'
import App from './App'
import ElementUI from 'element-ui';
import './theme/dark.css';
import './theme/dark-custom.css';
Vue.use(ElementUI);

Vue.config.productionTip = false

/* eslint-disable no-new */
new Vue({
  el: '#app',
  components: { App },
  template: '<App/>'
})