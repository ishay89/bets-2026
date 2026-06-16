'use client'
import { useState, useEffect, useRef } from 'react'
import { MatchDaySection, type MatchDaySectionProps } from './match-day-section'
import type { FullMatchDay } from '@/lib/data'

const BATCH = 3

type Props = Omit<MatchDaySectionProps, 'matchDay' | 'showTopDivider'> & {
  days: FullMatchDay[]
}

export function LazyMatchDayList({ days, ...sectionProps }: Props) {
  const [count, setCount] = useState(0)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (count >= days.length) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.disconnect()
          setCount(c => Math.min(c + BATCH, days.length))
        }
      },
      { rootMargin: '200px' },
    )
    if (sentinelRef.current) observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [count, days.length])

  if (days.length === 0) return null

  return (
    <>
      {days.slice(0, count).map(matchDay => (
        <MatchDaySection
          key={matchDay.id}
          matchDay={matchDay}
          showTopDivider
          {...sectionProps}
        />
      ))}
      {count < days.length && <div ref={sentinelRef} aria-hidden />}
    </>
  )
}
