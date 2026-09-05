export type Framing = { scale: [number, number]; offset: [number, number] };

/**
 * Fits one illustration to the viewport, cover-style, at a given zoom and pan.
 *
 * The shader samples the artwork through these numbers and the deer is placed
 * with them too, so the sprite stays welded to the spot it was cut from at any
 * window shape and any point in the journey.
 */
export function framing(
  imgW: number,
  imgH: number,
  vw: number,
  vh: number,
  zoom: number,
  pan: [number, number]
): Framing {
  const imageAspect = imgW / imgH;
  // A collapsed or not-yet-measured container reports 0, and 0/0 poisons every
  // number downstream into NaN — which the shader renders as garbage.
  const screenAspect = vw > 0 && vh > 0 ? vw / vh : imageAspect;

  // Show all of one axis and crop the other, whichever keeps the frame filled.
  const s: [number, number] =
    screenAspect > imageAspect
      ? [1, imageAspect / screenAspect]
      : [screenAspect / imageAspect, 1];

  return { scale: [s[0] / zoom, s[1] / zoom], offset: pan };
}

/** Image pixel -> normalised screen position (-0.5 .. 0.5), given the framing. */
export function toScreen(
  px: number,
  py: number,
  imgW: number,
  imgH: number,
  f: Framing
): [number, number] {
  return [
    (px / imgW - 0.5 - f.offset[0]) / f.scale[0],
    (py / imgH - 0.5 - f.offset[1]) / f.scale[1],
  ];
}
