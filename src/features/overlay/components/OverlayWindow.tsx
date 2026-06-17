import type { ReactNode } from 'react'

export function OverlayWindow({ children }: { children: ReactNode }) {
  return (
    <div
      className="
        w-full h-full flex flex-col items-center justify-center gap-6 p-8
        rounded-2xl bg-black/90 border border-cyan-500/20
        shadow-2xl shadow-cyan-500/10 backdrop-blur-xl
      "
    >
      {children}
    </div>
  )
}
