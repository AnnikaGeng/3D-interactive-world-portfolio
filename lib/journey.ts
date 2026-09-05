import { SCENES } from "./scenes.generated";
import { VIEW } from "./scene";
import { framing, type Framing } from "./view";
import { SPANS, STARTS } from "./spans";

export { SCENES };

export { SPANS, STARTS };

export type JourneyFrame = {
  /** Outgoing scene, and the one arriving behind it. */
  a: number;
  b: number;
  /** 0 = entirely a, 1 = entirely b. */
  mix: number;
  framingA: Framing;
  framingB: Framing;
};

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Scroll position -> what to draw.
 *
 * Scenes hand over with a zoom-through rather than a plain dissolve: the one
 * you are leaving keeps growing past its resting size while it fades, and the
 * next arrives from slightly further away. Every zoom stays at or above 1 so
 * neither picture ever pulls its own edge into frame mid-transition.
 */
export function journey(t: number, vw: number, vh: number, loaded: number): JourneyFrame {
  const clamped = Math.min(0.9999, Math.max(0, t));

  let i = SCENES.length - 1;
  while (i > 0 && clamped < STARTS[i]) i--;
  const u = (clamped - STARTS[i]) / SPANS[i];

  const hasNext = i + 1 < SCENES.length && i + 1 <= loaded - 1;
  const handover = u > 1 - VIEW.handover && hasNext;
  const mix = handover ? smoothstep(1 - VIEW.handover, 1, u) : 0;

  const hold = VIEW.handover > 0 ? Math.min(1, u / (1 - VIEW.handover)) : u;
  const zoomA = handover
    ? lerp(VIEW.zoomHoldEnd, VIEW.zoomExit, mix)
    : lerp(VIEW.zoomHoldStart, VIEW.zoomHoldEnd, hold);
  const zoomB = lerp(VIEW.zoomEnter, VIEW.zoomHoldStart, mix);

  const j = handover ? i + 1 : i;
  const panA: [number, number] = [VIEW.pan[0] * hold, VIEW.pan[1] * hold];

  return {
    a: i,
    b: j,
    mix,
    framingA: framing(SCENES[i].w, SCENES[i].h, vw, vh, zoomA, panA),
    framingB: framing(SCENES[j].w, SCENES[j].h, vw, vh, zoomB, [0, 0]),
  };
}
