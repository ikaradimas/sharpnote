import React, { useState, useEffect, useRef } from 'react';

const IDLE_THRESHOLD = 15_000;   // 15s → unhappy
const DEEP_IDLE     = 60_000;    // 60s → chase pacman
const FLICKER_MIN   = 3_000;
const FLICKER_MAX   = 8_000;
const SHOW_DURATION = 2_500;

function randomBetween(a, b) { return a + Math.random() * (b - a); }

export function Ghost() {
  const [visible, setVisible] = useState(false);
  const [mood, setMood] = useState('happy');    // happy | idle | deepIdle
  const [pos, setPos] = useState({ x: 200, y: 200 });
  const mouseRef = useRef({ x: 300, y: 300 });
  const lastActivityRef = useRef(Date.now());
  const flickerTimerRef = useRef(null);
  const hideTimerRef = useRef(null);
  const pacmanRef = useRef({ x: 0, y: 0, angle: 0 });
  const chaseFrameRef = useRef(null);

  // Track mouse position
  useEffect(() => {
    const onMove = (e) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
      lastActivityRef.current = Date.now();
    };
    const onKey = () => { lastActivityRef.current = Date.now(); };
    const onClick = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, []);

  // Mood tracker
  useEffect(() => {
    const id = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      if (idle > DEEP_IDLE) setMood('deepIdle');
      else if (idle > IDLE_THRESHOLD) setMood('idle');
      else setMood('happy');
    }, 2000);
    return () => clearInterval(id);
  }, []);

  // Flicker timer — show ghost near cursor periodically
  useEffect(() => {
    const scheduleFlicker = () => {
      const delay = randomBetween(FLICKER_MIN, FLICKER_MAX);
      flickerTimerRef.current = setTimeout(() => {
        const m = mouseRef.current;
        const offsetX = randomBetween(-120, 120);
        const offsetY = randomBetween(-100, 100);
        setPos({
          x: Math.max(20, Math.min(window.innerWidth - 40, m.x + offsetX)),
          y: Math.max(20, Math.min(window.innerHeight - 40, m.y + offsetY)),
        });
        setVisible(true);
        hideTimerRef.current = setTimeout(() => {
          setVisible(false);
          scheduleFlicker();
        }, SHOW_DURATION);
      }, delay);
    };
    scheduleFlicker();
    return () => {
      clearTimeout(flickerTimerRef.current);
      clearTimeout(hideTimerRef.current);
    };
  }, []);

  // Deep idle: Pac-Man flees, ghost chases
  const [pacman, setPacman] = useState(null);
  useEffect(() => {
    if (mood !== 'deepIdle') {
      setPacman(null);
      if (chaseFrameRef.current) cancelAnimationFrame(chaseFrameRef.current);
      return;
    }

    // Start Pac-Man ahead of the ghost, both near last cursor position
    const m = mouseRef.current;
    const startX = Math.max(40, Math.min(window.innerWidth - 40, m.x));
    const startY = Math.max(40, Math.min(window.innerHeight - 60, m.y));
    let px = startX + 70, py = startY;
    let gx = startX, gy = startY;
    let frame = 0;

    setPos({ x: gx, y: gy });
    setVisible(true);

    const chase = () => {
      frame++;
      // Pac-Man wanders in a wobbly path
      px += Math.cos(frame * 0.025) * 1.8;
      py += Math.sin(frame * 0.018) * 1.4;
      // Bounce off screen edges
      if (px < 30 || px > window.innerWidth - 30) px = Math.max(30, Math.min(window.innerWidth - 30, px));
      if (py < 30 || py > window.innerHeight - 50) py = Math.max(30, Math.min(window.innerHeight - 50, py));

      // Ghost chases Pac-Man with a slight lag
      const dx = px - gx, dy = py - gy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 20) {
        const speed = 1.2;
        gx += (dx / dist) * speed;
        gy += (dy / dist) * speed;
      }

      const angle = Math.atan2(py - gy, px - gx);
      const mouthOpen = Math.sin(frame * 0.3) > 0;

      setPos({ x: gx, y: gy });
      setPacman({ x: px, y: py, mouthOpen, angle });
      chaseFrameRef.current = requestAnimationFrame(chase);
    };

    chaseFrameRef.current = requestAnimationFrame(chase);
    return () => {
      if (chaseFrameRef.current) cancelAnimationFrame(chaseFrameRef.current);
    };
  }, [mood]); // eslint-disable-line react-hooks/exhaustive-deps

  const color = mood === 'happy' ? '#2ec4b6' : '#e0943a';

  return (
    <>
      <div
        className={`ghost-sprite${visible ? ' ghost-visible' : ''}`}
        style={{ left: pos.x, top: pos.y, color }}
      >
        <svg width="24" height="28" viewBox="0 0 24 28" fill="none">
          {/* Ghost body */}
          <path d="M12 2C7 2 3 6 3 11v11l3-3 3 3 3-3 3 3 3-3 3 3V11c0-5-4-9-9-9z"
                fill="currentColor" opacity="0.7" />
          {/* Eyes */}
          <circle cx="9" cy="11" r="2" fill="#0a0a10" />
          <circle cx="15" cy="11" r="2" fill="#0a0a10" />
          <circle cx="9.5" cy="10.5" r="0.8" fill="#fff" />
          <circle cx="15.5" cy="10.5" r="0.8" fill="#fff" />
        </svg>
        {mood === 'idle' && (
          <span className="ghost-zzz">zzz</span>
        )}
        {mood === 'deepIdle' && (
          <span className="ghost-zzz ghost-zzz-deep">ZZZ</span>
        )}
      </div>

      {pacman && mood === 'deepIdle' && (
        <div
          className="ghost-pacman"
          style={{
            left: pacman.x,
            top: pacman.y,
            transform: `rotate(${pacman.angle}rad)`,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            {pacman.mouthOpen ? (
              <path d="M9 1a8 8 0 110 16 8 8 0 010-16zm0 0L17 9 9 17" fill="#e0e040" />
            ) : (
              <circle cx="9" cy="9" r="8" fill="#e0e040" />
            )}
            <circle cx="9" cy="4" r="1.2" fill="#0a0a10" />
          </svg>
        </div>
      )}
    </>
  );
}
