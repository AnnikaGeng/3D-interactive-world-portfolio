"use client";

import * as THREE from "three";
import { useEffect, useMemo, useState } from "react";
import { SCENES } from "@/lib/scenes.generated";

export type SceneTextures = { bg: THREE.Texture; mask: THREE.Texture; deer?: THREE.Texture };

function load(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      url,
      (t) => {
        // No colour conversion: what Midjourney drew is what gets drawn.
        t.colorSpace = THREE.LinearSRGBColorSpace;
        t.minFilter = THREE.LinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        // The loader already flagged the texture ready with its default
        // filtering; these overrides only reach the GPU if it is flagged again.
        // Without this three.js keeps the original mipmapped state and samples
        // black — a silent failure with no console error.
        t.needsUpdate = true;
        resolve(t);
      },
      undefined,
      reject
    );
  });
}

/**
 * Loads the journey one scene at a time.
 *
 * All four illustrations together are several megabytes, and waiting for the
 * last one before showing the first is the difference between a site that opens
 * and a site that hangs. The first scene gates the fade-in; the rest arrive
 * while the reader is still on it, and `loaded` keeps the scroll from handing
 * over to a scene that has not turned up yet.
 */
export function useSceneTextures() {
  const [textures, setTextures] = useState<(SceneTextures | null)[]>(
    () => SCENES.map(() => null)
  );
  const [loaded, setLoaded] = useState(0);

  // Stands in for a scene that has not arrived yet; never actually visible.
  const blank = useMemo(() => {
    const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    t.needsUpdate = true;
    return t;
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      for (let i = 0; i < SCENES.length; i++) {
        const s = SCENES[i];
        try {
          const [bg, mask, deer] = await Promise.all([
            load(s.bg),
            load(s.mask),
            s.deerSrc ? load(s.deerSrc) : Promise.resolve(undefined),
          ]);
          if (cancelled) return;
          setTextures((prev) => {
            const next = [...prev];
            next[i] = { bg, mask, deer };
            return next;
          });
          setLoaded(i + 1);
        } catch {
          if (!cancelled) setLoaded(i);        // stop advancing past what we have
          return;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { textures, loaded, blank };
}
