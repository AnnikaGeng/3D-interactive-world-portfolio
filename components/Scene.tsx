"use client";

import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { journey, type JourneyFrame } from "@/lib/journey";
import { progress } from "@/lib/progress";
import { useSceneTextures } from "./useSceneTextures";
import Deer from "./Deer";

export type Life = { flow: number; flowSpeed: number; water: number; deer: boolean };

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/**
 * Two illustrations, cross-faded, with the trail alive in both.
 *
 * Each mask carries R = coral trail, G = how far along that trail a pixel is,
 * B = water. Because G is distance measured *inside* the trail rather than
 * across the screen, the highlight runs along the ribbon and follows its bends
 * into the distance — and since the trail is in all four illustrations, the
 * same effect carries through the whole journey.
 */
const fragment = /* glsl */ `
  uniform sampler2D uBgA, uMaskA, uBgB, uMaskB;
  uniform vec2 uScaleA, uOffsetA, uScaleB, uOffsetB;
  uniform float uMix, uTime, uFlow, uFlowSpeed, uWater;

  varying vec2 vUv;

  // Takes the already-sampled colour and mask rather than the textures. Passing
  // samplers as function arguments is legal GLSL but poorly supported in
  // practice, and not worth the risk on a page meant to open anywhere.
  vec3 alive(vec3 col, vec3 m, vec2 uv) {
    // Two highlights chasing each other up the trail.
    float head = fract(m.g * 2.0 - uTime * uFlowSpeed);
    float pulse = smoothstep(0.0, 0.05, head) * smoothstep(0.30, 0.05, head);
    col = mix(col, vec3(1.0, 0.88, 0.80), m.r * uFlow * pulse);

    // Water catches light the way the artwork already draws it: thin
    // horizontal glints, drifting.
    float band = sin(uv.y * 620.0 + sin(uv.x * 11.0 + uTime * 0.2) * 3.0 - uTime * 0.5);
    col += m.b * uWater * smoothstep(0.92, 1.0, band) * 0.45;

    return col;
  }

  void main() {
    vec2 uvA = (vUv - 0.5) * uScaleA + 0.5 + uOffsetA;
    vec3 col = alive(texture2D(uBgA, uvA).rgb, texture2D(uMaskA, uvA).rgb, uvA);

    if (uMix > 0.001) {
      vec2 uvB = (vUv - 0.5) * uScaleB + 0.5 + uOffsetB;
      vec3 b = alive(texture2D(uBgB, uvB).rgb, texture2D(uMaskB, uvB).rgb, uvB);
      col = mix(col, b, uMix);
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

export default function Scene({ life, onReady }: { life: Life; onReady: () => void }) {
  const { textures, loaded, blank } = useSceneTextures();
  const { size, gl, scene, camera, invalidate } = useThree();
  const frame = useRef<JourneyFrame | null>(null);
  const announced = useRef(false);

  const first = textures[0];
  const uniforms = useMemo(
    () => ({
      uBgA: { value: (first?.bg ?? blank) as THREE.Texture },
      uMaskA: { value: (first?.mask ?? blank) as THREE.Texture },
      uBgB: { value: (first?.bg ?? blank) as THREE.Texture },
      uMaskB: { value: (first?.mask ?? blank) as THREE.Texture },
      uScaleA: { value: new THREE.Vector2(1, 1) },
      uOffsetA: { value: new THREE.Vector2(0, 0) },
      uScaleB: { value: new THREE.Vector2(1, 1) },
      uOffsetB: { value: new THREE.Vector2(0, 0) },
      uMix: { value: 0 },
      uTime: { value: 0 },
      uFlow: { value: 0 },
      uFlowSpeed: { value: 0.06 },
      uWater: { value: 0 },
    }),
    [blank, first]
  );

  // Bind whatever has loaded as soon as it loads, rather than waiting for the
  // next animation frame. A browser that throttles rAF — a background tab, a
  // hidden container, reduced-motion settings — would otherwise leave the quad
  // showing the black placeholder even though the artwork had arrived.
  useEffect(() => {
    const A = textures[0];
    if (!A) return;
    uniforms.uBgA.value = A.bg;
    uniforms.uMaskA.value = A.mask;
    uniforms.uBgB.value = A.bg;
    uniforms.uMaskB.value = A.mask;

    // Give it a correct opening framing too, so a first paint that lands before
    // any animation frame still shows the artwork properly fitted.
    const j = journey(0, size.width, size.height, Math.max(1, loaded));
    uniforms.uScaleA.value.set(...j.framingA.scale);
    uniforms.uOffsetA.value.set(...j.framingA.offset);
    uniforms.uMix.value = 0;

    // Draw once, right now. The animation loop is driven by requestAnimationFrame,
    // which a browser pauses in a hidden or backgrounded tab — so without this a
    // visitor whose tab was in the background while the artwork loaded would be
    // looking at blank paper until they moved the mouse.
    gl.render(scene, camera);
    invalidate();

    if (!announced.current) {
      announced.current = true;
      onReady();
    }
  }, [textures, uniforms, onReady, size.width, size.height, loaded, gl, scene, camera, invalidate]);

  useFrame((state) => {
    if (loaded === 0) return;

    const j = journey(progress.current, size.width, size.height, loaded);
    frame.current = j;

    const A = textures[j.a] ?? textures[0];
    const B = textures[j.b] ?? A;
    if (!A || !B) return;

    uniforms.uBgA.value = A.bg;
    uniforms.uMaskA.value = A.mask;
    uniforms.uBgB.value = B.bg;
    uniforms.uMaskB.value = B.mask;
    uniforms.uScaleA.value.set(...j.framingA.scale);
    uniforms.uOffsetA.value.set(...j.framingA.offset);
    uniforms.uScaleB.value.set(...j.framingB.scale);
    uniforms.uOffsetB.value.set(...j.framingB.offset);
    uniforms.uMix.value = j.mix;
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uFlow.value = life.flow;
    uniforms.uFlowSpeed.value = life.flowSpeed;
    uniforms.uWater.value = life.water;

    if (process.env.NODE_ENV !== "production") {
      (window as any).__scene = {
        t: progress.current, loaded, a: j.a, b: j.b, mix: +j.mix.toFixed(3),
        scaleA: j.framingA.scale.map((n) => +n.toFixed(4)),
        offA: j.framingA.offset.map((n) => +n.toFixed(4)),
        size: [size.width, size.height],
        boundBg: (uniforms.uBgA.value as any)?.image?.width ?? "none",
      };
    }
  });

  return (
    <>
      {/* Nothing to draw until at least the first scene has arrived. */}
      <mesh frustumCulled={false} visible={loaded > 0}>
        <planeGeometry args={[2, 2]} />
        <shaderMaterial uniforms={uniforms} vertexShader={vertex} fragmentShader={fragment} />
      </mesh>
      {life.deer && <Deer frame={frame} texture={textures[0]?.deer} />}
    </>
  );
}
