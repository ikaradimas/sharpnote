// ── Notebook background patterns ─────────────────────────────────────────────
// Each pattern is an SVG with a viewBox designed for vertical tiling.
// The CSS mask-image gradient handles the left-to-center fade.
// All patterns use currentColor so they inherit from the theme's text color.

export const NOTEBOOK_BACKGROUNDS = [
  // ── Tribal ──────────────────────────────────────────────────────────────────
  {
    id: 'tribal',
    name: 'Tribal',
    category: 'tribal',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
      <!-- Main sweeping arc -->
      <path d="M-20,30 Q80,100 40,180 T80,340" stroke-width="4" opacity="0.5"/>
      <path d="M-5,40 Q90,110 50,190 T90,350" stroke-width="2" opacity="0.3"/>
      <!-- Hook motifs -->
      <path d="M30,20 C70,20 85,50 70,75 C55,100 25,92 25,65" stroke-width="3.5" opacity="0.55"/>
      <path d="M55,130 C95,130 110,160 95,185 C80,210 50,202 50,175" stroke-width="3.5" opacity="0.5"/>
      <path d="M20,250 C60,250 75,280 60,305 C45,330 15,322 15,295" stroke-width="3.5" opacity="0.45"/>
      <!-- Nested circles -->
      <circle cx="40" cy="105" r="14" stroke-width="2.5" opacity="0.5"/>
      <circle cx="40" cy="105" r="7" stroke-width="2" opacity="0.4"/>
      <circle cx="40" cy="105" r="2.5" fill="currentColor" stroke="none" opacity="0.4"/>
      <circle cx="75" cy="220" r="12" stroke-width="2.5" opacity="0.45"/>
      <circle cx="75" cy="220" r="5" fill="currentColor" stroke="none" opacity="0.35"/>
      <circle cx="30" cy="340" r="16" stroke-width="2.5" opacity="0.4"/>
      <circle cx="30" cy="340" r="8" stroke-width="2" opacity="0.3"/>
      <circle cx="30" cy="340" r="3" fill="currentColor" stroke="none" opacity="0.3"/>
      <!-- Spine with barbs -->
      <path d="M8,0 L8,400" stroke-width="1.5" opacity="0.2"/>
      <path d="M8,50 L30,42 M8,90 L25,84 M8,160 L35,150 M8,210 L28,202 M8,280 L32,272 M8,350 L27,342" stroke-width="2" opacity="0.35"/>
      <!-- Dots along spine -->
      <circle cx="8" cy="10" r="2.5" fill="currentColor" stroke="none" opacity="0.3"/>
      <circle cx="8" cy="120" r="2" fill="currentColor" stroke="none" opacity="0.25"/>
      <circle cx="8" cy="200" r="2.5" fill="currentColor" stroke="none" opacity="0.3"/>
      <circle cx="8" cy="310" r="2" fill="currentColor" stroke="none" opacity="0.25"/>
      <!-- Wave band -->
      <path d="M0,370 Q35,360 25,380 T50,390" stroke-width="2.5" opacity="0.35"/>
      <!-- Parallel arcs -->
      <path d="M100,0 Q130,60 110,120" stroke-width="1.5" opacity="0.2"/>
      <path d="M120,150 Q150,210 130,270" stroke-width="1.5" opacity="0.18"/>
      <path d="M90,280 Q120,340 100,400" stroke-width="1.5" opacity="0.15"/>
    </svg>`,
  },

  // ── Cyber ───────────────────────────────────────────────────────────────────
  {
    id: 'cyber',
    name: 'Cyber',
    category: 'cyber',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" fill="none" stroke="currentColor" stroke-linecap="square">
      <!-- Vertical scan lines -->
      <line x1="4" y1="0" x2="4" y2="400" stroke-width="0.8" opacity="0.15"/>
      <line x1="18" y1="0" x2="18" y2="400" stroke-width="0.5" opacity="0.12"/>
      <line x1="50" y1="0" x2="50" y2="400" stroke-width="0.4" opacity="0.1"/>
      <line x1="100" y1="0" x2="100" y2="400" stroke-width="0.3" opacity="0.08"/>
      <!-- Horizontal scan bands -->
      <rect x="0" y="48" width="180" height="1.5" fill="currentColor" opacity="0.15"/>
      <rect x="0" y="148" width="140" height="1.5" fill="currentColor" opacity="0.12"/>
      <rect x="0" y="248" width="160" height="1.5" fill="currentColor" opacity="0.13"/>
      <rect x="0" y="348" width="120" height="1.5" fill="currentColor" opacity="0.1"/>
      <!-- Circuit trace blocks -->
      <path d="M10,55 L45,55 L45,80 L80,80" stroke-width="2" opacity="0.4"/>
      <path d="M80,80 L80,100 L110,100" stroke-width="1.5" opacity="0.3"/>
      <rect x="106" y="96" width="10" height="10" stroke-width="1.5" opacity="0.35"/>
      <circle cx="111" cy="101" r="2" fill="currentColor" stroke="none" opacity="0.3"/>
      <path d="M15,155 L55,155 L55,140 L90,140 L90,170" stroke-width="2" opacity="0.35"/>
      <circle cx="90" cy="170" r="4" fill="currentColor" stroke="none" opacity="0.3"/>
      <!-- Hex clusters -->
      <path d="M30,220 L48,210 L66,220 L66,240 L48,250 L30,240 Z" stroke-width="1.5" opacity="0.3"/>
      <path d="M66,220 L84,210 L102,220 L102,240 L84,250 L66,240 Z" stroke-width="1.2" opacity="0.22"/>
      <path d="M48,250 L66,240 L84,250 L84,270 L66,280 L48,270 Z" stroke-width="1" opacity="0.18"/>
      <!-- Data blocks -->
      <rect x="10" y="295" width="50" height="4" fill="currentColor" opacity="0.3"/>
      <rect x="10" y="303" width="30" height="4" fill="currentColor" opacity="0.22"/>
      <rect x="10" y="311" width="65" height="4" fill="currentColor" opacity="0.28"/>
      <rect x="10" y="319" width="20" height="4" fill="currentColor" opacity="0.18"/>
      <rect x="10" y="327" width="45" height="4" fill="currentColor" opacity="0.25"/>
      <!-- Glitch bands -->
      <rect x="0" y="360" width="90" height="3" fill="currentColor" opacity="0.18"/>
      <rect x="25" y="366" width="55" height="2" fill="currentColor" opacity="0.12"/>
      <rect x="5" y="371" width="80" height="3" fill="currentColor" opacity="0.15"/>
      <!-- Corner brackets -->
      <path d="M0,0 L30,0 M0,0 L0,30" stroke-width="2" opacity="0.2"/>
      <path d="M0,400 L30,400 M0,400 L0,370" stroke-width="2" opacity="0.2"/>
      <!-- Dots -->
      <circle cx="130" cy="60" r="2" fill="currentColor" stroke="none" opacity="0.15"/>
      <circle cx="140" cy="170" r="1.5" fill="currentColor" stroke="none" opacity="0.12"/>
      <circle cx="120" cy="300" r="2" fill="currentColor" stroke="none" opacity="0.15"/>
    </svg>`,
  },

  // ── FPS ─────────────────────────────────────────────────────────────────────
  {
    id: 'fps',
    name: 'FPS',
    category: 'fps',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" fill="none" stroke="currentColor" stroke-linecap="square">
      <!-- Outer bracket frame -->
      <path d="M5,12 L5,4 L40,4" stroke-width="2" opacity="0.25"/>
      <path d="M5,388 L5,396 L40,396" stroke-width="2" opacity="0.25"/>
      <!-- Crosshair -->
      <circle cx="65" cy="100" r="24" stroke-width="1.5" opacity="0.3"/>
      <circle cx="65" cy="100" r="10" stroke-width="1" opacity="0.22"/>
      <line x1="65" y1="70" x2="65" y2="82" stroke-width="1" opacity="0.3"/>
      <line x1="65" y1="118" x2="65" y2="130" stroke-width="1" opacity="0.3"/>
      <line x1="35" y1="100" x2="47" y2="100" stroke-width="1" opacity="0.3"/>
      <line x1="83" y1="100" x2="95" y2="100" stroke-width="1" opacity="0.3"/>
      <circle cx="65" cy="100" r="2" fill="currentColor" stroke="none" opacity="0.35"/>
      <!-- Range finder brackets -->
      <path d="M10,170 L10,158 L28,158" stroke-width="1.5" opacity="0.28"/>
      <path d="M10,240 L10,252 L28,252" stroke-width="1.5" opacity="0.28"/>
      <path d="M100,170 L100,158 L82,158" stroke-width="1.5" opacity="0.22"/>
      <path d="M100,240 L100,252 L82,252" stroke-width="1.5" opacity="0.22"/>
      <!-- Distance ticks -->
      <line x1="15" y1="185" x2="28" y2="185" stroke-width="1" opacity="0.22"/>
      <line x1="15" y1="197" x2="35" y2="197" stroke-width="1.2" opacity="0.25"/>
      <line x1="15" y1="209" x2="28" y2="209" stroke-width="1" opacity="0.22"/>
      <line x1="15" y1="221" x2="32" y2="221" stroke-width="1" opacity="0.2"/>
      <!-- Compass rose -->
      <circle cx="45" cy="300" r="28" stroke-width="1" opacity="0.2"/>
      <line x1="45" y1="266" x2="45" y2="278" stroke-width="1.2" opacity="0.28"/>
      <line x1="45" y1="322" x2="45" y2="334" stroke-width="1.2" opacity="0.28"/>
      <line x1="11" y1="300" x2="23" y2="300" stroke-width="1.2" opacity="0.28"/>
      <line x1="67" y1="300" x2="79" y2="300" stroke-width="1.2" opacity="0.28"/>
      <path d="M45,278 L50,292 L45,287 L40,292 Z" fill="currentColor" stroke="none" opacity="0.3"/>
      <!-- Ammo counter -->
      <rect x="10" y="355" width="8" height="14" stroke-width="1" opacity="0.28"/>
      <rect x="22" y="355" width="8" height="14" stroke-width="1" opacity="0.28"/>
      <rect x="34" y="355" width="8" height="14" stroke-width="1" opacity="0.28"/>
      <rect x="46" y="355" width="8" height="14" fill="currentColor" stroke="none" opacity="0.18"/>
      <rect x="58" y="355" width="8" height="14" fill="currentColor" stroke="none" opacity="0.15"/>
      <rect x="70" y="355" width="8" height="14" fill="currentColor" stroke="none" opacity="0.1"/>
      <!-- Grid coordinates -->
      <text x="8" y="384" font-size="8" font-family="monospace" fill="currentColor" stroke="none" opacity="0.18">032.4</text>
      <text x="8" y="394" font-size="8" font-family="monospace" fill="currentColor" stroke="none" opacity="0.15">N 47°</text>
      <!-- Horizontal rule with ticks -->
      <line x1="0" y1="145" x2="130" y2="145" stroke-width="0.6" opacity="0.15"/>
      <line x1="20" y1="141" x2="20" y2="149" stroke-width="0.6" opacity="0.18"/>
      <line x1="50" y1="143" x2="50" y2="147" stroke-width="0.6" opacity="0.14"/>
      <line x1="80" y1="141" x2="80" y2="149" stroke-width="0.6" opacity="0.18"/>
      <line x1="110" y1="143" x2="110" y2="147" stroke-width="0.6" opacity="0.14"/>
    </svg>`,
  },

  // ── Relaxing ────────────────────────────────────────────────────────────────
  {
    id: 'relaxing',
    name: 'Relaxing',
    category: 'relaxing',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
      <!-- Gentle wave bands -->
      <path d="M-10,30 Q45,10 35,50 Q25,90 70,80 Q110,70 90,110" stroke-width="2" opacity="0.28"/>
      <path d="M-15,42 Q40,22 30,62 Q20,102 65,92 Q105,82 85,122" stroke-width="1" opacity="0.16"/>
      <!-- Fern tendril -->
      <path d="M15,130 Q28,180 22,230 Q16,280 35,340" stroke-width="2" opacity="0.3"/>
      <path d="M20,155 Q40,148 46,168" stroke-width="1.2" opacity="0.22"/>
      <path d="M18,195 Q38,188 44,208" stroke-width="1.2" opacity="0.2"/>
      <path d="M17,235 Q37,228 43,248" stroke-width="1.2" opacity="0.18"/>
      <path d="M20,275 Q40,268 46,288" stroke-width="1" opacity="0.15"/>
      <path d="M25,310 Q45,303 50,323" stroke-width="1" opacity="0.13"/>
      <!-- Ensō circle -->
      <path d="M60,80 A35,35 0 1,1 58,78" stroke-width="3.5" opacity="0.25" stroke-dasharray="200 25"/>
      <!-- Dot mandala -->
      <circle cx="35" cy="370" r="2.5" fill="currentColor" stroke="none" opacity="0.22"/>
      <circle cx="35" cy="370" r="10" stroke-width="1" opacity="0.15"/>
      <circle cx="35" cy="370" r="20" stroke-width="0.8" opacity="0.12"/>
      <circle cx="35" cy="370" r="30" stroke-width="0.5" opacity="0.08"/>
      <!-- Satellite dots -->
      <circle cx="20" cy="355" r="1.8" fill="currentColor" stroke="none" opacity="0.15"/>
      <circle cx="50" cy="355" r="1.8" fill="currentColor" stroke="none" opacity="0.15"/>
      <circle cx="20" cy="385" r="1.8" fill="currentColor" stroke="none" opacity="0.15"/>
      <circle cx="50" cy="385" r="1.8" fill="currentColor" stroke="none" opacity="0.15"/>
      <circle cx="7" cy="370" r="1.2" fill="currentColor" stroke="none" opacity="0.1"/>
      <circle cx="63" cy="370" r="1.2" fill="currentColor" stroke="none" opacity="0.1"/>
      <!-- Leaves -->
      <path d="M80,160 Q95,135 110,160 Q95,152 80,160" fill="currentColor" stroke="none" opacity="0.1"/>
      <path d="M65,320 Q80,295 95,320 Q80,312 65,320" fill="currentColor" stroke="none" opacity="0.08"/>
    </svg>`,
  },

  // ── Glitch ──────────────────────────────────────────────────────────────────
  {
    id: 'glitch',
    name: 'Glitch',
    category: 'abstract',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" fill="none" stroke="currentColor">
      <!-- Displaced horizontal bars -->
      <rect x="0" y="15" width="120" height="6" fill="currentColor" opacity="0.2"/>
      <rect x="20" y="15" width="80" height="6" fill="currentColor" opacity="0.12" transform="translate(5,2)"/>
      <rect x="0" y="55" width="60" height="3" fill="currentColor" opacity="0.18"/>
      <rect x="10" y="80" width="150" height="2" fill="currentColor" opacity="0.12"/>
      <rect x="0" y="82" width="90" height="2" fill="currentColor" opacity="0.15" transform="translate(8,0)"/>
      <!-- Scan line cluster -->
      <rect x="0" y="120" width="200" height="1" fill="currentColor" opacity="0.1"/>
      <rect x="0" y="123" width="200" height="1" fill="currentColor" opacity="0.08"/>
      <rect x="0" y="126" width="200" height="1" fill="currentColor" opacity="0.06"/>
      <!-- Broken rectangles -->
      <rect x="15" y="155" width="40" height="25" stroke-width="1.5" opacity="0.25"/>
      <rect x="19" y="159" width="40" height="25" stroke-width="1" opacity="0.12"/>
      <rect x="70" y="145" width="30" height="15" stroke-width="1" opacity="0.18"/>
      <!-- Noise dots -->
      <circle cx="10" cy="210" r="1.5" fill="currentColor" opacity="0.2"/>
      <circle cx="30" cy="215" r="1" fill="currentColor" opacity="0.15"/>
      <circle cx="55" cy="208" r="2" fill="currentColor" opacity="0.18"/>
      <circle cx="80" cy="218" r="1.2" fill="currentColor" opacity="0.12"/>
      <circle cx="20" cy="225" r="1.8" fill="currentColor" opacity="0.16"/>
      <circle cx="45" cy="222" r="1" fill="currentColor" opacity="0.14"/>
      <!-- Displaced bars continued -->
      <rect x="0" y="260" width="100" height="5" fill="currentColor" opacity="0.18"/>
      <rect x="5" y="262" width="70" height="5" fill="currentColor" opacity="0.1" transform="translate(3,0)"/>
      <rect x="0" y="290" width="140" height="3" fill="currentColor" opacity="0.15"/>
      <rect x="15" y="310" width="55" height="2" fill="currentColor" opacity="0.12"/>
      <rect x="0" y="330" width="85" height="4" fill="currentColor" opacity="0.16"/>
      <rect x="8" y="332" width="60" height="4" fill="currentColor" opacity="0.08" transform="translate(4,0)"/>
      <!-- Bottom cluster -->
      <rect x="20" y="360" width="35" height="20" stroke-width="1.2" opacity="0.2"/>
      <rect x="24" y="364" width="35" height="20" stroke-width="0.8" opacity="0.1"/>
      <rect x="0" y="390" width="110" height="2" fill="currentColor" opacity="0.12"/>
    </svg>`,
  },

  // ── Topology ────────────────────────────────────────────────────────────────
  {
    id: 'topology',
    name: 'Topology',
    category: 'abstract',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" fill="none" stroke="currentColor" stroke-linecap="round">
      <!-- Contour lines -->
      <path d="M-10,40 Q60,20 80,60 Q100,100 60,120 Q20,140 40,180" stroke-width="1.2" opacity="0.22"/>
      <path d="M-10,50 Q50,30 70,70 Q90,110 50,130 Q10,150 30,190" stroke-width="1.2" opacity="0.18"/>
      <path d="M-10,60 Q40,40 60,80 Q80,120 40,140 Q0,160 20,200" stroke-width="1" opacity="0.14"/>
      <!-- Node cluster -->
      <circle cx="50" cy="75" r="4" fill="currentColor" opacity="0.2"/>
      <circle cx="80" cy="90" r="3" fill="currentColor" opacity="0.15"/>
      <circle cx="35" cy="110" r="3.5" fill="currentColor" opacity="0.18"/>
      <line x1="50" y1="75" x2="80" y2="90" stroke-width="0.8" opacity="0.15"/>
      <line x1="50" y1="75" x2="35" y2="110" stroke-width="0.8" opacity="0.15"/>
      <line x1="80" y1="90" x2="35" y2="110" stroke-width="0.6" opacity="0.1"/>
      <!-- More contours -->
      <path d="M-5,220 Q70,200 100,240 Q130,280 80,300 Q30,320 50,360" stroke-width="1.2" opacity="0.2"/>
      <path d="M-5,232 Q60,212 90,252 Q120,292 70,312 Q20,332 40,372" stroke-width="1" opacity="0.16"/>
      <path d="M-5,244 Q50,224 80,264 Q110,304 60,324 Q10,344 30,384" stroke-width="0.8" opacity="0.12"/>
      <!-- Node cluster 2 -->
      <circle cx="70" cy="260" r="5" fill="currentColor" opacity="0.18"/>
      <circle cx="40" cy="280" r="3" fill="currentColor" opacity="0.14"/>
      <circle cx="95" cy="275" r="3.5" fill="currentColor" opacity="0.12"/>
      <line x1="70" y1="260" x2="40" y2="280" stroke-width="0.8" opacity="0.12"/>
      <line x1="70" y1="260" x2="95" y2="275" stroke-width="0.8" opacity="0.12"/>
      <!-- Scattered dots -->
      <circle cx="120" cy="50" r="1.5" fill="currentColor" opacity="0.1"/>
      <circle cx="110" cy="160" r="1.5" fill="currentColor" opacity="0.08"/>
      <circle cx="130" cy="340" r="1.5" fill="currentColor" opacity="0.1"/>
      <circle cx="15" cy="180" r="2" fill="currentColor" opacity="0.12"/>
      <circle cx="25" cy="350" r="2" fill="currentColor" opacity="0.1"/>
    </svg>`,
  },

  // ── Waveform ────────────────────────────────────────────────────────────────
  {
    id: 'waveform',
    name: 'Waveform',
    category: 'abstract',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" fill="none" stroke="currentColor" stroke-linecap="round">
      <!-- Audio waveform bars -->
      <rect x="8" y="18" width="3" height="12" fill="currentColor" opacity="0.2" rx="1"/>
      <rect x="14" y="12" width="3" height="24" fill="currentColor" opacity="0.25" rx="1"/>
      <rect x="20" y="8" width="3" height="32" fill="currentColor" opacity="0.3" rx="1"/>
      <rect x="26" y="14" width="3" height="20" fill="currentColor" opacity="0.22" rx="1"/>
      <rect x="32" y="6" width="3" height="36" fill="currentColor" opacity="0.28" rx="1"/>
      <rect x="38" y="16" width="3" height="16" fill="currentColor" opacity="0.2" rx="1"/>
      <rect x="44" y="10" width="3" height="28" fill="currentColor" opacity="0.26" rx="1"/>
      <rect x="50" y="18" width="3" height="12" fill="currentColor" opacity="0.18" rx="1"/>
      <rect x="56" y="4" width="3" height="40" fill="currentColor" opacity="0.3" rx="1"/>
      <rect x="62" y="14" width="3" height="20" fill="currentColor" opacity="0.2" rx="1"/>
      <rect x="68" y="10" width="3" height="28" fill="currentColor" opacity="0.24" rx="1"/>
      <rect x="74" y="18" width="3" height="12" fill="currentColor" opacity="0.16" rx="1"/>
      <!-- Sine wave -->
      <path d="M0,80 Q30,60 60,80 Q90,100 120,80 Q150,60 180,80" stroke-width="1.5" opacity="0.22"/>
      <path d="M0,90 Q30,70 60,90 Q90,110 120,90 Q150,70 180,90" stroke-width="1" opacity="0.14"/>
      <!-- Second waveform cluster -->
      <rect x="10" y="130" width="3" height="20" fill="currentColor" opacity="0.22" rx="1"/>
      <rect x="16" y="124" width="3" height="32" fill="currentColor" opacity="0.28" rx="1"/>
      <rect x="22" y="118" width="3" height="44" fill="currentColor" opacity="0.32" rx="1"/>
      <rect x="28" y="126" width="3" height="28" fill="currentColor" opacity="0.24" rx="1"/>
      <rect x="34" y="120" width="3" height="40" fill="currentColor" opacity="0.3" rx="1"/>
      <rect x="40" y="130" width="3" height="20" fill="currentColor" opacity="0.2" rx="1"/>
      <rect x="46" y="122" width="3" height="36" fill="currentColor" opacity="0.26" rx="1"/>
      <rect x="52" y="132" width="3" height="16" fill="currentColor" opacity="0.18" rx="1"/>
      <!-- Frequency spectrum lines -->
      <path d="M0,200 Q40,185 80,200 Q120,215 160,200" stroke-width="1.2" opacity="0.2"/>
      <path d="M0,210 Q40,195 80,210 Q120,225 160,210" stroke-width="0.8" opacity="0.14"/>
      <!-- Third cluster -->
      <rect x="8" y="245" width="3" height="16" fill="currentColor" opacity="0.2" rx="1"/>
      <rect x="14" y="237" width="3" height="32" fill="currentColor" opacity="0.28" rx="1"/>
      <rect x="20" y="241" width="3" height="24" fill="currentColor" opacity="0.24" rx="1"/>
      <rect x="26" y="233" width="3" height="40" fill="currentColor" opacity="0.3" rx="1"/>
      <rect x="32" y="243" width="3" height="20" fill="currentColor" opacity="0.2" rx="1"/>
      <rect x="38" y="235" width="3" height="36" fill="currentColor" opacity="0.26" rx="1"/>
      <rect x="44" y="247" width="3" height="12" fill="currentColor" opacity="0.16" rx="1"/>
      <rect x="50" y="239" width="3" height="28" fill="currentColor" opacity="0.22" rx="1"/>
      <!-- Waves -->
      <path d="M0,310 Q35,295 70,310 Q105,325 140,310" stroke-width="1.5" opacity="0.2"/>
      <path d="M0,320 Q35,305 70,320 Q105,335 140,320" stroke-width="1" opacity="0.12"/>
      <!-- Fourth cluster -->
      <rect x="12" y="350" width="3" height="28" fill="currentColor" opacity="0.24" rx="1"/>
      <rect x="18" y="344" width="3" height="40" fill="currentColor" opacity="0.3" rx="1"/>
      <rect x="24" y="352" width="3" height="24" fill="currentColor" opacity="0.22" rx="1"/>
      <rect x="30" y="346" width="3" height="36" fill="currentColor" opacity="0.28" rx="1"/>
      <rect x="36" y="354" width="3" height="20" fill="currentColor" opacity="0.2" rx="1"/>
      <rect x="42" y="340" width="3" height="48" fill="currentColor" opacity="0.32" rx="1"/>
      <rect x="48" y="350" width="3" height="28" fill="currentColor" opacity="0.24" rx="1"/>
    </svg>`,
  },

  // ── Blueprint ───────────────────────────────────────────────────────────────
  {
    id: 'blueprint',
    name: 'Blueprint',
    category: 'abstract',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" fill="none" stroke="currentColor" stroke-linecap="round">
      <!-- Grid -->
      <line x1="0" y1="0" x2="0" y2="400" stroke-width="0.5" opacity="0.08"/>
      <line x1="40" y1="0" x2="40" y2="400" stroke-width="0.3" opacity="0.06"/>
      <line x1="80" y1="0" x2="80" y2="400" stroke-width="0.3" opacity="0.06"/>
      <line x1="120" y1="0" x2="120" y2="400" stroke-width="0.3" opacity="0.05"/>
      <line x1="0" y1="40" x2="200" y2="40" stroke-width="0.3" opacity="0.06"/>
      <line x1="0" y1="80" x2="160" y2="80" stroke-width="0.3" opacity="0.05"/>
      <line x1="0" y1="200" x2="180" y2="200" stroke-width="0.3" opacity="0.06"/>
      <line x1="0" y1="320" x2="150" y2="320" stroke-width="0.3" opacity="0.05"/>
      <!-- Floor plan shape -->
      <rect x="15" y="50" width="80" height="60" stroke-width="1.5" opacity="0.25"/>
      <line x1="55" y1="50" x2="55" y2="110" stroke-width="1" opacity="0.18"/>
      <line x1="15" y1="80" x2="55" y2="80" stroke-width="1" opacity="0.15"/>
      <!-- Door arc -->
      <path d="M55,110 A15,15 0 0,1 70,110" stroke-width="1" opacity="0.18"/>
      <!-- Dimension lines -->
      <line x1="15" y1="125" x2="95" y2="125" stroke-width="0.8" opacity="0.18"/>
      <line x1="15" y1="122" x2="15" y2="128" stroke-width="0.8" opacity="0.18"/>
      <line x1="95" y1="122" x2="95" y2="128" stroke-width="0.8" opacity="0.18"/>
      <text x="48" y="135" font-size="7" font-family="monospace" fill="currentColor" stroke="none" opacity="0.15" text-anchor="middle">80</text>
      <!-- Second shape -->
      <path d="M20,210 L70,210 L70,260 L50,280 L20,280 Z" stroke-width="1.5" opacity="0.22"/>
      <line x1="20" y1="245" x2="70" y2="245" stroke-width="0.8" stroke-dasharray="3 2" opacity="0.12"/>
      <!-- Cross marks -->
      <line x1="43" y1="225" x2="47" y2="225" stroke-width="0.8" opacity="0.15"/>
      <line x1="45" y1="223" x2="45" y2="227" stroke-width="0.8" opacity="0.15"/>
      <!-- Circle with center mark -->
      <circle cx="50" cy="350" r="25" stroke-width="1.2" opacity="0.2"/>
      <line x1="50" y1="342" x2="50" y2="358" stroke-width="0.8" opacity="0.15"/>
      <line x1="42" y1="350" x2="58" y2="350" stroke-width="0.8" opacity="0.15"/>
      <!-- Radius dimension -->
      <line x1="50" y1="350" x2="75" y2="350" stroke-width="0.6" opacity="0.15"/>
      <text x="62" y="345" font-size="6" font-family="monospace" fill="currentColor" stroke="none" opacity="0.12">r25</text>
    </svg>`,
  },
];
