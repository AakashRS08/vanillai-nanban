// Optional ambient soundscape generated with WebAudio (no audio files). Off by default; needs a user gesture.

export function createAmbient() {
  let ctx = null;
  let noise = null;
  let filter = null;
  let gain = null;
  let enabled = false;
  let mood = { rain: 0, wind: 0, storm: false };

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('no audio');
    ctx = new AC();
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } // brown noise
    noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    gain = ctx.createGain();
    gain.gain.value = 0;
    noise.connect(filter).connect(gain).connect(ctx.destination);
    noise.start();
  }

  function apply() {
    if (!ctx) return;
    const level = enabled ? Math.min(0.5, 0.05 + mood.rain * 0.3 + mood.wind * 0.08) : 0;
    filter.frequency.setTargetAtTime(500 + mood.rain * 2600, ctx.currentTime, 0.4);
    gain.gain.setTargetAtTime(level, ctx.currentTime, 0.5);
  }

  return {
    get supported() { return typeof window !== 'undefined' && Boolean(window.AudioContext || window.webkitAudioContext); },
    get enabled() { return enabled; },
    async enable() { ensure(); await ctx.resume(); enabled = true; apply(); },
    disable() { enabled = false; apply(); },
    setMood(m) { mood = { ...mood, ...m }; apply(); },
    thunder() {
      if (!ctx || !enabled) return;
      const t = ctx.currentTime + 0.25 + Math.random() * 0.6;
      const g = gain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0.75, t + 0.15);
      g.exponentialRampToValueAtTime(0.06, t + 2.6);
      setTimeout(apply, 3200);
    },
  };
}
