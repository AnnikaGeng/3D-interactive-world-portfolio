"use client";

import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useRef, type RefObject } from "react";
import { WALK } from "@/lib/scene";
import { SCENES, type JourneyFrame } from "@/lib/journey";
import { toScreen } from "@/lib/view";

/**
 * The deer, lifted off the valley illustration so it can walk.
 *
 * It only exists in that first scene, so it rides that scene's own framing and
 * fades out exactly as the scene it belongs to hands over. Nobody can see legs
 * at this size — the bob on the step cadence is what reads as walking.
 */
export default function Deer({
  frame,
  texture,
}: {
  frame: RefObject<JourneyFrame | null>;
  texture?: THREE.Texture;
}) {
  const { size } = useThree();
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);

  const scene = SCENES[0];
  const box = scene.deer;

  useFrame((state) => {
    const j = frame.current;
    if (!mesh.current || !mat.current || !j || !box) return;

    // Visible only while the valley is on screen.
    const weight = j.a === 0 ? 1 - j.mix : j.b === 0 ? j.mix : 0;
    mat.current.opacity = weight;
    mesh.current.visible = weight > 0.002;
    if (!mesh.current.visible) return;

    const f = j.a === 0 ? j.framingA : j.framingB;
    const phase = ((state.clock.elapsedTime / WALK.period) % 1 + 1) % 1;

    // There and back on an eased triangle, so it slows into each turn.
    const tri = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
    const u = tri * tri * (3 - 2 * tri);
    const speed = 6 * tri * (1 - tri);            // 0 at the turns, 1 mid-stride
    const bob = Math.abs(Math.sin(phase * WALK.steps * 2 * Math.PI)) * WALK.bob * speed;

    const px = box.x + box.w / 2 + WALK.from[0] + (WALK.to[0] - WALK.from[0]) * u;
    const py = box.y + box.h / 2 + WALK.from[1] + (WALK.to[1] - WALK.from[1]) * u - bob;

    // R3F sizes an orthographic camera in pixels, so place the sprite in pixels
    // too. toScreen returns -0.5..0.5 across the viewport.
    const [sx, sy] = toScreen(px, py, scene.w, scene.h, f);
    mesh.current.position.set(sx * size.width, -sy * size.height, 0);
    mesh.current.scale.set(
      // The artwork's deer faces left; mirror it on the way back.
      (box.w / scene.w / f.scale[0]) * size.width * (phase < 0.5 ? 1 : -1),
      (box.h / scene.h / f.scale[1]) * size.height,
      1
    );
  });

  if (!texture || !box) return null;

  return (
    <mesh ref={mesh} frustumCulled={false} renderOrder={10}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial ref={mat} map={texture} transparent depthTest={false} toneMapped={false} />
    </mesh>
  );
}
