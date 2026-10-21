const assert = require('node:assert/strict')
const { test } = require('node:test')
const { authParams, createHost, deferred } = require('./helpers.cjs')

const count = (host, type) => host.events.filter(item => item[0] === type).length

test('external browsers cannot initiate or redeem Feishu authorization', async () => {
  const host = await createHost({ agent: 'Chrome/120' })
  await host.view.handleThirdAuth(authParams)
  host.storage.saveThirdAuthParams(authParams)
  await host.view.handleThirdAuthCallback({ sessionid: 'session-a' })
  assert.equal(count(host, 'request'), 0)
  assert.equal(count(host, 'authorize'), 0)
  assert.equal(count(host, 'login'), 2)
  host.storage.saveThirdAuthParams(authParams)
  assert.equal(host.api.handleTokenExpired(), false)
  assert.equal(host.api.reauthAfterLogout(), false)
})

test('unsupported providers are rejected and product code defaults to the host product', async () => {
  const host = await createHost()
  await host.view.handleThirdAuth({ ...authParams, type: 'OTHER' })
  assert.equal(count(host, 'request'), 0)
  await host.view.handleThirdAuth({ tenantid: 'tenant-a', type: 'feishu' })
  assert.equal(host.storage.getThirdAuthParams().productcode, 'WTB')
  assert.equal(host.storage.getThirdAuthParams().type, 'FEISHU')
  assert.equal(count(host, 'authorize'), 1)
})

test('Feishu opens the HTTPS authorization URL wrapped by applink', async () => {
  const host = await createHost()
  const target = 'https://open.feishu.cn/authorize?state=a%26b'
  host.setRequest(async () => ({
    data: {
      head: { ret: 0 },
      data: {
        authorizeUrl: `https://applink.feishu.cn/client/web_url/open?url=${encodeURIComponent(
          target
        )}`
      }
    }
  }))
  await host.view.handleThirdAuth(authParams)
  assert.equal(host.events.find(item => item[0] === 'authorize')[1], target)
  assert.equal(host.storage.hasRedirectFlag(authParams), true)
})

test('invalid, incomplete and nested applinks do not launch an external app', async () => {
  for (const url of [
    'https://applink.feishu.cn/client/web_url/open',
    'javascript:alert(1)',
    'feishu://open',
    'https://applink.feishu.cn/open?url=https%3A%2F%2Fapplink.feishu.cn%2Fopen'
  ]) {
    const host = await createHost()
    host.setRequest(async () => ({ data: { head: { ret: 0 }, data: { authorizeUrl: url } } }))
    await host.view.handleThirdAuth(authParams)
    assert.equal(count(host, 'authorize'), 0, url)
    assert.equal(count(host, 'login'), 1, url)
    assert.equal(host.storage.getThirdAuthParams(), undefined)
    assert.equal(count(host, 'loading'), count(host, 'hide'))
  }
})

test('a stale legacy flag cannot block a new entry', async () => {
  const host = await createHost()
  host.uni.setStorageSync('THIRD_AUTH_REDIRECT_FLAG', 1)
  await host.view.handleThirdAuth(authParams)
  assert.equal(count(host, 'modal'), 0)
  assert.equal(count(host, 'authorize'), 1)
})

test('an unfinished attempt offers an explicit retry without redirecting to login', async () => {
  const host = await createHost()
  host.storage.setRedirectFlag(authParams)
  await host.view.handleThirdAuth(authParams)
  assert.equal(count(host, 'modal'), 1)
  assert.equal(count(host, 'authorize'), 1)
  assert.equal(count(host, 'login'), 0)
})

test('cancelling a retry clears the pending context and leaves the authorization loop', async () => {
  const host = await createHost({ confirm: false })
  host.storage.saveThirdAuthParams(authParams)
  host.storage.setRedirectFlag(authParams)
  await host.view.handleThirdAuth(authParams)
  assert.equal(count(host, 'request'), 0)
  assert.equal(count(host, 'login'), 1)
  assert.equal(host.storage.getThirdAuthRedirectUrl(), '')
  assert.equal(host.storage.hasRedirectFlag(authParams), false)
})

test('expired attempts, other tenants, other tabs and other products do not block entry', async () => {
  const host = await createHost()
  host.storage.setRedirectFlag(authParams)
  assert.equal(host.storage.hasRedirectFlag({ ...authParams, tenantid: 'tenant-b' }), false)
  host.setNow(Date.now() + 6 * 60 * 1000)
  assert.equal(host.storage.hasRedirectFlag(authParams), false)
  host.storage.setRedirectFlag(authParams)
  const otherTab = await createHost({ local: host.local })
  assert.equal(otherTab.storage.hasRedirectFlag(authParams), false)
  const otherProduct = await createHost({ session: host.session, product: 'XTB' })
  assert.equal(otherProduct.storage.hasRedirectFlag(authParams), false)
})

