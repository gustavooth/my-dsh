---
kind: upgrade-guide
description: "The sidebar footer always renders the shell Settings trigger; the settings launcher slot and its notification seat are replaced."
---

# Sidebar Settings footer and account menu

English | [中文](guide.zh.md)

## Change

The sidebar footer now renders the settings shell's own trigger in every account state. `@deepseek-ai/dsh-client-ui-settings` no longer declares the `settings.launcher` slot or `SettingsLauncherOwnerProps`; its `settings.launcher.notifications` slot is replaced by `settings.trigger.notifications`, which the shell declares and anchors above the trigger row. A launcher contribution that replaced the Settings button has no seat and its registration fails.

`settings.trigger.notifications` receives `{ openSettings }` instead of the launcher's `{ active, openAccount }`. The shell owns the anchored position, its navigation, and keeping the contribution mounted while the rail hides it; the registrant owns visibility. `SettingsSectionOwnerProps` gains `openOnboarding(id)`, so a settings page can hand its flow to a registered onboarding editor.

The account plugin no longer contributes a launcher. Sign in, sign out, and Feedback move into the Account settings section, which now exists in every account state (`account` locale `nav`). Account toasts render from a `shell.overlay` entry, so credential expiry and model sign-in guidance still appear while Settings is closed.

## Migration

1. Remove every registration into `settings.launcher` and any declaration of `settings.launcher.notifications`. The shell renders its Settings trigger unconditionally, so a composition that relied on the fallback needs no replacement.
2. Move account-menu content into a settings page: register a `settings.section` contribution for the content, and use the section's `close` and `openOnboarding` owner props for flows that leave the page. Sign-in, sign-out, and the Feedback questionnaire belong to the page that owns them, not to browser chrome.
3. Re-register footer notices into `settings.trigger.notifications`. Compute visibility from your own account state; call `openSettings('account')` (or the section you own) for a card action. Keep transient reports in a `shell.overlay` entry so they outlive the panel that reported them.
4. Account consumers that read launcher-supplied values should read the Account section instead: the shared account stream, the `AccountUiState` snapshot (now carrying optional `onboarding` and `desktopOnboardingVisible`), and the section owner props. The account dictionaries no longer define `settings` or `menu`.
5. Rebuild the client bundle and verify the sidebar footer in the expanded and collapsed rail, the Settings dialog opened by keyboard command, and the Account section's signed-in and signed-out states.
