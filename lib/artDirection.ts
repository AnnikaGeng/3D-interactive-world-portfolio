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

const col = (hex: string) => new THREE.Color(hex);

/** Shared bits: flat facets from derivatives, stepped light, stepped distance. */
const COMMON = /* glsl */ `
  uniform vec3 uLit;
  uniform vec3 uShade;
  uniform vec3 uHaze;
  uniform vec3 uLightDir;
  uniform float uLightMix;
  uniform float uLightSteps;
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
    vec3 dark = mix(vTint, uShade, 0.46);
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

export function bandedMaterial(o: BandedOptions = {}) {
  const m = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: COMMON + FRAGMENT,
    vertexColors: o.vertexColors ?? false,
    side: o.side ?? THREE.FrontSide,
    uniforms: {
      uLit: { value: col(o.lit ?? PALETTE.cream) },
      uShade: { value: col(o.shade ?? PALETTE.deep) },
      uHaze: { value: col(PALETTE.paper) },
      uLightDir: { value: new THREE.Vector3(-0.78, 0.30, -0.55).normalize() },
      uLightMix: { value: o.lightMix ?? 1 },
      uLightSteps: { value: o.lightSteps ?? 3 },
      uHazeSteps: { value: o.hazeSteps ?? 6 },
      uHazeNear: { value: o.hazeNear ?? 90 },
      uHazeFar: { value: o.hazeFar ?? 1150 },
      uGrain: { value: o.grain ?? 0.07 },
    },
  });
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
