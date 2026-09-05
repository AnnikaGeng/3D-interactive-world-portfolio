"use client";

import { useEffect, useRef } from "react";
import Lenis from "lenis";
import { progress } from "@/lib/progress";

export function useScrollProgress() {
  return progress;
}

export function useLenis() {
  const lenis = useRef<Lenis | null>(null);

  useEffect(() => {
    const l = new Lenis({ duration: 1.1, smoothWheel: true });
    lenis.current = l;

    // Read progress off Lenis itself, not window.scrollY. Lenis owns the scroll
    // position; sampling the DOM desyncs the moment anything scrolls
    // programmatically.
    l.on("scroll", (inst: Lenis) => {
      progress.current = Number.isFinite(inst.progress) ? inst.progress : 0;
    });

    let raf = 0;
    const loop = (t: number) => {
      l.raf(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // Lenis measures the page once; a hidden or resized viewport leaves it
    // holding a stale limit until told otherwise.
    const onResize = () => l.resize();
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onResize);

    if (process.env.NODE_ENV !== "production") {
      (window as any).__ascent = { lenis: l, progress };
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onResize);
      l.destroy();
    };
  }, []);

  return lenis;
}
