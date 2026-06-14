interface MessageFallbackInfo {
  key: string
  namespace?: string
}

export function formatIntlMessagePath(namespace: string | undefined, key: string): string {
  return namespace ? `${namespace}.${key}` : key
}

export function getIntlMessageFallback(
  info: MessageFallbackInfo,
  env = process.env.NODE_ENV,
): string {
  if (env === 'production') return '...'
  return formatIntlMessagePath(info.namespace, info.key)
}
