"use client";

import { useCallback, useEffect, useState } from "react";
import Experience from "@/components/Experience";
import Story from "@/components/Story";
import Panel, { DEFAULT_LIFE, type Tuning } from "@/components/Panel";
import { useLenis } from "@/components/useScroll";

export default function Page() {
  useLenis();
  const [ready, setReady] = useState(false);
  const [panel, setPanel] = useState(false);
  const [tuning, setTuning] = useState<Tuning>({ life: { ...DEFAULT_LIFE } });

  // The first illustration gates the fade-in; the rest stream in behind it.
  const onReady = useCallback(() => setReady(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "d" && !e.metaKey && !e.ctrlKey) setPanel((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <div className={ready ? "stage ready" : "stage"}>
        <Experience life={tuning.life} onReady={onReady} />
        <div className="grain" />
        <div className="vignette" />
        <Story />
      </div>

      {/* The page is tall so there is something to scroll; the art is fixed. */}
      <div className="scroll-track" />

      <Panel open={panel} value={tuning} onChange={setTuning} />
      <a className="cv" href="#" onClick={(e) => e.preventDefault()}>CV</a>
    </>
  );
}
