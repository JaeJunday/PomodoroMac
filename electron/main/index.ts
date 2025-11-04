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
  remainingRatio: number
  running: boolean
}

const WINDOW_WIDTH = 360
const WINDOW_HEIGHT = 600
const WINDOW_MARGIN = 24
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

  win.on('closed', () => {
    win = null
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

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
  const remainingRatio = Number(payload.remainingRatio ?? 0)
  const running = Boolean(payload.running)

  if (Number.isNaN(minutesLeft) || Number.isNaN(totalMinutes) || Number.isNaN(remainingRatio)) {
    return null
  }

  return { phase, minutesLeft, totalMinutes, remainingRatio, running }
}

const describeDockSectorPath = (ratio: number, radius: number, cx = 256, cy = 256): string => {
  const clamped = Math.max(0, Math.min(1, ratio))
  if (clamped <= 0) return ''
  if (clamped >= 0.999) {
    const epsilon = 0.1
    return [
      `M ${cx} ${cy}`,
      `m 0 ${-radius}`,
      `A ${radius} ${radius} 0 1 1 ${cx + epsilon} ${cy - radius}`,
      'Z',
    ].join(' ')
  }

  const startAngle = -Math.PI / 2
  const sweep = clamped * Math.PI * 2
  const endAngle = startAngle + sweep

  const startX = cx + radius * Math.cos(startAngle)
  const startY = cy + radius * Math.sin(startAngle)
  const endX = cx + radius * Math.cos(endAngle)
  const endY = cy + radius * Math.sin(endAngle)
  const largeArcFlag = clamped > 0.5 ? 1 : 0
  const sweepFlag = 1

  return [
    `M ${cx} ${cy}`,
    `L ${startX.toFixed(2)} ${startY.toFixed(2)}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${endX.toFixed(2)} ${endY.toFixed(2)}`,
    'Z',
  ].join(' ')
}

const buildDockSvg = (payload: PomodoroDockPayload) => {
  const isFocus = payload.phase === 'focus'
  const accent = isFocus ? '#ff4d4f' : '#36d7a0'
  const background = isFocus ? '#1a1d32' : '#102a22'
  const baseFill = isFocus ? '#212542' : '#18332b'
  const rim = isFocus ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.18)'
  const sectorPath = describeDockSectorPath(payload.remainingRatio, 188)
  const minutesLabel = payload.minutesLeft > 0 ? String(payload.minutesLeft).padStart(2, '0') : payload.running ? '00' : '--'
  const statusLabel = isFocus ? 'FOCUS' : 'BREAK'
  const runState = payload.running ? 'RUN' : 'PAUSE'
  const totalLabel = String(Math.max(1, payload.totalMinutes)).padStart(2, '0')

  return `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="120" fill="${background}"/>
  <circle cx="256" cy="256" r="188" fill="${baseFill}"/>
  ${sectorPath ? `<path d="${sectorPath}" fill="${accent}" opacity="0.9"/>` : ''}
  <circle cx="256" cy="256" r="188" fill="none" stroke="${rim}" stroke-width="16"/>
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
    remainingRatio: Math.min(1, Math.max(0, payload.remainingRatio)),
    running: payload.running,
  }
  const key = JSON.stringify(constrained)
  if (key === lastDockKey) return
  lastDockKey = key

  const badge =
    constrained.minutesLeft > 0
      ? String(constrained.minutesLeft).padStart(2, '0')
      : constrained.running
        ? '00'
        : ''
  app.dock.setBadge(badge)

  const svg = buildDockSvg(constrained)
  const image = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)
  if (!image.isEmpty()) {
    app.dock.setIcon(image)
  }
}

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
