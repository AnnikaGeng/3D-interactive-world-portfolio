/**
 * The single number the whole experience is driven by: 0 at the top of the
 * page, 1 at the bottom.
 *
 * It hangs off globalThis rather than a module-local binding. Next.js can hand
 * the same module to two different chunks, and two copies of this store means
 * the camera and the copy disagree about where you are — which is exactly the
 * bug this replaced.
 */
const KEY = "__ascent_progress__";

type Store = { current: number };

export const progress: Store =
  ((globalThis as any)[KEY] ??= { current: 0 } satisfies Store);
