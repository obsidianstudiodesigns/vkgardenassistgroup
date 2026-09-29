// Ground-level lawn: image-based sky, dense shaded grass, vignette and film grain.
// The visitor's cursor is the mower: blades are cut and laid over in the direction of travel.
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { Sky } from 'three/addons/objects/Sky.js';

const canvas = document.getElementById('garden');
const hero = document.querySelector('.hero');
const hint = document.getElementById('heroHint');
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = window.matchMedia('(max-width: 760px)').matches;

// CC0 sky photos from Poly Haven to try, in order; falls back to a physical sky
const HDRI = small ? '1k' : '2k';
const SKY_CANDIDATES = [
  ...['kloofendal_48d_partly_cloudy_puresky', 'table_mountain_2_puresky', 'kloofendal_43d_clear_puresky', 'qwantani_afternoon_puresky']
    .map(id => `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/${HDRI}/${id}_${HDRI}.hdr`),
];

let renderer;
try {
  // Phones draw straight to the screen with the GPU's own (cheap, tile-based) MSAA;
  // desktops render off-screen for depth of field and grain.
  renderer = new THREE.WebGLRenderer({ canvas, antialias: small, powerPreference: 'high-performance' });
} catch (e) {
  document.documentElement.classList.add('no-webgl');
  throw e;
}
// Phones render at 1x and drop further if frames run slow (see adaptive quality in the loop)
const USE_POST = !small;
let DPR = Math.min(window.devicePixelRatio, 1.75);
renderer.setPixelRatio(DPR);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 900);
const CAM = new THREE.Vector3(0, 0.62, 2.6);
const LOOK = new THREE.Vector3(0, 0.12, -6);

// Shared lighting, filled in once the sky is known
const light = {
  sunDir: new THREE.Vector3(0.45, 0.35, -0.82).normalize(),
  sunColor: new THREE.Color(2.4, 2.05, 1.55),
  skyColor: new THREE.Color(0.55, 0.68, 0.9),
  fogColor: new THREE.Color(0.75, 0.8, 0.82),
};

/* ---------- Ground under and beyond the grass ---------- */
const groundTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3f5a22'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const v = Math.random();
    g.fillStyle = v < 0.5 ? `rgba(28,45,14,${0.25 + v * 0.3})` : v < 0.9 ? `rgba(98,128,48,${0.2 + v * 0.15})` : 'rgba(150,140,80,.35)';
    g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 5);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(160, 160);
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
})();
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(700, 700).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ map: groundTex, color: 0xffffff, roughness: 1 })
);
scene.add(ground);
// Direct sun on the far lawn, matched to the sun found in the sky photo
const sunLight = new THREE.DirectionalLight(0xffffff, 1);
scene.add(sunLight);

/* ---------- Grass blades ---------- */
const BLADES = small ? 20000 : 95000;
const offsets = new Float32Array(BLADES * 3);
const shape = new Float32Array(BLADES * 4); // rotation, height, width, seed
const cuts = new Float32Array(BLADES).fill(1);
const lays = new Float32Array(BLADES * 2);
const scatter = aspect => {
  const dMin = 1.1, dMax = 30;
  // Match the camera: portrait screens use a wider lens (see resize)
  const hw = Math.tan(THREE.MathUtils.degToRad(aspect < 1 ? 23 : 16)) * aspect * 1.4;
  for (let i = 0; i < BLADES; i++) {
    const d = dMin + (dMax - dMin) * Math.pow(Math.random(), 2.1);
    const x = (Math.random() * 2 - 1) * (d + 0.6) * hw;
    offsets[i * 3] = x;
    offsets[i * 3 + 2] = CAM.z - d;
    const far = (1 + d * 0.11) * (small ? 1.35 : 1); // fewer, slightly wider blades on phones
    const seed = Math.random();
    shape[i * 4] = Math.random() * Math.PI * 2;
    shape[i * 4 + 1] = (0.085 + Math.random() * 0.075) * (seed > 0.96 ? 1.35 : 1);
    shape[i * 4 + 2] = (0.0042 + Math.random() * 0.0028) * far;
    shape[i * 4 + 3] = seed;
  }
};
scatter(innerWidth / innerHeight);

