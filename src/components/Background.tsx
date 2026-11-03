"use client";

import { useEffect, useRef } from "react";
import { useFx } from "@/lib/client/fx";

type Particle = {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  alpha: number;
};

function Particles({ count, idle }: { count: number; idle: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d", { alpha: true, desynchronized: true });
    if (!canvas || !ctx) return;

    // Keep the canvas close to CSS resolution; oversized backing stores cost CPU/GPU.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    let w = 0;
    let h = 0;
    let timer: number | null = null;

    const particles: Particle[] = [];

    const resize = () => {
      w = Math.max(1, canvas.clientWidth);
      h = Math.max(1, canvas.clientHeight);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (!particles.length) {
        for (let i = 0; i < Math.min(count, 80); i++) {
          particles.push({
            x: Math.random() * w,
            y: Math.random() * h,
            r: 0.6 + Math.random() * 1.2,
            vx: (Math.random() - 0.5) * 0.12,
            vy: 0.08 + Math.random() * 0.18,
            alpha: 0.22 + Math.random() * 0.38,
          });
        }
      } else {
        for (const p of particles) {
          p.x = Math.min(p.x, w);
          p.y = Math.min(p.y, h);
        }
      }
    };

    // Simple circles avoid allocating dozens of radial gradients on every frame.
    const draw = (advance: boolean) => {
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        if (advance) {
          p.y -= p.vy;
          p.x += p.vx;
          if (p.y < -4) {
            p.y = h + 4;
            p.x = Math.random() * w;
          }
          if (p.x < -4) p.x = w + 4;
          if (p.x > w + 4) p.x = -4;
        }
        ctx.fillStyle = `rgba(243,220,138,${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const stop = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      draw(false);
    };

    const tick = () => {
      timer = null;
      if (idle || document.hidden) return;
      draw(true);
      // 20 FPS is enough for ambient particles and much cheaper than 60 FPS.
      timer = window.setTimeout(tick, 50);
    };

    const sync = () => {
      if (idle || document.hidden) {
        stop();
        return;
      }
      if (timer === null) tick();
    };

    resize();
    sync();
    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", sync);

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [count, idle]);

  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />;
}

function Spotlight() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let x = 0;
    let y = 0;
    let hideTimer = 0;

    const move = (e: globalThis.PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          el.style.setProperty("--sx", `${x}px`);
          el.style.setProperty("--sy", `${y}px`);
          el.classList.add("is-visible");
        });
      }
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(
        () => el.classList.remove("is-visible"),
        e.pointerType === "mouse" ? 1800 : 900,
      );
    };

    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", move, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", move);
      window.clearTimeout(hideTimer);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return <div ref={ref} className="spotlight" />;
}

/** Background layers. Animations pause while the kiosk is idle or hidden. */
export function Background({ idle = false }: { idle?: boolean }) {
  const { on, fx } = useFx();

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className="grid-overlay" />
      {on("aurora") && (
        <div className="aurora">
          <i />
          <i />
          <i />
        </div>
      )}
      {on("particles") && <Particles count={fx.particlesDensity} idle={idle} />}
      {on("spotlight") && <Spotlight />}
    </div>
  );
}
