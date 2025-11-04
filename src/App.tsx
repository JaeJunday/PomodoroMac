import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FC,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import './App.css'

type Phase = 'focus' | 'break'
type Theme = 'dark' | 'light'

const PHASE_META: Record<Phase, { label: string; defaultMinutes: number }> = {
  focus: { label: '집중', defaultMinutes: 25 },
  break: { label: '휴식', defaultMinutes: 5 },
}

const SECONDS_IN_MINUTE = 60
const MAX_MINUTES = 60
const TIMER_RADIUS = 90

const describeSectorPath = (ratio: number): string => {
  const clamped = Math.max(0, Math.min(1, ratio))
  if (clamped <= 0) return ''
  if (clamped >= 0.999) {
    const epsilon = 0.01
    return [
      `M 100 100`,
      `m 0 ${-TIMER_RADIUS}`,
      `A ${TIMER_RADIUS} ${TIMER_RADIUS} 0 1 1 ${100 + epsilon} ${100 - TIMER_RADIUS}`,
      'Z',
    ].join(' ')
  }

  const startAngle = -Math.PI / 2
  const sweep = clamped * Math.PI * 2
  const endAngle = startAngle + sweep

  const startX = 100 + TIMER_RADIUS * Math.cos(startAngle)
  const startY = 100 + TIMER_RADIUS * Math.sin(startAngle)
  const endX = 100 + TIMER_RADIUS * Math.cos(endAngle)
  const endY = 100 + TIMER_RADIUS * Math.sin(endAngle)
  const largeArcFlag = clamped > 0.5 ? 1 : 0
  const sweepFlag = 1

  return [
    `M 100 100`,
    `L ${startX.toFixed(3)} ${startY.toFixed(3)}`,
    `A ${TIMER_RADIUS} ${TIMER_RADIUS} 0 ${largeArcFlag} ${sweepFlag} ${endX.toFixed(3)} ${endY.toFixed(3)}`,
    'Z',
  ].join(' ')
}

const formatTime = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / SECONDS_IN_MINUTE)
  const seconds = totalSeconds % SECONDS_IN_MINUTE
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const PlayIcon: FC = () => (
  <svg className='icon' width='24' height='24' viewBox='0 0 24 24' aria-hidden='true'>
    <path d='M8 5v14l10-7z' fill='currentColor' />
  </svg>
)

const PauseIcon: FC = () => (
  <svg className='icon' width='24' height='24' viewBox='0 0 24 24' aria-hidden='true'>
    <rect x='7' y='5' width='4' height='14' rx='1.2' fill='currentColor' />
    <rect x='13' y='5' width='4' height='14' rx='1.2' fill='currentColor' />
  </svg>
)

const ResetIcon: FC = () => (
  <svg className='icon' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
    <path d='M5 8.5V4h4.5' />
    <path d='M5 4l4.5 4.5' />
    <path d='M6.8 12a6.2 6.2 0 1 0 1.8-4.4' />
  </svg>
)

const SkipIcon: FC = () => (
  <svg className='icon' width='24' height='24' viewBox='0 0 24 24' aria-hidden='true'>
    <path d='M7.5 6.5 14 12l-6.5 5.5V6.5z' fill='currentColor' />
    <rect x='15.5' y='6' width='1.8' height='12' rx='0.9' fill='currentColor' />
  </svg>
)


type TimerCirclePointerHandler = (event: ReactPointerEvent<HTMLDivElement>) => void

type TimerCircleProps = {
  remainingSeconds: number
  remainingRatio: number
  phase: Phase
  phaseLabel: string
  configuredMinutes: number
  running: boolean
  dragging: boolean
  onPointerDown: TimerCirclePointerHandler
  onPointerMove: TimerCirclePointerHandler
  onPointerUp: TimerCirclePointerHandler
  onPointerCancel: TimerCirclePointerHandler
}

