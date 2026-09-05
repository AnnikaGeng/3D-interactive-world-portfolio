"use client";

import { Canvas } from "@react-three/fiber";
import Scene, { type Life } from "./Scene";

export default function Experience({ life, onReady }: { life: Life; onReady: () => void }) {
  return (
    <Canvas
      className="canvas"
      dpr={[1, 1.75]}
      gl={{ antialias: false, alpha: false }}
      // The scene is a screen-space quad; nothing here needs a real camera.
      orthographic
      camera={{ position: [0, 0, 1], near: 0, far: 2 }}
    >
      <color attach="background" args={["#efe1d4"]} />
      <Scene life={life} onReady={onReady} />
    </Canvas>
  );
}
