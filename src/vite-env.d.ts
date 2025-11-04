/// <reference types="vite/client" />

interface Window {
  // expose in the `electron/preload/index.ts`
  ipcRenderer: import('electron').IpcRenderer
  pomodoro?: {
    updateDockIcon: (payload: {
      phase: 'focus' | 'break'
      minutesLeft: number
      totalMinutes: number
      remainingRatio: number
      running: boolean
    }) => Promise<void>
  }
}
