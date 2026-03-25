export type EasingFn = (t: number) => number

export const easeOut: EasingFn = (t) => 1 - (1 - t) ** 3

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t
}

export interface AnimationHandle { cancel: () => void }

export interface AnimateOptions {
  from: number
  to: number
  duration: number
  easing: EasingFn
  onUpdate: (value: number) => void
  onComplete?: () => void
}

export function animate(options: AnimateOptions): AnimationHandle {
  const { from, to, duration, easing, onUpdate, onComplete } = options
  let rafId: number
  let startTime: number | null = null
  let cancelled = false

  function tick(now: number) {
    if (cancelled) return
    if (startTime === null) startTime = now
    const elapsed = now - startTime
    const progress = Math.min(elapsed / duration, 1)
    onUpdate(lerp(from, to, easing(progress)))
    if (progress < 1) { rafId = requestAnimationFrame(tick) }
    else { onComplete?.() }
  }

  rafId = requestAnimationFrame(tick)
  return { cancel: () => { cancelled = true; cancelAnimationFrame(rafId) } }
}