const bladeBase = new THREE.PlaneGeometry(1, 1, 1, 5);
const grassGeo = new THREE.InstancedBufferGeometry();
grassGeo.index = bladeBase.index;
grassGeo.setAttribute('position', bladeBase.attributes.position);
grassGeo.setAttribute('uv', bladeBase.attributes.uv);
const offAttr = new THREE.InstancedBufferAttribute(offsets, 3);
const shapeAttr = new THREE.InstancedBufferAttribute(shape, 4);
const cutAttr = new THREE.InstancedBufferAttribute(cuts, 1).setUsage(THREE.DynamicDrawUsage);
const layAttr = new THREE.InstancedBufferAttribute(lays, 2).setUsage(THREE.DynamicDrawUsage);
grassGeo.setAttribute('aOffset', offAttr);
grassGeo.setAttribute('aShape', shapeAttr);
grassGeo.setAttribute('aCut', cutAttr);
grassGeo.setAttribute('aLay', layAttr);
grassGeo.instanceCount = BLADES;

const grassMat = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  uniforms: {
    uTime: { value: 0 },
    uWindDir: { value: new THREE.Vector2(0.8, -0.6).normalize() },
    uCursor: { value: new THREE.Vector3(0, -99, 0) },
    uSunDir: { value: light.sunDir },
    uSunColor: { value: light.sunColor },
    uSkyColor: { value: light.skyColor },
    uFogColor: { value: light.fogColor },
    uFogDensity: { value: 0.016 },
    uCamPos: { value: camera.position },
  },
  vertexShader: /* glsl */`
    attribute vec3 aOffset; attribute vec4 aShape; attribute float aCut; attribute vec2 aLay;
    uniform float uTime; uniform vec2 uWindDir; uniform vec3 uCursor;
    varying vec3 vPos; varying vec3 vN; varying float vT; varying float vSeed; varying float vCut;

    float n2(vec2 p) { return sin(p.x * 1.7 + sin(p.y * 1.3)) * sin(p.y * 1.1 + sin(p.x * 0.9)); }

    void main() {
      float t = uv.y;
      float rot = aShape.x, h = aShape.y * aCut, w = aShape.z, seed = aShape.w;
      vec2 face = vec2(cos(rot), sin(rot));
      vec3 side = vec3(-face.y, 0.0, face.x);

      // Natural lean, rolling gusts, flutter, mower lay and cursor push
      float gust = n2(aOffset.xz * 0.35 - uWindDir * uTime * 0.9) * 0.5 + 0.5;
      vec2 wind = uWindDir * (0.12 + 0.42 * gust * gust) + face.yx * sin(uTime * 3.1 + seed * 40.0) * 0.035;
      vec2 d = aOffset.xz - uCursor.xz;
      vec2 push = normalize(d + 1e-4) * smoothstep(0.45, 0.0, length(d)) * uCursor.y * 0.6;
      vec2 lean = face * (0.18 + seed * 0.45) + wind + aLay + push;
      float leanLen = min(length(lean), 1.3);
      lean = normalize(lean + 1e-5) * leanLen;

      float taper = 1.0 - pow(t, 1.6) * 0.92;
      vec3 p = aOffset + side * position.x * w * taper;
      p.xz += lean * t * t * h;
      p.y += t * h * (1.0 - 0.38 * leanLen * t);

      // Normal curls from facing toward up along the blade
      vec3 fn = normalize(vec3(face.x, 0.0, face.y) - vec3(lean.x, 0.0, lean.y) * 0.4);
      vN = normalize(mix(fn, vec3(0.0, 1.0, 0.0), 0.25 + 0.45 * t));
      vPos = p; vT = t; vSeed = seed; vCut = aCut;
      gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uSkyColor;
    uniform vec3 uFogColor; uniform float uFogDensity; uniform vec3 uCamPos;
    varying vec3 vPos; varying vec3 vN; varying float vT; varying float vSeed; varying float vCut;

    float n2(vec2 p) { return sin(p.x * 0.9 + sin(p.y * 0.7)) * sin(p.y * 0.6 + sin(p.x * 1.3)); }

    void main() {
      vec3 N = normalize(gl_FrontFacing ? vN : -vN);
      vec3 V = normalize(uCamPos - vPos);
      vec3 L = normalize(uSunDir);

      // Colour: dark thatch at the root, patchy greens toward the tip, a few dry blades
      float patchy = n2(vPos.xz * 0.55) * 0.5 + 0.5;
      vec3 tipA = vec3(0.105, 0.23, 0.035);
      vec3 tipB = vec3(0.2, 0.3, 0.055);
      vec3 tip = mix(tipA, tipB, patchy * 0.8 + vSeed * 0.2);
      tip = mix(tip, vec3(0.36, 0.32, 0.13), step(0.955, vSeed));
      vec3 root = vec3(0.025, 0.04, 0.012);
      vec3 albedo = mix(root, tip, smoothstep(0.0, 0.75, vT));
      // Fresh cut ends are paler
      albedo = mix(albedo, vec3(0.3, 0.36, 0.12), smoothstep(0.7, 1.0, vT) * (1.0 - smoothstep(0.35, 0.95, vCut)) * 0.8);

      float ao = mix(0.18, 1.0, smoothstep(0.0, 0.85, vT));
      float ndl = max(dot(N, L), 0.0);
      vec3 H = normalize(L + V);
      float spec = pow(max(dot(N, H), 0.0), 28.0) * 0.18 * vT;
      float trans = pow(max(dot(V, -L), 0.0), 3.0) * vT * 0.9;
      vec3 amb = uSkyColor * (0.35 + 0.35 * N.y);

      vec3 col = albedo * (amb + uSunColor * ndl * 0.9) * ao
               + uSunColor * (spec + trans * albedo * 2.2) * ao;

      float dist = length(uCamPos - vPos);
      float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
      col = mix(col, uFogColor, fog);
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
const grass = new THREE.Mesh(grassGeo, grassMat);
grass.frustumCulled = false;
scene.add(grass);

/* ---------- Clippings ---------- */
const CLIP = 500;
const clipPos = new Float32Array(CLIP * 3).fill(-99);
const clipVel = new Float32Array(CLIP * 3);
const clipLife = new Float32Array(CLIP);
let clipNext = 0;
const clipGeo = new THREE.BufferGeometry();
clipGeo.setAttribute('position', new THREE.BufferAttribute(clipPos, 3).setUsage(THREE.DynamicDrawUsage));
const clips = new THREE.Points(clipGeo, new THREE.PointsMaterial({ color: 0x6f8f35, size: 0.012, sizeAttenuation: true }));
clips.frustumCulled = false;
scene.add(clips);
const spawnClip = (x, z, dx, dz) => {
  const i = clipNext++ % CLIP;
  clipPos.set([x, 0.05, z], i * 3);
  clipVel.set([dx * 0.8 + (Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.8, dz * 0.8 + (Math.random() - 0.5) * 0.6], i * 3);
  clipLife[i] = 1;
};

/* ---------- Post (desktop): vignette, film grain, tone mapping ---------- */
const rt = USE_POST ? new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }) : null;
const postGeo = new THREE.BufferGeometry();
postGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
postGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
const postMat = new THREE.ShaderMaterial({
  uniforms: {
    tColor: { value: rt && rt.texture },
    uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tColor; uniform vec2 uRes; uniform float uTime;
    varying vec2 vUv;
    void main() {
      vec3 col = texture2D(tColor, vUv).rgb;
      vec2 q = vUv - 0.5;
      col *= 1.0 - dot(q, q) * 0.6;
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      float g = fract(sin(dot(gl_FragCoord.xy + fract(uTime) * 91.7, vec2(12.9898, 78.233))) * 43758.5453);
      gl_FragColor.rgb += (g - 0.5) * 0.03;
    }`,
  depthTest: false, depthWrite: false,
});
const postScene = new THREE.Scene();
const postQuad = new THREE.Mesh(postGeo, postMat);
postQuad.frustumCulled = false;
postScene.add(postQuad);
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

