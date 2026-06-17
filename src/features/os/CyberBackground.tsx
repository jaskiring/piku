// The shared cyberpunk backdrop, behind every screen. Pure CSS layers (cheap, no canvas):
// deep base → neon glow pools → engineering grid → scanlines → grain → one slow scan sweep →
// vignette. Restrained on purpose: this is atmosphere, never the subject.
export function CyberBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
      {/* deep base */}
      <div className="absolute inset-0 bg-[#04060c]" />
      <div className="absolute inset-0 bg-[radial-gradient(130%_100%_at_50%_-10%,rgba(13,30,48,0.6),transparent_60%)]" />

      {/* neon glow pools */}
      <div className="absolute -top-40 -left-40 w-[55vw] h-[55vw] rounded-full blur-[120px] bg-cyan-500/[0.06]" />
      <div className="absolute -bottom-52 -right-40 w-[50vw] h-[50vw] rounded-full blur-[130px] bg-fuchsia-600/[0.05]" />

      {/* engineering grid + scanlines + grain */}
      <div className="absolute inset-0 cyber-grid opacity-60" />
      <div className="absolute inset-0 cyber-scanlines opacity-50" />
      <div className="absolute inset-0 cyber-grain opacity-[0.05] mix-blend-overlay" />

      {/* single slow scan sweep — the only ambient motion */}
      <div className="absolute left-0 right-0 h-24 animate-cyber-scan bg-[linear-gradient(to_bottom,transparent,rgba(34,211,238,0.05),transparent)]" />

      {/* vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_50%,transparent_55%,rgba(0,0,0,0.6))]" />
    </div>
  )
}
