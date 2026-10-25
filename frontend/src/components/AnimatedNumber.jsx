import { useEffect, useRef, useState } from 'react';

const ease = (t) => 1 - Math.pow(1 - t, 3);

/** Counts smoothly from the previous number to the new one (instant with reduced motion). */
export default function AnimatedNumber({ value, duration = 650 }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef(0);
  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!Number.isFinite(value) || reduced || !Number.isFinite(from.current)) { from.current = value; setShown(value); return undefined; }
    const start = performance.now();
    const a = from.current;
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const v = a + (value - a) * ease(t);
      from.current = v;
      setShown(v);
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration]);
  return Number.isFinite(shown) ? Math.round(shown) : '–';
}
