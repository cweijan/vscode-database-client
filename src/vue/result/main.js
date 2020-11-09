import Vue from 'vue'
import App from './App'
import ElementUI from 'element-ui';
Vue.use(ElementUI);

import UmyUi from 'umy-ui'
import 'umy-ui/lib/theme-chalk/index.css'; // 引入样式
Vue.use(UmyUi);

Vue.config.productionTip = false

/* eslint-disable no-new */
new Vue({
  el: '#app',
  components: { App },
  template: '<App/>'
})
