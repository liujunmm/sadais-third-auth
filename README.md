# sadais-third-auth

sadais uni-app H5 第三方授权通用逻辑，供多个 uni-app 工程复用。

公共流程按入口 `type` 选择授权适配器，不绑定特定客户端。目前内置飞书适配器（`FEISHU`），后续可独立注册企业微信等适配器。未注册的授权类型会提示暂不支持，再走宿主的兜底页面。

飞书适配器仅允许从飞书 App 内发起和完成飞书授权。外部浏览器访问飞书授权入口或回调时会提示在飞书中打开；不通过 applink 拉起飞书。这项限制属于飞书适配器，不影响其他适配器的客户端策略。

功能范围：

- 引导页（`pages/guide/index`）第三方授权回跳处理与自动发起授权（含防死循环）
- 授权地址整页跳转（各适配器解析地址，公共层统一要求最终地址使用 HTTPS；飞书适配器仅提取 applink 内的真实授权地址）
- 回跳 `sessionid` 换取登录数据
- token 过期（登录态失效）或刷新 token 失败后重新走第三方授权，并发过期响应只触发一次整页跳转
- 退出登录后回到引导页重新授权

登录态保存、企业信息、页面跳转目标等工程差异通过宿主配置注入，不在包内处理。

## 安装

```bash
npm i sadais-third-auth@^0.1.4
```

## 宿主配置（main.js）

```js
// #ifdef H5
import thirdAuth from 'sadais-third-auth'
import request from '@/utils/request'
import { saveLoginState } from '@/utils/login-state'
Vue.use(thirdAuth, {
  request, // 必填：宿主 request 封装（含拦截器）
  onLoginSuccess: saveLoginState // 必填：登录数据保存回调，支持 Promise，完成后才跳转
  // onAuthFallback: 授权流程失败兜底跳转回调，可选，默认未登录进 $consts LOGIN_PATH、已登录进 HOME_PATH
  // redirectAfterLogin: 登录成功后跳转回调，可选，默认 reLaunch($consts HOME_PATH)
})
// #endif
```

安装时会校验 `request.get`、`onLoginSuccess` 以及可选跳转钩子的类型。跳转钩子也可返回 Promise，拒绝时进入错误处理。

> 重要：所有对本包的 import 与调用必须包裹 `#ifdef H5` 条件编译，第三方授权为 H5 专属功能，可保证小程序构建完全剔除包代码、主包体积零增加。

## 扩展授权适配器

在现有 `Vue.use` 配置中传入 `providers` 即可扩展，不需要修改入口、回调或重授权流程。例如下面是企业微信适配器的注册示意，尚未完成真实企业微信授权联调；`WECOM` 仅为示例，实际 `type` 须与后端约定一致。

```js
Vue.use(thirdAuth, {
  request,
  onLoginSuccess: saveLoginState,
  providers: {
    WECOM: {
      clientName: '企业微信',
      isClient: () => /wxwork/i.test(window.navigator.userAgent)
      // resolveAuthorizeUrl: url => url // 可选：按该平台规则解析接口返回的授权地址
    }
  }
})
```

- `providers` 的键对应入口 `type`，统一转为大写后匹配；注册其他类型时保留内置 `FEISHU`。
- `clientName` 为必填的客户端显示名称，用于环境不符合时的提示。
- `isClient()` 为必填的同步函数，严格返回布尔值；返回 `true` 才允许在 H5 中授权。客户端判断仅控制入口，不代替服务端身份校验。
- `resolveAuthorizeUrl(url)` 为可选同步函数，返回解析后的绝对 HTTPS 地址字符串。不配置时直接使用接口返回地址，公共层始终校验 HTTPS。
- 入口、回调兑换、token 过期、刷新失败兜底和退出重授权都使用同一适配器；回调及重授权根据本地保存的授权 `type` 选择适配器。
- 配置会在安装时校验，失败时不会写入部分配置。显式注册同名类型可替换其完整适配器；`providers` 配置不会与上一次安装的自定义适配器合并。

适配器负责客户端识别和地址解析；登录数据获取、凭证保存、防重复跳转和宿主导航由公共流程统一处理。真实新增平台仍需后端支持对应授权类型和 `sessionid` 兑换协议。

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

插件安装时自动通过 `uni.addInterceptor('reLaunch')` 处理底层刷新 token 失败的出口：存在第三方授权上下文且对应适配器确认当前客户端可授权时，将目标为宿主 `LOGIN_PATH` 的导航改为授权引导页，并清除过期凭证。保留 `sadais-core` 原有的正常刷新流程；普通登录用户继续进入普通登录页。授权失败会先清理第三方上下文，因此兜底登录页不会再次触发重授权。

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
- 第三方授权入口参数在发起授权时存入本地（`THIRD_AUTH_PARAMS`），授权回跳仅携带 `sessionid`，必须保留该上下文且符合对应适配器的客户端要求；缺失上下文时拒绝兑换登录态并提示重新进入。
- 跳转标记保存在当前标签页的 `sessionStorage` 中，按产品隔离、关联入口参数，有效期为 5 分钟。同一入口的未完成授权会提示用户选择重新授权或取消；其他租户、其他标签页及过期标记不会阻塞新授权。旧版永久标记不再参与判断。
- 登录数据结构假定与宿主登录接口同构（tokenDto、staffInfoDto 等），差异在宿主 `onLoginSuccess` 内消化。
- 内置飞书适配器依赖 User-Agent 识别客户端；授权凭证与会话的有效性仍由服务端校验。

## 开发验证

使用 Node.js 22 执行 `npm test`。测试使用隔离的浏览器、存储和宿主接口模拟，不调用真实授权服务。
