import { useEffect, useRef, useState } from 'react';
import { SceneEngine, webglAvailable } from './engine.js';
import { uiVars } from './presets.js';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Full-screen live sky. `scene` comes from sceneFor(); changing it morphs the sky.
 * Falls back to a plain gradient (same colours) if WebGL is unavailable.
 */
export default function WeatherScene({ scene, onThunder, paused = false }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const sceneRef = useRef(scene);
  const thunderRef = useRef(onThunder);
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
        engine = new SceneEngine(canvasRef.current, { reducedMotion: reduced, resolutionScale: narrow ? 0.45 : 0.6, maxFps: narrow ? 24 : 30 });
      } catch (e) {
        console.warn('Sky renderer unavailable, using gradient fallback:', e.message);
        setOk(false);
        return;
      }
      engine.onThunder = () => thunderRef.current?.();
      engine.onRestore = () => { engine.destroy(); build(); };
      engine.setTarget(sceneRef.current);
      engineRef.current = engine;
      if (prefersReducedMotion()) engine.renderOnce();
      else engine.start();
    };
    build();
    ro = new ResizeObserver(() => { engine?.resize(); if (prefersReducedMotion()) engine?.renderOnce(); });
    ro.observe(canvasRef.current);
    return () => { ro?.disconnect(); engine?.destroy(); engineRef.current = null; };
  }, []);

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
