// ── Notebook background patterns ─────────────────────────────────────────────
// Each pattern is an SVG string designed for the left edge of a notebook.
// The CSS mask-image gradient handles the fade-to-center effect.
// All patterns use currentColor so they inherit from the theme's text color.

export const NOTEBOOK_BACKGROUNDS = [
  // ── Tribal ──────────────────────────────────────────────────────────────────
  {
    id: 'tribal',
    name: 'Tribal',
    category: 'tribal',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 800" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
      <!-- Main sweeping arc -->
      <path d="M-20,100 Q80,200 40,350 T80,600" stroke-width="3" opacity="0.5"/>
      <path d="M-10,120 Q90,220 50,370 T90,620" stroke-width="1.5" opacity="0.3"/>
      <!-- Hook motifs -->
      <path d="M30,80 C60,80 70,100 60,120 C50,140 30,135 30,115" stroke-width="2.5" opacity="0.45"/>
      <path d="M50,250 C80,250 90,270 80,290 C70,310 50,305 50,285" stroke-width="2.5" opacity="0.4"/>
      <path d="M20,430 C50,430 60,450 50,470 C40,490 20,485 20,465" stroke-width="2.5" opacity="0.35"/>
      <path d="M60,580 C90,580 100,600 90,620 C80,640 60,635 60,615" stroke-width="2.5" opacity="0.3"/>
      <!-- Nested circles / dots -->
      <circle cx="35" cy="170" r="12" stroke-width="2" opacity="0.4"/>
      <circle cx="35" cy="170" r="6" stroke-width="1.5" opacity="0.3"/>
      <circle cx="35" cy="170" r="2" fill="currentColor" stroke="none" opacity="0.3"/>
      <circle cx="70" cy="350" r="10" stroke-width="2" opacity="0.35"/>
      <circle cx="70" cy="350" r="4" fill="currentColor" stroke="none" opacity="0.25"/>
      <circle cx="25" cy="530" r="14" stroke-width="2" opacity="0.3"/>
      <circle cx="25" cy="530" r="7" stroke-width="1.5" opacity="0.25"/>
      <circle cx="25" cy="530" r="2.5" fill="currentColor" stroke="none" opacity="0.2"/>
      <!-- Spine line with barbs -->
      <path d="M10,0 L10,800" stroke-width="1" opacity="0.15"/>
      <path d="M10,150 L30,140 M10,200 L25,195 M10,300 L35,290 M10,400 L28,392 M10,500 L32,492 M10,650 L27,642" stroke-width="1.5" opacity="0.25"/>
      <!-- Small dots along spine -->
      <circle cx="10" cy="50" r="2" fill="currentColor" stroke="none" opacity="0.2"/>
      <circle cx="10" cy="450" r="2" fill="currentColor" stroke="none" opacity="0.2"/>
      <circle cx="10" cy="700" r="2" fill="currentColor" stroke="none" opacity="0.2"/>
      <!-- Wave band -->
      <path d="M0,730 Q30,720 20,740 T40,750 T20,770 T40,780" stroke-width="2" opacity="0.25"/>
    </svg>`,
  },

  // ── Cyber ───────────────────────────────────────────────────────────────────
  {
    id: 'cyber',
    name: 'Cyber',
    category: 'cyber',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 800" fill="none" stroke="currentColor" stroke-linecap="square">
      <!-- Vertical scan lines -->
      <line x1="5" y1="0" x2="5" y2="800" stroke-width="0.5" opacity="0.12"/>
      <line x1="20" y1="0" x2="20" y2="800" stroke-width="0.5" opacity="0.1"/>
      <line x1="60" y1="0" x2="60" y2="800" stroke-width="0.3" opacity="0.08"/>
      <line x1="120" y1="0" x2="120" y2="800" stroke-width="0.3" opacity="0.06"/>
      <!-- Horizontal scan bands -->
      <rect x="0" y="95" width="200" height="1" fill="currentColor" opacity="0.1"/>
      <rect x="0" y="250" width="150" height="1" fill="currentColor" opacity="0.08"/>
      <rect x="0" y="405" width="180" height="1" fill="currentColor" opacity="0.1"/>
      <rect x="0" y="560" width="130" height="1" fill="currentColor" opacity="0.07"/>
      <rect x="0" y="715" width="160" height="1" fill="currentColor" opacity="0.09"/>
      <!-- Circuit trace blocks -->
      <path d="M10,100 L40,100 L40,130 L70,130" stroke-width="1.5" opacity="0.3"/>
      <path d="M70,130 L70,150 L100,150" stroke-width="1" opacity="0.2"/>
      <rect x="96" y="146" width="8" height="8" stroke-width="1" opacity="0.25"/>
      <path d="M15,260 L50,260 L50,240 L80,240 L80,270" stroke-width="1.5" opacity="0.25"/>
      <circle cx="80" cy="270" r="3" fill="currentColor" stroke="none" opacity="0.2"/>
      <!-- Hex cluster -->
      <path d="M30,400 L45,392 L60,400 L60,416 L45,424 L30,416 Z" stroke-width="1" opacity="0.2"/>
      <path d="M60,400 L75,392 L90,400 L90,416 L75,424 L60,416 Z" stroke-width="1" opacity="0.15"/>
      <path d="M45,424 L60,416 L75,424 L75,440 L60,448 L45,440 Z" stroke-width="0.8" opacity="0.12"/>
      <!-- Data blocks -->
      <rect x="10" y="550" width="40" height="3" fill="currentColor" opacity="0.2"/>
      <rect x="10" y="556" width="25" height="3" fill="currentColor" opacity="0.15"/>
      <rect x="10" y="562" width="55" height="3" fill="currentColor" opacity="0.18"/>
      <rect x="10" y="568" width="15" height="3" fill="currentColor" opacity="0.12"/>
      <!-- Glitch bands -->
      <rect x="0" y="680" width="80" height="2" fill="currentColor" opacity="0.12"/>
      <rect x="20" y="684" width="50" height="1" fill="currentColor" opacity="0.08"/>
      <rect x="5" y="688" width="70" height="2" fill="currentColor" opacity="0.1"/>
      <!-- Corner bracket -->
      <path d="M0,0 L30,0 M0,0 L0,30" stroke-width="1.5" opacity="0.15"/>
      <path d="M0,800 L30,800 M0,800 L0,770" stroke-width="1.5" opacity="0.15"/>
    </svg>`,
  },

  // ── FPS ─────────────────────────────────────────────────────────────────────
  {
    id: 'fps',
    name: 'FPS',
    category: 'fps',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 800" fill="none" stroke="currentColor" stroke-linecap="square">
      <!-- Outer bracket frame -->
      <path d="M5,20 L5,5 L40,5" stroke-width="1.5" opacity="0.2"/>
      <path d="M5,780 L5,795 L40,795" stroke-width="1.5" opacity="0.2"/>
      <!-- Crosshair -->
      <circle cx="60" cy="200" r="20" stroke-width="1" opacity="0.2"/>
      <circle cx="60" cy="200" r="8" stroke-width="0.8" opacity="0.15"/>
      <line x1="60" y1="175" x2="60" y2="185" stroke-width="0.8" opacity="0.2"/>
      <line x1="60" y1="215" x2="60" y2="225" stroke-width="0.8" opacity="0.2"/>
      <line x1="35" y1="200" x2="45" y2="200" stroke-width="0.8" opacity="0.2"/>
      <line x1="75" y1="200" x2="85" y2="200" stroke-width="0.8" opacity="0.2"/>
      <circle cx="60" cy="200" r="1.5" fill="currentColor" stroke="none" opacity="0.25"/>
      <!-- Range finder brackets -->
      <path d="M10,320 L10,310 L25,310" stroke-width="1" opacity="0.2"/>
      <path d="M10,380 L10,390 L25,390" stroke-width="1" opacity="0.2"/>
      <path d="M90,320 L90,310 L75,310" stroke-width="1" opacity="0.15"/>
      <path d="M90,380 L90,390 L75,390" stroke-width="1" opacity="0.15"/>
      <!-- Distance ticks -->
      <line x1="15" y1="340" x2="25" y2="340" stroke-width="0.8" opacity="0.15"/>
      <line x1="15" y1="350" x2="30" y2="350" stroke-width="0.8" opacity="0.18"/>
      <line x1="15" y1="360" x2="25" y2="360" stroke-width="0.8" opacity="0.15"/>
      <!-- Compass rose -->
      <circle cx="40" cy="500" r="25" stroke-width="0.8" opacity="0.15"/>
      <line x1="40" y1="470" x2="40" y2="480" stroke-width="1" opacity="0.2"/>
      <line x1="40" y1="520" x2="40" y2="530" stroke-width="1" opacity="0.2"/>
      <line x1="10" y1="500" x2="20" y2="500" stroke-width="1" opacity="0.2"/>
      <line x1="60" y1="500" x2="70" y2="500" stroke-width="1" opacity="0.2"/>
      <path d="M40,480 L44,492 L40,488 L36,492 Z" fill="currentColor" stroke="none" opacity="0.2"/>
      <!-- Ammo-counter rectangles -->
      <rect x="10" y="620" width="6" height="12" stroke-width="0.8" opacity="0.2"/>
      <rect x="19" y="620" width="6" height="12" stroke-width="0.8" opacity="0.2"/>
      <rect x="28" y="620" width="6" height="12" stroke-width="0.8" opacity="0.2"/>
      <rect x="37" y="620" width="6" height="12" fill="currentColor" stroke="none" opacity="0.12"/>
      <rect x="46" y="620" width="6" height="12" fill="currentColor" stroke="none" opacity="0.12"/>
      <rect x="55" y="620" width="6" height="12" fill="currentColor" stroke="none" opacity="0.08"/>
      <!-- Grid coordinates -->
      <text x="8" y="660" font-size="7" font-family="monospace" fill="currentColor" stroke="none" opacity="0.12">032.4</text>
      <text x="8" y="670" font-size="7" font-family="monospace" fill="currentColor" stroke="none" opacity="0.1">N 47°</text>
      <!-- Horizontal rule with ticks -->
      <line x1="0" y1="740" x2="120" y2="740" stroke-width="0.5" opacity="0.1"/>
      <line x1="20" y1="736" x2="20" y2="744" stroke-width="0.5" opacity="0.12"/>
      <line x1="40" y1="738" x2="40" y2="742" stroke-width="0.5" opacity="0.1"/>
      <line x1="60" y1="736" x2="60" y2="744" stroke-width="0.5" opacity="0.12"/>
      <line x1="80" y1="738" x2="80" y2="742" stroke-width="0.5" opacity="0.1"/>
      <line x1="100" y1="736" x2="100" y2="744" stroke-width="0.5" opacity="0.12"/>
    </svg>`,
  },

  // ── Relaxing ────────────────────────────────────────────────────────────────
  {
    id: 'relaxing',
    name: 'Relaxing',
    category: 'relaxing',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 800" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
      <!-- Gentle wave bands -->
      <path d="M-10,80 Q40,60 30,100 Q20,140 60,130 Q100,120 80,160" stroke-width="1.5" opacity="0.2"/>
      <path d="M-15,90 Q35,70 25,110 Q15,150 55,140 Q95,130 75,170" stroke-width="0.8" opacity="0.12"/>
      <!-- Fern tendril 1 -->
      <path d="M15,200 Q25,250 20,300 Q15,350 30,400" stroke-width="1.5" opacity="0.22"/>
      <path d="M20,230 Q35,225 40,240" stroke-width="1" opacity="0.15"/>
      <path d="M18,270 Q33,265 38,280" stroke-width="1" opacity="0.13"/>
      <path d="M17,310 Q32,305 37,320" stroke-width="1" opacity="0.11"/>
      <path d="M20,350 Q35,345 40,360" stroke-width="0.8" opacity="0.1"/>
      <!-- Ensō circle (zen brush stroke) -->
      <path d="M50,480 A30,30 0 1,1 48,478" stroke-width="2.5" opacity="0.18" stroke-dasharray="170 20"/>
      <!-- Dot mandala -->
      <circle cx="30" cy="600" r="2" fill="currentColor" stroke="none" opacity="0.15"/>
      <circle cx="30" cy="600" r="8" stroke-width="0.8" opacity="0.1"/>
      <circle cx="30" cy="600" r="16" stroke-width="0.5" opacity="0.08"/>
      <circle cx="30" cy="600" r="24" stroke-width="0.4" opacity="0.06"/>
      <!-- Satellite dots around mandala -->
      <circle cx="18" cy="588" r="1.2" fill="currentColor" stroke="none" opacity="0.1"/>
      <circle cx="42" cy="588" r="1.2" fill="currentColor" stroke="none" opacity="0.1"/>
      <circle cx="18" cy="612" r="1.2" fill="currentColor" stroke="none" opacity="0.1"/>
      <circle cx="42" cy="612" r="1.2" fill="currentColor" stroke="none" opacity="0.1"/>
      <circle cx="8" cy="600" r="1" fill="currentColor" stroke="none" opacity="0.08"/>
      <circle cx="52" cy="600" r="1" fill="currentColor" stroke="none" opacity="0.08"/>
      <!-- Gentle wave bottom -->
      <path d="M-10,720 Q30,710 50,725 Q70,740 110,730" stroke-width="1" opacity="0.12"/>
      <path d="M-5,735 Q35,725 55,740 Q75,755 115,745" stroke-width="0.6" opacity="0.08"/>
      <!-- Leaf silhouettes -->
      <path d="M70,150 Q80,130 90,150 Q80,145 70,150" fill="currentColor" stroke="none" opacity="0.06"/>
      <path d="M55,680 Q65,660 75,680 Q65,675 55,680" fill="currentColor" stroke="none" opacity="0.05"/>
    </svg>`,
  },
];
