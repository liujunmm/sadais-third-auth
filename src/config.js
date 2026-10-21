/**
 * 宿主配置存取
 */

// 宿主配置（request 与登录态处理由宿主工程注入）
let hostConfig = {
  request: null, // 宿主 request 封装（含拦截器），必填
  onLoginSuccess: null, // 登录数据保存回调，宿主自行处理 token/Vuex/企业信息，必填
  onAuthFallback: null, // 授权流程失败兜底跳转回调，可选
  redirectAfterLogin: null // 登录成功后跳转回调，可选
}

/**
 * 初始化第三方授权宿主配置
 * @param {Object} options 宿主配置（request、onLoginSuccess 必填）
 */
export const initConfig = (options) => {
  hostConfig = { ...hostConfig, ...options }
}

/**
 * 获取宿主配置
 * @returns {Object} 宿主配置
 */
export const getConfig = () => hostConfig
