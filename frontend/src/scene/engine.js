import { FRAGMENT, VERTEX } from './shader.js';
import { kickCurve, sceneDistance, stepToward } from './morph.js';

const VEC3 = ['skyTop', 'skyBottom', 'sunColor', 'cloudLit', 'cloudShade'];
const FLOATS = ['sunStrength', 'cover', 'hero', 'rain', 'snow', 'fog', 'stars', 'moon', 'wind'];
const KICK_MS = 1300;
const KICK_COOLDOWN_MS = 900;

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

/**
 * Renders the procedural sky into a canvas. Parameters morph smoothly toward whatever target is set, big changes
 * trigger a zoom/blur "fly through the clouds" transition, and storms fire timed lightning.
 */
export class SceneEngine {
  constructor(canvas, { reducedMotion = false, resolutionScale = 0.5, maxFps = 60 } = {}) {
    this.canvas = canvas;
    this.reducedMotion = reducedMotion;
    this.resolutionScale = resolutionScale;
    this.frameInterval = 1000 / maxFps - 2; // a little under the target so vsync-aligned frames aren't skipped
    this.maxFps = maxFps;
    this.adaptive = 'on';
    this.hq = 1;
    this.look = [0, 0];
    this.lookTarget = [0, 0];
    this.fps = 60;
    this.onThunder = null;
    this.current = null;
    this.target = null;
    this.kickStart = -1e9;
    this.lastKick = -1e9;
    this.time = 7.3; // start at a pleasant cloud arrangement
    this.flash = 0;
    this.nextBolt = performance.now() + 2500;
    this.boltQueue = [];
    this.running = false;
    this.lost = false;
    this.last = 0;
    this.lastDraw = 0;
    this.slowFrames = 0;
    this.minScale = 0.3;

    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' })
      || canvas.getContext('experimental-webgl');
    if (!gl) throw new Error('WebGL not available');
    this.gl = gl;
    this.program = this.link(VERTEX, FRAGMENT);
    gl.useProgram(this.program);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); // one big triangle
    const loc = gl.getAttribLocation(this.program, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const n of ['u_res', 'u_time', 'u_sunPos', 'u_flash', 'u_zoom', 'u_look', 'u_hq', ...VEC3.map(cap), ...FLOATS.map(cap)]) {
      this.u[n] = gl.getUniformLocation(this.program, n);
    }

