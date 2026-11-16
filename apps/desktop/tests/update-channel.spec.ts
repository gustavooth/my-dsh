import { expect, it } from 'vitest'
import { desktopUpdateChannel, desktopUpdateFeed } from '../src/update-channel.ts'

it('reads the installed channel independently from the current version', () => {
  expect(desktopUpdateChannel({ version: '1.0.0', dshDesktopUpdateChannel: 'nightly' })).toBe('nightly')
  expect(desktopUpdateChannel({ version: '1.0.0', dshDesktopUpdateChannel: 'stable' })).toBe('stable')
  expect(desktopUpdateChannel({ version: '1.0.0' })).toBe('nightly')
  expect(() => desktopUpdateChannel({ dshDesktopUpdateChannel: 'latest' })).toThrow(/channel/u)
  expect(() => desktopUpdateChannel({ dshDesktopUpdateChannel: 'beta' })).toThrow(/channel/u)
  expect(() => desktopUpdateChannel(null)).toThrow(/manifest/u)
})

it('reads the installed update destination independently from the channel', () => {
  expect(desktopUpdateFeed({ version: '1.0.0', dshDesktopUpdateFeed: 'github' })).toBe('github')
  expect(desktopUpdateFeed({ version: '1.0.0', dshDesktopUpdateFeed: 'generic' })).toBe('generic')
  expect(desktopUpdateFeed({ version: '1.0.0' })).toBe('generic')
  expect(() => desktopUpdateFeed({ dshDesktopUpdateFeed: 'github.com' })).toThrow(/feed/u)
  expect(() => desktopUpdateFeed(null)).toThrow(/manifest/u)
})