const TimerCircle: FC<TimerCircleProps> = ({
  remainingSeconds,
  remainingRatio,
  phase,
  phaseLabel,
  configuredMinutes,
  running,
  dragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}) => {
  const accentColor =
    phase === 'focus' ? 'var(--focus-highlight)' : 'var(--break-highlight)'
  const accentStyle = useMemo(
    () => ({ '--accent-color': accentColor } as CSSProperties),
    [accentColor],
  )
  const sectorPath = useMemo(() => describeSectorPath(remainingRatio), [remainingRatio])
  const classes = `timer-circle${dragging ? ' is-dragging' : ''}`

  return (
    <div
      className={classes}
      style={accentStyle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      role='slider'
      aria-valuemin={1}
      aria-valuemax={MAX_MINUTES}
      aria-valuenow={Math.max(1, Math.round(configuredMinutes))}
      aria-label={`${phaseLabel} 타이머 설정`}
    >
      <svg className='timer-circle__svg' viewBox='0 0 200 200'>
        <circle className='timer-circle__base' cx='100' cy='100' r={TIMER_RADIUS} />
        {sectorPath ? <path className='timer-circle__sector' d={sectorPath} /> : null}
        <circle className='timer-circle__rim' cx='100' cy='100' r={TIMER_RADIUS} />
      </svg>
      <div className='timer-circle__content'>
        <span className='timer-time'>{formatTime(remainingSeconds)}</span>
        <span className='timer-phase'>{phaseLabel}</span>
        <span className='timer-state'>{running ? '진행 중' : '일시 정지'}</span>
      </div>
      <div className='timer-circle__gesture' aria-hidden />
    </div>
  )
}

const App = () => {
  const [phase, setPhase] = useState<Phase>('focus')
  const [durations, setDurations] = useState<Record<Phase, number>>({
    focus: PHASE_META.focus.defaultMinutes,
    break: PHASE_META.break.defaultMinutes,
  })
  const [remaining, setRemaining] = useState(PHASE_META.focus.defaultMinutes * SECONDS_IN_MINUTE)
  const [running, setRunning] = useState(false)
  const [theme, setTheme] = useState<Theme>('dark')
  const [toast, setToast] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const toastTimeoutRef = useRef<number>()
  const dragPointerId = useRef<number | null>(null)

  const totalSeconds = useMemo(() => durations[phase] * SECONDS_IN_MINUTE, [durations, phase])
  const totalMinutes = Math.max(1, durations[phase])
  const minutesLeft = Math.max(
    0,
    Math.min(totalMinutes, Math.ceil(remaining / SECONDS_IN_MINUTE)),
  )
  const remainingRatio = Math.max(
    0,
    Math.min(1, remaining / (MAX_MINUTES * SECONDS_IN_MINUTE)),
  )
  const nextPhase: Phase = phase === 'focus' ? 'break' : 'focus'

  const showToast = useCallback((message: string) => {
    setToast(message)
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current)
    toastTimeoutRef.current = window.setTimeout(() => setToast(null), 2400)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    return () => {
      document.documentElement.removeAttribute('data-theme')
    }
  }, [theme])

  useEffect(() => {
    if (!running || remaining <= 0) return
    const interval = window.setInterval(() => {
      setRemaining((prev) => (prev <= 1 ? 0 : prev - 1))
    }, 1000)
    return () => window.clearInterval(interval)
  }, [running, remaining])

  useEffect(() => {
    if (!running || remaining > 0) return
    const upcomingPhase: Phase = phase === 'focus' ? 'break' : 'focus'
    const upcomingDurationSeconds = durations[upcomingPhase] * SECONDS_IN_MINUTE
    setPhase(upcomingPhase)
    setRemaining(upcomingDurationSeconds)
  }, [remaining, running, phase, durations])

  useEffect(() => {
    window.pomodoro?.updateDockIcon?.({
      phase,
      minutesLeft,
      totalMinutes,
      running,
      remainingRatio,
    })
  }, [phase, minutesLeft, totalMinutes, running, remainingRatio])

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current)
    }
  }, [])

  const updateDurationFromPointer = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, options: { emitToast?: boolean } = {}): boolean => {
      const { emitToast = true } = options
      if (running) {
        if (emitToast) {
          showToast('타이머를 일시정지 후 시간을 조절하세요.')
        }
        return false
      }

      const target = event.currentTarget as HTMLDivElement
      const rect = target.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const dx = event.clientX - centerX
      const dy = event.clientY - centerY

      const angleDegrees = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360
      let minutes = Math.round(angleDegrees / 6)
      if (minutes < 1) minutes = 1
      if (minutes > MAX_MINUTES) minutes = MAX_MINUTES

      setDurations((prev) => {
        if (prev[phase] === minutes) return prev
        return { ...prev, [phase]: minutes }
      })
      setRemaining(minutes * SECONDS_IN_MINUTE)
      return true
    },
    [phase, running, showToast],
  )

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      const updated = updateDurationFromPointer(event)
      if (!updated) return
      dragPointerId.current = event.pointerId
      setDragging(true)
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [updateDurationFromPointer],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (dragPointerId.current !== event.pointerId) return
      updateDurationFromPointer(event, { emitToast: false })
    },
    [updateDurationFromPointer],
  )

  const releasePointer = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragPointerId.current !== event.pointerId) return
    dragPointerId.current = null
    setDragging(false)
    event.currentTarget.releasePointerCapture(event.pointerId)
  }, [])

  const toggleRunning = () => {
    if (remaining <= 0) {
      setRemaining(totalSeconds)
    }
    setRunning((prev) => !prev)
  }

  const handleReset = () => {
    setRunning(false)
    setRemaining(totalSeconds)
    showToast('타이머를 초기화했습니다.')
  }

  const handleSkip = () => {
    const upcoming = nextPhase
    setPhase(upcoming)
    setRemaining(durations[upcoming] * SECONDS_IN_MINUTE)
    setRunning(false)
    showToast(`${PHASE_META[upcoming].label} 세션으로 이동했습니다.`)
  }

  const handleThemeToggle = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  return (
    <div className='app-root'>
      <div className='app-shell'>
        <div className='app-shell__drag'>
          <span className='app-shell__title'>Pomodoro</span>
          <div className='app-shell__actions'>
            <button type='button' className='ghost-button' onClick={handleThemeToggle}>
              {theme === 'dark' ? '라이트' : '다크'}
            </button>
            <span className='status-pill'>{PHASE_META[phase].label}</span>
          </div>
        </div>

        <TimerCircle
          remainingSeconds={remaining}
          remainingRatio={remainingRatio}
          phase={phase}
          phaseLabel={PHASE_META[phase].label}
          configuredMinutes={durations[phase]}
          running={running}
          dragging={dragging}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={releasePointer}
          onPointerCancel={releasePointer}
        />

        <div className='details-panel'>
          <span>
            <small>현재 단계</small>
            <strong>{PHASE_META[phase].label}</strong>
          </span>
          <span>
            <small>세션 길이</small>
            <strong>{durations[phase]}분</strong>
          </span>
          <span>
            <small>다음 단계</small>
            <strong>{`${PHASE_META[nextPhase].label} • ${durations[nextPhase]}분`}</strong>
          </span>
        </div>

        <div className='controls'>
          <button
            type='button'
            className={`icon-button primary${running ? ' active' : ''}`}
            onClick={toggleRunning}
            aria-label={running ? '타이머 일시정지' : '타이머 시작'}
            title={running ? '일시정지' : '시작'}
          >
            {running ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button
            type='button'
            className='icon-button'
            onClick={handleSkip}
            aria-label='다음 단계로 건너뛰기'
            title='다음 단계'
          >
            <SkipIcon />
          </button>
          <button
            type='button'
            className='icon-button danger'
            onClick={handleReset}
            aria-label='타이머 초기화'
            title='초기화'
          >
            <ResetIcon />
          </button>
        </div>
      </div>

      {toast ? <div className='toast'>{toast}</div> : null}
    </div>
  )
}

export default App
