/** Account state and presentation extension points shared with client plugins. */
import type { AccountClientMetadata, AccountView } from '@deepseek-ai/dsh-deepseek-account/types'

/** Latest account-stream availability, without notification state. */
export interface AccountUiState {
  readonly view: AccountView | undefined
  readonly failed: boolean
  /** Model credential onboarding owns the login dialog and delays account notifications while mounted. */
  readonly onboarding?: boolean
  /** Desktop introduction covers the workspace during loading, saving, and exit animation. */
  readonly desktopOnboardingVisible?: boolean
}

/** Read the account stream already owned by the account settings plugin. */
export interface AccountUi {
  /** Read the current state from the existing account snapshot.
   * @returns the latest account state.
   */
  getSnapshot(): AccountUiState
  /** Build metadata for one account request.
   * @param locale - requested language.
   * @returns this client's version, language, and timezone.
   */
  clientMetadata(locale: string): AccountClientMetadata
}

declare module '@deepseek-ai/cordis' {
  interface Context { accountUi: AccountUi }
  interface Events {
    /** Account stream update or loss of access. @mode parallel
     * @param state - latest account state.
     * @param reset - whether account availability, credentials, or the connection lifetime changed.
     */
    'account-ui/change'(state: AccountUiState, reset: boolean): void
    /** Explicit account refresh from Settings or a returned Platform page. @mode parallel */
    'account-ui/refresh'(): Promise<void>
  }
}
