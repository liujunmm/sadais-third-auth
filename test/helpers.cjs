const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.resolve(__dirname, '..')
const authParams = { tenantid: 'tenant-a', type: 'FEISHU', productcode: 'WTB' }

async function createHost(options = {}) {
  const local = options.local || new Map()
  const session = options.session || new Map()
  const events = []
  const interceptors = []
  const constants = {
    NAME: options.product || 'WTB',
    LOGIN_PATH: 'pages/login/index',
    HOME_PATH: 'pages/index/index',
    RET_CODE: { SUCCESS: 0 }
  }
  let now = options.now || Date.now()
  let requestHandler = async url => ({
    data: {
      head: { ret: 0 },
      data: url.includes('getbysessionid')
        ? { userid: 'user-a' }
        : { authorizeUrl: 'https://open.feishu.cn/authorize' }
    }
  })
  const key = value => `${constants.NAME}_${value}`
  const getStorage = value => local.get(key(value))
  const setStorage = (value, data) => local.set(key(value), data)
  const location = {
    replace: url => events.push(['replace', url])
  }
  Object.defineProperty(location, 'href', {
    set: url => events.push(['authorize', url])
  })
  const uni = {
    getStorageSync: value => local.get(value),
    setStorageSync: (value, data) => local.set(value, data),
    removeStorageSync: value => local.delete(value),
    addInterceptor(method, hooks) {
      interceptors.push({ method, hooks })
    },
    showModal(args) {
      events.push(['modal'])
      args.success({ confirm: options.confirm !== false })
    },
    reLaunch(args) {
      for (const item of interceptors) {
        if (item.method === 'reLaunch') item.hooks.invoke(args)
      }
      events.push(['reLaunch', args.url])
      return Promise.resolve()
    }
  }
  const context = vm.createContext({
    URL,
    console,
    Date: class extends Date {
      static now() {
        return now
      }
    },
    uni,
    window: {
      navigator: { userAgent: options.agent || 'Feishu/7.0' },
      location,
      sessionStorage: {
        getItem: value => session.get(value) || null,
        setItem: (value, data) => session.set(value, data),
        removeItem: value => session.delete(value)
      }
    }
  })
  const modules = new Map()
  function stub(id, exports) {
    modules.set(
      id,
      new vm.SyntheticModule(
        Object.keys(exports),
        function() {
          for (const [name, value] of Object.entries(exports)) this.setExport(name, value)
        },
        { context, identifier: id }
      )
    )
  }
  stub('sadais-core/consts', { getConsts: name => (name ? constants[name] : constants) })
  stub('sadais-core/core/storage', {
    getStorage,
    setStorage,
    removeStorage: value => local.delete(key(value)),
    getStorageKey: key
  })
  stub('sadais-core/core/auth', {
    getUserInfo: () => getStorage('USER_INFO'),
    getUserId: () => {
      const user = getStorage('USER_INFO') || {}
      return user.userid || user.userId || ''
    },
    getTokenId: () => getStorage('TOKEN_ID') || '',
    getRefreshTokenId: () => getStorage('REFRESH_TOKEN_ID') || '',
    saveTokenId: value => setStorage('TOKEN_ID', value),
    saveRefreshTokenId: value => setStorage('REFRESH_TOKEN_ID', value),
    removeTokenId: () => local.delete(key('TOKEN_ID')),
    removeUserInfo: () => local.delete(key('USER_INFO')),
    reLaunchToLogin: () => uni.reLaunch({ url: constants.LOGIN_PATH }),
    logout(url, shouldNavigate = true) {
      events.push(['clear'])
      for (const name of ['USER_INFO', 'TOKEN_ID', 'REFRESH_TOKEN_ID', 'ACCOUNT_INFO']) {
        local.delete(key(name))
      }
      if (shouldNavigate) return uni.reLaunch({ url: url || constants.LOGIN_PATH })
    }
  })
  for (const name of fs.readdirSync(path.join(root, 'src'))) {
    const id = path.join(root, 'src', name)
    modules.set(
      id,
      new vm.SourceTextModule(fs.readFileSync(id, 'utf8'), { context, identifier: id })
    )
  }
  const index = modules.get(path.join(root, 'src/index.js'))
  await index.link((specifier, parent) => {
    const id = specifier.startsWith('.')
      ? path.resolve(path.dirname(parent.identifier), `${specifier}.js`)
      : specifier
    return modules.get(id)
  })
  await index.evaluate()
  const config = modules.get(path.join(root, 'src/config.js')).namespace
  const storage = modules.get(path.join(root, 'src/storage.js')).namespace
  const request = {
    get: (...args) => {
      events.push(['request', args[0]])
      return requestHandler(...args)
    }
  }
  const installOptions = {
    request,
    providers: options.providers,
    onLoginSuccess: async data => {
      events.push(['save'])
      setStorage('USER_INFO', data)
    }
  }
  index.namespace.default.install({}, installOptions)
  const mixin = index.namespace.thirdAuthMixin
  const view = {
    ...mixin.data(),
    ...mixin.methods,
    $consts: { ...constants, get: name => constants[name] },
    $loading: () => events.push(['loading']),
    $hideLoading: () => events.push(['hide']),
    $toast: async message => events.push(['toast', message]),
    $pi: {
      navi: {
        reLaunch: url => uni.reLaunch({ url }),
        switchTab: async url => events.push(['home', url]),
        redirectTo: async url => events.push(['login', url])
      }
    }
  }
  return {
    api: index.namespace,
    config,
    storage,
    view,
    local,
    session,
    events,
    uni,
    constants,
    interceptors,
    context,
    modules,
    getStorage,
    setStorage,
    setRequest: handler => (requestHandler = handler),
    setNow: value => (now = value),
    configure: values => config.initConfig({ ...installOptions, ...values })
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

module.exports = { authParams, createHost, deferred }