test('duplicate authorization entry calls only issue one request', async () => {
  const host = await createHost()
  const response = deferred()
  host.setRequest(() => response.promise)
  const first = host.view.handleThirdAuth(authParams)
  await host.view.handleThirdAuth(authParams)
  assert.equal(count(host, 'request'), 1)
  response.resolve({
    data: { head: { ret: 0 }, data: { authorizeUrl: 'https://open.feishu.cn/auth' } }
  })
  await first
  assert.equal(count(host, 'authorize'), 1)
})

test('callback waits for async state saving and handles duplicate callbacks once', async () => {
  const host = await createHost()
  const saving = deferred()
  const navigation = deferred()
  host.storage.saveThirdAuthParams(authParams)
  host.configure({
    onLoginSuccess: () => saving.promise,
    redirectAfterLogin: () => {
      host.events.push(['navigation'])
      return navigation.promise
    }
  })
  let finished = false
  const first = host.view.handleThirdAuthCallback({ sessionid: 'session-a' }).then(() => {
    finished = true
  })
  await host.view.handleThirdAuthCallback({ sessionid: 'session-a' })
  assert.equal(count(host, 'request'), 1)
  assert.equal(count(host, 'navigation'), 0)
  saving.resolve()
  await new Promise(setImmediate)
  assert.equal(count(host, 'navigation'), 1)
  assert.equal(finished, false)
  assert.equal(count(host, 'loading'), count(host, 'hide'))
  navigation.resolve()
  await first
  assert.equal(finished, true)
})

test('callback without the initiating context cannot create a partial third-party session', async () => {
  const host = await createHost()
  assert.equal(await host.view.handleThirdAuthCallback({ sessionid: 'session-a' }), true)
  assert.equal(count(host, 'request'), 0)
  assert.equal(count(host, 'save'), 0)
  assert.equal(count(host, 'login'), 1)
})

test('failed async state saving clears partially saved credentials', async () => {
  const host = await createHost()
  host.storage.saveThirdAuthParams(authParams)
  host.configure({
    onLoginSuccess: async () => {
      host.setStorage('USER_INFO', { userid: 'partial' })
      host.setStorage('REFRESH_TOKEN_ID', 'partial-refresh')
      throw new Error('saving failed')
    }
  })
  await host.view.handleThirdAuthCallback({ sessionid: 'session-a' })
  assert.equal(host.getStorage('USER_INFO'), undefined)
  assert.equal(host.getStorage('REFRESH_TOKEN_ID'), undefined)
  assert.equal(count(host, 'login'), 1)
})

test('network errors and malformed responses release loading and fall back', async () => {
  for (const callback of [false, true]) {
    for (const malformed of [false, true]) {
      const host = await createHost()
      host.storage.saveThirdAuthParams(authParams)
      host.setRequest(async () => {
        if (malformed) return {}
        throw new Error('network disconnected')
      })
      if (callback) await host.view.handleThirdAuthCallback({ sessionid: 'session-a' })
      else await host.view.handleThirdAuth(authParams)
      assert.equal(count(host, 'loading'), count(host, 'hide'))
      assert.equal(count(host, 'login'), 1)
      assert.equal(host.storage.getThirdAuthRedirectUrl(), '')
    }
  }
})

test('unavailable session storage does not prevent failure fallback', async () => {
  const host = await createHost()
  host.context.window.sessionStorage.getItem = () => {
    throw new Error('storage unavailable')
  }
  host.context.window.sessionStorage.removeItem = () => {
    throw new Error('storage unavailable')
  }
  await host.view.handleThirdAuth(authParams)
  assert.equal(count(host, 'login'), 1)
  assert.equal(host.view.thirdAuthPending, false)
})

test('authorization failure can navigate to login without being reauthorized again', async () => {
  const host = await createHost()
  host.configure({
    onAuthFallback: () => host.uni.reLaunch({ url: '/pages/login/index' })
  })
  host.setRequest(async () => {
    throw new Error('network disconnected')
  })
  await host.view.handleThirdAuth(authParams)
  assert.equal(host.events.find(item => item[0] === 'reLaunch')[1], '/pages/login/index')
  assert.equal(count(host, 'clear'), 0)
})

test('rejected success navigation is awaited and retains the successful login context', async () => {
  const host = await createHost()
  host.storage.saveThirdAuthParams(authParams)
  host.configure({
    onLoginSuccess: async () => host.setStorage('USER_INFO', { userid: 'saved' }),
    redirectAfterLogin: async () => {
      throw new Error('navigation failed')
    }
  })
  await host.view.handleThirdAuthCallback({ sessionid: 'session-a' })
  assert.equal(count(host, 'home'), 1)
  assert.ok(host.storage.getThirdAuthRedirectUrl())
})

