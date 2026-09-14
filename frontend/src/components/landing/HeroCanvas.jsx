import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import PoissonDiskSampling from 'poisson-disk-sampling'
import { useTheme } from '../../lib/theme'

/**
 * Particle field driven on the GPU.
 *
 * Positions live in a ping-ponged float render target, so one fragment shader
 * advances every particle in parallel. A ring centred on the pointer sweeps
 * outward through the field: particles inside the band scale up, take on the
 * warm end of the gradient, and get pushed away from the ring centre. Each
 * particle is drawn as a rounded capsule rotated to face the ring, which is
 * what gives the field its grain rather than looking like round dots.
 *
 * Placement uses Poisson-disk sampling — uniform random clumps, and a grid
 * reads as a lattice; blue noise gives even coverage that still looks organic.
 */

const SIM_SIZE = 128 // texture is SIM_SIZE², capped to the sample count below

const SIMPLEX_GLSL = `
#define PI 3.14159265359
#define TAU 6.28318530718
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(
    i.z+vec4(0.0,i1.z,i2.z,1.0))
    +i.y+vec4(0.0,i1.y,i2.y,1.0))
    +i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`

const SIM_VERTEX_SHADER = `
void main() { gl_Position = vec4(position, 1.0); }
`

/**
 * Each texel holds one particle: xy = live position, z = scale, w = velocity.
 * Scale eases toward the ring response so particles bloom and settle rather
 * than popping.
 */
const SIM_FRAGMENT_SHADER = `
uniform sampler2D uPosition;
uniform sampler2D uHome;
uniform vec2 uRingPos;
uniform float uRingRadius;
uniform float uRingWidth;
uniform float uRingWidthInner;
uniform float uDisplacement;
uniform float uTime;
uniform vec2 resolution;
${SIMPLEX_GLSL}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 prev = texture2D(uPosition, uv);
  vec2 home = texture2D(uHome, uv).xy;

  float scale = prev.z;
  float velocity = prev.w;
  vec2 pos = prev.xy * 0.8;

  float time = uTime * 0.5;
  float dist = distance(home, uRingPos);

  // Offsetting the outer edge by noise keeps the ring from reading as a
  // perfect circle sweeping the field.
  float edgeNoise = snoise(vec3(home * 0.2 + vec2(18.49, 72.97), time * 0.5));
  float distOuter = distance(home + edgeNoise * 0.005, uRingPos);

  // Two bands: a wide soft one and a tight bright one, plus a fill inside.
  float band = smoothstep(uRingRadius - uRingWidth * 2.0, uRingRadius, dist)
    - smoothstep(uRingRadius, uRingRadius + uRingWidth, distOuter);
  float core = smoothstep(uRingRadius - uRingWidthInner * 2.0, uRingRadius, dist)
    - smoothstep(uRingRadius, uRingRadius + uRingWidthInner, distOuter);
  float inside = smoothstep(uRingRadius + uRingWidthInner, uRingRadius, dist);

  float response = pow(band, 2.0);
  float corePow = pow(core, 3.0);
  response += corePow * 1.5;
  response += inside * 0.3;
  response += snoise(vec3(home * 30.0 + vec2(11.49, 12.97), time * 0.5)) * inside * 0.35;

  // Ambient shimmer so the field still breathes with the pointer away.
  float ambient = snoise(vec3(home * 2.0 + vec2(18.49, 72.97), time * 0.5));
  response += pow((ambient + 1.5) * 0.5, 2.0) * 1.0;

  // Omnidirectional flow. One noise field picks a heading per particle over
  // the full turn and a second picks its speed, so neighbours travel at
  // genuinely different angles instead of sliding along the two axes — the
  // axis-aligned sine pair this replaced made the whole field shear
  // left-right/up-down together.
  float heading = snoise(vec3(home * 1.6 + vec2(21.70, 48.30), time * 0.25)) * PI;
  float speed = snoise(vec3(home * 2.3 + vec2(91.20, 7.80), time * 0.30)) * 0.5 + 0.5;
  vec2 flow = vec2(cos(heading), sin(heading)) * speed * 0.045;

  // Each particle also orbits its own home on a randomised phase. The motion
  // closes on itself, so the field keeps wandering in every direction without
  // any particle escaping its designated area.
  float phase = snoise(vec3(home * 3.0 + vec2(63.10, 29.40), 0.0)) * TAU;
  float orbit = time * 0.55 + phase;
  vec2 swirl = vec2(cos(orbit), sin(orbit)) * 0.014;

  // Fine grain on top so it reads as texture, not one laminar sheet.
  float n3 = snoise(vec3(home * 20.0 + vec2(18.49, 72.97), time * 0.5));
  float n4 = snoise(vec3(home * 20.0 + vec2(50.90, 120.95), time * 0.5));
  vec2 drift = flow + swirl + vec2(n3, n4) * 0.006;

  // Push away from the ring centre, weighted by the tight band.
  pos -= (uRingPos - (home + drift)) * pow(corePow, 0.75) * uDisplacement;

  scale += (response - scale) * 0.2;
  velocity = velocity * 0.5 + scale * 0.25;

  gl_FragColor = vec4(home + drift + pos * 0.25, scale, velocity);
}
`

