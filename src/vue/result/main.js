import Vue from 'vue'
import App from './App'
import ElementUI from 'element-ui';
Vue.use(ElementUI);

import UmyUi from 'umy-ui'
import 'umy-ui/lib/theme-chalk/index.css'; // 引入样式
import '@/../public/theme/auto.css'
import '@/../public/theme/result.css'
Vue.use(UmyUi);

Vue.config.productionTip = false

/* eslint-disable no-new */
new Vue({
  el: '#app',
  components: { App },
  template: '<App/>'
})
