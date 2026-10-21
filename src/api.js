/**
 * 第三方授权接口封装（request 由宿主注入，自动携带宿主拦截器的公共参数）
 */
import { getConfig } from './config'

/**
 * 获取第三方授权地址，返回的 authorizeUrl 需整页跳转
 * @param {Object} params 授权参数：tenantid 企业码、type 授权类型、productcode 产品编码
 * @returns {Promise} 接口响应数据
 */
export const apiGetThirdAuthorizeUrl = async (params) => {
  const { request } = getConfig()
  const { data } = await request.get('/api/third/auth/v1/authorize/authorizeurl', { params })
  return data
}

/**
 * 通过授权会话 ID 换取登录数据，数据结构同登录接口
 * @param {Object} params 参数：sessionid 授权会话 ID
 * @returns {Promise} 接口响应数据
 */
export const apiGetThirdLoginBySessionId = async (params) => {
  const { request } = getConfig()
  const { data } = await request.get('/api/third/auth/v1/authorize/getbysessionid', { params })
  return data
}
