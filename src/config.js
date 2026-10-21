/**
 * 宿主配置存取
 */

import feishuProvider from './feishu-provider'

// 宿主配置（request 与登录态处理由宿主工程注入）
let hostConfig = {
  request: null, // 宿主 request 封装（含拦截器），必填
  onLoginSuccess: null, // 登录数据保存回调，宿主自行处理 token/Vuex/企业信息，必填
  onAuthFallback: null, // 授权流程失败兜底跳转回调，可选
  redirectAfterLogin: null, // 登录成功后跳转回调，可选
  providers: { FEISHU: feishuProvider }
}

/**
 * 初始化第三方授权宿主配置
 * @param {Object} options 宿主配置（request、onLoginSuccess 必填）
 */
export const initConfig = options => {
  if (!options || !options.request || typeof options.request.get !== 'function') {
    throw new TypeError('sadais-third-auth: request.get 必须是函数')
  }
  if (typeof options.onLoginSuccess !== 'function') {
    throw new TypeError('sadais-third-auth: onLoginSuccess 必须是函数')
  }
  for (const key of ['onAuthFallback', 'redirectAfterLogin']) {
    if (options[key] != null && typeof options[key] !== 'function') {
      throw new TypeError(`sadais-third-auth: ${key} 必须是函数`)
    }
  }
  const providers = { FEISHU: feishuProvider }
  if (options.providers != null) {
    if (typeof options.providers !== 'object' || Array.isArray(options.providers)) {
      throw new TypeError('sadais-third-auth: providers 必须是对象')
    }
    for (const type of Object.keys(options.providers)) {
      const provider = options.providers[type]
      if (
        !type.trim() ||
        !provider ||
        typeof provider.clientName !== 'string' ||
        !provider.clientName.trim() ||
        typeof provider.isClient !== 'function' ||
        (provider.resolveAuthorizeUrl != null && typeof provider.resolveAuthorizeUrl !== 'function')
      ) {
        throw new TypeError(`sadais-third-auth: 无效的授权适配器 ${type}`)
      }
      Object.defineProperty(providers, type.toUpperCase(), {
        value: { ...provider },
        enumerable: true,
        configurable: true,
        writable: true
      })
    }
  }
  hostConfig = { ...hostConfig, ...options, providers }
}

/**
 * 获取宿主配置
 * @returns {Object} 宿主配置
 */
export const getConfig = () => hostConfig