/* ---------- Sky: photo if we can get one, physical sky otherwise ---------- */
const pmrem = new THREE.PMREMGenerator(renderer);
const DESIRED_SUN_AZ = -Math.PI / 2 + 0.55; // ahead and to the right, so the lawn is backlit

const useHdr = tex => {
  const { data, width: W, height: Hh } = tex.image;
  // Half-float pixels (filterable on phones) are decoded here just for analysis
  const px = data instanceof Uint16Array ? k => THREE.DataUtils.fromHalfFloat(data[k]) : k => data[k];
  // Find the sun (brightest pixel) and the average sky and horizon colours
  let best = 0, bu = 0.5, bv = 0.7;
  const sky = [0, 0, 0], hor = [0, 0, 0];
  let skyN = 0, horN = 0;
  const step = small ? 3 : 2;
  for (let y = 0; y < Hh; y += step) {
    const v = 1 - (y + 0.5) / Hh;
    for (let x = 0; x < W; x += step) {
      const i = (y * W + x) * 4;
      const r = px(i), g = px(i + 1), b = px(i + 2);
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum > best) { best = lum; bu = (x + 0.5) / W; bv = v; }
      if (v > 0.55 && lum < 8) { sky[0] += r; sky[1] += g; sky[2] += b; skyN++; }
      if (v > 0.5 && v < 0.53 && lum < 8) { hor[0] += r; hor[1] += g; hor[2] += b; horN++; }
    }
  }
  const lat = (bv - 0.5) * Math.PI, lon = (bu - 0.5) * Math.PI * 2;
  const texAz = lon;
  const rotY = DESIRED_SUN_AZ - texAz;
  if (scene.backgroundRotation) scene.backgroundRotation.set(0, -rotY, 0);
  if (scene.environmentRotation) scene.environmentRotation.set(0, -rotY, 0);
  light.sunDir.set(Math.cos(DESIRED_SUN_AZ) * Math.cos(lat), Math.max(Math.sin(lat), 0.12), Math.sin(DESIRED_SUN_AZ) * Math.cos(lat)).normalize();
  const i = (Math.floor((1 - bv) * Hh) * W + Math.floor(bu * W)) * 4;
  const sr = px(i), sg = px(i + 1), sb = px(i + 2);
  const sm = Math.max(sr, sg, sb, 1e-3);
  light.sunColor.setRGB(sr / sm, sg / sm, sb / sm).multiplyScalar(2.6);
  if (skyN) light.skyColor.setRGB(sky[0] / skyN, sky[1] / skyN, sky[2] / skyN).multiplyScalar(1.1);
  if (horN) light.fogColor.setRGB(hor[0] / horN, hor[1] / horN, hor[2] / horN);

  tex.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = tex;
  scene.backgroundIntensity = 0.8; // keeps cloud highlights from clipping to white
  scene.environment = pmrem.fromEquirectangular(tex).texture;
};