    this.handleLost = (e) => { e.preventDefault(); this.lost = true; };
    this.handleRestored = () => { this.lost = false; this.rebuild(); };
    canvas.addEventListener('webglcontextlost', this.handleLost);
    canvas.addEventListener('webglcontextrestored', this.handleRestored);
    this.resize();
  }

  link(vs, fs) {
    const { gl } = this;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Shader error: ${gl.getShaderInfoLog(s)}`);
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`Link error: ${gl.getProgramInfoLog(prog)}`);
    return prog;
  }

  rebuild() {
    // After a lost context everything must be recreated; simplest is to ask the owner to build a new engine.
    this.onRestore?.();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.round(rect.width * dpr * this.resolutionScale));
    const h = Math.max(2, Math.round(rect.height * dpr * this.resolutionScale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.gl.viewport(0, 0, w, h);
    }
    this.dirty = true;
  }

  /** Pointer position in -1..1; the sky parallax-shifts toward it. */
  setPointer(x, y) {
    this.lookTarget = [x, y];
  }

  /** Applies a user quality preset: render scale, frame cap, detail level and self-adjust mode ('on' | 'guard' | 'off'). */
  setQuality({ scale, fps, adaptive, hq }) {
    this.adaptive = adaptive;
    this.hq = hq ? 1 : 0;
    this.maxFps = fps;
    this.frameInterval = 1000 / fps - 2;
    this.resolutionScale = scale;
    this.minScale = adaptive === 'guard' ? Math.max(0.55, scale * 0.6) : Math.min(0.3, scale);
    this.slowFrames = 0;
    this.resize();
  }

  /** Sets the sky to render. The first call snaps; later calls morph (and may trigger the fly-through). */
  setTarget(scene) {
    const now = performance.now();
    if (!this.current) {
      this.current = { ...scene };
      this.target = scene;
      this.dirty = true;
      return;
    }
    const big = sceneDistance(this.target, scene) > 0.7;
    this.target = scene;
    if (big && now - this.lastKick > KICK_COOLDOWN_MS && !this.reducedMotion) {
      this.kickStart = now;
      this.lastKick = now;
    }
    this.dirty = true;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      if (document.hidden || this.lost) { this.last = now; return; }
      if (now - this.lastDraw < this.frameInterval) return;
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.lastDraw = now;
      this.tick(now, dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  destroy() {
    this.stop();
    this.canvas.removeEventListener('webglcontextlost', this.handleLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleRestored);
    // Deliberately not calling loseContext(): React StrictMode re-mounts onto the same canvas, and a lost context can't be reused.
  }

  tick(now, dt) {
    if (!this.target) return;
    if (!this.reducedMotion) this.time += dt;
    if (dt > 0) this.fps = this.fps * 0.92 + (1 / dt) * 0.08;
    const k2 = 1 - Math.exp(-dt * 3);
    this.look = [this.look[0] + (this.lookTarget[0] - this.look[0]) * k2, this.look[1] + (this.lookTarget[1] - this.look[1]) * k2];
    this.current = stepToward(this.current, this.target, dt, this.reducedMotion ? 30 : 2.0);
    this.updateLightning(now, dt);

    const k = (now - this.kickStart) / KICK_MS;
    const kick = kickCurve(k);
    this.canvas.style.filter = kick.blur > 0.2 ? `blur(${kick.blur.toFixed(1)}px) brightness(${(1 - kick.dim).toFixed(3)})` : '';
    this.draw(kick.zoom);
    this.adaptQuality(dt);
  }

  /**
   * Keeps motion smooth rather than fast: if frames take too long, first settle on a steady 30fps (an uneven 40fps looks
   * worse), and only if even that is missed quietly lower the render resolution (the sky is soft, so it's barely visible).
   */
  adaptQuality(dt) {
    if (this.adaptive === 'off') return;
    // 'guard' (max quality) only steps in when the frame rate really collapses (<~28fps); 'on' (auto) aims for steady 60/30.
    const limit = this.adaptive === 'guard' ? 1 / 28 : (1 / this.maxFps) * 1.6;
    if (dt > limit) this.slowFrames++; else this.slowFrames = Math.max(0, this.slowFrames - 1);
    if (this.slowFrames <= (this.adaptive === 'guard' ? 40 : 24)) return;
    this.slowFrames = 0;
    if (this.adaptive === 'on' && this.maxFps > 30) {
      this.maxFps = 30;
      this.frameInterval = 1000 / 30 - 2;
    } else if (this.resolutionScale > this.minScale) {
      this.resolutionScale = Math.max(this.minScale, this.resolutionScale * 0.85);
      this.resize();
    } else if (this.hq) {
      this.hq = 0;
    }
  }

  updateLightning(now, dt) {
    const bolts = this.target?.lightning ?? 0;
    if (bolts > 0 && !this.reducedMotion) {
      if (now >= this.nextBolt) {
        // a main stroke, often followed by a weaker re-strike; never more than ~one flash cluster per 2.5s
        this.boltQueue = [{ at: now, power: 0.9 + Math.random() * 0.1 }];
        if (Math.random() < 0.6) this.boltQueue.push({ at: now + 140 + Math.random() * 120, power: 0.5 + Math.random() * 0.3 });
        this.nextBolt = now + 2600 + Math.random() * 5200;
        this.onThunder?.();
      }
    } else {
      this.boltQueue = [];
    }
    let level = 0;
    for (const b of this.boltQueue) {
      const age = (now - b.at) / 1000;
      if (age >= 0) level = Math.max(level, b.power * Math.exp(-age * 7.5));
    }
    this.flash = level < 0.01 ? 0 : level;
  }

  draw(zoom = 1) {
    const { gl, u, current: s } = this;
    if (!s) return;
    gl.uniform2f(u.u_res, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.u_time, this.time);
    gl.uniform1f(u.u_flash, this.flash);
    gl.uniform1f(u.u_zoom, zoom);
    gl.uniform2f(u.u_look, this.look[0], this.look[1]);
    gl.uniform1f(u.u_hq, this.hq);
    gl.uniform2f(u.u_sunPos, s.sunPos[0], s.sunPos[1]);
    for (const n of VEC3) gl.uniform3f(u[cap(n)], s[n][0], s[n][1], s[n][2]);
    for (const n of FLOATS) gl.uniform1f(u[cap(n)], s[n]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.dirty = false;
  }

  /** Draws one frame immediately (used for reduced-motion and for tests). */
  renderOnce() {
    if (!this.current) return;
    this.draw(1);
  }
}

function cap(name) {
  return `u_${name}`;
}