/**
 * Particles are points, but the fragment shader carves a rounded capsule out
 * of each one and rotates it to face the ring — that orientation is what makes
 * the field look like grain flowing around the pointer instead of dots.
 */
const RENDER_VERTEX_SHADER = `
uniform sampler2D uPosition;
uniform float uPixelRatio;
uniform float uParticleScale;
uniform vec2 uRingPos;
uniform vec2 uFieldSize;
varying float vScale;
varying float vVelocity;
varying float vFalloff;
varying vec2 vLocalPos;

void main() {
  vec4 particle = texture2D(uPosition, uv);
  vScale = particle.z;
  vVelocity = particle.w;
  vLocalPos = particle.xy;

  // The field fills its whole designated box rather than a disc that follows
  // the pointer — previously everything outside a 0.55 radius of the ring was
  // culled, so most of the hero sat empty and the field appeared to move only
  // where the pointer was. Fading on the box (not a radius) keeps the corners
  // populated; the CSS mask on the host does the final soft edge.
  vec2 q = abs(particle.xy) / uFieldSize;
  vFalloff = 1.0 - smoothstep(0.80, 1.0, max(q.x, q.y));

  gl_Position = projectionMatrix * modelViewMatrix * vec4(particle.xy, 0.0, 1.0);
  gl_PointSize = max(vScale * 7.0, 0.0) * uPixelRatio * uParticleScale * vFalloff;
}
`

const RENDER_FRAGMENT_SHADER = `
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec2 uRingPos;
uniform float uOpacity;
uniform float uTime;
uniform float uDarkMode;
varying float vScale;
varying float vVelocity;
varying float vFalloff;
varying vec2 vLocalPos;
${SIMPLEX_GLSL}

// Signed distance to a rounded box — the streak shape big particles morph into.
float sdRoundBox(in vec2 p, in vec2 b, in float r) {
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

void main() {
  float colorNoise = snoise(vec3(vLocalPos * 2.0 + vec2(74.66, 91.56), uTime * 0.5));
  colorNoise = (colorNoise + 1.0) * 0.5;

  vec2 uv = gl_PointCoord.xy - 0.5;
  float circle = smoothstep(0.5, 0.35, length(uv));

  // Big particles (near the ring, mid-bloom) stretch into a line oriented
  // radially away from the ring centre — a streak instead of a dot. Small
  // ambient particles stay round.
  float angle = atan(vLocalPos.y - uRingPos.y, vLocalPos.x - uRingPos.x);
  float c = cos(-angle), s = sin(-angle);
  vec2 ruv = mat2(c, s, -s, c) * uv;
  float line = smoothstep(0.06, 0.0, sdRoundBox(ruv, vec2(0.5, 0.07), 0.07));
  float stretch = smoothstep(0.45, 0.95, vScale);
  float sphere = mix(circle, line, stretch);

  // Three-stop gradient: the field sits on colour 1 and warms toward 3.
  float h = 0.8;
  float t = smoothstep(0.0, 0.75, pow(colorNoise, 2.0));
  vec3 color = mix(
    mix(uColor1, uColor2, t / h),
    mix(uColor2, uColor3, (t - h) / (1.0 - h)),
    step(h, t)
  );

  // On dark grounds, velocity darkens the tail for depth; on light it would
  // just wash out, so it is left flat.
  color = mix(color, color * clamp(vVelocity, 0.0, 1.0), uDarkMode);

  float alpha = uOpacity * sphere * vFalloff * smoothstep(0.1, 0.2, vScale);
  if (alpha < 0.01) discard;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), clamp(alpha, 0.0, 1.0));
}
`

