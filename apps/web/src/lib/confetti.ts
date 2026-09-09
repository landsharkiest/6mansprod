/**
 * Tiny dependency-free canvas confetti burst. Call `fireConfetti()` on a correct guess;
 * it appends a fullscreen, click-through canvas, animates a burst, and removes itself when
 * done. Call the returned cleanup function on unmount to cancel early and remove the canvas
 * immediately (React StrictMode / fast navigation safe).
 */

const DEFAULT_COLORS = ['#e91e63', '#43a047', '#3f51b5', '#f5b301', '#1e88e5', '#ff6b35'];
const PARTICLE_COUNT = 120;
const DURATION_MS = 1600;
const GRAVITY = 0.28;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  rotationSpeed: number;
  color: string;
  shape: 'rect' | 'circle';
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function makeParticles(width: number, colors: string[]): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const angle = (Math.random() * Math.PI) / 3 + Math.PI / 3; // roughly upward cone
    const speed = 6 + Math.random() * 8;
    particles.push({
      x: width / 2 + (Math.random() - 0.5) * width * 0.4,
      y: -10,
      vx: Math.cos(angle) * speed * (Math.random() < 0.5 ? -1 : 1),
      vy: -Math.sin(angle) * speed - 4,
      size: 5 + Math.random() * 5,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)]!,
      shape: Math.random() < 0.5 ? 'rect' : 'circle',
    });
  }
  return particles;
}

/**
 * Fires a confetti burst covering the viewport. No-op (returns a harmless cleanup) when the
 * user has requested reduced motion, or when not running in a browser (SSR/test safety).
 */
export function fireConfetti(options: { colors?: string[] } = {}): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  if (prefersReducedMotion()) return () => {};

  const colors = options.colors ?? DEFAULT_COLORS;
  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '9999';

  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;

  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const particles = makeParticles(width, colors);
  let frameId: number | null = null;
  let stopped = false;
  const start = performance.now();

  function cleanup() {
    if (stopped) return;
    stopped = true;
    if (frameId !== null) cancelAnimationFrame(frameId);
    canvas.remove();
  }

  if (!ctx) {
    cleanup();
    return () => {};
  }
  ctx.scale(dpr, dpr);

  function tick(now: number) {
    if (stopped) return;
    const elapsed = now - start;
    const t = elapsed / DURATION_MS;
    if (t >= 1) {
      cleanup();
      return;
    }

    ctx!.clearRect(0, 0, width, height);
    const fade = 1 - t;
    for (const p of particles) {
      p.vy += GRAVITY;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;

      ctx!.save();
      ctx!.translate(p.x, p.y);
      ctx!.rotate(p.rotation);
      ctx!.globalAlpha = Math.max(0, fade);
      ctx!.fillStyle = p.color;
      if (p.shape === 'rect') {
        ctx!.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else {
        ctx!.beginPath();
        ctx!.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.restore();
    }

    frameId = requestAnimationFrame(tick);
  }

  frameId = requestAnimationFrame(tick);
  return cleanup;
}
