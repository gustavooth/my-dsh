// @vitest-environment jsdom
/** The sidebar extension preserves notifications while onboarding hides their presentation. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { AccountNotifications, type AccountNotificationsProps } from '../src/client/AccountNotifications.tsx'
import { notification } from './notification-fixture.ts'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('shows retained cards above the Settings trigger and opens account settings without dismissing them', () => {
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
  const notices = [notification('notice', { actions: [
    { label: 'View account', style: 'primary', target: { type: 'app_route', name: 'account' } },
  ] })]
  const openSettings = vi.fn()
  const dismiss = vi.fn()
  const ctaClicked = vi.fn()
  const props: AccountNotificationsProps = {
    ...({} as GlobalStandardProps), openSettings, ctaClicked, dismiss, shown: vi.fn(),
    useActive: select => select(false), useNotices: select => select(notices), t: () => 'Close',
  }
  const view = render(<AccountNotifications {...props} />)
  expect(screen.queryByRole('status')).toBeNull()
  view.rerender(<AccountNotifications {...props} useActive={select => select(true)} />)
  fireEvent.click(screen.getByRole('button', { name: 'View account' }))
  expect(openSettings).toHaveBeenCalledExactlyOnceWith('account')
  expect(ctaClicked).toHaveBeenCalledExactlyOnceWith('notice')
  expect(screen.getByRole('status')).toBeTruthy()
  expect(dismiss).not.toHaveBeenCalled()
  view.rerender(<AccountNotifications {...props} useActive={select => select(false)} />)
  expect(screen.queryByRole('status')).toBeNull()
  expect(dismiss).not.toHaveBeenCalled()
  view.rerender(<AccountNotifications {...props} useActive={select => select(true)} />)
  expect(screen.getByRole('button', { name: 'View account' })).toBeTruthy()
})
