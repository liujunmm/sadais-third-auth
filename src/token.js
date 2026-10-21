/**
 * token 过期重授权
 */
import { isH5 } from './env'
import { getThirdAuthRedirectUrl } from './storage'

/**
 * token 过期处理：第三方授权登录的账号重新走第三方授权，避免跳回登录页
 * 在宿主 request 响应拦截器中、清除登录态之后调用
 * @returns {Boolean} 是否已按第三方授权重新发起（true 时宿主不再跳转登录页）
 */
export const handleTokenExpired = () => {
  if (!isH5()) return false
  const redirectUrl = getThirdAuthRedirectUrl()
  if (!redirectUrl) return false
  window.location.href = redirectUrl
  return true
}
