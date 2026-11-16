/** Feed policy applied before a check, independently of the library's channel setter. */
import type { AppUpdater } from 'electron-updater'
import type { DesktopUpdateChannel, DesktopUpdateFeed } from '../../update-channel.ts'

/**
 * Apply the packaged feed's channel rules.
 * GitHub Releases expose one Latest release and select metadata by release tag, so the installer
 * channel must not override the updater's default channel there. Fixed-URL feeds keep per-channel
 * metadata and accept prerelease versions.
 * @param updater - Updater whose prior operations have settled.
 * @param feed - Packaged update destination.
 * @param channel - Selected distribution channel.
 */
export function selectUpdateChannel(updater: AppUpdater, feed: DesktopUpdateFeed, channel: DesktopUpdateChannel): void {
  if (feed === 'github') {
    // The library channel setter enables downgrades, so every feed restores this explicitly.
    updater.allowDowngrade = false
    updater.allowPrerelease = false
    return
  }
  updater.channel = channel
  // The library channel setter enables downgrades.
  updater.allowDowngrade = false
  updater.allowPrerelease = true
}
