/**
 * 第三方授权本地存储：授权入口参数与防死循环标记
 * 使用 sadais-core storage 保证与宿主工程读写序列化行为一致
 */
import { getStorage, setStorage, removeStorage } from 'sadais-core/core/storage'

const THIRD_AUTH_PARAMS = 'THIRD_AUTH_PARAMS' // 第三方授权入口参数
const THIRD_AUTH_REDIRECT_FLAG = 'THIRD_AUTH_REDIRECT_FLAG' // 授权跳转防死循环标记

/**
 * 保存第三方授权入口参数到本地存储中
 * 用途：token 过期后重新走第三方授权（授权回跳仅携带 sessionid，无入口参数）
 * @param {Object} thirdAuthParams 授权入口参数（tenantid、type、productcode）
 */
export const saveThirdAuthParams = (thirdAuthParams) => {
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
 * 设置授权跳转标记：授权发起后未回跳成功前存在，防止异常回跳后重复自动发起造成死循环
 */
export const setRedirectFlag = () => {
  uni.setStorageSync(THIRD_AUTH_REDIRECT_FLAG, 1)
}

/**
 * 是否存在授权跳转标记
 * @returns {Boolean} 标记是否存在
 */
export const hasRedirectFlag = () => {
  return !!uni.getStorageSync(THIRD_AUTH_REDIRECT_FLAG)
}

/**
 * 移除授权跳转标记
 */
export const removeRedirectFlag = () => {
  uni.removeStorageSync(THIRD_AUTH_REDIRECT_FLAG)
}

/**
 * 获取第三方授权重新授权的引导页地址（guide 页携带授权入口参数）
 * @returns {String} 有效的重新授权地址，非第三方授权登录时返回空字符串
 */
export const getThirdAuthRedirectUrl = () => {
  const thirdAuthParams = getThirdAuthParams() || {}
  if (!thirdAuthParams.type || !thirdAuthParams.tenantid) return ''
  const query = Object.keys(thirdAuthParams)
    .map((key) => `${key}=${encodeURIComponent(thirdAuthParams[key])}`)
    .join('&')
  return `/pages/guide/index?${query}`
}
