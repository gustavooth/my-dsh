/** Native shell reads reuse authenticated Web RPC and never read credential values. */
import { describe, expect, it, vi } from 'vitest'
import { connectDesktopShell } from '../src/shell-backend.ts'

function transport(preference?: string) {
  const keys = new Map<string, string>()
  const namespaces = [
    { ns: 'llm-deepseek', value: { apiKeyEnv: 'CUSTOM_DEEPSEEK_KEY' } },
    { ns: 'llm-pi-ai', value: { profiles: { example: { apiKeyEnv: 'EXAMPLE_API_KEY' } } } },
    { ns: 'locale', value: preference === undefined ? {} : { preference } },
  ]
  const send = vi.fn<NonNullable<Parameters<typeof connectDesktopShell>[2]>>(async (_input, init) => {
    const { rpcId, method, payload } = JSON.parse(init!.body as string) as {
      rpcId: string
      method: string
      payload: { args: { refs: string[] } }
    }
    let value: unknown
    if (method === 'settings/describe') value = { namespaces }
    else if (method === 'llm/listConfigurableProviders') value = [{ settingsNs: 'llm-pi-ai', settingsPath: ['profiles', 'example'] }]
    else if (method === 'productAnalytics/enabled') value = true
    else if (method === 'productAnalytics/report') value = undefined
    else value = Object.fromEntries(payload.args.refs.map(ref => [ref, { configured: keys.has(ref), writable: true }]))
    return Response.json({ type: 'server-response', rpcId, result: { ok: true, value } })
  })
  return { send, keys, namespaces }
}

const url = 'http://127.0.0.1:19387/'
const cookie = 'dsh-auth-fixture=signed'

describe('desktop shell Web operations', () => {
  it.each(['light', 'dark', 'system'] as const)('reads the live %s theme in the existing settings request', async (preference) => {
    const host = transport()
    host.namespaces.push({ ns: 'ui-theme', value: { preference } })
    const backend = connectDesktopShell(url, cookie, host.send)
    expect(await backend.read()).toMatchObject({ themePreference: preference })
    expect(host.send.mock.calls.filter(([input]) => input.endsWith('/api/settings/describe'))).toHaveLength(1)
    host.namespaces.find(item => item.ns === 'ui-theme')!.value.preference = 'system'
    expect(await backend.read()).toMatchObject({ themePreference: 'system' })
  })

  it('falls back for an invalid optional theme without blocking startup metadata', async () => {
    const host = transport()
    host.namespaces.push({ ns: 'ui-theme', value: { preference: 'invalid' } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(await connectDesktopShell(url, cookie, host.send).read()).toMatchObject({ themePreference: 'system' })
      expect(warn).toHaveBeenCalledOnce()
    } finally { warn.mockRestore() }
  })

  it('authenticates with the explicit Host cookie and reports configured keys from metadata only', async () => {
    const host = transport()
    host.keys.set('CUSTOM_DEEPSEEK_KEY', 'sk-example')
    const backend = connectDesktopShell(url, cookie, host.send)
    expect(await backend.read()).toEqual({ hasApiKey: true, localePreference: null, themePreference: 'system' })
    for (const [input, init] of host.send.mock.calls) {
      expect(input).toMatch(/^http:\/\/127\.0\.0\.1:19387\/api\//u)
      expect(init).toMatchObject({ redirect: 'error', headers: { cookie } })
      expect(init).not.toHaveProperty('credentials')
      expect(input).not.toContain('/api/account/')
      expect(input).not.toContain('credentials/set')
    }
  })

  it('reads the explicit language preference and recognizes another provider key', async () => {
    const host = transport('zh')
    host.keys.set('EXAMPLE_API_KEY', 'sk-other')
    const backend = connectDesktopShell(url, cookie, host.send)
    expect(await backend.read()).toMatchObject({ localePreference: 'zh', hasApiKey: true })
    host.keys.clear()
    expect(await backend.read()).toMatchObject({ hasApiKey: false })
  })

  it('reads language without querying account or model providers', async () => {
    const host = transport('zh')
    const backend = connectDesktopShell(url, cookie, host.send)
    host.send.mockClear()
    expect(await backend.readLocalePreference()).toBe('zh')
    expect(host.send).toHaveBeenCalledOnce()
    expect(host.send.mock.calls[0]![0]).toContain('/api/settings/describe')
  })

  it('allows profiles without the official provider and retains custom key detection', async () => {
    const host = transport()
    host.namespaces.splice(0, 1)
    const backend = connectDesktopShell(url, cookie, host.send)
    expect(await backend.read()).toMatchObject({ hasApiKey: false })
    host.keys.set('EXAMPLE_API_KEY', 'custom-key')
    expect(await backend.read()).toMatchObject({ hasApiKey: true })
  })

  it('rejects an official provider without a credential reference', async () => {
    const host = transport()
    host.namespaces[0] = { ns: 'llm-deepseek', value: {} }
    await expect(connectDesktopShell(url, cookie, host.send).read()).rejects.toThrow('missing official DeepSeek credential reference')
  })

  it('propagates Host transport failures and rejects unmatched RPC envelopes', async () => {
    const host = transport()
    const backend = connectDesktopShell(url, cookie, host.send)
    host.send.mockRejectedValueOnce(new Error('Host transport unavailable'))
    await expect(backend.read()).rejects.toThrow('Host transport unavailable')
    host.send.mockResolvedValueOnce(Response.json({ type: 'server-response', rpcId: 'other', result: { ok: true } }))
    await expect(backend.read()).rejects.toThrow('Web RPC failed')
  })

  it('submits native analytics through authenticated RPC with a bounded request', async () => {
    const host = transport()
    const backend = connectDesktopShell(url, cookie, host.send)
    const event = { eventName: 'desktop_app_launch' as const, timestamp: 100, attributes: {} }
    await backend.report(event)
    const [input, init] = host.send.mock.calls.at(-1)!
    expect(input).toBe('http://127.0.0.1:19387/api/productAnalytics/report')
    expect(init?.headers).toMatchObject({ cookie })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(init!.body as string)).toMatchObject({ payload: { args: { event } } })
  })
})
