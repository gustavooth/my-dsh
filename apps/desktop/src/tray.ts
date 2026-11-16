/** System tray: the always-present way back to a hidden window and the explicit quit entry. */

import { Menu, nativeImage, Tray, type NativeImage } from 'electron'
import type { DesktopLocale } from './locale.ts'

/** Main-process actions the tray triggers; both run the same paths as the window and application menu. */
export interface DesktopTrayOptions {
  /** Windows multi-size ICO or Linux PNG rendered by `scripts/render-tray-icon.ts`. */
  readonly iconPath: string
  readonly locale: () => DesktopLocale
  /** Show and focus the primary window. */
  readonly open: () => void
  /** Request quit through the same confirmation as every other quit entry. */
  readonly quit: () => void
}

/** Delay before re-exporting the icon so a host that subscribed during creation receives `NewIcon`. */
const ICON_REFRESH_MS = 1500

/** Tray icon present for the whole run, not only while the window is hidden. */
export class DesktopTray {
  private tray: Tray | undefined
  private readonly image: NativeImage
  private readonly refreshTimers: NodeJS.Timeout[] = []

  /** @param options - Icon path, locale reader, and the open and quit actions. */
  constructor(private readonly options: DesktopTrayOptions) {
    const image = nativeImage.createFromPath(options.iconPath)
    this.image = image
    const tray = new Tray(image)
    this.tray = tray
    // Linux status areas show the context menu instead of emitting click, so Open stays in the menu.
    tray.on('click', () => { options.open() })
    this.relabel()
    // A status area can subscribe between item registration and the first pixmap export, then
    // show a placeholder until the next NewIcon; export the icon once more after it is listening.
    this.refreshTimers.push(setTimeout(() => {
      if (this.tray !== undefined) this.tray.setImage(this.image)
    }, ICON_REFRESH_MS))
  }

  /** Rebuild the tooltip and context menu in the current locale. */
  relabel(): void {
    const tray = this.tray
    if (tray === undefined) return
    const { messages } = this.options.locale()
    tray.setToolTip(messages.aboutProduct)
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: messages.openApplication, click: () => { this.options.open() } },
      { type: 'separator' },
      { label: messages.quitApplication, click: () => { this.options.quit() } },
    ]))
  }

  /** Remove the icon; called once the quit is confirmed so no dead icon outlives the process. */
  dispose(): void {
    const tray = this.tray
    this.tray = undefined
    for (const timer of this.refreshTimers) clearTimeout(timer)
    this.refreshTimers.length = 0
    tray?.destroy()
  }
}
