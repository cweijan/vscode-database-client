import Vue from 'vue'
import App from './App'
import ElementUI from 'element-ui';
import locale from 'element-ui/lib/locale/lang/en'
import Contextmenu from "../Contextmenu"
import UmyTable from 'umy-table'
import 'umy-table/lib/theme-chalk/index.css';
import '@/../public/theme/element.css'
import '@/../public/theme/custom.css'
import './view.css'
import './icon/iconfont.css'
import VueI18n from 'vue-i18n'
import {messages} from "../message"

Vue.use(Contextmenu).use(UmyTable)
.use(ElementUI, { locale })
.use(VueI18n)

Vue.config.productionTip = false

const i18n = new VueI18n({
  locale:'en',
  fallbackLocale: 'en',
  messages
})

new Vue({
  el: '#app',i18n,
  components: { App },
  template: '<App/>'
})