const usePhysicalSky = () => {
  const sky = new Sky();
  sky.scale.setScalar(800);
  const u = sky.material.uniforms;
  u.turbidity.value = 5.5; u.rayleigh.value = 1.4; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;
  const elev = THREE.MathUtils.degToRad(9);
  light.sunDir.set(Math.cos(DESIRED_SUN_AZ) * Math.cos(elev), Math.sin(elev), Math.sin(DESIRED_SUN_AZ) * Math.cos(elev));
  u.sunPosition.value.copy(light.sunDir);
  light.sunColor.setRGB(2.6, 1.9, 1.2);
  light.skyColor.setRGB(0.5, 0.6, 0.78);
  light.fogColor.setRGB(0.82, 0.78, 0.7);
  const envScene = new THREE.Scene(); envScene.add(sky.clone());
  scene.environment = pmrem.fromScene(envScene).texture;
  scene.add(sky);
};

const loadSky = async () => {
  // Half float, not full float: many phone GPUs can't filter 32-bit float textures and draw them black
  const loader = new RGBELoader().setDataType(THREE.HalfFloatType);
  for (const url of SKY_CANDIDATES) {
    try {
      const tex = await Promise.race([
        loader.loadAsync(url),
        new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 9000)),
      ]);
      useHdr(tex);
      return;
    } catch (e) { /* try the next one */ }
  }
  usePhysicalSky();
};

