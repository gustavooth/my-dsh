// Real-composition acceptance for DeepSeek account sign-in from a plain browser. The
// scaffold boots the shipped Web Loader tree, so the real account provider drives
// auth_init, the loopback OAuth callback, and auth_exchange against a loopback Platform
// double, while a real Chromium follows the tab the Web UI preopens.
import { createServer, type Server } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed, onTestFinished } from 'vitest'
import { compareOrRefreshGolden, launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold } from './scaffold.ts'
import { openSettings, saveFailureShot } from './support.ts'

const OVERLAY_TEMPLATE = fileURLToPath(new URL('./fixtures/account-login/cordis.patch.yml', import.meta.url))
const MODE = webSnapshotMode()
const TOKEN = 'dsh_web_login_test'
const CODE = 'web-login-code'
const AVATAR_EXPECTED = fileURLToPath(new URL('./expected/account-login/avatar-retry.expected.md', import.meta.url))

/** Loopback Platform double: authorization handoff, code exchange, and the signed-in profile reads. */
async function mockPlatform() {
  const inits: Record<string, unknown>[] = []
  const pages: string[] = []
  let state: string | undefined
  let redirectUri: string | undefined
  let avatarRequests = 0
  let notificationLists = 0
  /** Hold the picture reply so the signed-in section's mount refresh cannot race the first load. */
  let holdAvatars = false
  const pendingAvatars: (() => void)[] = []
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const reply = (payload: unknown): void => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ code: 0, data: { biz_code: 0, biz_data: payload } }))
    }
    if (url.pathname === '/dsh/authorize') {
      pages.push(url.href)
      // The user approves at once: Platform returns the browser to the Host callback.
      const callback = new URL(redirectUri ?? '/')
      callback.searchParams.set('code', CODE)
      callback.searchParams.set('state', state ?? '')
      res.writeHead(302, { location: callback.href }).end()
      return
    }
    if (url.pathname === '/dsh/authorized') {
      pages.push(url.href)
      res.writeHead(200, { 'content-type': 'text/html' }).end('<title>Authorized</title>')
      return
    }
    if (req.method === 'POST' && url.pathname.startsWith('/auth-api/v0/dsh/')) {
      let body = ''
      req.setEncoding('utf8')
      req.on('data', (chunk: string) => { body += chunk })
      req.on('end', () => {
        const payload = JSON.parse(body) as Record<string, unknown>
        if (url.pathname === '/auth-api/v0/dsh/auth_init') {
          inits.push(payload)
          state = String(payload.state)
          redirectUri = String(payload.redirect_uri)
          reply({ authorize_url: `${origin}/dsh/authorize?authorize_id=web`, authorize_id: 'web', expires_in: 300 })
          return
        }
        if (url.pathname === '/auth-api/v0/dsh/auth_exchange' && payload.code === CODE) {
          reply({ token: TOKEN, authorized_url: `${origin}/dsh/authorized` })
          return
        }
        res.writeHead(404).end()
      })
      return
    }
    if (url.pathname === '/avatar.svg') {
      const ordinal = ++avatarRequests
      const answer = (): void => {
        if (ordinal < 3) { res.writeHead(503, { 'cache-control': 'no-store' }).end(); return }
        res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'max-age=3600' })
          .end('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="16" fill="blue"/></svg>')
      }
      if (holdAvatars) { pendingAvatars.push(answer); return }
      answer()
      return
    }
    if (req.headers['x-dsh-auth-token'] !== TOKEN) { res.writeHead(401).end(); return }
    if (url.pathname === '/auth-api/v0/users/current') {
      // `email` is required by the provider's profile schema even when the account has none.
      reply({ id: 'web-user', email: '', id_profile: { name: 'Web User', picture: `${origin}/avatar.svg` } })
      return
    }
    if (url.pathname === '/api/v0/users/get_user_summary') {
      reply({ normal_wallets: [{ currency: 'CNY', balance: '1.00' }], bonus_wallets: [] })
      return
    }
    if (url.pathname === '/api/v0/users/notifications/list') {
      notificationLists++
      reply({ next_poll_after: 600, notifications: [] }); return
    }
    res.writeHead(404).end()
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('account login: missing mock listener')
  const origin = `http://localhost:${String(address.port)}`
  return {
    origin, inits, pages, avatarRequests: () => avatarRequests, notificationLists: () => notificationLists,
    holdAvatar: () => { holdAvatars = true },
    releaseAvatar: () => { holdAvatars = false; for (const answer of pendingAvatars.splice(0)) answer() },
    close: () => new Promise<void>((resolve) => { server.close(() => { resolve() }); server.closeAllConnections() }),
  }
}

