import { isH5 } from './env'

export default {
  clientName: '飞书 App',
  isClient: () => isH5() && /lark|feishu/i.test(window.navigator.userAgent),
  resolveAuthorizeUrl(authorizeUrl) {
    let target = new URL(authorizeUrl)
    if (target.hostname === 'applink.feishu.cn') {
      const url = target.searchParams.get('url')
      if (!url) throw new Error('Missing authorization URL')
      target = new URL(url)
    }
    if (target.hostname === 'applink.feishu.cn') {
      throw new Error('Nested Feishu applink is not supported')
    }
    return target.href
  }
}
