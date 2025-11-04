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
const TIMER_RADIUS = 80

const describeSectorPath = (ratio: number): string => {
  const clamped = Math.max(0, Math.min(1, ratio))
  if (clamped <= 0) return ''
  if (clamped >= 0.999) {
    const epsilon = 0.01
    return [
      `M 100 100`,
      `m 0 ${-TIMER_RADIUS}`,
      `A ${TIMER_RADIUS} ${TIMER_RADIUS} 0 1 0 ${100 - epsilon} ${100 - TIMER_RADIUS}`,
      'Z',
    ].join(' ')
  }

  const startAngle = -Math.PI / 2
  const sweep = clamped * Math.PI * 2
  const endAngle = startAngle - sweep

  const startX = 100 + TIMER_RADIUS * Math.cos(startAngle)
  const startY = 100 + TIMER_RADIUS * Math.sin(startAngle)
  const endX = 100 + TIMER_RADIUS * Math.cos(endAngle)
  const endY = 100 + TIMER_RADIUS * Math.sin(endAngle)
  const largeArcFlag = clamped > 0.5 ? 1 : 0

  return [
    `M 100 100`,
    `L ${startX.toFixed(3)} ${startY.toFixed(3)}`,
    `A ${TIMER_RADIUS} ${TIMER_RADIUS} 0 ${largeArcFlag} 0 ${endX.toFixed(3)} ${endY.toFixed(3)}`,
    'Z',
  ].join(' ')
}

const formatTime = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / SECONDS_IN_MINUTE)
  const seconds = totalSeconds % SECONDS_IN_MINUTE
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

type TimerCirclePointerHandler = (event: ReactPointerEvent<HTMLDivElement>) => void

type TimerCircleProps = {
  remainingSeconds: number
  totalSeconds: number
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
  totalSeconds,
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
  const remainingRatio =
    totalSeconds <= 0 ? 0 : Math.min(1, Math.max(0, remainingSeconds / totalSeconds))
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
  const [locked, setLocked] = useState(true)
  const [theme, setTheme] = useState<Theme>('dark')
  const [toast, setToast] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const toastTimeoutRef = useRef<number>()
  const skipNextLockToastRef = useRef(true)
  const dragPointerId = useRef<number | null>(null)

  const totalSeconds = useMemo(() => durations[phase] * SECONDS_IN_MINUTE, [durations, phase])
  const totalMinutes = Math.max(1, durations[phase])
  const minutesLeft = Math.max(
    0,
    Math.min(totalMinutes, Math.ceil(remaining / SECONDS_IN_MINUTE)),
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
    let mounted = true
    window.pomodoro
      ?.getLockState?.()
      .then((value) => {
        if (!mounted) return
        if (typeof value === 'boolean') {
          skipNextLockToastRef.current = true
          setLocked(value)
        } else {
          skipNextLockToastRef.current = true
        }
      })
      .catch(() => {
        skipNextLockToastRef.current = true
      })
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    window.pomodoro?.setLockState?.(locked)
    if (skipNextLockToastRef.current) {
      skipNextLockToastRef.current = false
      return
    }
    showToast(locked ? '잠금 모드가 활성화되었습니다.' : '잠금 모드를 해제했습니다.')
  }, [locked, showToast])

  useEffect(() => {
    const dispose = window.pomodoro?.onPreventClose?.(() => {
      showToast('잠금 모드에서는 창을 닫을 수 없습니다.')
    })
    return () => {
      dispose?.()
    }
  }, [showToast])

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
    const remainingRatio = totalMinutes === 0 ? 0 : minutesLeft / totalMinutes
    window.pomodoro?.updateDockIcon?.({
      phase,
      minutesLeft,
      totalMinutes,
      running,
      remainingRatio,
    })
  }, [phase, minutesLeft, totalMinutes, running])

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

  const handleLockToggle = () => {
    setLocked((prev) => !prev)
  }

  const handleThemeToggle = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  return (
    <div className='app-root'>
      <div className='app-shell'>
        <div className='app-shell__drag' data-locked={locked}>
          <span className='app-shell__title'>Pomodoro</span>
          <div className='app-shell__actions'>
            <button type='button' className='ghost-button' onClick={handleThemeToggle}>
              {theme === 'dark' ? '라이트' : '다크'}
            </button>
            <span className='status-pill'>{PHASE_META[phase].label}</span>
            <span className={`lock-indicator ${locked ? 'locked' : 'unlocked'}`}>
              {locked ? '잠금 중' : '해제됨'}
            </span>
          </div>
        </div>

        <TimerCircle
          remainingSeconds={remaining}
          totalSeconds={totalSeconds}
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
          <button className='primary wide' onClick={toggleRunning}>
            {running ? '일시정지' : '시작'}
          </button>
          <button onClick={handleSkip}>다음 단계</button>
          <button className='danger' onClick={handleReset}>
            초기화
          </button>
          <button onClick={handleLockToggle}>{locked ? '잠금 해제' : '잠금'}</button>
        </div>
      </div>

      {toast ? <div className='toast'>{toast}</div> : null}
    </div>
  )
}

export default App
