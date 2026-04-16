import React, { useState, useEffect, useRef } from 'react';

const IDLE_THRESHOLD = 15_000;
const DEEP_IDLE     = 20_000;
const FLICKER_MIN   = 3_000;
const FLICKER_MAX   = 8_000;
const SHOW_DURATION = 2_500;
const SYMBOL_LIFE   = 4000;      // base lifetime in ms
const SYMBOL_EXTEND = 2000;      // extra life when mouse approaches
const SYMBOL_HOVER_R = 30;       // hover glow radius
const SYMBOL_NEAR_R  = 120;      // proximity that extends lifetime
const SYMBOL_SPAWN_INTERVAL = 1200; // ms between symbol drops in deep idle
const SYMBOLS = ['✦', '◈', '⟡', '⬡', '✧', '⊛', '◇', '△', '∞', '⊕', '⟐', '☍'];

function randomBetween(a, b) { return a + Math.random() * (b - a); }

function pickDarkSpot(mouseX, mouseY) {
  const W = window.innerWidth, H = window.innerHeight;
  const spots = [
    { x: randomBetween(8, 50), y: randomBetween(60, H - 60) },
    { x: randomBetween(W - 60, W - 12), y: randomBetween(60, H - 60) },
    { x: randomBetween(80, W - 80), y: randomBetween(4, 40) },
    { x: randomBetween(80, W - 80), y: randomBetween(H - 36, H - 8) },
    { x: Math.max(20, Math.min(W - 40, mouseX + randomBetween(-150, 150))),
      y: Math.max(20, Math.min(H - 40, mouseY + randomBetween(-120, 120))) },
  ];
  return spots[Math.floor(Math.random() * spots.length)];
}

export function Ghost() {
  const [visible, setVisible] = useState(false);
  const [mood, setMood] = useState('happy');
  const [pos, setPos] = useState({ x: 200, y: 200 });
  const [symbols, setSymbols] = useState([]);
  const mouseRef = useRef({ x: 300, y: 300 });
  const lastActivityRef = useRef(Date.now());
  const flickerTimerRef = useRef(null);
  const hideTimerRef = useRef(null);
  const symbolTimerRef = useRef(null);
  const moodRef = useRef('happy');
  const symbolIdRef = useRef(0);

  // Track mouse + activity
  useEffect(() => {
    const onMove = (e) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
      lastActivityRef.current = Date.now();
    };
    const onActivity = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('keydown', onActivity);
    window.addEventListener('mousedown', onActivity);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('mousedown', onActivity);
    };
  }, []);

  // Mood tracker
  useEffect(() => {
    const id = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      const next = idle > DEEP_IDLE ? 'deepIdle' : idle > IDLE_THRESHOLD ? 'idle' : 'happy';
      moodRef.current = next;
      setMood(next);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  // Ghost flickering — teleports around in all moods
  useEffect(() => {
    const scheduleFlicker = () => {
      const isDeep = moodRef.current === 'deepIdle';
      const delay = isDeep ? randomBetween(1500, 3000) : randomBetween(FLICKER_MIN, FLICKER_MAX);
      flickerTimerRef.current = setTimeout(() => {
        setPos(pickDarkSpot(mouseRef.current.x, mouseRef.current.y));
        setVisible(true);
        hideTimerRef.current = setTimeout(() => {
          setVisible(false);
          scheduleFlicker();
        }, isDeep ? randomBetween(1500, 3000) : SHOW_DURATION);
      }, delay);
    };
    scheduleFlicker();
    return () => {
      clearTimeout(flickerTimerRef.current);
      clearTimeout(hideTimerRef.current);
    };
  }, []);

  // Deep idle: drop glowing symbols at random positions
  useEffect(() => {
    if (mood !== 'deepIdle') {
      clearInterval(symbolTimerRef.current);
      return;
    }

    const drop = () => {
      const W = window.innerWidth, H = window.innerHeight;
      const sym = {
        id: symbolIdRef.current++,
        char: SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        x: randomBetween(30, W - 30),
        y: randomBetween(50, H - 60),
        born: Date.now(),
        extended: false,
      };
      setSymbols(prev => [...prev, sym]);
    };

    drop(); // first one immediately
    symbolTimerRef.current = setInterval(drop, SYMBOL_SPAWN_INTERVAL);
    return () => clearInterval(symbolTimerRef.current);
  }, [mood]);

  // Symbol lifecycle: expire old symbols, extend near mouse
  useEffect(() => {
    if (symbols.length === 0) return;
    const id = setInterval(() => {
      const now = Date.now();
      const mx = mouseRef.current.x, my = mouseRef.current.y;
      setSymbols(prev => prev.filter(s => {
        const age = now - s.born;
        const dx = mx - s.x, dy = my - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // Extend life if mouse is approaching
        if (dist < SYMBOL_NEAR_R && !s.extended) {
          s.born += SYMBOL_EXTEND; // push born forward = longer life
          s.extended = true;
        }
        return age < SYMBOL_LIFE;
      }));
    }, 200);
    return () => clearInterval(id);
  }, [symbols.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const color = mood === 'happy' ? '#38b6ff' : '#e0943a';

  return (
    <>
      <div
        className={`ghost-sprite${visible ? ' ghost-visible' : ''}`}
        style={{ left: pos.x, top: pos.y, color }}
      >
        <svg width="28" height="32" viewBox="0 0 24 28" fill="none">
          <path d="M12 2C7 2 3 6 3 11v11l3-3 3 3 3-3 3 3 3-3 3 3V11c0-5-4-9-9-9z"
                fill="currentColor" opacity="0.85" />
          <circle cx="9" cy="11" r="2.2" fill="#0a0a10" />
          <circle cx="15" cy="11" r="2.2" fill="#0a0a10" />
          <circle cx="9.6" cy="10.4" r="0.9" fill="#fff" />
          <circle cx="15.6" cy="10.4" r="0.9" fill="#fff" />
        </svg>
      </div>

      {symbols.map((s) => (
        <GlowSymbol key={s.id} sym={s} mouseRef={mouseRef} />
      ))}
    </>
  );
}

function GlowSymbol({ sym, mouseRef }) {
  const [hovered, setHovered] = useState(false);
  const ref = useRef(null);

  // Check hover via mouse proximity (since pointer-events: none on parent)
  useEffect(() => {
    const check = () => {
      const mx = mouseRef.current.x, my = mouseRef.current.y;
      const dx = mx - sym.x, dy = my - sym.y;
      setHovered(dx * dx + dy * dy < SYMBOL_HOVER_R * SYMBOL_HOVER_R);
    };
    const id = setInterval(check, 80);
    return () => clearInterval(id);
  }, [sym.x, sym.y, mouseRef]);

  const age = (Date.now() - sym.born) / SYMBOL_LIFE;
  const fadeOut = age > 0.7 ? 1 - (age - 0.7) / 0.3 : 1;

  return (
    <div
      ref={ref}
      className={`ghost-symbol${hovered ? ' ghost-symbol-hover' : ''}`}
      style={{
        left: sym.x,
        top: sym.y,
        opacity: Math.max(0, fadeOut * 0.7),
      }}
    >
      {sym.char}
    </div>
  );
}
