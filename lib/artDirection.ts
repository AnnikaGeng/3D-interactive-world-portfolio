import * as THREE from 'three';

/**
 * The look.
 *
 * The reference illustrations are printed graphics, not photographs: light is
 * two or three flat steps rather than a smooth falloff, distance is a stack of
 * cut-paper layers rather than a haze gradient, and every surface carries the
 * same paper grain. Standard PBR materials do the opposite of all three, which
 * is why the default 3D pass reads as "generic terrain" no matter the colours.
 *
 * These materials are quantised on purpose. Almost every constant here is a
 * step count, and lowering one makes the picture flatter and more graphic.
 */

/** Sampled from valley.png, summit.png and Climb.png — they agree closely. */
export const PALETTE = {
  paper:     '#f2e3d1',   // sky, the lightest thing in frame
  paperCool: '#ddd9cf',   // top of the sky
  haze:      '#e3d6c4',   // what distance fades toward
  cream:     '#e9ddca',   // lit rock
  sand:      '#d7c1a9',   // lit ground near the trail
  rose:      '#b5938f',   // coral seen in shade
  slate:     '#6e8496',   // middle distance
  navy:      '#2e4b5f',
  deep:      '#112a3b',
  ink:       '#070f14',   // near-black foreground
  coral:     '#f7523c',   // the trail
  coralDeep: '#c8442f',
};

/**
 * The sky travels with you: morning in the valley, dusk by the time the route
 * reaches the sea. One journey, one continuous time of day.
 */
export const SKY = {
  dayTop:      '#cfd4d2',
  dayMid:      '#e6dccd',
  dayHorizon:  '#f4e6d4',
  duskTop:     '#2f4a63',
  duskMid:     '#b0837f',
  duskHorizon: '#f6c79a',
  /** What distance fades into, at each end of the journey. */
  dayHaze:     '#f2e3d1',
  duskHaze:    '#e5ab86',
};

/** Water, sampled from ocean.png. The bright band near the horizon is the
 *  thing that makes the reference read as sea rather than as a grey plane. */
export const SEA = {
  near:    '#123c4e',
  mid:     '#296577',
  bright:  '#62afb6',
  glint:   '#acefea',
  horizon: '#2a566f',
};

const col = (hex: string) => new THREE.Color(hex);

/** Shared bits: flat facets from derivatives, stepped light, stepped distance. */
const COMMON = /* glsl */ `
  uniform vec3 uLit;
  uniform vec3 uShade;
  uniform vec3 uFill;
  uniform vec3 uHaze;
  uniform vec3 uLightDir;
  uniform float uLightMix;
  uniform float uLightSteps;
  uniform float uFillSteps;
  uniform float uHazeSteps;
  uniform float uHazeNear;
  uniform float uHazeFar;
  uniform float uGrain;

  varying vec3 vTint;
  varying vec3 vWorldPos;

  // Quantise, but leave a sliver of softness on each step so the edges read as
  // printed ink rather than as aliasing.
  float bands(float x, float steps) {
    float s = max(steps, 1.0);
    return floor(x * s) / s + smoothstep(0.82, 1.0, fract(x * s)) / s;
  }

  float paperGrain(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  vec3 shadeSurface() {
    // Face normal from screen-space derivatives: every triangle gets one flat
    // value, which is the faceted look the artwork already has.
    vec3 n = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
    // Stretched rather than the usual *0.5+0.5: that remap crams every
    // upward-facing surface into the top band, which is most of a landscape,
    // and the whole frame washes out to the lit colour. Widening it lets which
    // way a slope faces decide its value, the way it does in the artwork.
    float lambert = smoothstep(-0.32, 0.62, dot(n, normalize(uLightDir)));

    vec3 lit = mix(vTint, uLit, 0.34);
    vec3 dark = mix(vTint, uShade, 0.62);

    // Skylight. Without it every surface turned away from the sun collapses to
    // one flat ink and a whole mountainside reads as a dead silhouette. In the
    // reference art the shadow side is a family of navies: faces that still see
    // the sky lift toward it, and that is what makes ridges and folds legible
    // inside the dark mass. Banded like everything else.
    // Narrow on purpose: only faces that genuinely turn skyward catch it, so
    // the steep shadow planes stay dark and the mass still reads as a mass.
    float sky = bands(smoothstep(0.06, 0.92, n.y), uFillSteps);
    dark = mix(dark, mix(dark, uFill, 0.55), sky);

    vec3 c = mix(vTint, mix(dark, lit, bands(lambert, uLightSteps)), uLightMix);

    // Aerial perspective in steps, so distant ridges stack like cut paper
    // instead of dissolving into a gradient.
    float haze = smoothstep(uHazeNear, uHazeFar, distance(cameraPosition, vWorldPos));
    c = mix(c, uHaze, bands(haze, uHazeSteps));

    return c * (1.0 - uGrain * 0.5 + paperGrain(gl_FragCoord.xy) * uGrain);
  }
`;

