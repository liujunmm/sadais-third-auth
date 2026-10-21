/**
 * 第三方授权本地存储：授权入口参数与防死循环标记
 * 使用 sadais-core storage 保证与宿主工程读写序列化行为一致
 */
import { getStorage, setStorage, removeStorage, getStorageKey } from 'sadais-core/core/storage'

const THIRD_AUTH_PARAMS = 'THIRD_AUTH_PARAMS' // 第三方授权入口参数
const THIRD_AUTH_REDIRECT_FLAG = 'THIRD_AUTH_REDIRECT_FLAG' // 授权跳转防死循环标记
const REDIRECT_FLAG_TTL = 5 * 60 * 1000

/**
 * 保存第三方授权入口参数到本地存储中
 * 用途：token 过期后重新走第三方授权（授权回跳仅携带 sessionid，无入口参数）
 * @param {Object} thirdAuthParams 授权入口参数（tenantid、type、productcode）
 */
export const saveThirdAuthParams = thirdAuthParams => {
  return setStorage(THIRD_AUTH_PARAMS, thirdAuthParams)
}

/**
 * 获取第三方授权入口参数
 * @returns {Object} 授权入口参数，未存储时返回空值
 */
export const getThirdAuthParams = () => {
  return getStorage(THIRD_AUTH_PARAMS)
}

/**
 * 移除第三方授权入口参数
 */
export const removeThirdAuthParams = () => {
  return removeStorage(THIRD_AUTH_PARAMS)
}

/**
 * 授权标记仅保存在当前标签页，避免其他页面、产品的授权互相干扰
 */
export const setRedirectFlag = params => {
  window.sessionStorage.setItem(
    getStorageKey(THIRD_AUTH_REDIRECT_FLAG),
    JSON.stringify({ ...params, createdAt: Date.now() })
  )
}

/**
 * 是否存在授权跳转标记
 * @returns {Boolean} 标记是否存在
 */
export const hasRedirectFlag = params => {
  const value = window.sessionStorage.getItem(getStorageKey(THIRD_AUTH_REDIRECT_FLAG))
  if (!value) return false
  let flag
  try {
    flag = JSON.parse(value)
  } catch (error) {
    removeRedirectFlag()
    return false
  }
  const age = flag && Date.now() - flag.createdAt
  if (!flag || !Number.isFinite(age) || age < 0 || age >= REDIRECT_FLAG_TTL) {
    removeRedirectFlag()
    return false
  }
  return ['tenantid', 'type', 'productcode'].every(key => flag[key] === params[key])
}

/**
 * 移除授权跳转标记
 */
export const removeRedirectFlag = () => {
  try {
    window.sessionStorage.removeItem(getStorageKey(THIRD_AUTH_REDIRECT_FLAG))
  } catch (error) {
    // 存储不可用时仍允许授权失败流程退出。
  }
  // 清理 0.1.3 及之前版本写入的永久标记。
  uni.removeStorageSync(THIRD_AUTH_REDIRECT_FLAG)
}

/**
 * 获取第三方授权重新授权的引导页地址（guide 页携带授权入口参数）
 * @returns {String} 有效的重新授权地址，非第三方授权登录时返回空字符串
 */
export const getThirdAuthRedirectUrl = () => {
  const thirdAuthParams = getThirdAuthParams() || {}
  if (
    typeof thirdAuthParams.type !== 'string' ||
    !thirdAuthParams.type ||
    !thirdAuthParams.tenantid
  )
    return ''
  const query = ['tenantid', 'type', 'productcode']
    .filter(key => thirdAuthParams[key] != null && thirdAuthParams[key] !== '')
    .map(key => `${key}=${encodeURIComponent(thirdAuthParams[key])}`)
    .join('&')
  return `/pages/guide/index?${query}`
}
