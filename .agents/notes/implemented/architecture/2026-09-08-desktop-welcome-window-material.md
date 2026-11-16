# Agent Note: Desktop welcome window material

Status: implemented

English | [中文](2026-09-08-desktop-welcome-window-material.zh.md)

## Problem

The desktop welcome design blurs the desktop behind its entire window. Chromium backdrop filters only sample content inside the renderer. Credential setup also needs an explicit startup owner so a native skip is not followed by a second Web dialog.

## Decision

The native welcome window described by this note has been removed. Its Electron window, bundled React renderer, write-only preload, and welcome IPC handlers are gone; the desktop opens the workspace directly on every launch, and model API keys and account sign-in are configured in Settings. The material and onboarding decisions below remain as the historical record of why that window existed. The [thin Web wrapper](2026-09-10-desktop-web-wrapper.md) still owns the HTTP server, and the Electron main process authenticates through the shared Web launch and RPC path. Responses contain metadata or a safe outcome, never a key or private provider diagnostics.

Cold startup opened the entry when neither an account credential nor a model API key was configured. Saving entered the workspace after persistence succeeded; skipping entered without saving a draft or a credential-entry completion flag, and the next process launch checked credentials again. The Desktop preload marker still suppresses the automatic Web credential step; settings and explicit API-key editing remain available. The [Desktop onboarding reference](../../../../packages/client/ui-settings-account/README.md) owns the separate device-local introduction after account login. Other native shells can disable only the credential step through the Models Host plugin's `credentialOnboarding` page-injection value. The module graph carries package identities rather than arbitrary Host config, so a Host row alone does not configure its Client half. The [account provider](2026-09-14-deepseek-account-login.md) supplies login and sign-out state while preserving independently stored API keys.

The generated project follows declared workspace dependencies because pnpm’s hoist index alone can omit configured plugins.

Desktop reads the shared `locale.preference` before opening the workspace. The Client awaits an isolated preload read of that preference and the same OS language order before mounting, then reports resolved locale changes to the shell. Only an explicit Settings selection writes the preference; automatic detection stays provisional. The shell ships English and Simplified Chinese dictionaries, so a Client-only language pack falls back to a supported OS language in native windows.

The shell startup path shares the Desktop backend controller with startup recovery. The main recovery document loads offscreen while the Host starts; a failure reveals it, and successful startup opens the workspace after reading locale and appearance. Recovery actions retain the controller’s serialized retries and awaited child shutdown. The application preload exposes recovery controls only to shell documents and the locale bridge only to application documents.

## Alternatives considered

**A CSS-only backdrop filter.** It cannot blur other application windows or the desktop, so it cannot provide the required native effect.

**Persisting a credential-entry completion flag.** A native credential skip is valid only for the current process; retaining it would suppress the next cold-start choice while the user still has no credentials. The account introduction's separate completion flag does not bypass this authentication decision.

**Keeping both native and Web credential dialogs.** Their separate completion state would ask for a key twice after a native skip. The composition assigns credential onboarding to one owner.

**Drawing replacement traffic lights.** Native controls preserve platform window behavior and accessibility. Their dimensions and outer window corners follow the OS rather than reproducing Figma geometry exactly.

**Separate preview callbacks.** A visual-only skip cannot demonstrate entry into the workspace and can hide broken startup dependencies. The preview uses the same callbacks and Host as the product.

## Consequences

Native blur strength and font fallback vary by system. The main window uses the shared sidebar vibrancy; full-window onboarding retains a transparent renderer without an additional tint. Windows compositing needs platform QA. Owner-local text expectations cover both pages and locales, and built-Host acceptance covers credential persistence across restarts. Account sign-out preserves independent API keys. Onboarding presentation produces no Session events.
