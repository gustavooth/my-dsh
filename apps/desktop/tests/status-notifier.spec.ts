import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  readStatusNotifierHostState,
  waitForStatusNotifierHost,
  type StatusNotifierHostState,
} from '../src/status-notifier.ts'

const execFileMock = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ execFile: execFileMock }))

beforeEach(() => { execFileMock.mockReset() })
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })

function runProbe(stdout: string): void {
  execFileMock.mockImplementation((_file: string, _args: readonly string[], _options: object,
    callback: (error: Error | null, stdout: string, stderr: string) => void) => {
    callback(null, stdout, '')
  })
}

describe('StatusNotifier host probe', () => {
  it('reports a registered host and an absent one from the watcher property', async () => {
    runProbe('(<true>,)')
    await expect(readStatusNotifierHostState()).resolves.toBe('registered')
    runProbe('(<false>,)')
    await expect(readStatusNotifierHostState()).resolves.toBe('absent')
  })

  it('keeps Electron fallback for a system without gdbus and treats other failures as absent', async () => {
    execFileMock.mockImplementation((_file: string, _args: readonly string[], _options: object,
      callback: (error: Error | null, stdout: string, stderr: string) => void) => {
      callback(Object.assign(new Error('spawn gdbus ENOENT'), { code: 'ENOENT' }), '', '')
    })
    await expect(readStatusNotifierHostState()).resolves.toBe('unsupported')
    execFileMock.mockImplementation((_file: string, _args: readonly string[], _options: object,
      callback: (error: Error | null, stdout: string, stderr: string) => void) => {
      callback(new Error('session bus unavailable'), '', '')
    })
    await expect(readStatusNotifierHostState()).resolves.toBe('absent')
  })
})

describe('StatusNotifier host wait', () => {
  function options(probe: () => Promise<StatusNotifierHostState>, onReady = vi.fn()) {
    return { probe, onReady, isCancelled: () => false, retryMs: 250, timeoutMs: 500 }
  }

  function probeOf(state: StatusNotifierHostState) {
    return vi.fn(async (): Promise<StatusNotifierHostState> => state)
  }

  it('creates the tray as soon as a host is registered', async () => {
    vi.useFakeTimers()
    const onReady = vi.fn()
    const cancel = waitForStatusNotifierHost(options(probeOf('registered'), onReady))
    await vi.advanceTimersByTimeAsync(0)
    expect(onReady).toHaveBeenCalledOnce()
    cancel()
  })

  it('retries while the status area is missing and stops after it registers', async () => {
    vi.useFakeTimers()
    const probe = vi.fn<() => Promise<StatusNotifierHostState>>()
      .mockResolvedValueOnce('absent').mockResolvedValue('registered')
    const onReady = vi.fn()
    const cancel = waitForStatusNotifierHost(options(probe, onReady))
    await vi.advanceTimersByTimeAsync(0)
    expect(onReady).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(250)
    expect(probe).toHaveBeenCalledTimes(2)
    expect(onReady).toHaveBeenCalledOnce()
    cancel()
  })

  it('falls back after the timeout when no host appears', async () => {
    vi.useFakeTimers()
    const onReady = vi.fn()
    const cancel = waitForStatusNotifierHost(options(probeOf('absent'), onReady))
    await vi.advanceTimersByTimeAsync(250)
    expect(onReady).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(250)
    expect(onReady).toHaveBeenCalledOnce()
    cancel()
  })

  it('creates the tray immediately when the platform cannot report a host', async () => {
    vi.useFakeTimers()
    const onReady = vi.fn()
    const cancel = waitForStatusNotifierHost(options(probeOf('unsupported'), onReady))
    await vi.advanceTimersByTimeAsync(0)
    expect(onReady).toHaveBeenCalledOnce()
    cancel()
  })

  it('stops probing after cancellation', async () => {
    vi.useFakeTimers()
    const probe = vi.fn(async () => 'absent' as const)
    const onReady = vi.fn()
    const cancel = waitForStatusNotifierHost(options(probe, onReady))
    await vi.advanceTimersByTimeAsync(0)
    expect(probe).toHaveBeenCalledOnce()
    cancel()
    await vi.advanceTimersByTimeAsync(1000)
    expect(probe).toHaveBeenCalledOnce()
    expect(onReady).not.toHaveBeenCalled()
  })
})
