import { SCENES } from "./scenes.generated";

const TOTAL = SCENES.reduce((n, s) => n + s.weight, 0);

/** Each scene's share of the page. */
export const SPANS = SCENES.map((s) => s.weight / TOTAL);

/** Where each scene begins, as a fraction of the whole scroll. */
export const STARTS = SPANS.reduce<number[]>((acc, span, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + SPANS[i - 1]);
  return acc;
}, []);