function readColor(varName, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  return v || fallback
}

export default function HeroCanvas({ dark } = {}) {
  const mountRef = useRef(null)
  const { theme } = useTheme()
  // The hero sits on the page surface, so it follows the site theme. The CTA
  // card sits on an *inverse* surface (deliberately opposite the page), so it
  // passes its own actual background brightness instead.
  const resolvedDark = dark ?? theme === 'dark'

  useEffect(() => {
    const host = mountRef.current
    if (!host) return
    const isDark = resolvedDark
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setPixelRatio(dpr)
    renderer.setClearColor(0x000000, 0)
    host.appendChild(renderer.domElement)

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
    camera.position.z = 1
    const scene = new THREE.Scene()

    // Blue-noise placement over a square domain, then mapped to [-1, 1].
    const sampler = new PoissonDiskSampling({
      shape: [500, 500],
      minDistance: 6,
      maxDistance: 9,
      tries: 12,
    })
    const samples = sampler.fill()
    const count = Math.min(samples.length, SIM_SIZE * SIM_SIZE)

    const homeData = new Float32Array(SIM_SIZE * SIM_SIZE * 4)
    const uvData = new Float32Array(count * 2)
    for (let i = 0; i < count; i++) {
      const s = samples[i]
      const o = i * 4
      homeData[o + 0] = (s[0] / 250 - 1) * 1.1
      homeData[o + 1] = (s[1] / 250 - 1) * 1.1
      homeData[o + 2] = 0 // scale
      homeData[o + 3] = 0 // velocity
      // Sample texel centres so nearest-filter lookups land unambiguously.
      uvData[i * 2 + 0] = ((i % SIM_SIZE) + 0.5) / SIM_SIZE
      uvData[i * 2 + 1] = (Math.floor(i / SIM_SIZE) + 0.5) / SIM_SIZE
    }
    const homeTexture = new THREE.DataTexture(
      homeData, SIM_SIZE, SIM_SIZE, THREE.RGBAFormat, THREE.FloatType
    )
    homeTexture.needsUpdate = true

    const rtOptions = {
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
    }
    let rtRead = new THREE.WebGLRenderTarget(SIM_SIZE, SIM_SIZE, rtOptions)
    let rtWrite = new THREE.WebGLRenderTarget(SIM_SIZE, SIM_SIZE, rtOptions)

    const simScene = new THREE.Scene()
    const simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const simMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uPosition: { value: homeTexture },
        uHome: { value: homeTexture },
        uRingPos: { value: new THREE.Vector2(0, 0) },
        uRingRadius: { value: 0.175 },
        uRingWidth: { value: 0.107 },
        uRingWidthInner: { value: 0.05 },
        uDisplacement: { value: 0.1 },
        uTime: { value: 0 },
        resolution: { value: new THREE.Vector2(SIM_SIZE, SIM_SIZE) },
      },
      vertexShader: SIM_VERTEX_SHADER,
      fragmentShader: SIM_FRAGMENT_SHADER,
    })
    const simQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMaterial)
    simScene.add(simQuad)

    const particleGeometry = new THREE.BufferGeometry()
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    particleGeometry.setAttribute('uv', new THREE.BufferAttribute(uvData, 2))

    const renderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uPosition: { value: rtRead.texture },
        uPixelRatio: { value: dpr },
        uParticleScale: { value: 0.6 },
        uColor1: { value: new THREE.Color(readColor('--chart-1', '#3279f9')) },
        uColor2: { value: new THREE.Color(readColor('--chart-2', '#1baf7a')) },
        uColor3: { value: new THREE.Color(readColor('--chart-3', '#eda100')) },
        uRingPos: { value: new THREE.Vector2(0, 0) },
        // Matches the ±1.1 home placement below, so the box fade lands just
        // inside the outermost particles.
        uFieldSize: { value: new THREE.Vector2(1.1, 1.1) },
        uOpacity: { value: isDark ? 0.7 : 0.38 },
        uTime: { value: 0 },
        uDarkMode: { value: isDark ? 1 : 0 },
      },
      vertexShader: RENDER_VERTEX_SHADER,
      fragmentShader: RENDER_FRAGMENT_SHADER,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: isDark ? THREE.AdditiveBlending : THREE.NormalBlending,
    })
    scene.add(new THREE.Points(particleGeometry, renderMaterial))

    // Ring eases toward the pointer; with the pointer away it wanders on noise
    // so the field never sits completely still.
    const ring = new THREE.Vector2(0, 0)
    const pointer = new THREE.Vector2(0, 0)
    let pointerActive = false
    const clock = new THREE.Clock()
    let raf = null

    const resize = () => {
      const rect = host.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) renderer.setSize(rect.width, rect.height)
    }

    // Listened for on `window`, not on the host: the mount is
    // `pointer-events-none` (so it never swallows clicks on the hero CTAs) and
    // the hero copy sits on top of it, so a listener bound to the host would
    // never fire. Coordinates are mapped against the host's own rect, and the
    // pointer only counts as active while it is actually over that rect.
    const onPointerMove = (e) => {
      const rect = host.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const x = (e.clientX - rect.left) / rect.width
      const y = (e.clientY - rect.top) / rect.height
      pointerActive = x >= 0 && x <= 1 && y >= 0 && y <= 1
      if (pointerActive) pointer.set(x * 2 - 1, -(y * 2 - 1))
    }
    const onPointerLeave = () => {
      pointerActive = false
    }

    const drawFrame = () => {
      const dt = Math.min(clock.getDelta(), 0.1)
      const t = clock.getElapsedTime()

      // Idle wander uses offset sine pairs — cheap stand-in for a noise walk.
      const idleX = Math.sin(t * 0.31) * 0.35 + Math.sin(t * 0.17) * 0.12
      const idleY = Math.cos(t * 0.23) * 0.22 + Math.cos(t * 0.41) * 0.08
      const targetX = pointerActive ? pointer.x : idleX
      const targetY = pointerActive ? pointer.y : idleY
      // Tighter while tracking so the bloom reads as attached to the cursor;
      // slower on idle so the wander stays lazy.
      const ease = pointerActive ? 0.12 : 0.02
      ring.x += (targetX - ring.x) * ease
      ring.y += (targetY - ring.y) * ease

      simMaterial.uniforms.uTime.value = t
      simMaterial.uniforms.uRingPos.value.copy(ring)
      simMaterial.uniforms.uRingRadius.value =
        0.175 + Math.sin(t) * 0.03 + Math.cos(t * 3) * 0.02
      simMaterial.uniforms.uPosition.value = rtRead.texture

      renderer.setRenderTarget(rtWrite)
      renderer.render(simScene, simCamera)
      renderer.setRenderTarget(null)
      ;[rtRead, rtWrite] = [rtWrite, rtRead]

      renderMaterial.uniforms.uPosition.value = rtRead.texture
      renderMaterial.uniforms.uRingPos.value.copy(ring)
      renderMaterial.uniforms.uTime.value = t
      renderer.render(scene, camera)
      return dt
    }

    const loop = () => {
      drawFrame()
      raf = requestAnimationFrame(loop)
    }

    resize()
    if (reduced) {
      // Let the field settle to a static frame instead of animating.
      for (let i = 0; i < 60; i++) drawFrame()
    } else {
      loop()
    }

    let observer
    if (!reduced) {
      observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          if (!raf) {
            clock.getDelta() // drop the paused interval
            loop()
          }
        } else if (raf) {
          cancelAnimationFrame(raf)
          raf = null
        }
      })
      observer.observe(host)
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerleave', onPointerLeave)
    window.addEventListener('blur', onPointerLeave)

    let rzT
    const onResize = () => {
      clearTimeout(rzT)
      rzT = setTimeout(resize, 150)
    }
    window.addEventListener('resize', onResize)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      observer?.disconnect()
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerleave', onPointerLeave)
      window.removeEventListener('blur', onPointerLeave)
      window.removeEventListener('resize', onResize)
      clearTimeout(rzT)
      rtRead.dispose()
      rtWrite.dispose()
      homeTexture.dispose()
      particleGeometry.dispose()
      simQuad.geometry.dispose()
      simMaterial.dispose()
      renderMaterial.dispose()
      renderer.dispose()
      if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement)
    }
  }, [resolvedDark])

  return (
    <div
      ref={mountRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full [&>canvas]:block"
      style={{
        WebkitMaskImage:
          'radial-gradient(ellipse 90% 80% at 50% 45%, #000 45%, transparent 80%)',
        maskImage: 'radial-gradient(ellipse 90% 80% at 50% 45%, #000 45%, transparent 80%)',
      }}
    />
  )
}