/* ---------- Layout ---------- */
let W = 1, H = 1;
const resize = () => {
  W = hero.clientWidth; H = hero.clientHeight;
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  // Portrait screens: step back and widen so the lawn still reads as a lawn
  camera.fov = camera.aspect < 1 ? 46 : 32;
  camera.updateProjectionMatrix();
  if (rt) {
    rt.setSize(Math.floor(W * DPR), Math.floor(H * DPR));
    postMat.uniforms.uRes.value.set(W * DPR, H * DPR);
  }
};
resize();
new ResizeObserver(resize).observe(hero);

/* ---------- Pointer = mower ---------- */
const ndc = new THREE.Vector2(0, -0.5);
const ray = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitNow = new THREE.Vector3(), hitPrev = new THREE.Vector3();
let pointerOn = false, hasPrev = false, cutTotal = 0, anyCut = false;
const setNdc = e => {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
};
canvas.addEventListener('pointermove', e => { setNdc(e); pointerOn = true; });
canvas.addEventListener('pointerleave', () => { pointerOn = false; hasPrev = false; });
hero.addEventListener('pointermove', e => { if (e.target !== canvas) setNdc(e); });

const mow = (ax, az, bx, bz) => {
  const sx = bx - ax, sz = bz - az;
  const len2 = sx * sx + sz * sz;
  if (len2 < 1e-6) return;
  const len = Math.sqrt(len2), dx = sx / len, dz = sz / len;
  const R = 0.2 + 0.012 * Math.abs(CAM.z - bz); // wider cut further away so it still reads
  const R2 = R * R;
  const minX = Math.min(ax, bx) - R, maxX = Math.max(ax, bx) + R, minZ = Math.min(az, bz) - R, maxZ = Math.max(az, bz) + R;
  let spawned = 0;
  for (let i = 0; i < BLADES; i++) {
    const x = offsets[i * 3], z = offsets[i * 3 + 2];
    if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
    const t = Math.max(0, Math.min(1, ((x - ax) * sx + (z - az) * sz) / len2));
    const ex = x - (ax + sx * t), ez = z - (az + sz * t);
    if (ex * ex + ez * ez > R2) continue;
    if (cuts[i] > 0.55) {
      cutTotal++;
      if (spawned < 8 && Math.random() < 0.08) { spawnClip(x, z, dx, dz); spawned++; }
    }
    cuts[i] = 0.34;
    lays[i * 2] = dx * 0.75; lays[i * 2 + 1] = dz * 0.75;
    anyCut = true;
  }
};

