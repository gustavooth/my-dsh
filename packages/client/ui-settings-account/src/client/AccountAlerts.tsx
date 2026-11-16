/** Account-wide transient alerts, mounted beside the workspace so they outlive Settings. */
import { useEffect, useState } from 'react'
import { Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { AccountSectionInjected } from './AccountSection.tsx'

/** Alerts composed from the account plugin's injection face and its copy. */
export type AccountAlertsProps = PropsLocale<'settings.account'> & InjectFace<AccountSectionInjected>

/**
 * Report a credential expiry and model sign-in guidance once per event.
 * @param props - localized copy and the account subscriptions.
 * @returns the transient banners, each keyed to its own occurrence.
 */
export function AccountAlerts({ subscribeSessionExpired, subscribeModelSignInRequired, t }: AccountAlertsProps) {
  const [signInNotice, setSignInNotice] = useState(0)
  useEffect(() => subscribeModelSignInRequired?.(() => { setSignInNotice(value => value + 1) }), [subscribeModelSignInRequired])
  const [expiryNotice, setExpiryNotice] = useState(false)
  useEffect(() => subscribeSessionExpired?.(() => { setExpiryNotice(true) }), [subscribeSessionExpired])
  return <>
    {signInNotice > 0 && <Toast key={signInNotice} text={t('modelSignInRequired')} onDone={() => { setSignInNotice(0) }} />}
    {expiryNotice && <Toast text={t('sessionExpired')} onDone={() => { setExpiryNotice(false) }} />}
  </>
}
