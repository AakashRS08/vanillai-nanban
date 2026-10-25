import { useEffect, useState } from 'react';

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#%&*+=?';

/** Text that "decodes" into its final value letter by letter whenever it changes (instant with reduced motion). */
export function useScramble(target, { duration = 700 } = {}) {
  const [out, setOut] = useState(target);
  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !target) { setOut(target); return undefined; }
    const start = performance.now();
    let raf;
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const solid = Math.floor(p * target.length);
      let s = '';
      for (let i = 0; i < target.length; i++) {
        const ch = target[i];
        s += i < solid || ch === ' ' ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }
      setOut(s);
      if (p < 1) raf = requestAnimationFrame(step);
      else setOut(target);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return out;
}
