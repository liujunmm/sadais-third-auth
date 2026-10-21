/**
 * token 过期重授权
 */
import { getConsts } from 'sadais-core/consts'
import { logout } from 'sadais-core/core/auth'
import { isAuthClient } from './providers'
import { getThirdAuthParams, getThirdAuthRedirectUrl } from './storage'

let isRedirecting = false
let isFallbackInstalled = false

/**
 * token 过期处理：第三方授权登录的账号重新走第三方授权，避免跳回登录页
 * 在宿主 request 响应拦截器中、清除登录态之后调用
 * @returns {Boolean} 是否已按第三方授权重新发起（true 时宿主不再跳转登录页）
 */
export const handleTokenExpired = () => {
  if (!isAuthClient((getThirdAuthParams() || {}).type)) return false
  const redirectUrl = getThirdAuthRedirectUrl()
  if (!redirectUrl) return false
  if (isRedirecting) return true
  isRedirecting = true
  try {
    logout(undefined, false)
    window.location.replace(redirectUrl)
  } catch (error) {
    isRedirecting = false
    throw error
  }
  return true
}

/** 接住 sadais-core 刷新 token 失败后的登录页导航，保留其正常刷新行为。 */
export const installTokenFallback = () => {
  if (isFallbackInstalled || typeof uni === 'undefined' || !uni.addInterceptor) return
  uni.addInterceptor('reLaunch', {
    invoke(options) {
      if (!isAuthClient((getThirdAuthParams() || {}).type)) return
      const loginPath = getConsts('LOGIN_PATH')
      const targetPath = (options.url || '').split('?')[0].replace(/^\//, '')
      if (!loginPath || targetPath !== loginPath.replace(/^\//, '')) return
      const redirectUrl = getThirdAuthRedirectUrl()
      if (!redirectUrl) return
      logout(undefined, false)
      options.url = redirectUrl
    }
  })
  isFallbackInstalled = true
}