describe.skipIf(MODE === 'record')('web e2e: DeepSeek account sign-in in a plain browser', () => {
  let root: string | undefined
  let scaffold: WebScaffold
  let browser: Browser
  let platform: Awaited<ReturnType<typeof mockPlatform>>

  beforeAll(async () => {
    platform = await mockPlatform()
    root = await mkdtemp(join(tmpdir(), 'dsh-web-account-login-'))
    const overlay = join(root, 'account-login.overlay.yml')
    await writeFile(overlay, (await readFile(OVERLAY_TEMPLATE, 'utf8')).replaceAll('{{origin}}', platform.origin))
    scaffold = await launchWebScaffold({ extraOverlayPath: overlay })
    browser = await chromium.launch()
  })

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
    await platform?.close()
    if (root !== undefined) await rm(root, { recursive: true, force: true })
  })

  it('signs in through a themed tab and recovers the Account avatar on a later Settings entry', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: 'en-US', colorScheme: 'dark' })
    onTestFinished(() => context.close())
    const page = await context.newPage()
    const console = watchConsole(page)
    onTestFailed(() => saveFailureShot(page, 'web-e2e-account-login'))
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
    const account = settings.getByRole('region', { name: 'Account', exact: true })
    // Signed out, Settings opens on General; the Account section has its own nav row.
    await openSettings(page, 'en')
    await settings.waitFor()
    await settings.getByRole('button', { name: 'Account', exact: true }).click()
    // Hold the picture reply: the sign-in re-registers the Account section (signed-in
    // order), so its remount refresh must not race the first picture load.
    platform.holdAvatar()
    const tab = context.waitForEvent('page')
    const callback = context.waitForEvent('request', request => new URL(request.url()).pathname === '/oauth/callback')
    await account.getByRole('button', { name: 'Sign in', exact: true }).click()
    const authorization = await tab
    expect((await (await callback).allHeaders())['sec-fetch-site']).toBe('cross-site')
    await authorization.waitForURL(url => url.pathname === '/dsh/authorized', { timeout: 30_000 })
    expect(await authorization.evaluate(() => window.opener === null)).toBe(true)
    // The credential closes the login dialog and swaps the section to its signed-in card.
    await account.getByRole('button', { name: 'Sign out', exact: true }).waitFor({ timeout: 30_000 })

    const pageOrigin = new URL(scaffold.authenticatedUrl).origin
    expect(platform.inits).toHaveLength(1)
    expect(platform.inits[0]).toMatchObject({ login_source: 'web', redirect_uri: `${pageOrigin}/oauth/callback` })
    const [authorize, authorized] = platform.pages.map(href => new URL(href))
    expect(authorize?.searchParams.get('theme')).toBe('dark')
    expect(authorized?.searchParams.get('login_source')).toBe('web')
    // The signed-in frame reads the profile once; the remounted section's own mount
    // refresh adds one notification read. Release the held picture reply as a failure.
    await expect.poll(platform.notificationLists, { timeout: 30_000 }).toBe(2)
    await expect.poll(platform.avatarRequests, { timeout: 30_000 }).toBe(1)
    platform.releaseAvatar()
    await account.locator('[data-avatar-status="failed"]').waitFor()
    expect(await account.locator('img').count()).toBe(0)
    const states: string[] = []
    let expectedLists = 2
    const capture = async (stage: string): Promise<void> => {
      await expect.poll(platform.notificationLists).toBe(expectedLists)
      const mounted = await account.count() > 0
      const settingsStatus = mounted
        ? await account.locator('[data-avatar-status]').getAttribute('data-avatar-status') : 'unmounted'
      states.push(`${stage}: settings=${settingsStatus}, settingsImages=${mounted ? await account.locator('img').count() : 0}, `
        + `requests=${platform.avatarRequests()}, notificationLists=${platform.notificationLists()}`)
    }
    await capture('Initial load')
    await settings.getByRole('button', { name: 'Close', exact: true }).click()
    await settings.waitFor({ state: 'detached' })
    // Every Settings entry mounts the Account section, whose mount refresh retries the picture.
    await openSettings(page, 'en')
    expectedLists++
    await expect.poll(platform.avatarRequests).toBe(2)
    await account.locator('[data-avatar-status="failed"]').waitFor()
    expect(await account.locator('img').count()).toBe(0)
    await capture('First Settings entry')
    await settings.getByRole('button', { name: 'Close', exact: true }).click()
    await settings.waitFor({ state: 'detached' })
    await openSettings(page, 'en')
    expectedLists++
    await expect.poll(() => account.locator('img').count()).toBe(1)
    const image = account.locator('img')
    await expect.poll(() => image.evaluate(element =>
      element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0)).toBe(true)
    expect(await image.getAttribute('src')).toBe(`${platform.origin}/avatar.svg`)
    await capture('Second Settings entry')
    await settings.getByRole('button', { name: 'Close', exact: true }).click()
    await settings.waitFor({ state: 'detached' })
    await openSettings(page, 'en')
    expectedLists++
    await account.waitFor()
    expect(await account.locator('img').count()).toBe(1)
    expect(platform.avatarRequests()).toBe(3)
    await capture('Third Settings entry')
    await account.locator('img').dispatchEvent('error')
    await account.locator('[data-avatar-status="failed"]').waitFor()
    expect(await account.locator('img').count()).toBe(0)
    await capture('Rendered image failure')
    await settings.getByRole('button', { name: 'Close', exact: true }).click()
    await settings.waitFor({ state: 'detached' })
    await openSettings(page, 'en')
    expectedLists++
    await expect.poll(() => account.locator('img').count()).toBe(1)
    await capture('Settings entry after rendered failure')
    await compareOrRefreshGolden(AVATAR_EXPECTED, states.join('\n'), MODE)
    expect(console.pageErrors).toEqual([])
    await context.close()
  }, 90_000)
})
