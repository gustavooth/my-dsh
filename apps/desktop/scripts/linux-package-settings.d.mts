/**
 * Validate worker limits before packaging starts.
 * @param environment Loaded packaging settings and inherited build environment.
 * @returns A positive integer pack limit defaulting to four. Invalid values throw.
 */
export function resolveLinuxPackageSettings(environment: NodeJS.ProcessEnv): { packConcurrency: number }
