import { useEffect, useRef, useState } from 'react';
import { SceneEngine, webglAvailable } from './engine.js';
import { uiVars } from './presets.js';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Full-screen live sky. `scene` comes from sceneFor(); changing it morphs the sky.
 * Falls back to a plain gradient (same colours) if WebGL is unavailable.
 */
export const QUALITY = {
  max: { scale: 1.0, fps: 60, adaptive: 'guard', hq: true },
  auto: { scale: 0.6, fps: 60, adaptive: 'on', hq: true },
  balanced: { scale: 0.42, fps: 30, adaptive: 'off', hq: false },
  low: { scale: 0.28, fps: 30, adaptive: 'off', hq: false },
};

export default function WeatherScene({ scene, onThunder, paused = false, quality = 'max', onEngine }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const sceneRef = useRef(scene);
  const qualityRef = useRef(quality);
  qualityRef.current = quality;
  const thunderRef = useRef(onThunder);
  const onEngineRef = useRef(onEngine);
  onEngineRef.current = onEngine;
  const [ok, setOk] = useState(true);
  sceneRef.current = scene;
  thunderRef.current = onThunder;

  useEffect(() => {
    if (!webglAvailable()) { setOk(false); return undefined; }
    let engine;
    let ro;
    const build = () => {
      try {
        const reduced = prefersReducedMotion();
        const narrow = window.innerWidth < 700;
        engine = new SceneEngine(canvasRef.current, { reducedMotion: reduced, resolutionScale: narrow ? 0.45 : 0.6, maxFps: narrow ? 30 : 60 });
      } catch (e) {
        console.warn('Sky renderer unavailable, using gradient fallback:', e.message);
        setOk(false);
        return;
      }
      engine.setQuality(QUALITY[qualityRef.current] || QUALITY.max);
      onEngineRef.current?.(engine);
      engine.onThunder = () => thunderRef.current?.();
      engine.onRestore = () => { engine.destroy(); build(); };
      engine.setTarget(sceneRef.current);
      engineRef.current = engine;
      if (prefersReducedMotion()) engine.renderOnce();
      else engine.start();
    };
    build();
    const onMove = (e) => engine?.setPointer((e.clientX / window.innerWidth - 0.5) * 2, -(e.clientY / window.innerHeight - 0.5) * 2);
    window.addEventListener('pointermove', onMove, { passive: true });
    ro = new ResizeObserver(() => { engine?.resize(); if (prefersReducedMotion()) engine?.renderOnce(); });
    ro.observe(canvasRef.current);
    return () => { window.removeEventListener('pointermove', onMove); ro?.disconnect(); engine?.destroy(); engineRef.current = null; };
  }, []);

  useEffect(() => {
    const e = engineRef.current;
    if (e) e.setQuality(QUALITY[quality] || QUALITY.max);
  }, [quality]);

  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    e.setTarget(scene);
    if (prefersReducedMotion()) { e.tick(performance.now(), 5); }
  }, [scene]);

  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    if (paused) e.stop(); else if (!prefersReducedMotion()) e.start();
  }, [paused]);

  const vars = uiVars(scene);
  return (
    <div className="scene" aria-hidden="true" style={{ background: `linear-gradient(to top, ${vars['--sky-bottom']}, ${vars['--sky-top']})` }}>
      {ok && <canvas ref={canvasRef} className="scene-canvas" data-scene={scene.key} />}
    </div>
  );
}
