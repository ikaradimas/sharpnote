import React, { useState, useEffect, useRef } from 'react';

const IDLE_THRESHOLD = 15_000;
const DEEP_IDLE     = 20_000;    // 20s → chase pacman
const FLICKER_MIN   = 3_000;
const FLICKER_MAX   = 8_000;
const SHOW_DURATION = 2_500;
const MAX_BEADS     = 12;

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
  const [pacman, setPacman] = useState(null);
  const [beads, setBeads] = useState([]);
  const mouseRef = useRef({ x: 300, y: 300 });
  const lastActivityRef = useRef(Date.now());
  const flickerTimerRef = useRef(null);
  const hideTimerRef = useRef(null);
  const chaseFrameRef = useRef(null);
  const moodRef = useRef('happy');

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

  useEffect(() => {
    const id = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      const next = idle > DEEP_IDLE ? 'deepIdle' : idle > IDLE_THRESHOLD ? 'idle' : 'happy';
      moodRef.current = next;
      setMood(next);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  // Flicker (only when NOT in deep idle — chase handles its own visibility)
  useEffect(() => {
    const scheduleFlicker = () => {
      const delay = randomBetween(FLICKER_MIN, FLICKER_MAX);
      flickerTimerRef.current = setTimeout(() => {
        if (moodRef.current === 'deepIdle') { scheduleFlicker(); return; }
        setPos(pickDarkSpot(mouseRef.current.x, mouseRef.current.y));
        setVisible(true);
        hideTimerRef.current = setTimeout(() => {
          if (moodRef.current !== 'deepIdle') setVisible(false);
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

  // Deep idle chase with bead trail
  useEffect(() => {
    if (mood !== 'deepIdle') {
      setPacman(null);
      setBeads([]);
      if (chaseFrameRef.current) cancelAnimationFrame(chaseFrameRef.current);
      return;
    }

    const m = mouseRef.current;
    const W = window.innerWidth, H = window.innerHeight;
    let px = Math.max(40, Math.min(W - 40, m.x + 70));
    let py = Math.max(40, Math.min(H - 60, m.y));
    let gx = Math.max(40, Math.min(W - 40, m.x));
    let gy = Math.max(40, Math.min(H - 60, m.y));
    let heading = Math.random() * Math.PI * 2;
    let swerveTimer = 0;
    let swerveTarget = heading;
    let beadList = [];
    let beadCounter = 0;

    setPos({ x: gx, y: gy });
    setVisible(true);

    const chase = () => {
      swerveTimer++;

      // Spawn beads ahead of Pac-Man
      if (swerveTimer % 12 === 0) {
        const ahead = 30;
        beadList.push({
          id: beadCounter++,
          x: px + Math.cos(heading) * ahead,
          y: py + Math.sin(heading) * ahead,
          alive: true,
        });
        if (beadList.length > MAX_BEADS) beadList.shift();
      }

      // Pac-Man eats beads it passes over
      for (const b of beadList) {
        if (!b.alive) continue;
        const dx = px - b.x, dy = py - b.y;
        if (dx * dx + dy * dy < 100) b.alive = false;
      }

      // Pac-Man swerves
      if (swerveTimer % (80 + Math.floor(Math.random() * 120)) === 0) {
        swerveTarget = heading + randomBetween(-Math.PI * 0.7, Math.PI * 0.7);
      }
      heading += (swerveTarget - heading) * 0.04;

      const speed = 1.6;
      px += Math.cos(heading) * speed;
      py += Math.sin(heading) * speed;

      if (px < 30) { px = 30; heading = Math.PI - heading; swerveTarget = heading; }
      if (px > W - 30) { px = W - 30; heading = Math.PI - heading; swerveTarget = heading; }
      if (py < 40) { py = 40; heading = -heading; swerveTarget = heading; }
      if (py > H - 50) { py = H - 50; heading = -heading; swerveTarget = heading; }

      // Ghost chases
      const gdx = px - gx, gdy = py - gy;
      const dist = Math.sqrt(gdx * gdx + gdy * gdy);
      if (dist > 22) {
        gx += (gdx / dist) * 1.3;
        gy += (gdy / dist) * 1.3;
      }

      const mouthOpen = Math.sin(swerveTimer * 0.3) > 0;
      setPos({ x: gx, y: gy });
      setPacman({ x: px, y: py, mouthOpen, angle: heading });
      setBeads(beadList.filter(b => b.alive).map(b => ({ id: b.id, x: b.x, y: b.y })));
      chaseFrameRef.current = requestAnimationFrame(chase);
    };

    chaseFrameRef.current = requestAnimationFrame(chase);
    return () => {
      if (chaseFrameRef.current) cancelAnimationFrame(chaseFrameRef.current);
    };
  }, [mood]); // eslint-disable-line react-hooks/exhaustive-deps

  const color = mood === 'happy' ? '#38b6ff' : '#e0943a';
  const isChasing = mood === 'deepIdle';

  return (
    <>
      <div
        className={`ghost-sprite${visible || isChasing ? ' ghost-visible' : ''}`}
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
      </div>

      {beads.map((b) => (
        <div key={b.id} className="ghost-bead" style={{ left: b.x, top: b.y }} />
      ))}

      {pacman && isChasing && (
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
