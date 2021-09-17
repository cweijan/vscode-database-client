import Vue from 'vue'
import App from './App'
import ElementUI from 'element-ui';
import locale from 'element-ui/lib/locale/lang/en'
Vue.use(ElementUI, { locale });
import Contextmenu from "../Contextmenu"
Vue.use(Contextmenu);
import UmyTable from 'umy-table'
import 'umy-table/lib/theme-chalk/index.css';
import '@/../public/theme/element.css'
import '@/../public/theme/custom.css'
import './view.css'
import './icon/iconfont.css'
Vue.use(UmyTable);

Vue.config.productionTip = false

new Vue({
  el: '#app',
  components: { App },
  template: '<App/>'
})