/* ---------- Loop ---------- */
const clock = new THREE.Clock();
let time = 0, paused = false, ready = false;
// Adaptive quality: after warm-up, if frames average slower than ~40fps, step down.
// Resolution never drops below 1x (that's what made the grass look pixelated); after that
// it thins the grass, and as a last resort caps the frame rate at 30.
let perfFrames = -30, perfTime = 0, perfSettled = false, fpsCap = false, lastDraw = 0, thinned = false;
const checkPerf = raw => {
  if (perfSettled) return;
  if (++perfFrames <= 0) return;
  perfTime += raw;
  if (perfFrames < 45) return;
  const avg = perfTime / perfFrames;
  perfFrames = 0; perfTime = 0;
  if (avg <= 1 / 40) { perfSettled = true; return; }
  if (DPR > 1) {
    DPR = Math.max(1, DPR * 0.85);
    renderer.setPixelRatio(DPR);
    resize();
  } else if (!thinned) {
    thinned = true;
    grassGeo.instanceCount = Math.floor(BLADES * 0.65);
  } else {
    fpsCap = true;
    perfSettled = true;
  }
};
const frame = () => {
  requestAnimationFrame(frame);
  if (!ready) return;
  if (document.hidden || window.scrollY > hero.offsetHeight + 40) { paused = true; return; }
  if (paused) { paused = false; clock.getDelta(); }
  if (fpsCap) {
    const now = performance.now();
    if (now - lastDraw < 1000 / 31) return;
    lastDraw = now;
  }
  const raw = clock.getDelta();
  checkPerf(raw);
  const dt = Math.min(raw, 0.05);
  if (!reduce) time += dt;

  // Camera: still, with a breath of parallax
  const px = reduce ? 0 : ndc.x * 0.05, py = reduce ? 0 : ndc.y * 0.025;
  camera.position.set(CAM.x + px, CAM.y + py, CAM.z);
  // Portrait tilts down so the lawn, not the sky, fills the tall screen
  camera.lookAt(LOOK.x, camera.aspect < 1 ? -0.84 : LOOK.y, LOOK.z);
  camera.updateMatrixWorld();

  // Mowing
  let cursorOn = false;
  if (pointerOn) {
    ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(groundPlane, hitNow) && CAM.z - hitNow.z < 24) {
      cursorOn = true;
      if (hasPrev) mow(hitPrev.x, hitPrev.z, hitNow.x, hitNow.z);
      hitPrev.copy(hitNow); hasPrev = true;
    } else hasPrev = false;
  }
  grassMat.uniforms.uCursor.value.set(hitNow.x, cursorOn ? 1 : 0, hitNow.z);

  // Regrow slowly
  if (anyCut) {
    anyCut = false;
    const g = dt * 0.02, k = 1 - dt * 0.02;
    for (let i = 0; i < BLADES; i++) {
      const c = cuts[i];
      if (c >= 1) continue;
      cuts[i] = Math.min(1, c + g);
      lays[i * 2] *= k; lays[i * 2 + 1] *= k;
      anyCut = true;
    }
    cutAttr.needsUpdate = true; layAttr.needsUpdate = true;
  }
  if (cutTotal > 1500 && hint && !hint.classList.contains('is-done')) hint.classList.add('is-done');

  for (let i = 0; i < CLIP; i++) {
    if (clipLife[i] <= 0) continue;
    clipLife[i] -= dt * 1.3;
    clipVel[i * 3 + 1] -= 4.5 * dt;
    clipPos[i * 3] += clipVel[i * 3] * dt;
    clipPos[i * 3 + 1] = Math.max(0.01, clipPos[i * 3 + 1] + clipVel[i * 3 + 1] * dt);
    clipPos[i * 3 + 2] += clipVel[i * 3 + 2] * dt;
    if (clipLife[i] <= 0) clipPos[i * 3 + 1] = -99;
  }
  clipGeo.attributes.position.needsUpdate = true;

  grassMat.uniforms.uTime.value = time;
  postMat.uniforms.uTime.value = time;
  if (USE_POST) {
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCam);
  } else {
    renderer.render(scene, camera);
  }
};

scene.fog = new THREE.FogExp2(light.fogColor, 0.016);
loadSky().then(() => {
  scene.fog.color.copy(light.fogColor);
  sunLight.position.copy(light.sunDir).multiplyScalar(50);
  sunLight.color.copy(light.sunColor).multiplyScalar(1 / 2.6);
  sunLight.intensity = 2.2;
  grassMat.uniforms.uFogColor.value.copy(light.fogColor);
  ready = true;
  clock.getDelta();
  hero.classList.add('is-ready');
});
frame();
