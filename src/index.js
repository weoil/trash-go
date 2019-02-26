import Pdf from './components/pdf/i-pdf.vue'
const Components = {
  IPdf: Pdf
}

export const IPdf = Pdf
const install = function(Vue, opts = {}) {
  if (install.installed) {
    return
  }
  Object.keys(Components).forEach(key => {
    Vue.component(key, Components[key])
  })
  install.installed = true
}
if (typeof window !== 'undefined' && window.Vue) {
  install(window.Vue)
}
const API = {
  version: '0.0.1',
  install
}
// module.exports.default = module.exports = API
export default API
