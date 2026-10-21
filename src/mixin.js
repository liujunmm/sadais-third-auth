/**
 * H5 第三方授权入口及回调，客户端差异由授权适配器处理。
 */
import { getConsts } from 'sadais-core/consts'
import { getUserInfo, logout } from 'sadais-core/core/auth'
import { apiGetThirdAuthorizeUrl, apiGetThirdLoginBySessionId } from './api'
import {
  saveThirdAuthParams,
  getThirdAuthParams,
  removeThirdAuthParams,
  setRedirectFlag,
  hasRedirectFlag,
  removeRedirectFlag
} from './storage'
import { getAuthProvider, isAuthClient, resolveAuthorizeUrl } from './providers'
import { getConfig } from './config'

export default {
  data() {
    return {
      thirdAuthPending: false,
      thirdAuthCallbackPending: false
    }
  },
  methods: {
    async handleThirdAuthCallback(params = {}) {
      if (!params.sessionid) return false
      if (this.thirdAuthCallbackPending) return true
      this.thirdAuthCallbackPending = true
      let isSavingLogin = false
      let isLoginSaved = false
      let failureMessage = '授权登录失败，请重新进入应用'
      try {
        const authParams = getThirdAuthParams()
        if (!authParams || !authParams.tenantid || !authParams.type) {
          await this.handleThirdAuthFailure({
            message: '授权上下文已失效，请从授权客户端重新进入应用'
          })
          return true
        }
        const clientError = this.getThirdAuthClientError(authParams.type)
        if (clientError) {
          await this.handleThirdAuthFailure({ message: clientError })
          return true
        }
        this.$loading()
        try {
          const result = await apiGetThirdLoginBySessionId({ sessionid: params.sessionid })
          if (!result || !result.head || result.head.ret !== this.$consts.RET_CODE.SUCCESS) {
            failureMessage = (result && result.head && result.head.msg) || failureMessage
            throw new Error('Third-party login failed')
          }
          isSavingLogin = true
          await getConfig().onLoginSuccess(result.data)
          isSavingLogin = false
          isLoginSaved = true
        } finally {
          this.$hideLoading()
        }
        removeRedirectFlag()
        failureMessage = '登录成功，页面跳转失败，请重试'
        await this.navigateAfterLogin()
      } catch (error) {
        // 保存钩子可能只写入了部分登录态，失败时不得带着残缺状态进入首页。
        if (isSavingLogin) logout(undefined, false)
        await this.handleThirdAuthFailure({ message: failureMessage, preserveParams: isLoginSaved })
      } finally {
        this.thirdAuthCallbackPending = false
      }
      return true
    },
    tryThirdAuth(params = {}) {
      if (!params.type || !params.tenantid) return false
      if (isAuthClient(params.type) && getUserInfo()) return false
      this.handleThirdAuth(params)
      return true
    },
    async handleThirdAuth(params = {}) {
      if (this.thirdAuthPending) return
      this.thirdAuthPending = true
      try {
        const authParams = this.getThirdAuthParams(params)
        if (!authParams.tenantid || !authParams.type || !authParams.productcode) {
          return await this.handleThirdAuthFailure({ message: '授权入口参数无效，请重新进入应用' })
        }
        const clientError = this.getThirdAuthClientError(authParams.type)
        if (clientError) {
          return await this.handleThirdAuthFailure({ message: clientError })
        }
        if (hasRedirectFlag(authParams)) {
          // 同一次异常回跳不自动重试；重新进入的用户可明确选择再次授权。
          const retry = await new Promise((resolve, reject) => {
            uni.showModal({
              title: '授权未完成',
              content: '上次授权未完成，是否重新授权？',
              confirmText: '重新授权',
              success: result => resolve(result.confirm),
              fail: reject
            })
          })
          if (!retry) {
            return await this.handleThirdAuthFailure({ message: '已取消授权' })
          }
        }
        saveThirdAuthParams(authParams)
        let result
        this.$loading()
        try {
          result = await apiGetThirdAuthorizeUrl(authParams)
        } finally {
          this.$hideLoading()
        }
        if (
          !result ||
          !result.head ||
          result.head.ret !== this.$consts.RET_CODE.SUCCESS ||
          !result.data ||
          !result.data.authorizeUrl
        ) {
          return await this.handleThirdAuthFailure({
            message: (result && result.head && result.head.msg) || '无法获取授权地址，请稍后重试'
          })
        }
        setRedirectFlag(authParams)
        this.navigateToAuthorizeUrl(result.data.authorizeUrl, authParams.type)
      } catch (error) {
        await this.handleThirdAuthFailure({ message: '授权请求异常，请稍后重试' })
      } finally {
        this.thirdAuthPending = false
      }
    },
    getThirdAuthParams(params) {
      return {
        tenantid: params.tenantid,
        type: typeof params.type === 'string' ? params.type.toUpperCase() : '',
        productcode: params.productcode || getConsts('NAME')
      }
    },
    getThirdAuthClientError(type) {
      const provider = getAuthProvider(type)
      if (!provider) return '暂不支持该授权类型'
      return isAuthClient(type) ? '' : `请在${provider.clientName}内打开应用进行授权`
    },
    navigateToAuthorizeUrl(authorizeUrl, type) {
      const authType = type || (getThirdAuthParams() || {}).type
      window.location.href = resolveAuthorizeUrl(authType, authorizeUrl)
    },
    async handleThirdAuthFailure({ message, preserveParams = false }) {
      removeRedirectFlag()
      if (!preserveParams) removeThirdAuthParams()
      await this.$toast(message)
      try {
        await this.navigateAwayAfterAuth()
      } catch (error) {
        await this.$toast('页面跳转失败，请重新进入应用')
      }
    },
    navigateAfterLogin() {
      const { redirectAfterLogin } = getConfig()
      if (redirectAfterLogin) return redirectAfterLogin()
      return this.$pi.navi.reLaunch(this.$consts.get('HOME_PATH'))
    },
    navigateAwayAfterAuth() {
      const { onAuthFallback } = getConfig()
      if (onAuthFallback) return onAuthFallback()
      if (getUserInfo()) return this.$pi.navi.switchTab(this.$consts.get('HOME_PATH'))
      return this.$pi.navi.redirectTo(this.$consts.get('LOGIN_PATH'))
    }
  }
}
