import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

type Phase = 'focus' | 'break'

const PHASES: Record<
  Phase,
  {
    label: string
    durationMinutes: number
  }
> = {
  focus: { label: '집중', durationMinutes: 25 },
  break: { label: '휴식', durationMinutes: 5 },
}

const SECONDS_IN_MINUTE = 60
const TIMER_RADIUS = 80
const TIMER_CIRCUMFERENCE = 2 * Math.PI * TIMER_RADIUS

const formatTime = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / SECONDS_IN_MINUTE)
  const seconds = totalSeconds % SECONDS_IN_MINUTE
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const TimerCircle: React.FC<{
  phase: Phase
  running: boolean
  remainingSeconds: number
  totalSeconds: number
}> = ({ phase, running, remainingSeconds, totalSeconds }) => {
  const progress = totalSeconds === 0 ? 1 : Math.min(1, Math.max(0, 1 - remainingSeconds / totalSeconds))
  const dashOffset = TIMER_CIRCUMFERENCE * (1 - progress)
  const className = `timer-circle ${phase === 'focus' ? 'phase-focus' : 'phase-break'}`

  return (
    <div className={className}>
      <svg viewBox='0 0 200 200'>
        <circle className='timer-circle__track' cx='100' cy='100' r={TIMER_RADIUS} />
        <circle
          className='timer-circle__progress'
          cx='100'
          cy='100'
          r={TIMER_RADIUS}
          strokeDasharray={TIMER_CIRCUMFERENCE}
          strokeDashoffset={Math.max(0, Math.min(TIMER_CIRCUMFERENCE, dashOffset))}
        />
      </svg>
      <div className='timer-circle__content'>
        <span className='timer-time'>{formatTime(remainingSeconds)}</span>
        <span className='timer-phase'>{PHASES[phase].label}</span>
        <span className='timer-state'>{running ? '진행 중' : '일시 정지'}</span>
      </div>
    </div>
  )
}

const getPhaseDurationSeconds = (phase: Phase) => PHASES[phase].durationMinutes * SECONDS_IN_MINUTE

const App = () => {
  const [phase, setPhase] = useState<Phase>('focus')
  const [remaining, setRemaining] = useState(getPhaseDurationSeconds('focus'))
  const [running, setRunning] = useState(false)
  const [locked, setLocked] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimeoutRef = useRef<number>()

  const totalSeconds = useMemo(() => getPhaseDurationSeconds(phase), [phase])
  const totalMinutes = Math.max(1, Math.round(totalSeconds / SECONDS_IN_MINUTE))
  const minutesLeft = Math.max(0, Math.min(totalMinutes, Math.ceil(remaining / SECONDS_IN_MINUTE)))
  const nextPhase: Phase = phase === 'focus' ? 'break' : 'focus'

  const showToast = useCallback((message: string) => {
    setToast(message)
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current)
    toastTimeoutRef.current = window.setTimeout(() => setToast(null), 2400)
  }, [])

  useEffect(() => {
    let mounted = true
    window.pomodoro?.getLockState?.().then((value) => {
      if (!mounted) return
      if (typeof value === 'boolean') setLocked(value)
    })
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    window.pomodoro?.setLockState?.(locked)
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
    setPhase(upcomingPhase)
    setRemaining(getPhaseDurationSeconds(upcomingPhase))
  }, [remaining, running, phase])

  useEffect(() => {
    window.pomodoro?.updateDockIcon?.({
      phase,
      minutesLeft,
      totalMinutes,
      running,
      progress: totalMinutes === 0 ? 0 : (totalMinutes - minutesLeft) / totalMinutes,
    })
  }, [phase, minutesLeft, totalMinutes, running])

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current)
    }
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
    setPhase(nextPhase)
    const nextDuration = getPhaseDurationSeconds(nextPhase)
    setRemaining(nextDuration)
    setRunning(false)
    showToast(`${PHASES[nextPhase].label} 세션으로 이동했습니다.`)
  }

  const handleLockToggle = () => {
    setLocked((prev) => !prev)
  }

  return (
    <div className='app-root'>
      <div className='app-shell'>
        <div className='app-shell__drag'>
          <span>Pomodoro</span>
          <div className='app-shell__actions'>
            <span className='status-pill'>{PHASES[phase].label}</span>
            <span className='lock-indicator'>{locked ? '잠금 중' : '해제됨'}</span>
          </div>
        </div>

        <TimerCircle phase={phase} running={running} remainingSeconds={remaining} totalSeconds={totalSeconds} />

        <div className='details-panel'>
          <span>
            <small>현재 단계</small>
            <strong>{PHASES[phase].label}</strong>
          </span>
          <span>
            <small>세션 길이</small>
            <strong>{PHASES[phase].durationMinutes}분</strong>
          </span>
          <span>
            <small>다음 단계</small>
            <strong>{PHASES[nextPhase].label}</strong>
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
