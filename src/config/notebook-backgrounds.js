// ── Notebook background patterns ─────────────────────────────────────────────
// Each pattern is an SVG with a viewBox designed for vertical tiling.
// The CSS mask-image gradient handles the left-to-center fade.
// All patterns use currentColor so they inherit from the theme's text color.
// Cyberpunk aesthetic: neon traces, grid distortion, data streams, holograms.

export const NOTEBOOK_BACKGROUNDS = [
  // ── Neon Grid ──────────────────────────────────────────────────────────────
  {
    id: 'neon-grid',
    name: 'Neon Grid',
    category: 'cyber',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" fill="none" stroke="currentColor">
      <!-- Perspective grid receding into distance -->
      <line x1="0" y1="400" x2="60" y2="0" stroke-width="0.6" opacity="0.12"/>
      <line x1="0" y1="400" x2="100" y2="0" stroke-width="0.6" opacity="0.1"/>
      <line x1="0" y1="400" x2="150" y2="0" stroke-width="0.5" opacity="0.08"/>
      <line x1="0" y1="400" x2="220" y2="0" stroke-width="0.4" opacity="0.06"/>
      <!-- Horizontal grid lines with perspective spacing -->
      <line x1="0" y1="380" x2="180" y2="380" stroke-width="0.5" opacity="0.1"/>
      <line x1="0" y1="340" x2="160" y2="340" stroke-width="0.5" opacity="0.1"/>
      <line x1="0" y1="280" x2="140" y2="280" stroke-width="0.4" opacity="0.09"/>
      <line x1="0" y1="200" x2="120" y2="200" stroke-width="0.4" opacity="0.08"/>
      <line x1="0" y1="100" x2="100" y2="100" stroke-width="0.3" opacity="0.06"/>
      <!-- Bright neon accent traces -->
      <path d="M10,350 L50,350 L50,310 L90,310" stroke-width="2.5" opacity="0.4" stroke-linecap="square"/>
      <circle cx="90" cy="310" r="3" fill="currentColor" opacity="0.35"/>
      <path d="M15,240 L40,240 L40,210 L75,210 L75,180" stroke-width="2" opacity="0.35" stroke-linecap="square"/>
      <rect x="71" y="176" width="8" height="8" stroke-width="1.5" opacity="0.3"/>
      <path d="M20,130 L55,130 L55,100 L85,100" stroke-width="1.8" opacity="0.3" stroke-linecap="square"/>
      <circle cx="85" cy="100" r="2.5" fill="currentColor" opacity="0.25"/>
      <!-- Neon junction nodes -->
      <rect x="47" y="347" width="6" height="6" fill="currentColor" opacity="0.3"/>
      <rect x="37" y="237" width="6" height="6" fill="currentColor" opacity="0.25"/>
      <rect x="52" y="127" width="6" height="6" fill="currentColor" opacity="0.2"/>
      <!-- Floating data points -->
      <circle cx="120" cy="260" r="1.5" fill="currentColor" opacity="0.15"/>
      <circle cx="100" cy="150" r="1.2" fill="currentColor" opacity="0.12"/>
      <circle cx="140" cy="350" r="1.8" fill="currentColor" opacity="0.12"/>
      <!-- Glowing horizon line -->
      <line x1="0" y1="398" x2="200" y2="398" stroke-width="1.5" opacity="0.2"/>
      <line x1="0" y1="2" x2="160" y2="2" stroke-width="0.8" opacity="0.08"/>
    </svg>`,
  },

  // ── Data Rain ──────────────────────────────────────────────────────────────
  {
    id: 'data-rain',
    name: 'Data Rain',
    category: 'cyber',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" fill="currentColor" stroke="none">
      <!-- Vertical streams of falling data -->
      <rect x="8" y="5" width="2" height="8" opacity="0.3" rx="1"/>
      <rect x="8" y="20" width="2" height="14" opacity="0.25" rx="1"/>
      <rect x="8" y="42" width="2" height="6" opacity="0.15" rx="1"/>
      <rect x="8" y="56" width="2" height="20" opacity="0.3" rx="1"/>
      <rect x="8" y="85" width="2" height="10" opacity="0.2" rx="1"/>
      <rect x="8" y="110" width="2" height="16" opacity="0.28" rx="1"/>
      <rect x="8" y="135" width="2" height="8" opacity="0.18" rx="1"/>
      <rect x="8" y="155" width="2" height="22" opacity="0.32" rx="1"/>
      <rect x="8" y="190" width="2" height="12" opacity="0.22" rx="1"/>
      <rect x="8" y="215" width="2" height="18" opacity="0.28" rx="1"/>
      <rect x="8" y="245" width="2" height="6" opacity="0.15" rx="1"/>
      <rect x="8" y="260" width="2" height="14" opacity="0.25" rx="1"/>
      <rect x="8" y="285" width="2" height="20" opacity="0.3" rx="1"/>
      <rect x="8" y="315" width="2" height="10" opacity="0.2" rx="1"/>
      <rect x="8" y="338" width="2" height="16" opacity="0.28" rx="1"/>
      <rect x="8" y="365" width="2" height="24" opacity="0.32" rx="1"/>
      <!-- Stream 2 -->
      <rect x="30" y="12" width="2" height="18" opacity="0.25" rx="1"/>
      <rect x="30" y="40" width="2" height="10" opacity="0.2" rx="1"/>
      <rect x="30" y="60" width="2" height="24" opacity="0.3" rx="1"/>
      <rect x="30" y="95" width="2" height="8" opacity="0.15" rx="1"/>
      <rect x="30" y="115" width="2" height="16" opacity="0.28" rx="1"/>
      <rect x="30" y="145" width="2" height="12" opacity="0.22" rx="1"/>
      <rect x="30" y="170" width="2" height="20" opacity="0.3" rx="1"/>
      <rect x="30" y="205" width="2" height="6" opacity="0.12" rx="1"/>
      <rect x="30" y="225" width="2" height="18" opacity="0.28" rx="1"/>
      <rect x="30" y="255" width="2" height="14" opacity="0.24" rx="1"/>
      <rect x="30" y="282" width="2" height="22" opacity="0.3" rx="1"/>
      <rect x="30" y="320" width="2" height="8" opacity="0.16" rx="1"/>
      <rect x="30" y="342" width="2" height="16" opacity="0.25" rx="1"/>
      <rect x="30" y="372" width="2" height="20" opacity="0.28" rx="1"/>
      <!-- Stream 3 (dimmer, further right) -->
      <rect x="58" y="0" width="2" height="14" opacity="0.18" rx="1"/>
      <rect x="58" y="25" width="2" height="22" opacity="0.22" rx="1"/>
      <rect x="58" y="60" width="2" height="8" opacity="0.12" rx="1"/>
      <rect x="58" y="80" width="2" height="18" opacity="0.2" rx="1"/>
      <rect x="58" y="112" width="2" height="26" opacity="0.25" rx="1"/>
      <rect x="58" y="150" width="2" height="10" opacity="0.15" rx="1"/>
      <rect x="58" y="175" width="2" height="20" opacity="0.22" rx="1"/>
      <rect x="58" y="210" width="2" height="14" opacity="0.18" rx="1"/>
      <rect x="58" y="240" width="2" height="24" opacity="0.25" rx="1"/>
      <rect x="58" y="280" width="2" height="12" opacity="0.16" rx="1"/>
      <rect x="58" y="305" width="2" height="18" opacity="0.22" rx="1"/>
      <rect x="58" y="340" width="2" height="8" opacity="0.12" rx="1"/>
      <rect x="58" y="360" width="2" height="28" opacity="0.25" rx="1"/>
      <!-- Stream 4 (faint, far right) -->
      <rect x="95" y="15" width="1.5" height="12" opacity="0.1" rx="1"/>
      <rect x="95" y="45" width="1.5" height="20" opacity="0.12" rx="1"/>
      <rect x="95" y="85" width="1.5" height="16" opacity="0.1" rx="1"/>
      <rect x="95" y="120" width="1.5" height="10" opacity="0.08" rx="1"/>
      <rect x="95" y="150" width="1.5" height="24" opacity="0.12" rx="1"/>
      <rect x="95" y="195" width="1.5" height="14" opacity="0.1" rx="1"/>
      <rect x="95" y="230" width="1.5" height="18" opacity="0.1" rx="1"/>
      <rect x="95" y="270" width="1.5" height="22" opacity="0.12" rx="1"/>
      <rect x="95" y="310" width="1.5" height="10" opacity="0.08" rx="1"/>
      <rect x="95" y="340" width="1.5" height="26" opacity="0.12" rx="1"/>
      <rect x="95" y="382" width="1.5" height="14" opacity="0.1" rx="1"/>
      <!-- Bright lead drops -->
      <rect x="8" y="388" width="2" height="4" opacity="0.5" rx="1"/>
      <rect x="30" y="392" width="2" height="4" opacity="0.45" rx="1"/>
      <rect x="58" y="395" width="2" height="4" opacity="0.35" rx="1"/>
    </svg>`,
  },

  // ── Circuit Trace ──────────────────────────────────────────────────────────
  {
    id: 'circuit-trace',
    name: 'Circuit Trace',
    category: 'cyber',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" fill="none" stroke="currentColor" stroke-linecap="square">
      <!-- Main bus traces -->
      <path d="M5,0 L5,400" stroke-width="2" opacity="0.15"/>
      <path d="M25,0 L25,400" stroke-width="1" opacity="0.08"/>
      <!-- Branch traces with right-angle turns -->
      <path d="M5,30 L40,30 L40,60 L80,60" stroke-width="2" opacity="0.35"/>
      <path d="M5,62 L30,62 L30,90" stroke-width="1.5" opacity="0.25"/>
      <circle cx="80" cy="60" r="4" stroke-width="1.5" opacity="0.3"/>
      <circle cx="80" cy="60" r="1.5" fill="currentColor" opacity="0.3"/>
      <circle cx="30" cy="90" r="3" stroke-width="1.5" opacity="0.25"/>
      <!-- IC chip outline -->
      <rect x="55" y="100" width="40" height="24" stroke-width="1.5" opacity="0.3" rx="2"/>
      <line x1="55" y1="108" x2="45" y2="108" stroke-width="1.5" opacity="0.25"/>
      <line x1="55" y1="116" x2="45" y2="116" stroke-width="1.5" opacity="0.25"/>
      <line x1="95" y1="108" x2="105" y2="108" stroke-width="1.5" opacity="0.2"/>
      <line x1="95" y1="116" x2="105" y2="116" stroke-width="1.5" opacity="0.2"/>
      <path d="M5,108 L45,108" stroke-width="1.5" opacity="0.25"/>
      <!-- Second branch cluster -->
      <path d="M5,170 L50,170 L50,200 L90,200" stroke-width="2" opacity="0.3"/>
      <path d="M25,185 L60,185 L60,215" stroke-width="1.5" opacity="0.22"/>
      <rect x="86" y="196" width="8" height="8" fill="currentColor" opacity="0.2"/>
      <circle cx="60" cy="215" r="3.5" stroke-width="1.5" opacity="0.22"/>
      <!-- Via holes -->
      <circle cx="5" cy="30" r="3" fill="currentColor" opacity="0.2"/>
      <circle cx="5" cy="170" r="3" fill="currentColor" opacity="0.18"/>
      <circle cx="5" cy="280" r="3" fill="currentColor" opacity="0.16"/>
      <!-- Third cluster -->
      <path d="M5,280 L35,280 L35,310 L70,310 L70,340" stroke-width="2" opacity="0.28"/>
      <path d="M25,295 L55,295 L55,325" stroke-width="1.5" opacity="0.2"/>
      <rect x="66" y="336" width="8" height="8" stroke-width="1.5" opacity="0.25"/>
      <circle cx="70" cy="340" r="1.5" fill="currentColor" opacity="0.2"/>
      <circle cx="55" cy="325" r="3" stroke-width="1.5" opacity="0.2"/>
      <!-- Faint parallel traces -->
      <line x1="110" y1="0" x2="110" y2="400" stroke-width="0.4" opacity="0.06"/>
      <line x1="130" y1="0" x2="130" y2="400" stroke-width="0.3" opacity="0.04"/>
      <!-- Test pads -->
      <rect x="2" y="370" width="6" height="6" fill="currentColor" opacity="0.12"/>
      <rect x="2" y="382" width="6" height="6" fill="currentColor" opacity="0.1"/>
    </svg>`,
  },

  // ── Hologram ───────────────────────────────────────────────────────────────
  {
    id: 'hologram',
    name: 'Hologram',
    category: 'cyber',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" fill="none" stroke="currentColor" stroke-linecap="round">
      <!-- Concentric distortion rings -->
      <ellipse cx="60" cy="80" rx="50" ry="35" stroke-width="1" opacity="0.18"/>
      <ellipse cx="60" cy="80" rx="38" ry="26" stroke-width="1.2" opacity="0.22"/>
      <ellipse cx="60" cy="80" rx="24" ry="16" stroke-width="1.5" opacity="0.28"/>
      <ellipse cx="60" cy="80" rx="10" ry="6" stroke-width="2" opacity="0.35"/>
      <!-- Scan lines through rings -->
      <line x1="10" y1="72" x2="110" y2="72" stroke-width="0.5" opacity="0.1"/>
      <line x1="10" y1="80" x2="110" y2="80" stroke-width="0.5" opacity="0.12"/>
      <line x1="10" y1="88" x2="110" y2="88" stroke-width="0.5" opacity="0.1"/>
      <!-- Holographic diamond -->
      <path d="M50,180 L80,210 L50,240 L20,210 Z" stroke-width="1.5" opacity="0.3"/>
      <path d="M50,190 L70,210 L50,230 L30,210 Z" stroke-width="1" opacity="0.2"/>
      <line x1="50" y1="180" x2="50" y2="240" stroke-width="0.6" opacity="0.15"/>
      <line x1="20" y1="210" x2="80" y2="210" stroke-width="0.6" opacity="0.15"/>
      <!-- Interference bands -->
      <line x1="0" y1="150" x2="140" y2="150" stroke-width="0.8" opacity="0.12"/>
      <line x1="0" y1="153" x2="130" y2="153" stroke-width="0.5" opacity="0.08"/>
      <line x1="0" y1="156" x2="120" y2="156" stroke-width="0.3" opacity="0.06"/>
      <line x1="0" y1="270" x2="130" y2="270" stroke-width="0.8" opacity="0.12"/>
      <line x1="0" y1="273" x2="120" y2="273" stroke-width="0.5" opacity="0.08"/>
      <!-- Second ring cluster -->
      <ellipse cx="45" cy="330" rx="40" ry="28" stroke-width="1" opacity="0.15"/>
      <ellipse cx="45" cy="330" rx="28" ry="19" stroke-width="1.2" opacity="0.2"/>
      <ellipse cx="45" cy="330" rx="14" ry="9" stroke-width="1.5" opacity="0.25"/>
      <!-- Floating particles -->
      <circle cx="90" cy="120" r="1.5" fill="currentColor" opacity="0.15"/>
      <circle cx="20" cy="160" r="1" fill="currentColor" opacity="0.12"/>
      <circle cx="100" cy="210" r="1.8" fill="currentColor" opacity="0.12"/>
      <circle cx="15" cy="290" r="1.2" fill="currentColor" opacity="0.1"/>
      <circle cx="85" cy="370" r="1.5" fill="currentColor" opacity="0.12"/>
      <!-- Vertical scan artifact -->
      <line x1="60" y1="0" x2="60" y2="400" stroke-width="0.4" opacity="0.06" stroke-dasharray="3 8"/>
    </svg>`,
  },

  // ── Hex Mesh ───────────────────────────────────────────────────────────────
  {
    id: 'hex-mesh',
    name: 'Hex Mesh',
    category: 'cyber',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" fill="none" stroke="currentColor" stroke-linejoin="round">
      <!-- Row 1 -->
      <path d="M20,15 L38,5 L56,15 L56,35 L38,45 L20,35 Z" stroke-width="1.2" opacity="0.3"/>
      <path d="M56,15 L74,5 L92,15 L92,35 L74,45 L56,35 Z" stroke-width="1" opacity="0.2"/>
      <!-- Row 2 (offset) -->
      <path d="M2,55 L20,45 L38,55 L38,75 L20,85 L2,75 Z" stroke-width="1.2" opacity="0.25"/>
      <path d="M38,55 L56,45 L74,55 L74,75 L56,85 L38,75 Z" stroke-width="1.5" opacity="0.35"/>
      <circle cx="56" cy="65" r="3" fill="currentColor" opacity="0.25"/>
      <path d="M74,55 L92,45 L110,55 L110,75 L92,85 L74,75 Z" stroke-width="0.8" opacity="0.15"/>
      <!-- Row 3 -->
      <path d="M20,95 L38,85 L56,95 L56,115 L38,125 L20,115 Z" stroke-width="1.2" opacity="0.28"/>
      <path d="M56,95 L74,85 L92,95 L92,115 L74,125 L56,115 Z" stroke-width="1" opacity="0.2"/>
      <!-- Row 4 (offset) -->
      <path d="M2,135 L20,125 L38,135 L38,155 L20,165 L2,155 Z" stroke-width="1" opacity="0.22"/>
      <path d="M38,135 L56,125 L74,135 L74,155 L56,165 L38,155 Z" stroke-width="1.2" opacity="0.28"/>
      <path d="M74,135 L92,125 L110,135 L110,155 L92,165 L74,155 Z" stroke-width="0.6" opacity="0.12"/>
      <!-- Row 5 -->
      <path d="M20,175 L38,165 L56,175 L56,195 L38,205 L20,195 Z" stroke-width="1.5" opacity="0.32"/>
      <circle cx="38" cy="185" r="3" fill="currentColor" opacity="0.22"/>
      <path d="M56,175 L74,165 L92,175 L92,195 L74,205 L56,195 Z" stroke-width="0.8" opacity="0.16"/>
      <!-- Row 6 (offset) -->
      <path d="M2,215 L20,205 L38,215 L38,235 L20,245 L2,235 Z" stroke-width="0.8" opacity="0.18"/>
      <path d="M38,215 L56,205 L74,215 L74,235 L56,245 L38,235 Z" stroke-width="1.2" opacity="0.25"/>
      <path d="M74,215 L92,205 L110,215 L110,235 L92,245 L74,235 Z" stroke-width="0.8" opacity="0.14"/>
      <!-- Row 7 -->
      <path d="M20,255 L38,245 L56,255 L56,275 L38,285 L20,275 Z" stroke-width="1" opacity="0.22"/>
      <path d="M56,255 L74,245 L92,255 L92,275 L74,285 L56,275 Z" stroke-width="1.2" opacity="0.28"/>
      <circle cx="74" cy="265" r="2.5" fill="currentColor" opacity="0.2"/>
      <!-- Row 8 (offset) -->
      <path d="M2,295 L20,285 L38,295 L38,315 L20,325 L2,315 Z" stroke-width="1.2" opacity="0.25"/>
      <path d="M38,295 L56,285 L74,295 L74,315 L56,325 L38,315 Z" stroke-width="1" opacity="0.2"/>
      <!-- Row 9 -->
      <path d="M20,335 L38,325 L56,335 L56,355 L38,365 L20,355 Z" stroke-width="1.5" opacity="0.3"/>
      <circle cx="38" cy="345" r="2.5" fill="currentColor" opacity="0.2"/>
      <path d="M56,335 L74,325 L92,335 L92,355 L74,365 L56,355 Z" stroke-width="0.8" opacity="0.15"/>
      <!-- Row 10 (offset) -->
      <path d="M2,375 L20,365 L38,375 L38,395 L20,405 L2,395 Z" stroke-width="1" opacity="0.2"/>
      <path d="M38,375 L56,365 L74,375 L74,395 L56,405 L38,395 Z" stroke-width="1.2" opacity="0.25"/>
    </svg>`,
  },

  // ── Signal Wave ────────────────────────────────────────────────────────────
  {
    id: 'signal-wave',
    name: 'Signal Wave',
    category: 'cyber',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" fill="none" stroke="currentColor" stroke-linecap="round">
      <!-- EKG / signal trace -->
      <path d="M0,30 L20,30 L25,10 L30,50 L35,20 L40,40 L45,30 L80,30" stroke-width="2" opacity="0.35"/>
      <path d="M80,30 L140,30" stroke-width="1" opacity="0.15"/>
      <!-- Second pulse -->
      <path d="M0,100 L15,100 L20,80 L25,120 L30,85 L35,110 L40,100 L60,100" stroke-width="1.8" opacity="0.3"/>
      <path d="M60,100 L120,100" stroke-width="0.8" opacity="0.12"/>
      <!-- Frequency spectrum bars -->
      <rect x="10" y="145" width="3" height="30" fill="currentColor" opacity="0.28" rx="1"/>
      <rect x="16" y="155" width="3" height="20" fill="currentColor" opacity="0.22" rx="1"/>
      <rect x="22" y="140" width="3" height="35" fill="currentColor" opacity="0.32" rx="1"/>
      <rect x="28" y="150" width="3" height="25" fill="currentColor" opacity="0.25" rx="1"/>
      <rect x="34" y="138" width="3" height="37" fill="currentColor" opacity="0.3" rx="1"/>
      <rect x="40" y="152" width="3" height="23" fill="currentColor" opacity="0.2" rx="1"/>
      <rect x="46" y="148" width="3" height="27" fill="currentColor" opacity="0.26" rx="1"/>
      <rect x="52" y="158" width="3" height="17" fill="currentColor" opacity="0.18" rx="1"/>
      <rect x="58" y="142" width="3" height="33" fill="currentColor" opacity="0.28" rx="1"/>
      <rect x="64" y="155" width="3" height="20" fill="currentColor" opacity="0.2" rx="1"/>
      <!-- Sine interference -->
      <path d="M0,210 Q30,195 60,210 Q90,225 120,210" stroke-width="1.5" opacity="0.2"/>
      <path d="M0,218 Q30,203 60,218 Q90,233 120,218" stroke-width="0.8" opacity="0.12"/>
      <!-- Third pulse -->
      <path d="M0,270 L18,270 L23,248 L28,292 L33,258 L38,282 L43,270 L70,270" stroke-width="2" opacity="0.32"/>
      <path d="M70,270 L130,270" stroke-width="1" opacity="0.12"/>
      <!-- Second spectrum cluster -->
      <rect x="12" y="310" width="3" height="25" fill="currentColor" opacity="0.25" rx="1"/>
      <rect x="18" y="318" width="3" height="17" fill="currentColor" opacity="0.2" rx="1"/>
      <rect x="24" y="305" width="3" height="30" fill="currentColor" opacity="0.3" rx="1"/>
      <rect x="30" y="315" width="3" height="20" fill="currentColor" opacity="0.22" rx="1"/>
      <rect x="36" y="308" width="3" height="27" fill="currentColor" opacity="0.28" rx="1"/>
      <rect x="42" y="320" width="3" height="15" fill="currentColor" opacity="0.18" rx="1"/>
      <rect x="48" y="312" width="3" height="23" fill="currentColor" opacity="0.24" rx="1"/>
      <!-- Fourth pulse -->
      <path d="M0,370 L16,370 L21,352 L26,388 L31,360 L36,380 L41,370 L65,370" stroke-width="1.8" opacity="0.28"/>
      <path d="M65,370 L120,370" stroke-width="0.8" opacity="0.1"/>
      <!-- Flatline baseline -->
      <line x1="0" y1="30" x2="0" y2="400" stroke-width="0.5" opacity="0.06" stroke-dasharray="2 6"/>
    </svg>`,
  },

  // ── Wireframe ──────────────────────────────────────────────────────────────
  {
    id: 'wireframe',
    name: 'Wireframe',
    category: 'cyber',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" fill="none" stroke="currentColor" stroke-linecap="round">
      <!-- 3D cube wireframe -->
      <path d="M30,30 L70,30 L85,15 L45,15 Z" stroke-width="1.2" opacity="0.25"/>
      <path d="M30,30 L30,70 L70,70 L70,30" stroke-width="1.2" opacity="0.3"/>
      <path d="M70,30 L85,15 L85,55 L70,70" stroke-width="1" opacity="0.2"/>
      <line x1="30" y1="30" x2="45" y2="15" stroke-width="0.8" opacity="0.15"/>
      <line x1="30" y1="70" x2="45" y2="55" stroke-width="0.6" opacity="0.1" stroke-dasharray="3 2"/>
      <line x1="45" y1="15" x2="45" y2="55" stroke-width="0.6" opacity="0.1" stroke-dasharray="3 2"/>
      <!-- Floating triangular prism -->
      <path d="M20,120 L60,100 L80,130 Z" stroke-width="1.2" opacity="0.28"/>
      <line x1="20" y1="120" x2="20" y2="160" stroke-width="1" opacity="0.2"/>
      <line x1="60" y1="100" x2="60" y2="140" stroke-width="1" opacity="0.2"/>
      <line x1="80" y1="130" x2="80" y2="170" stroke-width="1" opacity="0.2"/>
      <path d="M20,160 L60,140 L80,170 Z" stroke-width="0.8" opacity="0.15"/>
      <!-- Sphere wireframe -->
      <circle cx="50" cy="240" r="35" stroke-width="1" opacity="0.22"/>
      <ellipse cx="50" cy="240" rx="35" ry="14" stroke-width="0.8" opacity="0.15"/>
      <ellipse cx="50" cy="240" rx="35" ry="28" stroke-width="0.6" opacity="0.1" transform="rotate(90 50 240)"/>
      <ellipse cx="50" cy="240" rx="24" ry="10" stroke-width="0.5" opacity="0.1"/>
      <!-- Vertices -->
      <circle cx="50" cy="205" r="2" fill="currentColor" opacity="0.2"/>
      <circle cx="50" cy="275" r="2" fill="currentColor" opacity="0.2"/>
      <circle cx="15" cy="240" r="1.5" fill="currentColor" opacity="0.15"/>
      <circle cx="85" cy="240" r="1.5" fill="currentColor" opacity="0.15"/>
      <!-- Pyramid -->
      <path d="M40,330 L70,330 L80,350 L30,350 Z" stroke-width="0.8" opacity="0.18"/>
      <line x1="55" y1="300" x2="40" y2="330" stroke-width="1.2" opacity="0.25"/>
      <line x1="55" y1="300" x2="70" y2="330" stroke-width="1.2" opacity="0.25"/>
      <line x1="55" y1="300" x2="80" y2="350" stroke-width="0.8" opacity="0.15"/>
      <line x1="55" y1="300" x2="30" y2="350" stroke-width="0.8" opacity="0.18"/>
      <circle cx="55" cy="300" r="2" fill="currentColor" opacity="0.2"/>
      <!-- Edge normals -->
      <line x1="85" y1="40" x2="100" y2="32" stroke-width="0.5" opacity="0.1"/>
      <line x1="80" y1="130" x2="95" y2="135" stroke-width="0.5" opacity="0.1"/>
    </svg>`,
  },

  // ── Datascope ──────────────────────────────────────────────────────────────
  {
    id: 'datascope',
    name: 'Datascope',
    category: 'cyber',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" fill="none" stroke="currentColor" stroke-linecap="square">
      <!-- Corner brackets (HUD frame) -->
      <path d="M4,4 L30,4 M4,4 L4,30" stroke-width="2" opacity="0.25"/>
      <path d="M4,396 L30,396 M4,396 L4,370" stroke-width="2" opacity="0.25"/>
      <!-- Targeting reticle -->
      <circle cx="55" cy="70" r="28" stroke-width="1" opacity="0.22"/>
      <circle cx="55" cy="70" r="16" stroke-width="1.2" opacity="0.28"/>
      <line x1="55" y1="38" x2="55" y2="52" stroke-width="1" opacity="0.25"/>
      <line x1="55" y1="88" x2="55" y2="102" stroke-width="1" opacity="0.25"/>
      <line x1="23" y1="70" x2="37" y2="70" stroke-width="1" opacity="0.25"/>
      <line x1="73" y1="70" x2="87" y2="70" stroke-width="1" opacity="0.25"/>
      <circle cx="55" cy="70" r="2.5" fill="currentColor" opacity="0.3"/>
      <!-- Range ticks -->
      <line x1="10" y1="130" x2="25" y2="130" stroke-width="1.2" opacity="0.22"/>
      <line x1="10" y1="145" x2="35" y2="145" stroke-width="1.5" opacity="0.28"/>
      <line x1="10" y1="160" x2="25" y2="160" stroke-width="1.2" opacity="0.22"/>
      <line x1="10" y1="175" x2="30" y2="175" stroke-width="1" opacity="0.18"/>
      <!-- Data readout bars -->
      <rect x="10" y="200" width="55" height="4" fill="currentColor" opacity="0.3"/>
      <rect x="10" y="210" width="35" height="4" fill="currentColor" opacity="0.22"/>
      <rect x="10" y="220" width="70" height="4" fill="currentColor" opacity="0.28"/>
      <rect x="10" y="230" width="25" height="4" fill="currentColor" opacity="0.18"/>
      <rect x="10" y="240" width="50" height="4" fill="currentColor" opacity="0.25"/>
      <!-- Compass / bearing indicator -->
      <circle cx="45" cy="310" r="30" stroke-width="0.8" opacity="0.18"/>
      <line x1="45" y1="276" x2="45" y2="288" stroke-width="1.2" opacity="0.25"/>
      <line x1="45" y1="332" x2="45" y2="344" stroke-width="1.2" opacity="0.25"/>
      <line x1="11" y1="310" x2="23" y2="310" stroke-width="1.2" opacity="0.25"/>
      <line x1="67" y1="310" x2="79" y2="310" stroke-width="1.2" opacity="0.25"/>
      <path d="M45,288 L49,298 L45,295 L41,298 Z" fill="currentColor" opacity="0.25"/>
      <!-- Coordinates readout -->
      <text x="8" y="375" font-size="8" font-family="monospace" fill="currentColor" stroke="none" opacity="0.18">47°22'N</text>
      <text x="8" y="387" font-size="8" font-family="monospace" fill="currentColor" stroke="none" opacity="0.15">122°08'W</text>
      <!-- Scan line -->
      <line x1="0" y1="115" x2="140" y2="115" stroke-width="0.8" opacity="0.1"/>
      <line x1="0" y1="260" x2="120" y2="260" stroke-width="0.8" opacity="0.1"/>
    </svg>`,
  },
];
