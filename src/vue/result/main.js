import Vue from 'vue'
import App from './App'
import ElementUI from 'element-ui';
import locale from 'element-ui/lib/locale/lang/en'
Vue.use(ElementUI, { locale });

import UmyUi from 'umy-ui'
import 'umy-ui/lib/theme-chalk/index.css';
import '@/../public/theme/auto.css'
import './view.css'
import './umyui.css'
Vue.use(UmyUi);

Vue.config.productionTip = false

new Vue({
  el: '#app',
  components: { App },
  template: '<App/>'
})
