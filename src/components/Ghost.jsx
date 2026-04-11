import React, { useState, useEffect, useRef } from 'react';

const IDLE_THRESHOLD = 15_000;
const DEEP_IDLE     = 60_000;
const FLICKER_MIN   = 3_000;
const FLICKER_MAX   = 8_000;
const SHOW_DURATION = 2_500;

function randomBetween(a, b) { return a + Math.random() * (b - a); }

// Prefer dark UI regions: sidebar edges, toolbar, status bar, panel borders
function pickDarkSpot(mouseX, mouseY) {
  const W = window.innerWidth, H = window.innerHeight;
  const spots = [
    // Near left sidebar edge
    { x: randomBetween(8, 50), y: randomBetween(60, H - 60) },
    // Near right edge (panel border zone)
    { x: randomBetween(W - 60, W - 12), y: randomBetween(60, H - 60) },
    // Toolbar area
    { x: randomBetween(80, W - 80), y: randomBetween(4, 40) },
    // Status bar area
    { x: randomBetween(80, W - 80), y: randomBetween(H - 36, H - 8) },
    // Near cursor but biased toward edges
    { x: Math.max(20, Math.min(W - 40, mouseX + randomBetween(-150, 150))),
      y: Math.max(20, Math.min(H - 40, mouseY + randomBetween(-120, 120))) },
  ];
  return spots[Math.floor(Math.random() * spots.length)];
}

export function Ghost() {
  const [visible, setVisible] = useState(false);
  const [mood, setMood] = useState('happy');
  const [pos, setPos] = useState({ x: 200, y: 200 });
  const mouseRef = useRef({ x: 300, y: 300 });
  const lastActivityRef = useRef(Date.now());
  const flickerTimerRef = useRef(null);
  const hideTimerRef = useRef(null);
  const chaseFrameRef = useRef(null);

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
      if (idle > DEEP_IDLE) setMood('deepIdle');
      else if (idle > IDLE_THRESHOLD) setMood('idle');
      else setMood('happy');
    }, 2000);
    return () => clearInterval(id);
  }, []);

  // Flicker near dark regions
  useEffect(() => {
    const scheduleFlicker = () => {
      const delay = randomBetween(FLICKER_MIN, FLICKER_MAX);
      flickerTimerRef.current = setTimeout(() => {
        const m = mouseRef.current;
        setPos(pickDarkSpot(m.x, m.y));
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

  // Deep idle: Pac-Man flees with swerving, ghost chases
  const [pacman, setPacman] = useState(null);
  useEffect(() => {
    if (mood !== 'deepIdle') {
      setPacman(null);
      if (chaseFrameRef.current) cancelAnimationFrame(chaseFrameRef.current);
      return;
    }

    const m = mouseRef.current;
    const W = window.innerWidth, H = window.innerHeight;
    let px = Math.max(40, Math.min(W - 40, m.x + 70));
    let py = Math.max(40, Math.min(H - 60, m.y));
    let gx = Math.max(40, Math.min(W - 40, m.x));
    let gy = Math.max(40, Math.min(H - 60, m.y));
    // Pac-Man has a heading that swerves randomly
    let heading = Math.random() * Math.PI * 2;
    let swerveTimer = 0;
    let swerveTarget = heading;

    setPos({ x: gx, y: gy });
    setVisible(true);

    const chase = () => {
      swerveTimer++;
      // Pac-Man: pick a new random heading every ~80–200 frames
      if (swerveTimer % (80 + Math.floor(Math.random() * 120)) === 0) {
        swerveTarget = heading + randomBetween(-Math.PI * 0.7, Math.PI * 0.7);
      }
      // Smoothly steer toward swerve target
      const angleDiff = swerveTarget - heading;
      heading += angleDiff * 0.04;

      const speed = 1.6;
      px += Math.cos(heading) * speed;
      py += Math.sin(heading) * speed;

      // Bounce off edges by reversing heading component
      if (px < 30) { px = 30; heading = Math.PI - heading; swerveTarget = heading; }
      if (px > W - 30) { px = W - 30; heading = Math.PI - heading; swerveTarget = heading; }
      if (py < 40) { py = 40; heading = -heading; swerveTarget = heading; }
      if (py > H - 50) { py = H - 50; heading = -heading; swerveTarget = heading; }

      // Ghost chases with slight lag
      const dx = px - gx, dy = py - gy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 22) {
        gx += (dx / dist) * 1.3;
        gy += (dy / dist) * 1.3;
      }

      const mouthOpen = Math.sin(swerveTimer * 0.3) > 0;
      setPos({ x: gx, y: gy });
      setPacman({ x: px, y: py, mouthOpen, angle: heading });
      chaseFrameRef.current = requestAnimationFrame(chase);
    };

    chaseFrameRef.current = requestAnimationFrame(chase);
    return () => {
      if (chaseFrameRef.current) cancelAnimationFrame(chaseFrameRef.current);
    };
  }, [mood]); // eslint-disable-line react-hooks/exhaustive-deps

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
          <svg width="20" height="20" viewBox="0 0 18 18">
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
