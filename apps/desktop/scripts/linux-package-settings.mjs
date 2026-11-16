/** Resolve Linux packaging concurrency. */

/**
 * Validate worker limits before packaging starts.
 * Linux packages carry no signing hardware or notarization credentials.
 * @param {NodeJS.ProcessEnv} environment Loaded packaging settings and inherited build environment.
 * @returns {{packConcurrency: number}} A positive integer pack limit defaulting to four.
 */
export function resolveLinuxPackageSettings(environment) {
  const pack = environment.DSH_DESKTOP_LINUX_PACK_CONCURRENCY ?? '4'
  if (!/^[1-9]\d*$/u.test(pack) || !Number.isSafeInteger(Number(pack))) {
    throw new Error('desktop package: DSH_DESKTOP_LINUX_PACK_CONCURRENCY must be a positive integer')
  }
  return { packConcurrency: Number(pack) }
}
