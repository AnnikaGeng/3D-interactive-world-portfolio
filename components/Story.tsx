"use client";

import { useEffect, useRef } from "react";
import { STORY } from "@/lib/scene";
import { progress } from "@/lib/progress";

const FADE = 0.06;

/**
 * Placeholder copy, cross-faded by scroll.
 *
 * Opacity is written straight to the DOM inside one rAF loop. Routing it
 * through useState would re-render React on every frame to change a number
 * that only CSS ever reads.
 */
export default function Story() {
  const beats = useRef<(HTMLDivElement | null)[]>([]);
  const hint = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const t = progress.current;
      STORY.forEach((s, i) => {
        const el = beats.current[i];
        if (!el) return;
        const [a, b] = s.at;
        const o =
          t < a - FADE || t > b + FADE
            ? 0
            : Math.min((t - (a - FADE)) / FADE, (b + FADE - t) / FADE, 1);
        el.style.opacity = String(Math.max(0, o));
      });
      if (hint.current) hint.current.style.opacity = t > 0.03 ? "0" : "1";
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="story">
      <div className="scrim" />
      {STORY.map((s, i) => (
        <div
          key={s.title}
          ref={(el) => {
            beats.current[i] = el;
          }}
          className="beat"
          style={{ opacity: 0 }}
        >
          <h2>{s.title}</h2>
          <p>{s.body}</p>
        </div>
      ))}
      <div ref={hint} className="hint">scroll</div>
    </div>
  );
}
