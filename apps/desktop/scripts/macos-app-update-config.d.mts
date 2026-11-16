/** Resolved GitHub release feed required to embed a macOS updater feed. */
export interface MacOSGithubAppUpdateFeed {
  readonly provider: 'github'
  readonly owner: string
  readonly repo: string
}

/** Resolved fixed-URL feed required to embed a macOS updater feed. */
export interface MacOSGenericAppUpdateFeed {
  readonly provider: 'generic'
  readonly publicUrl: string
  readonly channel?: 'nightly' | 'stable'
}

/** Resolved fields required to embed a macOS updater feed. */
export type MacOSAppUpdateFeed = MacOSGithubAppUpdateFeed | MacOSGenericAppUpdateFeed

/** Packaged electron-updater configuration for a GitHub release feed. */
export interface MacOSGithubAppUpdateConfig {
  readonly provider: 'github'
  readonly owner: string
  readonly repo: string
  readonly updaterCacheDirName: string
}

/** Packaged electron-updater configuration for a fixed-URL feed. */
export interface MacOSGenericAppUpdateConfig {
  readonly provider: 'generic'
  readonly url: string
  readonly channel: 'nightly' | 'stable'
  readonly updaterCacheDirName: string
}

/** Packaged electron-updater configuration for macOS. */
export type MacOSAppUpdateConfig = MacOSGithubAppUpdateConfig | MacOSGenericAppUpdateConfig

/** Resolve the one macOS feed from the final electron-builder configuration. */
export function resolveMacOSAppUpdateFeed(publish: unknown): MacOSAppUpdateFeed

/** Create the electron-updater configuration embedded before code signing. */
export function createMacOSAppUpdateConfig(
  update: MacOSAppUpdateFeed,
  updaterCacheDirName: string,
): MacOSAppUpdateConfig

/** Write the updater configuration into an assembled App before signing. */
export function writeMacOSAppUpdateConfig(
  resourcesDir: string,
  update: MacOSAppUpdateFeed,
  updaterCacheDirName: string,
): Promise<void>

/** Verify the updater configuration inside an assembled macOS App. */
export function verifyMacOSAppUpdateConfig(
  appPath: string,
  update: MacOSAppUpdateFeed,
  updaterCacheDirName?: string,
): Promise<void>
