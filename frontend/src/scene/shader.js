export const VERTEX = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

// One full-screen fragment shader paints the whole sky: gradient, sun/moon bloom, stars, two cloud layers with
// cheap directional lighting, rain, snow, fog, lightning flash. GLSL ES 1.00 so it runs on WebGL1 as well.
export const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_skyTop;
uniform vec3 u_skyBottom;
uniform vec3 u_sunColor;
uniform vec3 u_cloudLit;
uniform vec3 u_cloudShade;
uniform vec2 u_sunPos;
uniform float u_sunStrength;
uniform float u_cover;
uniform float u_hero;
uniform float u_rain;
uniform float u_snow;
uniform float u_fog;
uniform float u_stars;
uniform float u_moon;
uniform float u_wind;
uniform float u_flash;
uniform float u_zoom;
uniform vec2 u_look;
uniform float u_hq;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 6; i++) {
    if (i == 5 && u_hq < 0.5) break;
    v += a * noise(p);
    p = m * p;
    a *= 0.5;
  }
  return v;
}

float fbm3(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p = m * p;
    a *= 0.5;
  }
  return v;
}

// returns (density, light). Billowy cumulus: warped fbm plus a "puff" term for cauliflower edges, a big hero
// cumulus, and light marched toward the sun (3 taps) so clouds self-shadow and get bright tops.
vec2 cloudLayer(vec2 p, float t, float cover, float scale, float speed, vec2 ldir, vec2 heroAt, float hero, float puffAmt) {
  vec2 q = p * scale + vec2(t * speed, t * speed * 0.12);
  float w = fbm(q * 0.6 + vec2(0.0, t * 0.01));
  float d = fbm(q + w * 1.5);
  float pf = 1.0 - abs(2.0 * noise(q * 2.2 + w * 2.0 + vec2(t * 0.02, 0.0)) - 1.0);
  d += (pf - 0.5) * puffAmt;
  float blob = 0.0;
  if (hero > 0.0) {
    vec2 h = (p - heroAt) * vec2(0.7, 1.15);
    blob = hero * exp(-dot(h, h) * 2.6);
    d += blob * (0.45 + 0.7 * fbm(q * 1.4 + 3.0 + w));
  }
  float thr = mix(0.82, 0.32, cover);
  // erode the edges with fine detail: ragged, cauliflower rims instead of smooth blobs
  float detail = fbm3(q * 4.6 + w * 2.0 + vec2(t * 0.03, 0.0));
  float edge = 1.0 - smoothstep(thr, thr + 0.35, d);
  d -= detail * 0.26 * edge;
  float dens = smoothstep(thr, thr + 0.07, d);
  float occ = 0.0;
  for (int i = 1; i <= 6; i++) {
    if (i > 4 && u_hq < 0.5) break;
    float fi = float(i);
    vec2 qq = q + ldir * (0.12 * fi * (u_hq > 0.5 ? 0.7 : 1.0));
    float ds = fbm3(qq + w * 1.5) + blob * 0.45;
    occ += smoothstep(thr, thr + 0.2, ds);
  }
  float light = clamp(1.0 - occ * (u_hq > 0.5 ? 0.22 : 0.30) - detail * 0.30 * dens + 0.02, 0.0, 1.0);
  return vec2(dens, light);
}

float rainLayer(vec2 uv, float scale, float speed, float t, float seed) {
  vec2 p = vec2(uv.x * scale * (u_res.x / u_res.y), uv.y * scale * 0.55);
  p.x += p.y * 0.22;
  p.y += t * speed;
  vec2 id = floor(p);
  vec2 f = fract(p);
  float h = hash(id + seed);
  float on = step(0.55, hash(id + seed + 7.0));
  float x = smoothstep(0.045, 0.0, abs(f.x - (0.15 + 0.7 * h)));
  float y = smoothstep(0.0, 0.25, f.y) * smoothstep(1.0, 0.45, f.y);
  return x * y * on;
}

