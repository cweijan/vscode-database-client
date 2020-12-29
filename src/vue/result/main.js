import Vue from 'vue'
import App from './App'
import ElementUI from 'element-ui';
import locale from 'element-ui/lib/locale/lang/en'
Vue.use(ElementUI, { locale });

import UmyUi from 'umy-ui'
import './index.css'
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
