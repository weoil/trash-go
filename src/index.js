import IPdf from '../src/components/pdf/i-pdf.vue'
const Components = {
  IPdf: IPdf
}
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
module.exports.default = module.exports = API
