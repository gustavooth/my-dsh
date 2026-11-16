/** Resolve the update source and channel sealed into the installed application manifest. */
import type { DesktopUpdatePreferences } from './settings-file.ts'

/** Installer-owned channel, independent of release version and upload environment. */
export type DesktopUpdateChannel = DesktopUpdatePreferences['channel']

/** Destination sealed into one installer; older manifests embedded fixed-URL feeds only. */
export type DesktopUpdateFeed = 'github' | 'generic'

/**
 * Read the packaged channel; older manifests retain their existing nightly behavior.
 * @param manifest Parsed application manifest.
 * @returns Validated channel. Invalid explicit values reject instead of changing feeds.
 */
export function desktopUpdateChannel(manifest: unknown): DesktopUpdateChannel {
  if (typeof manifest !== 'object' || manifest === null) throw new Error('desktop update: invalid application manifest')
  if (!('dshDesktopUpdateChannel' in manifest)) return 'nightly'
  const channel = manifest.dshDesktopUpdateChannel
  if (channel !== 'nightly' && channel !== 'stable') throw new Error('desktop update: invalid packaged channel')
  return channel
}

/**
 * Read the packaged update destination; releases built before GitHub support embedded a fixed-URL feed.
 * @param manifest Parsed application manifest.
 * @returns Validated destination. Invalid explicit values reject instead of switching sources.
 */
export function desktopUpdateFeed(manifest: unknown): DesktopUpdateFeed {
  if (typeof manifest !== 'object' || manifest === null) throw new Error('desktop update: invalid application manifest')
  if (!('dshDesktopUpdateFeed' in manifest)) return 'generic'
  const feed = manifest.dshDesktopUpdateFeed
  if (feed !== 'github' && feed !== 'generic') throw new Error('desktop update: invalid packaged update feed')
  return feed
}
