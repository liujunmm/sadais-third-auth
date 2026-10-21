import { getConfig } from './config'
import { isH5 } from './env'

export const getAuthProvider = type => {
  if (typeof type !== 'string') return null
  const providers = getConfig().providers
  const key = type.toUpperCase()
  return Object.prototype.hasOwnProperty.call(providers, key) ? providers[key] : null
}

export const isAuthClient = type => {
  const provider = getAuthProvider(type)
  return !!provider && isH5() && provider.isClient() === true
}

export const resolveAuthorizeUrl = (type, authorizeUrl) => {
  const provider = getAuthProvider(type)
  if (!isAuthClient(type)) throw new Error('Authorization client required')
  const resolved = provider.resolveAuthorizeUrl
    ? provider.resolveAuthorizeUrl(authorizeUrl)
    : authorizeUrl
  const target = new URL(resolved)
  if (target.protocol !== 'https:') throw new Error('Invalid authorization URL')
  return target.href
}