test('concurrent expiry responses clear credentials and replace the page only once', async () => {
  const host = await createHost()
  host.storage.saveThirdAuthParams(authParams)
  host.setStorage('USER_INFO', { userid: 'expired' })
  host.setStorage('TOKEN_ID', 'expired-token')
  host.setStorage('REFRESH_TOKEN_ID', 'expired-refresh')
  for (let index = 0; index < 3; index++) assert.equal(host.api.handleTokenExpired(), true)
  assert.equal(count(host, 'replace'), 1)
  assert.equal(count(host, 'clear'), 1)
  assert.equal(host.getStorage('USER_INFO'), undefined)
  assert.equal(host.getStorage('TOKEN_ID'), undefined)
  assert.equal(host.getStorage('REFRESH_TOKEN_ID'), undefined)
})

test('core login navigation after refresh failure is redirected only for a Feishu session', async () => {
  for (const agent of ['Feishu/7.0', 'Chrome/120']) {
    for (const thirdParty of [true, false]) {
      const host = await createHost({ agent })
      host.setStorage('USER_INFO', { userid: 'user-a' })
      if (thirdParty) host.storage.saveThirdAuthParams(authParams)
      await host.uni.reLaunch({ url: '/pages/login/index?from=expired' })
      const target = host.events.find(item => item[0] === 'reLaunch')[1]
      const handled = thirdParty && agent.startsWith('Feishu')
      assert.equal(target.startsWith('/pages/guide/index?'), handled)
      assert.equal(count(host, 'clear'), handled ? 1 : 0)
    }
  }
})

test('logout preserves reauthorization parameters even when the host clears all storage', async () => {
  const host = await createHost()
  host.storage.saveThirdAuthParams(authParams)
  assert.equal(host.api.reauthAfterLogout({ clearAuthState: () => host.local.clear() }), true)
  const target = host.events.find(item => item[0] === 'reLaunch')[1]
  await host.view.handleThirdAuth(
    Object.fromEntries(new URL(target, 'https://app.example').searchParams)
  )
  assert.equal(host.storage.getThirdAuthParams().tenantid, authParams.tenantid)
  assert.equal(count(host, 'authorize'), 1)
})

test('installation rejects invalid hooks and installs navigation fallback only once', async () => {
  const host = await createHost()
  assert.throws(() => host.config.initConfig({}), /request.get/)
  assert.throws(() => host.configure({ onLoginSuccess: null }), /onLoginSuccess/)
  assert.throws(() => host.configure({ redirectAfterLogin: true }), /redirectAfterLogin/)
  host.api.default.install({}, host.config.getConfig())
  assert.equal(host.interceptors.length, 1)
})

// Simulated provider contract; this does not exercise the real WeCom OAuth service.
const wecomParams = { ...authParams, type: 'WECOM' }
const registerWecom = host =>
  host.configure({
    providers: {
      wecom: {
        clientName: '企业微信',
        isClient: () => /wxwork/i.test(host.context.window.navigator.userAgent),
        resolveAuthorizeUrl: url => new URL(url).searchParams.get('target')
      }
    }
  })

test('custom provider handles entry and callback using its own client and URL strategy', async () => {
  const host = await createHost({ agent: 'wxwork/4.1' })
  registerWecom(host)
  const target = 'https://open.work.weixin.qq.com/authorize?state=custom'
  host.setRequest(async (url, options) => {
    if (url.includes('getbysessionid')) {
      assert.equal(options.params.sessionid, 'wecom-session')
      return { data: { head: { ret: 0 }, data: { userid: 'wecom-user' } } }
    }
    assert.equal(options.params.type, 'WECOM')
    return {
      data: {
        head: { ret: 0 },
        data: {
          authorizeUrl: `https://gateway.example/auth?target=${encodeURIComponent(target)}`
        }
      }
    }
  })
  await host.view.handleThirdAuth({ ...wecomParams, type: 'wecom' })
  assert.equal(host.events.find(item => item[0] === 'authorize')[1], target)
  assert.equal(host.storage.getThirdAuthParams().type, 'WECOM')
  await host.view.handleThirdAuthCallback({ sessionid: 'wecom-session' })
  assert.equal(host.getStorage('USER_INFO').userid, 'wecom-user')
  assert.equal(count(host, 'reLaunch'), 1)
  assert.equal(host.storage.hasRedirectFlag(wecomParams), false)
  assert.equal(host.view.tryThirdAuth(wecomParams), false)
})