float snowLayer(vec2 uv, float scale, float speed, float t, float seed) {
  vec2 p = vec2(uv.x * scale * (u_res.x / u_res.y), uv.y * scale);
  p.y += t * speed;
  vec2 id = floor(p);
  vec2 f = fract(p);
  float h = hash(id + seed);
  vec2 c = vec2(0.5 + 0.28 * sin(t * 0.8 + h * 6.28), 0.5 + 0.28 * cos(t * 0.6 + h * 9.0));
  float r = 0.06 + 0.07 * hash(id + seed + 3.0);
  return smoothstep(r, r * 0.3, length(f - c)) * step(0.45, hash(id + seed + 11.0));
}

void main() {
  vec2 frag = gl_FragCoord.xy / u_res;
  vec2 uv = (frag - 0.5) / u_zoom + 0.5;
  float asp = u_res.x / u_res.y;
  vec2 p = vec2((uv.x - 0.5) * asp, uv.y - 0.5);
  vec2 sunP = vec2((u_sunPos.x - 0.5) * asp, u_sunPos.y - 0.5);
  vec2 toSun = sunP - p;
  float sd = length(toSun);
  vec2 sunDir = normalize(toSun + 1e-4);
  float t = u_time;

  vec3 col = mix(u_skyBottom, u_skyTop, smoothstep(0.0, 1.0, uv.y));

  // stars + moon disc
  if (u_stars > 0.0) {
    vec2 sp = uv * vec2(asp, 1.0) * 70.0;
    vec2 sid = floor(sp);
    float star = step(0.985, hash(sid)) * smoothstep(0.35, 0.0, length(fract(sp) - 0.5));
    star *= 0.55 + 0.45 * sin(t * 2.0 + hash(sid + 5.0) * 40.0);
    col += vec3(0.85, 0.9, 1.0) * star * u_stars * smoothstep(0.2, 0.9, uv.y + 0.2);
  }

  // sun / moon bloom: tone-mapped so the core stays warm and soft instead of clipping to a white disc
  float glow = exp(-sd * 3.2) * 0.30 + exp(-sd * 9.0) * 0.42 + exp(-sd * 38.0) * 0.85;
  float pulse = 1.0 + 0.04 * sin(t * 0.7);
  vec3 sunGlow = u_sunColor * (1.0 - exp(-glow * u_sunStrength * pulse * 1.7));
  col = col * (1.0 - 0.35 * length(sunGlow)) + sunGlow * 1.05;
  if (u_moon > 0.0) {
    float disc = smoothstep(0.052, 0.046, sd);
    col = mix(col, vec3(0.93, 0.96, 1.0), disc * u_moon);
  }

  // crepuscular rays: angular streaks fanning out from the sun (clouds composited later naturally block them)
  if (u_sunStrength > 0.3) {
    float ang = atan(toSun.y, toSun.x);
    float ray = noise(vec2(ang * 7.0, t * 0.05)) * 0.6 + noise(vec2(ang * 17.0 + 3.0, -t * 0.04)) * 0.4;
    ray = smoothstep(0.38, 0.95, ray);
    col += u_sunColor * ray * exp(-sd * 2.4) * u_sunStrength * (u_hq > 0.5 ? 0.20 : 0.12) * (1.0 - u_rain * 0.8);
    // soft lens ghosts mirrored through the screen centre
    for (int g = 1; g <= 2; g++) {
      vec2 gp = -sunP * (0.45 * float(g));
      float gd = length(p - gp);
      col += u_sunColor * smoothstep(0.075 * float(g), 0.0, gd) * 0.045 * u_sunStrength;
    }
  }
  // shooting star on clear nights
  if (u_stars > 0.5) {
    float cyc = floor(t / 7.0);
    float ph = fract(t / 7.0);
    vec2 a0 = vec2(hash(vec2(cyc, 1.0)) * 1.4 - 0.5, 0.25 + hash(vec2(cyc, 2.0)) * 0.3);
    vec2 dir = normalize(vec2(1.0, -0.55));
    vec2 head = a0 + dir * ph * 1.6;
    vec2 rel = uv - head;
    float along = dot(rel, -dir);
    float across = abs(dot(rel, vec2(dir.y, dir.x * -1.0)));
    float trail = step(0.0, along) * smoothstep(0.16, 0.0, along) * smoothstep(0.0025, 0.0, across);
    col += vec3(0.9, 0.95, 1.0) * trail * step(ph, 0.5) * step(0.55, hash(vec2(cyc, 3.0))) * 0.9;
  }

  // light direction: toward the sun when it matters, from above on overcast days
  vec2 ldir = normalize(mix(vec2(-0.25, 1.0), sunDir, clamp(u_sunStrength * 1.4, 0.0, 1.0)));

  // clouds: far layer (slow, small, soft), near layer (big, billowy, with the hero cumulus)
  // the big cumulus sits low-right on fair days and dead centre when it storms
  vec2 heroAt = mix(vec2(0.14 * asp, -0.14), vec2(0.0, -0.03), smoothstep(0.2, 0.6, u_rain));
  vec2 far = cloudLayer(p + vec2(1.7, 0.4) + u_look * 0.03, t, u_cover * 0.85, 5.0, 0.010 * u_wind, ldir, heroAt, 0.0, 0.10);
  vec3 farCol = mix(u_cloudShade, u_cloudLit, far.y);
  col = mix(col, mix(col, farCol, 0.85), far.x * 0.7);

  vec2 near = cloudLayer(p + u_look * 0.075, t, u_cover, 3.0, 0.018 * u_wind, ldir, heroAt, u_hero, 0.22);
  float lt = near.y * near.y * (3.0 - 2.0 * near.y);
  vec3 cloudCol = mix(u_cloudShade, u_cloudLit, lt) * 0.95;
  // sunlight bleeding through the cloud + silver lining
  float thin = 1.0 - smoothstep(0.0, 0.9, near.x);
  float bleed = (exp(-sd * 3.5) * 0.22 + exp(-sd * 12.0) * 0.5) * u_sunStrength;
  cloudCol += u_sunColor * bleed * (0.20 + 0.8 * thin) * near.x;
  cloudCol += u_sunColor * lt * lt * 0.05 * u_sunStrength * near.x;
  // lightning lights the cloud from inside: strongest in the shadowed core
  cloudCol += vec3(0.42, 0.58, 1.0) * u_flash * (0.35 + 1.1 * (1.0 - lt)) * near.x;
  col = mix(col, cloudCol, near.x);

  // aerial haze: distance washes colour out toward the horizon
  col = mix(col, mix(u_skyBottom, vec3(1.0), 0.15), (1.0 - smoothstep(0.0, 0.45, uv.y)) * 0.28 * (0.4 + 0.6 * u_cover));

  // fog
  if (u_fog > 0.0) {
    float f = u_fog * (0.55 + 0.45 * fbm(p * 2.0 + vec2(t * 0.02, 0.0)));
    col = mix(col, mix(u_skyBottom, u_cloudLit, 0.55), clamp(f, 0.0, 0.92));
  }

  // rain: three parallax layers
  if (u_rain > 0.0) {
    float r = rainLayer(uv, 18.0, 5.0, t, 1.0) * 0.55
            + rainLayer(uv, 30.0, 7.5, t, 2.0) * 0.4
            + rainLayer(uv, 52.0, 11.0, t, 3.0) * 0.28;
    col += vec3(0.78, 0.84, 0.96) * r * u_rain * 0.42;
    col *= 1.0 - 0.10 * u_rain;
  }

  // snow
  if (u_snow > 0.0) {
    float s = snowLayer(uv, 14.0, 0.5, t, 1.0) + snowLayer(uv, 26.0, 0.8, t, 2.0) * 0.8 + snowLayer(uv, 44.0, 1.2, t, 3.0) * 0.6;
    col = mix(col, vec3(1.0), clamp(s, 0.0, 1.0) * u_snow * 0.9);
  }

  // lightning screen flash, vignette, dither
  col += vec3(0.30, 0.36, 0.55) * u_flash * 0.5;
  vec2 vv = uv - 0.5;
  col *= 1.0 - dot(vv, vv) * 0.55;
  col += (hash(gl_FragCoord.xy + fract(t)) - 0.5) / 120.0;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
