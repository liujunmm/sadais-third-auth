/**
 * 退出登录后重授权
 */
import { getThirdAuthParams, getThirdAuthRedirectUrl } from './storage'
import { isAuthClient } from './providers'
import { logout } from 'sadais-core/core/auth'

/**
 * 第三方授权登录用户退出登录：清除登录态后回到引导页重新授权
 * 在宿主退出登录入口调用；本地无第三方授权参数时返回 false，宿主走原有退出逻辑
 * @param {Object} hooks 宿主钩子
 * @param {Function} hooks.clearAuthState 清除登录态回调（storage 与 Vuex 同步清理，不跳转）
 * @returns {Boolean} 是否已按第三方授权回引导页重新授权
 */
export const reauthAfterLogout = ({ clearAuthState } = {}) => {
  if (!isAuthClient((getThirdAuthParams() || {}).type)) return false
  const redirectUrl = getThirdAuthRedirectUrl()
  if (!redirectUrl) return false
  logout(undefined, false)
  if (clearAuthState) {
    clearAuthState()
  }
  uni.reLaunch({ url: redirectUrl })
  return true
}
