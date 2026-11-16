// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import type { AccountView } from '@deepseek-ai/dsh-deepseek-account/types'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import { AccountAlerts, type AccountAlertsProps } from '../src/client/AccountAlerts.tsx'
import type { AccountSectionInjected, AccountSnapshot } from '../src/client/AccountSection.tsx'
import type {} from '../src/client/index.ts'
import { en, zh, type AccountKey } from '../src/client/locales.ts'

afterEach(() => { cleanup(); vi.useRealTimers() })

/** One resolved theme snapshot; the renderer binds it to the alert's unused theme hook. */
const theme: ThemeSnapshot = {
  preference: 'light', fontSizes: { text: 14, code: 11, terminal: 13 }, fontFamilies: { text: '', code: '', terminal: '' },
  active: { id: 'light', colorScheme: 'light', tokens: {} }, themes: [], revision: 0,
}
const accountView: AccountView = {
  status: 'signed-out', attempt: null,
  links: { usageUrl: 'http://localhost:8081/usage', topUpUrl: 'http://localhost:8081/top_up' },
}
const snapshot: AccountSnapshot = { view: accountView, details: undefined, avatar: undefined, failed: false }

/** The account plugin's inject face, trimmed to what this overlay reads. */
function operationsOf(): AccountSectionInjected {
  return {
    hooks: {
      account: { getSnapshot: () => snapshot, subscribe: () => () => {} },
      theme: { getSnapshot: () => theme, subscribe: () => () => {} },
    },
    avatarFailed: vi.fn(), refreshAccount: vi.fn(async () => {}), contactUs: vi.fn(),
    showLogin: vi.fn(), setOnboarding: vi.fn(), start: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}), hasRunningAccountTasks: vi.fn(async () => false), signOut: vi.fn(async () => {}),
  }
}

function element(copy: typeof en | typeof zh, inject: Partial<AccountSectionInjected> = {}) {
  const { hooks, ...injected } = { ...operationsOf(), ...inject }
  const props: AccountAlertsProps = {
    ...injected,
    useAccount: selector => selector(hooks.account.getSnapshot()),
    useTheme: selector => selector(hooks.theme.getSnapshot()),
    t: (key: string) => key in copy ? copy[key as AccountKey] : key,
  }
  return <AccountAlerts {...props} />
}

it.each([en, zh])('shows the localized credential-expiry alert once per event', async (copy) => {
  vi.useFakeTimers()
  onTestFinished(() => { vi.useRealTimers() })
  let expire: (() => void) | undefined
  const unsubscribe = vi.fn(() => { expire = undefined })
  const view = render(element(copy, { subscribeSessionExpired: (listener) => { expire = listener; return unsubscribe } }))
  expect(screen.queryByRole('alert')).toBeNull()
  act(() => { expire!() })
  expect(screen.getByRole('alert').textContent).toContain(copy.sessionExpired)
  await expect(`${screen.getByRole('alert').textContent}\n`)
    .toMatchFileSnapshot(`./expected/expired-${copy === en ? 'en' : 'zh'}.txt`)
  await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
  expect(screen.queryByRole('alert')).toBeNull()

  view.unmount()
  expect(unsubscribe).toHaveBeenCalledOnce()
  render(element(copy, { subscribeSessionExpired: (listener) => { expire = listener; return unsubscribe } }))
  expect(screen.queryByRole('alert')).toBeNull()
})

it.each([en, zh])('shows live model sign-in guidance once per event and not for a remount', async (copy) => {
  vi.useFakeTimers()
  onTestFinished(() => { vi.useRealTimers() })
  let listener: (() => void) | undefined
  const unsubscribe = vi.fn(() => { listener = undefined })
  const subscribeModelSignInRequired = (next: () => void) => { listener = next; return unsubscribe }
  const view = render(element(copy, { subscribeModelSignInRequired }))
  expect(screen.queryByRole('alert')).toBeNull()
  act(() => { listener?.() })
  expect(screen.getByRole('alert').textContent).toBe(copy.modelSignInRequired)
  // Another rejection while the banner is visible replaces its occurrence instead of stacking.
  act(() => { listener?.() })
  expect(screen.getAllByRole('alert')).toHaveLength(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
  expect(screen.queryByRole('alert')).toBeNull()
  act(() => { listener?.() })
  expect(screen.getByRole('alert').textContent).toBe(copy.modelSignInRequired)

  view.unmount()
  expect(unsubscribe).toHaveBeenCalledOnce()
  render(element(copy, { subscribeModelSignInRequired }))
  expect(screen.queryByRole('alert')).toBeNull()
})

it('renders nothing when the Host publishes no account subscriptions', () => {
  render(element(en))
  expect(screen.queryByRole('alert')).toBeNull()
})
