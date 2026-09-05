import { SCENES } from "./scenes.generated";
import { SPANS, STARTS } from "./spans";

/**
 * How the artwork sits in the viewport, and how scenes hand over.
 *
 * Every zoom is at or above 1 on purpose: a scene at less than full cover would
 * pull its own edge into frame, which is very visible during a cross-fade.
 */
export const VIEW = {
  /** An arriving scene starts here — further away, exactly filling the frame. */
  zoomEnter: 1.0,
  /** Where it settles once it has fully arrived. */
  zoomHoldStart: 1.06,
  /** Where it has drifted to by the end of its own stretch of the page. */
  zoomHoldEnd: 1.2,
  /** How far it keeps pushing while it fades out, so you pass through it. */
  zoomExit: 1.36,
  /** Fraction of a scene's scroll spent handing over to the next. */
  handover: 0.26,
  /** Drift across a scene, in fractions of the image. */
  pan: [0.012, -0.024] as [number, number],
};

/**
 * The deer's walk, in image pixels relative to where it stands in the artwork.
 * It ambles left along the coral band, which slopes gently downhill that way,
 * then turns and comes back.
 *
 * Walking one way on a loop needs a fade at the seam to hide the jump back, and
 * the deer still visibly teleports. Turning around has no seam at all, and a
 * grazing animal changing its mind is what you would expect to see anyway.
 */
export const WALK = {
  from: [120, -14] as [number, number],
  to: [-200, 26] as [number, number],
  /** Seconds for a full there-and-back. */
  period: 52,
  /** Steps per leg — the bob cadence is what reads as walking. */
  steps: 30,
  /** Bob height, in image pixels. */
  bob: 5,
};

export const COPY = [
  { title: "Yi Geng", body: "Full-stack engineer. Vienna, Austria." },
  { title: "The climb", body: "Three years on backend. Three users to three hundred thousand." },
  { title: "The view", body: "Shipped, broke it, rebuilt it. Learned to tell those apart." },
  { title: "What's next", body: "Looking for the next ridge." },
];

/** Placeholder copy — one beat per scene, sitting inside that scene's stretch. */
export const STORY = SCENES.map((_, i) => {
  // Anchored to the scene's real stretch of the page, not an even quarter —
  // the scenes carry different weights, so an even split drifts out of sync.
  const at: [number, number] = [
    STARTS[i] + SPANS[i] * 0.08,
    STARTS[i] + SPANS[i] * 0.62,
  ];
  return { at, ...COPY[i] };
});

