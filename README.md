# sadais-third-auth

sadais uni-app H5 第三方授权通用逻辑（飞书等），供多个 uni-app 工程复用，避免维护多套。

功能范围：

- 引导页（`pages/guide/index`）第三方授权回跳处理与自动发起授权（含防死循环）
- 授权地址整页跳转（飞书客户端内解析 applink 直跳真实授权地址，外部保留 applink 拉起飞书）
- 回跳 `sessionid` 换取登录数据
- token 过期（登录态失效）后重新走第三方授权，不落登录页
- 退出登录后回到引导页重新授权

登录态保存、企业信息、页面跳转目标等工程差异通过宿主配置注入，不在包内处理。

## 安装

```bash
npm i sadais-third-auth
```

## 宿主配置（main.js）

```js
// #ifdef H5
import thirdAuth from 'sadais-third-auth'
import request from '@/utils/request'
Vue.use(thirdAuth, {
  request, // 必填：宿主 request 封装（含拦截器）
  onLoginSuccess: saveLoginState // 必填：登录数据保存回调
  // onAuthFallback: 授权流程失败兜底跳转回调，可选，默认未登录进 $consts LOGIN_PATH、已登录进 HOME_PATH
  // redirectAfterLogin: 登录成功后跳转回调，可选，默认 reLaunch($consts HOME_PATH)
})
// #endif
```

> 重要：所有对本包的 import 与调用必须包裹 `#ifdef H5` 条件编译，第三方授权为 H5 专属功能，可保证小程序构建完全剔除包代码、主包体积零增加。

## 接入一：guide 页（引导页）

```js
// #ifdef H5
import { thirdAuthMixin } from 'sadais-third-auth'
// #endif

export default {
  // #ifdef H5
  mixins: [thirdAuthMixin],
  // #endif
  // ...
  async initPage(params) {
    // #ifdef H5
    // 第三方授权回跳：通过 sessionid 换取登录态
    if (await this.handleThirdAuthCallback(params)) return
    // 第三方应用入口：未登录时自动发起授权
    if (this.tryThirdAuth(params)) return
    // #endif
    // ...原有 shareId / 扫码 / 默认逻辑
  }
}
```

第三方应用入口地址形如：`https://H5域名/pages/guide/index?tenantid=企业ID&type=FEISHU&productcode=产品编码`。

## 接入二：request 拦截器（token 过期重授权）

```js
// #ifdef H5
import { handleTokenExpired } from 'sadais-third-auth'
// #endif

// 响应拦截器 ret 30003 分支，清除登录态之后：
// #ifdef H5
if (handleTokenExpired()) {
  return response
}
// #endif
logout('/pages/system/pages/login/index', true)
```

## 接入三：退出登录（回引导页重新授权）

```js
// #ifdef H5
import { reauthAfterLogout } from 'sadais-third-auth'
// #endif

handleLogout() {
  // #ifdef H5
  // 第三方授权登录的用户，退出后回到引导页重新走第三方授权
  if (
    reauthAfterLogout({
      clearAuthState: () => {
        // 宿主清除登录态（storage 与 Vuex 同步清理，不跳转）
      }
    })
  ) {
    return
  }
  // #endif
  // 原有退出逻辑
}
```

## 注意事项

- 包内不使用 uni-app 条件编译，平台判断为运行时实现；`#ifdef H5` 保留在宿主调用处。
- 第三方授权入口参数在发起授权时存入本地（`THIRD_AUTH_PARAMS`），授权回跳仅携带 `sessionid`，token 过期重授权依赖该参数。
- 授权发起后未回跳成功前存在跳转标记（`THIRD_AUTH_REDIRECT_FLAG`），防止异常回跳后重复自动发起造成死循环。
- 登录数据结构假定与宿主登录接口同构（tokenDto、staffInfoDto 等），差异在宿主 `onLoginSuccess` 内消化。
