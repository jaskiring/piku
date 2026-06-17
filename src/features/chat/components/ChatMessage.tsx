import type { Message } from '../../../types'

interface Props {
  message: Message
}

// Compact message bubble (ambient popup / small surfaces). The immersive chat uses its own
// roomier renderer. Cyan/teal palette, thinking collapsed by default.
export function ChatMessage({ message }: Props) {
  const isUser   = message.sender === 'user'
  const thinking = (!isUser && message.thinking?.trim()) || ''

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
          isUser
            ? 'bg-cyan-500/12 border border-cyan-400/15 text-cyan-50/95 rounded-br-md'
            : 'bg-white/[0.04] text-white/80 rounded-bl-md'
        }`}
      >
        {thinking && (
          <details open className="mb-1.5 group">
            <summary className="text-[11px] text-cyan-300/55 hover:text-cyan-300/85 cursor-pointer select-none list-none">
              <span className="group-open:hidden">▸ thinking</span>
              <span className="hidden group-open:inline">▾ thinking</span>
            </summary>
            <div className="mt-1 whitespace-pre-wrap border-l border-cyan-400/15 pl-2 text-[11px] leading-relaxed text-white/40 italic">
              {thinking}
            </div>
          </details>
        )}
        <span className="whitespace-pre-wrap">{message.text || <span className="text-white/30">…</span>}</span>
      </div>
    </div>
  )
}
