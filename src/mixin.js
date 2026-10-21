/**
 * guide 页第三方授权 mixin
 * 提供授权回跳处理与自动发起授权两个入口方法，其余为内部实现方法
 * 依赖宿主通过 Vue.use(thirdAuth, options) 注入 request 与登录态处理回调
 */
import { getUserInfo } from 'sadais-core/core/auth'
import { apiGetThirdAuthorizeUrl, apiGetThirdLoginBySessionId } from './api'
import {
  saveThirdAuthParams,
  getThirdAuthParams,
  removeThirdAuthParams,
  setRedirectFlag,
  hasRedirectFlag,
  removeRedirectFlag
} from './storage'
import { getConfig } from './config'

export default {
  methods: {
    /**
     * 处理第三方授权回跳：通过 sessionid 换取登录数据并保存登录态后进入首页
     * 授权回跳仅携带 sessionid，入口参数已在发起授权时存入本地
     * @param {Object} params 页面启动参数（授权回跳时仅携带 sessionid）
     * @returns {Promise<Boolean>} 是否已按授权回跳处理
     */
    async handleThirdAuthCallback(params) {
      if (!params.sessionid) return false
      // 回跳后立即清除授权跳转标记，保证下次可正常发起授权
      removeRedirectFlag()
      this.$loading()
      const { data, head } = await apiGetThirdLoginBySessionId({ sessionid: params.sessionid })
      this.$hideLoading()
      if (head.ret !== this.$consts.RET_CODE.SUCCESS) {
        await this.$toast(head.msg)
        removeThirdAuthParams()
        this.navigateAwayAfterAuth()
        return true
      }
      const { onLoginSuccess } = getConfig()
      if (onLoginSuccess) {
        onLoginSuccess(data)
      }
      this.navigateAfterLogin()
      return true
    },
    /**
     * 判断是否为第三方应用入口，未登录时自动发起授权
     * @param {Object} params 页面启动参数（携带 type、tenantid 等授权入口参数）
     * @returns {Boolean} 是否已发起授权跳转
     */
    tryThirdAuth(params) {
      if (!params.type || !params.tenantid) return false
      if (getUserInfo()) return false
      // 已发起过授权但回跳未成功，不再重复发起，避免死循环
      if (hasRedirectFlag()) {
        removeRedirectFlag()
        console.warn('第三方授权回跳异常，页面启动参数：', params)
        this.$toast('授权信息缺失，请重新进入应用')
        return false
      }
      this.handleThirdAuth(params)
      return true
    },
    /**
     * 请求第三方授权地址并整页跳转授权页
     * @param {Object} params 页面启动参数
     */
    async handleThirdAuth(params) {
      setRedirectFlag()
      // 记录第三方授权入口参数，用于 token 过期后重新走第三方授权
      saveThirdAuthParams(this.getThirdAuthParams(params))
      this.$loading()
      const { data, head } = await apiGetThirdAuthorizeUrl(this.getThirdAuthParams(params))
      this.$hideLoading()
      if (head.ret !== this.$consts.RET_CODE.SUCCESS || !data || !data.authorizeUrl) {
        removeRedirectFlag()
        removeThirdAuthParams()
        await this.$toast(head.msg)
        return this.navigateAwayAfterAuth()
      }
      this.navigateToAuthorizeUrl(data.authorizeUrl)
    },
    /**
     * 汇总第三方授权公共参数（透传页面路由参数）
     * @param {Object} params 页面启动参数
     * @returns {Object} 授权接口所需参数
     */
    getThirdAuthParams(params) {
      return {
        tenantid: params.tenantid,
        type: params.type,
        productcode: params.productcode
      }
    },
    /**
     * 是否运行在飞书客户端内
     * @returns {Boolean} 是否飞书客户端环境
     */
    isFeishuClient() {
      if (typeof window === 'undefined') return false
      return /lark|feishu/i.test(window.navigator.userAgent)
    },
    /**
     * 跳转第三方授权地址
     * applink 用于从飞书客户端外部拉起飞书，飞书客户端内 webview 无法通过它拉起飞书，
     * 需解析出 applink 内包裹的真实授权地址直接打开；非 applink 地址或非飞书环境原样跳转
     * @param {String} authorizeUrl 授权地址（可能是 applink 包裹的地址）
     */
    navigateToAuthorizeUrl(authorizeUrl) {
      if (typeof window === 'undefined') return
      if (this.isFeishuClient() && authorizeUrl.includes('applink.feishu.cn')) {
        const targetUrl = new URL(authorizeUrl).searchParams.get('url')
        if (targetUrl) {
          window.location.href = targetUrl
          return
        }
      }
      window.location.href = authorizeUrl
    },
    /**
     * 登录成功后的跳转：优先使用宿主配置回调，默认回到工程首页
     */
    navigateAfterLogin() {
      const { redirectAfterLogin } = getConfig()
      if (redirectAfterLogin) {
        return redirectAfterLogin()
      }
      this.$pi.navi.reLaunch(this.$consts.get('HOME_PATH'))
    },
    /**
     * 授权流程失败后的兜底跳转：优先使用宿主配置回调，
     * 默认未登录进工程登录页、已登录进工程首页
     */
    navigateAwayAfterAuth() {
      const { onAuthFallback } = getConfig()
      if (onAuthFallback) {
        return onAuthFallback()
      }
      if (getUserInfo()) {
        this.$pi.navi.switchTab(this.$consts.get('HOME_PATH'))
        return
      }
      this.$pi.navi.redirectTo(this.$consts.get('LOGIN_PATH'))
    }
  }
}