const VERTEX = /* glsl */ `
  varying vec3 vTint;
  varying vec3 vWorldPos;

  void main() {
    vec3 tint = vec3(1.0);
    #ifdef USE_COLOR
      tint = color;
    #endif
    #ifdef USE_INSTANCING_COLOR
      tint = instanceColor;
    #endif
    vTint = tint;

    vec4 local = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
    #endif
    vec4 world = modelMatrix * local;
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT = /* glsl */ `
  void main() {
    gl_FragColor = vec4(shadeSurface(), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export type BandedOptions = {
  /** Base colour, when the geometry carries no vertex or instance colour. */
  tint?: string;
  lit?: string;
  shade?: string;
  /** Skylight colour, which gives the shadow side its internal structure. */
  fill?: string;
  fillSteps?: number;
  /** 0 = a flat silhouette, 1 = fully shaded. Trees and figures want 0. */
  lightMix?: number;
  lightSteps?: number;
  hazeSteps?: number;
  hazeNear?: number;
  hazeFar?: number;
  grain?: number;
  vertexColors?: boolean;
  side?: THREE.Side;
};

const atmosphere: THREE.ShaderMaterial[] = [];
const dayHaze = col(SKY.dayHaze);
const duskHaze = col(SKY.duskHaze);

/**
 * Shift what distance fades into, so the far hills warm up with the sky rather
 * than staying morning-cream against a dusk horizon.
 */
export function setAtmosphere(progress: number) {
  const t = Math.min(1, Math.max(0, (progress - 0.52) / 0.42));
  for (const m of atmosphere) {
    (m.uniforms.uHaze.value as THREE.Color).copy(dayHaze).lerp(duskHaze, t);
  }
}

export function bandedMaterial(o: BandedOptions = {}) {
  const m = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: COMMON + FRAGMENT,
    vertexColors: o.vertexColors ?? false,
    side: o.side ?? THREE.FrontSide,
    uniforms: {
      uLit: { value: col(o.lit ?? PALETTE.cream) },
      uShade: { value: col(o.shade ?? PALETTE.deep) },
      uFill: { value: col(o.fill ?? PALETTE.navy) },
      uHaze: { value: col(SKY.dayHaze) },
      uLightDir: { value: new THREE.Vector3(-0.78, 0.30, -0.55).normalize() },
      uLightMix: { value: o.lightMix ?? 1 },
      uLightSteps: { value: o.lightSteps ?? 3 },
      uFillSteps: { value: o.fillSteps ?? 3 },
      uHazeSteps: { value: o.hazeSteps ?? 6 },
      uHazeNear: { value: o.hazeNear ?? 90 },
      uHazeFar: { value: o.hazeFar ?? 1150 },
      uGrain: { value: o.grain ?? 0.07 },
    },
  });
  atmosphere.push(m);
  // Geometry without a colour attribute still needs a tint to work from.
  if (!o.vertexColors) {
    m.defines = { ...m.defines, USE_COLOR: '' };
  }
  return m;
}

/**
 * For meshes that carry no colour attribute at all: bake the tint into the
 * uniforms rather than the geometry.
 */
export function flatMaterial(tint: string, opts: BandedOptions = {}) {
  const m = bandedMaterial({ ...opts, vertexColors: false });
  delete (m.defines as Record<string, string>).USE_COLOR;
  m.needsUpdate = true;
  m.vertexShader = m.vertexShader.replace('vec3 tint = vec3(1.0);', `vec3 tint = ${glslColor(tint)};`);
  return m;
}

function glslColor(hex: string) {
  const c = col(hex);
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
}
