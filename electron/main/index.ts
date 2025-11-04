import { app, BrowserWindow, shell, ipcMain, nativeImage, screen } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { update } from './update'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.mjs   > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

type PomodoroDockPayload = {
  phase: 'focus' | 'break'
  minutesLeft: number
  totalMinutes: number
  progress: number
  running: boolean
}

const WINDOW_WIDTH = 340
const WINDOW_HEIGHT = 380
const WINDOW_MARGIN = 24
let isLocked = true
let win: BrowserWindow | null = null
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')
let lastDockKey = ''

// Disable GPU Acceleration for Windows 7
if (os.release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

async function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const targetX = Math.max(0, width - WINDOW_WIDTH - WINDOW_MARGIN)
  const targetY = Math.max(0, WINDOW_MARGIN)

  win = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x: targetX,
    y: targetY,
    show: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    frame: false,
    transparent: true,
    title: 'Pomodoro',
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    backgroundColor: '#00000000',
    titleBarStyle: 'hidden',
    roundedCorners: true,
    webPreferences: {
      preload,
      backgroundThrottling: false,
      devTools: !app.isPackaged,
    },
  })

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setAlwaysOnTop(true, 'screen-saver')

  win.once('ready-to-show', () => {
    win?.showInactive()
  })

  if (VITE_DEV_SERVER_URL) {
    await win.loadURL(VITE_DEV_SERVER_URL)
    if (!app.isPackaged) {
      win.webContents.openDevTools({ mode: 'detach' })
    }
  } else {
    await win.loadFile(indexHtml)
  }

  win.on('close', (event) => {
    if (isLocked) {
      event.preventDefault()
      win?.webContents.send('pomodoro:prevent-close')
    } else {
      win = null
    }
  })

  win.on('hide', () => {
    if (isLocked) {
      win?.showInactive()
    }
  })

  win.on('minimize', () => {
    if (isLocked) {
      win?.restore()
      win?.showInactive()
    }
  })

  win.on('closed', () => {
    win = null
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  applyLockState(isLocked)
  update(win)
}

app.whenReady().then(createWindow)

const isMac = process.platform === 'darwin'

const parseDockPayload = (raw: unknown): PomodoroDockPayload | null => {
  if (!raw || typeof raw !== 'object') return null
  const payload = raw as Record<string, unknown>
  const phase = payload.phase === 'break' ? 'break' : payload.phase === 'focus' ? 'focus' : null
  if (!phase) return null

  const minutesLeft = Number(payload.minutesLeft ?? 0)
  const totalMinutes = Number(payload.totalMinutes ?? 1)
  const progress = Number(payload.progress ?? 0)
  const running = Boolean(payload.running)

  if (Number.isNaN(minutesLeft) || Number.isNaN(totalMinutes) || Number.isNaN(progress)) {
    return null
  }

  return { phase, minutesLeft, totalMinutes, progress, running }
}

const applyLockState = (locked: boolean) => {
  isLocked = locked
  if (!win) return
  win.setAlwaysOnTop(locked, locked ? 'screen-saver' : 'normal')
  win.setVisibleOnAllWorkspaces(locked, { visibleOnFullScreen: true })
  win.setClosable(!locked)
  if (locked && win.isMinimized()) {
    win.restore()
  }
}

const buildDockSvg = (payload: PomodoroDockPayload) => {
  const accent = payload.phase === 'focus' ? '#9fa8ff' : '#73f3c4'
  const background = payload.phase === 'focus' ? '#161829' : '#102524'
  const normalized = Math.min(1, Math.max(0, payload.progress))
  const circumference = 2 * Math.PI * 190
  const dashOffset = circumference * (1 - normalized)
  const minutesLabel = payload.minutesLeft > 0 ? String(payload.minutesLeft).padStart(2, '0') : payload.running ? '00' : '--'
  const statusLabel = payload.phase === 'focus' ? 'FOCUS' : 'BREAK'
  const runState = payload.running ? 'RUN' : 'PAUSE'
  const totalLabel = String(Math.max(1, payload.totalMinutes)).padStart(2, '0')

  return `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="120" fill="${background}"/>
  <g transform="translate(256 256)">
    <circle cx="0" cy="0" r="190" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="32"/>
    <circle cx="0" cy="0" r="190" fill="none" stroke="${accent}" stroke-width="32" stroke-linecap="round"
      stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${dashOffset.toFixed(2)}" transform="rotate(-90)"/>
  </g>
  <text x="256" y="238" text-anchor="middle" font-size="176" font-family="SF Pro Display, Helvetica Neue, Arial" font-weight="700" fill="#f6f8ff">${minutesLabel}</text>
  <text x="256" y="312" text-anchor="middle" font-size="48" font-family="SF Pro Text, Helvetica Neue, Arial" letter-spacing="12" fill="rgba(255,255,255,0.72)">${statusLabel}</text>
  <text x="256" y="360" text-anchor="middle" font-size="36" font-family="SF Pro Text, Helvetica Neue, Arial" letter-spacing="10" fill="rgba(255,255,255,0.5)">${runState}</text>
  <text x="256" y="408" text-anchor="middle" font-size="30" font-family="SF Pro Text, Helvetica Neue, Arial" fill="rgba(255,255,255,0.36)">/${totalLabel} MIN</text>
</svg>`
}

const updateDockIcon = (payload: PomodoroDockPayload) => {
  if (!isMac || !app.dock) return
  const constrained: PomodoroDockPayload = {
    phase: payload.phase,
    minutesLeft: Math.max(0, Math.min(99, Math.round(payload.minutesLeft))),
    totalMinutes: Math.max(1, Math.min(99, Math.round(payload.totalMinutes))),
    progress: Math.min(1, Math.max(0, payload.progress)),
    running: payload.running,
  }
  const key = JSON.stringify(constrained)
  if (key === lastDockKey) return
  lastDockKey = key

  const badge = constrained.minutesLeft > 0 ? String(constrained.minutesLeft).padStart(2, '0') : ''
  app.dock.setBadge(badge)

  const svg = buildDockSvg(constrained)
  const image = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)
  if (!image.isEmpty()) {
    app.dock.setIcon(image)
  }
}

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})

ipcMain.handle('pomodoro:set-lock-state', (_, locked: boolean) => {
  applyLockState(Boolean(locked))
})

ipcMain.handle('pomodoro:get-lock-state', () => isLocked)

ipcMain.handle('pomodoro:update-dock-icon', (_event, payload) => {
  const parsed = parseDockPayload(payload)
  if (parsed) {
    updateDockIcon(parsed)
  }
})

// New window example arg: new windows url
ipcMain.handle('open-win', (_, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    childWindow.loadURL(`${VITE_DEV_SERVER_URL}#${arg}`)
  } else {
    childWindow.loadFile(indexHtml, { hash: arg })
  }
})
