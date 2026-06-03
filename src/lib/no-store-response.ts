export function withNoStore<T extends Response>(response: T): T {
  response.headers.set('cache-control', 'no-store, max-age=0')
  response.headers.set('pragma', 'no-cache')
  response.headers.set('expires', '0')
  return response
}
