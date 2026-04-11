import React, { useRef, useEffect, useCallback, useState } from 'react';

const W = 364, H = 252;
const PADDLE_W = 67, PADDLE_H = 8, PADDLE_Y = H - 20;
const BALL_R = 6;
const BRICK_ROWS = 4, BRICK_COLS = 8, BRICK_W = 39, BRICK_H = 11, BRICK_GAP = 4, BRICK_TOP = 17;
const BALL_SPEED = 3.1;
const TEAL = '#2ec4b6';
const COLORS = ['#2ec4b6', '#e0943a', '#c084d0', '#6a9fd8', '#4ec9b0', '#e06070', '#d4a843', '#7a8fa0'];

function initBricks() {
  const bricks = [];
  const totalW = BRICK_COLS * BRICK_W + (BRICK_COLS - 1) * BRICK_GAP;
  const startX = (W - totalW) / 2;
  for (let r = 0; r < BRICK_ROWS; r++) {
    for (let c = 0; c < BRICK_COLS; c++) {
      bricks.push({
        x: startX + c * (BRICK_W + BRICK_GAP),
        y: BRICK_TOP + r * (BRICK_H + BRICK_GAP),
        alive: true,
        color: COLORS[(r + c) % COLORS.length],
      });
    }
  }
  return bricks;
}

export function PongGame() {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const animRef = useRef(null);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const gameOverRef = useRef(false);
  const wonRef = useRef(false);

  const resetState = useCallback(() => {
    stateRef.current = {
      px: W / 2 - PADDLE_W / 2,
      bx: W / 2, by: H / 2,
      vx: BALL_SPEED * (Math.random() > 0.5 ? 1 : -1),
      vy: -BALL_SPEED,
      bricks: initBricks(),
      score: 0,
    };
    setScore(0);
    setGameOver(false);
    setWon(false);
    gameOverRef.current = false;
    wonRef.current = false;
  }, []);

  useEffect(() => { resetState(); }, [resetState]);

  const draw = useCallback((ctx, s) => {
    ctx.clearRect(0, 0, W, H);

    // bricks
    for (const b of s.bricks) {
      if (!b.alive) continue;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, BRICK_W, BRICK_H, 3);
      ctx.fill();
    }

    // paddle
    ctx.fillStyle = TEAL;
    ctx.beginPath();
    ctx.roundRect(s.px, PADDLE_Y, PADDLE_W, PADDLE_H, 4);
    ctx.fill();

    // ball
    ctx.fillStyle = '#e0e0f0';
    ctx.shadowColor = TEAL;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(s.bx, s.by, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const onMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      if (stateRef.current) {
        stateRef.current.px = Math.max(0, Math.min(W - PADDLE_W, mx - PADDLE_W / 2));
      }
    };
    canvas.addEventListener('mousemove', onMove);

    const loop = () => {
      const s = stateRef.current;
      if (!s) { animRef.current = requestAnimationFrame(loop); return; }

      // move ball
      s.bx += s.vx;
      s.by += s.vy;

      // wall bounce
      if (s.bx - BALL_R <= 0) { s.bx = BALL_R; s.vx = Math.abs(s.vx); }
      if (s.bx + BALL_R >= W) { s.bx = W - BALL_R; s.vx = -Math.abs(s.vx); }
      if (s.by - BALL_R <= 0) { s.by = BALL_R; s.vy = Math.abs(s.vy); }

      // paddle bounce
      if (s.vy > 0 && s.by + BALL_R >= PADDLE_Y && s.by + BALL_R <= PADDLE_Y + PADDLE_H + 6
          && s.bx >= s.px && s.bx <= s.px + PADDLE_W) {
        s.by = PADDLE_Y - BALL_R;
        const hit = (s.bx - s.px) / PADDLE_W - 0.5; // -0.5 to 0.5
        s.vx = BALL_SPEED * 2 * hit;
        s.vy = -Math.sqrt(BALL_SPEED * BALL_SPEED * 1.5 - s.vx * s.vx) || -BALL_SPEED;
      }

      // brick collision
      for (const b of s.bricks) {
        if (!b.alive) continue;
        if (s.bx + BALL_R > b.x && s.bx - BALL_R < b.x + BRICK_W
            && s.by + BALL_R > b.y && s.by - BALL_R < b.y + BRICK_H) {
          b.alive = false;
          s.score++;
          setScore(s.score);

          // determine bounce direction
          const overlapLeft = (s.bx + BALL_R) - b.x;
          const overlapRight = (b.x + BRICK_W) - (s.bx - BALL_R);
          const overlapTop = (s.by + BALL_R) - b.y;
          const overlapBottom = (b.y + BRICK_H) - (s.by - BALL_R);
          const minX = Math.min(overlapLeft, overlapRight);
          const minY = Math.min(overlapTop, overlapBottom);
          if (minX < minY) s.vx = -s.vx;
          else s.vy = -s.vy;
          break;
        }
      }

      // check win
      if (s.bricks.every(b => !b.alive)) {
        wonRef.current = true;
        setWon(true);
        draw(ctx, s);
        return;
      }

      // ball out
      if (s.by - BALL_R > H) {
        gameOverRef.current = true;
        setGameOver(true);
        draw(ctx, s);
        return;
      }

      draw(ctx, s);
      animRef.current = requestAnimationFrame(loop);
    };

    if (!gameOverRef.current && !wonRef.current) {
      animRef.current = requestAnimationFrame(loop);
    }
    return () => {
      canvas.removeEventListener('mousemove', onMove);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [draw]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRestart = () => {
    resetState();
  };

  return (
    <div className="pong-game">
      <div className="pong-score">Score: {score} / {BRICK_ROWS * BRICK_COLS}</div>
      <div className="pong-arena">
        <canvas ref={canvasRef} width={W} height={H} className="pong-canvas" />
        {(gameOver || won) && (
          <div className="pong-overlay">
            <span className="pong-message">{won ? 'You win!' : 'Game over'}</span>
            <button className="pong-restart" onClick={handleRestart}>Play again</button>
          </div>
        )}
      </div>
      <div className="pong-hint">Move mouse to control paddle</div>
    </div>
  );
}