test('custom provider participates in expiry, refresh failure fallback and logout', async () => {
  for (const action of ['expiry', 'fallback', 'logout']) {
    const host = await createHost({ agent: 'wxwork/4.1' })
    registerWecom(host)
    host.storage.saveThirdAuthParams(wecomParams)
    host.setStorage('USER_INFO', { userid: 'wecom-user' })
    host.setStorage('TOKEN_ID', 'expired')
    if (action === 'expiry') assert.equal(host.api.handleTokenExpired(), true)
    if (action === 'fallback') await host.uni.reLaunch({ url: '/pages/login/index' })
    if (action === 'logout') {
      let cleared = false
      assert.equal(
        host.api.reauthAfterLogout({
          clearAuthState: () => {
            cleared = true
          }
        }),
        true
      )
      assert.equal(cleared, true)
    }
    const target = host.events.find(item => ['replace', 'reLaunch'].includes(item[0]))[1]
    assert.equal(new URL(target, 'https://app.example').searchParams.get('type'), 'WECOM')
    assert.equal(host.getStorage('TOKEN_ID'), undefined)
    assert.equal(count(host, 'clear'), 1)
  }
})

test('custom provider rejects entry, callback and reauthorization in the wrong client', async () => {
  for (const agent of ['Chrome/120', 'Feishu/7.0']) {
    const host = await createHost({ agent })
    registerWecom(host)
    await host.view.handleThirdAuth(wecomParams)
    host.storage.saveThirdAuthParams(wecomParams)
    await host.view.handleThirdAuthCallback({ sessionid: 'wecom-session' })
    assert.equal(count(host, 'request'), 0)
    assert.ok(
      host.events.filter(item => item[0] === 'toast').every(item => item[1].includes('企业微信'))
    )
    host.storage.saveThirdAuthParams(wecomParams)
    assert.equal(host.api.handleTokenExpired(), false)
    assert.equal(host.api.reauthAfterLogout(), false)
    await host.uni.reLaunch({ url: '/pages/login/index' })
    assert.equal(host.events.find(item => item[0] === 'reLaunch')[1], '/pages/login/index')
  }
})

test('unknown stored providers cannot redeem sessions or trigger reauthorization', async () => {
  const host = await createHost()
  const params = { ...authParams, type: 'UNKNOWN' }
  host.storage.saveThirdAuthParams(params)
  assert.equal(host.api.handleTokenExpired(), false)
  assert.equal(host.api.reauthAfterLogout(), false)
  await host.uni.reLaunch({ url: '/pages/login/index' })
  assert.equal(host.events.find(item => item[0] === 'reLaunch')[1], '/pages/login/index')
  await host.view.handleThirdAuthCallback({ sessionid: 'unknown-session' })
  assert.equal(count(host, 'request'), 0)
  assert.ok(host.events.find(item => item[0] === 'toast')[1].includes('暂不支持'))
})

test('custom adapters keep HTTPS enforcement and can use URLs without a resolver', async () => {
  for (const useResolver of [true, false]) {
    for (const target of [
      'https://auth.example/authorize',
      'http://auth.example/authorize',
      'wecom://open'
    ]) {
      const host = await createHost({
        providers: {
          CUSTOM: {
            clientName: 'Custom',
            isClient: () => true,
            ...(useResolver ? { resolveAuthorizeUrl: () => target } : {})
          }
        }
      })
      host.setRequest(async () => ({ data: { head: { ret: 0 }, data: { authorizeUrl: target } } }))
      await host.view.handleThirdAuth({ ...authParams, type: 'CUSTOM' })
      assert.equal(count(host, 'authorize'), target.startsWith('https:') ? 1 : 0)
    }
  }
})

test('provider configuration is validated atomically and retains the built-in provider', async () => {
  const host = await createHost({ agent: 'wxwork/4.1' })
  registerWecom(host)
  const previous = host.config.getConfig()
  for (const providers of [
    true,
    [],
    { INVALID: {} },
    {
      INVALID: {
        clientName: 'Invalid',
        isClient: () => true,
        resolveAuthorizeUrl: true
      }
    }
  ]) {
    assert.throws(() => host.configure({ providers }), /providers|适配器/)
    assert.equal(host.config.getConfig(), previous)
  }
  assert.equal(typeof previous.providers.FEISHU.isClient, 'function')
  assert.equal(typeof previous.providers.WECOM.isClient, 'function')
  assert.equal(previous.providers.wecom, undefined)
})

test('all providers respect H5 runtime and require a synchronous boolean client check', async () => {
  const host = await createHost({
    providers: {
      CUSTOM: {
        clientName: 'Custom',
        isClient: () => Promise.resolve(true)
      }
    }
  })
  const params = { ...authParams, type: 'CUSTOM' }
  await host.view.handleThirdAuth(params)
  assert.equal(count(host, 'request'), 0)
  host.storage.saveThirdAuthParams(params)
  delete host.context.window
  assert.equal(host.api.handleTokenExpired(), false)
  assert.equal(host.api.reauthAfterLogout(), false)
})
