/**
 * sadais-third-auth
 * sadais uni-app H5 第三方授权通用逻辑（飞书等）
 * 授权跳转、回跳换取登录态、token 过期重授权、退出重授权
 */
import { initConfig } from './config'
import thirdAuthMixin from './mixin'
import { handleTokenExpired, installTokenFallback } from './token'
import { reauthAfterLogout } from './logout'

/**
 * Vue 插件安装：注册第三方授权宿主配置
 * @param {Vue} Vue Vue 构造器
 * @param {Object} options 宿主配置
 * @param {Object} options.request 宿主 request 封装（含拦截器），必填
 * @param {Function} options.onLoginSuccess 登录数据保存回调，必填
 * @param {Function} options.onAuthFallback 授权流程失败兜底跳转回调，可选
 * @param {Function} options.redirectAfterLogin 登录成功后跳转回调，可选
 * @param {Object} options.providers 按授权 type 注册的客户端适配器，可选
 */
const install = (Vue, options = {}) => {
  initConfig(options)
  installTokenFallback()
}

export { thirdAuthMixin, handleTokenExpired, reauthAfterLogout }

export default {
  install
}
