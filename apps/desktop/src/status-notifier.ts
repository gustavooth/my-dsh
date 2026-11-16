/** Session StatusNotifier readiness for the Linux tray icon. */

import { execFile } from 'node:child_process'

/** Whether the session can display a StatusNotifierItem. */
export type StatusNotifierHostState = 'registered' | 'absent' | 'unsupported'

/** Retry interval while the panel or its status area is still starting. */
export const STATUS_NOTIFIER_RETRY_MS = 250

/** How long the shell waits for a host before falling back to Electron's GtkStatusIcon. */
export const STATUS_NOTIFIER_TIMEOUT_MS = 20_000

const GDBUS_ARGS = ['call', '--session', '--dest', 'org.kde.StatusNotifierWatcher',
  '--object-path', '/StatusNotifierWatcher', '--method', 'org.freedesktop.DBus.Properties.Get',
  'org.kde.StatusNotifierWatcher', 'IsStatusNotifierHostRegistered']

/**
 * Read whether the session has a registered StatusNotifier host.
 *
 * `gdbus` ships with GLib, which every supported Linux desktop installs. A system without it
 * reports `unsupported`, so the caller keeps Electron's built-in fallback instead of waiting.
 * @returns the observed host state.
 */
export async function readStatusNotifierHostState(): Promise<StatusNotifierHostState> {
  return await new Promise<StatusNotifierHostState>((resolve) => {
    execFile('gdbus', GDBUS_ARGS, { encoding: 'utf8', timeout: 1000 }, (error, stdout) => {
      if (error !== null) {
        resolve(error.code === 'ENOENT' ? 'unsupported' : 'absent')
        return
      }
      resolve(/\btrue\b/u.test(stdout) ? 'registered' : 'absent')
    })
  })
}

/** Inputs for {@link waitForStatusNotifierHost}. */
export interface WaitForStatusNotifierHostOptions {
  /** Read the current host state. */
  readonly probe: () => Promise<StatusNotifierHostState>
  /** Create the tray icon once a host can display it. */
  readonly onReady: () => void
  /** Stop before the next probe and before calling {@link onReady}. */
  readonly isCancelled: () => boolean
  /** Delay between probes; defaults to {@link STATUS_NOTIFIER_RETRY_MS}. */
  readonly retryMs?: number
  /** Maximum waiting time before the caller falls back; defaults to {@link STATUS_NOTIFIER_TIMEOUT_MS}. */
  readonly timeoutMs?: number
}

/**
 * Wait until a StatusNotifier host can display a new tray icon.
 *
 * A session restored before its panel leaves the watcher without a host. Creating the tray then
 * makes Electron fall back to GtkStatusIcon, which COSMIC and other SNI-only panels never show.
 * Waiting keeps the icon on the StatusNotifierItem path; after the timeout the caller still gets
 * a tray through Electron's fallback.
 * @param options - Probe, ready callback, cancellation, and timing controls.
 * @returns a function that stops further probes without creating the tray.
 */
export function waitForStatusNotifierHost(options: WaitForStatusNotifierHostOptions): () => void {
  const retryMs = options.retryMs ?? STATUS_NOTIFIER_RETRY_MS
  const timeoutMs = options.timeoutMs ?? STATUS_NOTIFIER_TIMEOUT_MS
  const deadline = Date.now() + timeoutMs
  let cancelled = false
  let finished = false
  let timer: NodeJS.Timeout | undefined

  const finish = (): void => {
    if (cancelled || finished || options.isCancelled()) return
    finished = true
    options.onReady()
  }

  const check = async (): Promise<void> => {
    if (cancelled || options.isCancelled()) return
    let state: StatusNotifierHostState
    // A rejected probe means the bus or the watcher is not ready yet, so keep waiting.
    try { state = await options.probe() } catch { state = 'absent' }
    if (cancelled || options.isCancelled()) return
    if (state !== 'absent' || Date.now() >= deadline) {
      finish()
      return
    }
    timer = setTimeout(() => { void check() }, retryMs)
  }

  void check()
  return () => {
    cancelled = true
    if (timer !== undefined) clearTimeout(timer)
  }
}
