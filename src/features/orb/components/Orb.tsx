import { OrbCore } from './OrbCore'
import type { PresenceState } from '../../../types'

// OrbCore renders at a fixed 380px. This wrapper scales the real constellation orb to any
// target size so it can be the presence everywhere — header, hero, dashboard — instead of a ✦.
const NATIVE = 380

export function Orb({ presence, size = 96, className = '' }: {
  presence:   PresenceState
  size?:      number
  className?: string
}) {
  const scale = size / NATIVE
  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      <div
        className="absolute top-1/2 left-1/2"
        style={{ transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: 'center' }}
      >
        <OrbCore state={presence} />
      </div>
    </div>
  )
}
