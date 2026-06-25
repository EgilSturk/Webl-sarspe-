import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

clearTimeout(window.__emergencyTimer);

// ── Config ────────────────────────────────────────────────────────────────────
const HEDGEHOG_URL   = './assets/hedgehog.glb';
const TREE_URL       = './assets/tree.glb';
const GROUND_TEX_URL = 'https://d8j0ntlcm91z4.cloudfront.net/user_3Aj4UpTS3to1n1H7M2bIRV76drb/hf_20260625_141421_6abab39d-6fa3-4dfc-ba52-0fda3bfe5530.png';
const MUSIC_URL      = 'https://d8j0ntlcm91z4.cloudfront.net/user_3Aj4UpTS3to1n1H7M2bIRV76drb/hf_20260625_141450_8c0d6f66-dfa9-49f9-9072-ed7afc41516c.m4a';
const COLLECT_URL    = 'https://d8j0ntlcm91z4.cloudfront.net/user_3Aj4UpTS3to1n1H7M2bIRV76drb/hf_20260625_141452_d51b6392-abad-4eff-ac73-df6076365ec5.mp3';
const WORLD        = 22;
const SPEED        = 6.5;
const BASE_DRAIN   = 0.028;
const DRAIN_SCALE  = 0.00005;
const RESTORE      = 0.30;
const MAX_FOOD     = 8;
const COLLECT_R    = 1.6;
const MAGNET_R     = 3.2;   // food gets pulled toward hedgehog within this range
const STEP         = 1 / 60;
const DEV          = new URLSearchParams(location.search).has('dev');
const DPR_CAP      = 1.5;
const SNIFF_RANGE  = 10;
const SNIFF_CD     = 2.5;
const COMBO_WINDOW = 2.0;
const GOLDEN_CHANCE = 0.15;
const GOLDEN_LIFE   = 7.0;   // seconds before golden food disappears

// ── DOM refs ──────────────────────────────────────────────────────────────────
const elScore    = document.getElementById('score');
const elLevel    = document.getElementById('level');
const elFill     = document.getElementById('hunger-fill');
const elOverlay  = document.getElementById('overlay');
const elStartBtn = document.getElementById('start-btn');
const elOvTitle  = document.getElementById('ov-title');
const elOvDesc   = document.getElementById('ov-desc');
const elOvHint   = document.getElementById('ov-hint');
const elOvScore  = document.getElementById('ov-score');
const elOvHi     = document.getElementById('ov-hi');
const elOvEmoji  = document.getElementById('ov-emoji');
const elLoading  = document.getElementById('loading');
const elLoadMsg  = document.getElementById('load-msg');
const elProgFill = document.getElementById('prog-fill');
const elDev      = document.getElementById('dev');
const elJoyBase  = document.getElementById('joy-base');
const elJoyKnob  = document.getElementById('joy-knob');
const elBtnSniff = document.getElementById('btn-sniff');
const elVignette = document.getElementById('vignette');
const elCombo    = document.getElementById('combo');

// ── Renderer ──────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, DPR_CAP));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.insertBefore(renderer.domElement, document.body.firstChild);

// ── Scene ─────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x8ec8e8, 0.013);

// ── Camera ────────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 90);
const CAM_OFFSET = new THREE.Vector3(0, 13, 10);
camera.position.copy(CAM_OFFSET);
camera.lookAt(0, 0, 0);
const camLookTarget = new THREE.Vector3();
let shakeAmt = 0;

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
addEventListener('blur',  () => { paused = true; });
addEventListener('focus', () => { paused = false; lastTs = performance.now(); });

// ── Sky dome ──────────────────────────────────────────────────────────────────
scene.add(new THREE.Mesh(
  new THREE.SphereGeometry(80, 20, 10),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      uTop:    { value: new THREE.Color(0x1a55aa) },
      uMid:    { value: new THREE.Color(0x3d99d8) },
      uHorizon:{ value: new THREE.Color(0x9ddcf0) },
    },
    vertexShader: `varying vec3 vPos; void main(){ vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 uTop,uMid,uHorizon; varying vec3 vPos;
      void main(){
        float t=clamp(vPos.y/60.0,0.0,1.0);
        vec3 c=t<0.3?mix(uHorizon,uMid,t/0.3):mix(uMid,uTop,(t-0.3)/0.7);
        gl_FragColor=vec4(c,1.0);
      }`,
  })
));

// ── Lights ────────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffeedd, 0.40));
const sun = new THREE.DirectionalLight(0xfff5e0, 2.6);
sun.position.set(20, 32, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1; sun.shadow.camera.far = 80;
sun.shadow.camera.left = -32; sun.shadow.camera.right =  32;
sun.shadow.camera.bottom = -32; sun.shadow.camera.top =  32;
sun.shadow.bias = -0.0008;
scene.add(sun);
const skyFill = new THREE.DirectionalLight(0x88ccff, 0.6);
skyFill.position.set(-14, 20, -10);
scene.add(skyFill);
scene.add(new THREE.HemisphereLight(0x9ddcf0, 0x5aaa38, 0.5));

// ── Ground ────────────────────────────────────────────────────────────────────
const texLoader = new THREE.TextureLoader();
function buildGround(tex) {
  let mat;
  if (tex) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(10, 10);
    tex.colorSpace = THREE.SRGBColorSpace;
    mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
  } else {
    mat = new THREE.MeshStandardMaterial({ color: 0x3d7a30, roughness: 0.9 });
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(WORLD * 2, WORLD * 2), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  scene.add(mesh);
}
texLoader.load(GROUND_TEX_URL, buildGround, undefined, () => buildGround(null));

// ── Trees + collision obstacles ────────────────────────────────────────────────
const treeObstacles = []; // { x, z, r } — filled when trees are placed

function placeTreesFromTemplate(template) {
  const bbox = new THREE.Box3().setFromObject(template);
  const sz   = bbox.getSize(new THREE.Vector3());
  const baseScale = 5.0 / sz.y;
  template.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = false; } });

  const rng = seededRNG(42);

  // ── Inner trees (on the playing field) ────────────────────────────────────
  const innerPositions = [];
  for (let attempt = 0; attempt < 200 && innerPositions.length < 14; attempt++) {
    const a = rng() * Math.PI * 2;
    const r = 5 + rng() * (WORLD - 8);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    // Minimum separation between trees
    if (innerPositions.some(p => (p.x - x) ** 2 + (p.z - z) ** 2 < 25)) continue;
    innerPositions.push({ x, z });
  }
  for (const pos of innerPositions) {
    const clone = template.clone(true);
    const s = baseScale * (0.7 + rng() * 0.5);
    clone.scale.setScalar(s);
    const cb = new THREE.Box3().setFromObject(clone);
    clone.position.set(pos.x, -cb.min.y, pos.z);
    clone.rotation.y = rng() * Math.PI * 2;
    scene.add(clone);
    treeObstacles.push({ x: pos.x, z: pos.z, r: 0.65 });
  }

  // ── Boundary trees (backdrop, no collision) ────────────────────────────────
  for (let i = 0; i < 14; i++) {
    const a   = (i / 14) * Math.PI * 2 + rng() * 0.25;
    const rad = WORLD + 2.0 + rng() * 4.0;
    const clone = template.clone(true);
    const s = baseScale * (0.85 + rng() * 0.6);
    clone.scale.setScalar(s);
    const cb = new THREE.Box3().setFromObject(clone);
    clone.position.set(Math.cos(a) * rad, -cb.min.y, Math.sin(a) * rad);
    clone.rotation.y = rng() * Math.PI * 2;
    scene.add(clone);
  }
}

// Procedural fallback trees (removed when GLB loads)
const treeGroup = new THREE.Group();
{
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.95 });
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.36, 2.0, 7);
  const leafGeo  = new THREE.SphereGeometry(1.15, 8, 6);
  const pineGeo  = new THREE.ConeGeometry(1.05, 2.0, 8);
  const leafCols = [0x2a6020, 0x357025, 0x225018, 0x2e6828];
  const pineCols = [0x1a4810, 0x245018, 0x1c4012, 0x20561a];
  const rng = seededRNG(42);
  for (let i = 0; i < 40; i++) {
    const a   = (i / 40) * Math.PI * 2 + rng() * 0.2;
    const rad = WORLD + 1.8 + rng() * 2.8;
    const x   = Math.cos(a) * rad, z = Math.sin(a) * rad;
    const h   = 1.6 + rng() * 1.5;
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, h * 0.45, z); trunk.scale.y = h / 2.0;
    treeGroup.add(trunk);
    if (rng() > 0.45) {
      const mat = new THREE.MeshStandardMaterial({ color: pineCols[i % 4], roughness: 0.85 });
      for (let t = 0; t < 3; t++) {
        const c = new THREE.Mesh(pineGeo, mat);
        c.scale.set(0.95 - t * 0.2, 0.85, 0.95 - t * 0.2);
        c.position.set(x, h * 0.78 + t * 0.95, z);
        treeGroup.add(c);
      }
    } else {
      const mat = new THREE.MeshStandardMaterial({ color: leafCols[i % 4], roughness: 0.85 });
      const top = new THREE.Mesh(leafGeo, mat);
      top.scale.set(0.9 + rng() * 0.45, 1.15 + rng() * 0.5, 0.9 + rng() * 0.45);
      top.position.set(x, h * 0.9 + 1.55, z);
      treeGroup.add(top);
      if (rng() > 0.45) {
        const top2 = new THREE.Mesh(leafGeo, mat);
        top2.scale.setScalar(0.55 + rng() * 0.2);
        top2.position.set(x + rng() * 0.7, h * 0.9 + 3.0, z + rng() * 0.7);
        treeGroup.add(top2);
      }
    }
  }
}
scene.add(treeGroup);
new GLTFLoader().load(TREE_URL, (gltf) => {
  scene.remove(treeGroup);
  placeTreesFromTemplate(gltf.scene);
});

// ── Grass tufts (3D blade clusters) ──────────────────────────────────────────
{
  // Build a grass-tuft geometry: 6 tapered blades fanned at different angles
  const verts = [], normals = [], uvs = [], indices = [];
  const BLADES = 6, H = 0.38, BW = 0.038;
  for (let b = 0; b < BLADES; b++) {
    const angle = (b / BLADES) * Math.PI;
    const lean  = 0.10 + (b % 3) * 0.06; // each blade leans a bit differently
    const ax = Math.cos(angle), az = Math.sin(angle);
    const lx = Math.cos(angle + 0.4) * lean, lz = Math.sin(angle + 0.4) * lean;
    const base = verts.length / 3;
    // bottom-left, bottom-right, top (tapered triangle = realistic blade)
    verts.push(-ax*BW, 0,      -az*BW,
                ax*BW, 0,       az*BW,
                lx,    H*0.55, lz,        // mid-left  (gives blade width midway)
               -lx,    H*0.55,-lz,        // mid-right
                (lx+(-lx))*0.5, H, (lz+(-lz))*0.5); // tip
    uvs.push(0,0, 1,0, 0.2,0.55, 0.8,0.55, 0.5,1);
    // simple upward-ish normals (will be recomputed)
    for (let n = 0; n < 5; n++) normals.push(0, 1, 0);
    // Two triangles forming the lower half, two for the upper taper
    indices.push(
      base,base+1,base+2, base,base+2,base+3,  // lower quad
      base+3,base+2,base+4,                      // upper triangle
      // back faces
      base+2,base+1,base, base+3,base+2,base, base+4,base+2,base+3
    );
  }
  const tGeo = new THREE.BufferGeometry();
  tGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts,   3));
  tGeo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
  tGeo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs,     2));
  tGeo.setIndex(indices);
  tGeo.computeVertexNormals();

  const tMat = new THREE.MeshStandardMaterial({
    color: 0x4aaa28, roughness: 0.9, side: THREE.DoubleSide,
    vertexColors: false,
  });
  const COUNT = 420;
  const gInst = new THREE.InstancedMesh(tGeo, tMat, COUNT);
  const d = new THREE.Object3D(), rg = seededRNG(91);
  for (let i = 0; i < COUNT; i++) {
    d.position.set((rg() * 2 - 1) * (WORLD - 1.2), 0, (rg() * 2 - 1) * (WORLD - 1.2));
    d.rotation.y = rg() * Math.PI * 2;
    d.scale.setScalar(0.55 + rg() * 1.0);
    d.updateMatrix(); gInst.setMatrixAt(i, d.matrix);
  }
  gInst.instanceMatrix.needsUpdate = true;
  scene.add(gInst);
}

// ── Pebbles ───────────────────────────────────────────────────────────────────
const pebbleInst = new THREE.InstancedMesh(
  new THREE.SphereGeometry(0.11, 5, 4),
  new THREE.MeshStandardMaterial({ color: 0x9a8878, roughness: 0.9 }), 50
);
const dp = new THREE.Object3D(), rp = seededRNG(77);
for (let i = 0; i < 50; i++) {
  dp.position.set((rp() * 2 - 1) * (WORLD - 1.5), 0.07, (rp() * 2 - 1) * (WORLD - 1.5));
  dp.scale.setScalar(0.5 + rp() * 1.0); dp.rotation.y = rp() * Math.PI * 2;
  dp.updateMatrix(); pebbleInst.setMatrixAt(i, dp.matrix);
}
pebbleInst.instanceMatrix.needsUpdate = true;
scene.add(pebbleInst);

// ── Flowers ───────────────────────────────────────────────────────────────────
const flowerCols = [0xffee55, 0xff88bb, 0xffffff, 0xff6644, 0xaa77ff];
const flowerGeo  = new THREE.CircleGeometry(0.18, 5);
const rf = seededRNG(55);
for (let i = 0; i < 90; i++) {
  const fl = new THREE.Mesh(flowerGeo, new THREE.MeshBasicMaterial({
    color: flowerCols[i % 5], side: THREE.DoubleSide,
  }));
  fl.position.set((rf() * 2 - 1) * (WORLD - 1.5), 0.04, (rf() * 2 - 1) * (WORLD - 1.5));
  fl.rotation.x = -Math.PI / 2 + (rf() - 0.5) * 0.3;
  fl.rotation.z = rf() * Math.PI * 2;
  scene.add(fl);
}

// ── Procedural hedgehog (fallback while GLB loads) ────────────────────────────
function makeProcHedgehog() {
  const root = new THREE.Group();
  const bodyMat  = new THREE.MeshStandardMaterial({ color: 0x9b6b40, roughness: 0.8 });
  const faceMat  = new THREE.MeshStandardMaterial({ color: 0xf0d5a8, roughness: 0.75 });
  const spineMat = new THREE.MeshStandardMaterial({ color: 0x2e2010, roughness: 0.6 });
  const eyeMat   = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.58, 14, 10), bodyMat);
  body.scale.set(1, 0.72, 1.12); body.position.y = 0.42; body.castShadow = true; root.add(body);
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), faceMat);
  snout.position.set(0, 0.36, 0.54); root.add(snout);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.075, 7, 6),
    new THREE.MeshStandardMaterial({ color: 0x1a0a0a, roughness: 0.3 }));
  nose.position.set(0, 0.38, 0.76); root.add(nose);
  for (const ex of [-0.15, 0.15]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.058, 7, 6), eyeMat);
    eye.position.set(ex, 0.52, 0.65); root.add(eye);
  }
  const spineGeo = new THREE.ConeGeometry(0.065, 0.5, 5);
  const lr = seededRNG(7);
  for (let i = 0; i < 30; i++) {
    const phi = Math.PI * 0.08 + lr() * Math.PI * 0.58, theta = lr() * Math.PI * 2;
    const sp  = new THREE.Mesh(spineGeo, spineMat);
    const dir = new THREE.Vector3(Math.sin(phi)*Math.cos(theta), Math.cos(phi), Math.sin(phi)*Math.sin(theta)*0.88-0.1).normalize();
    sp.position.copy(dir.clone().multiplyScalar(0.52)).add(new THREE.Vector3(0, 0.42, 0));
    sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    sp.castShadow = true; root.add(sp);
  }
  return root;
}

// ── GLB loader ────────────────────────────────────────────────────────────────
let hedgehogNode = null;
let procHedgehog = makeProcHedgehog();
scene.add(procHedgehog);
let modelReady = false;

const gltfLoader = new GLTFLoader();
setProgress(25);
gltfLoader.load(HEDGEHOG_URL,
  (gltf) => {
    hedgehogNode = gltf.scene;
    hedgehogNode.traverse(m => {
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; if (m.material) m.material.needsUpdate = true; }
    });
    const box = new THREE.Box3().setFromObject(hedgehogNode);
    const s   = 1.9 / Math.max(...box.getSize(new THREE.Vector3()).toArray());
    hedgehogNode.scale.setScalar(s);
    box.setFromObject(hedgehogNode);
    hedgehogNode.position.y = -box.min.y;
    scene.add(hedgehogNode); scene.remove(procHedgehog); procHedgehog = null;
    modelReady = true; setProgress(95); finishLoad();
  },
  (prog) => { if (prog.total > 0) setProgress(25 + (prog.loaded / prog.total) * 65); },
  () => { modelReady = true; setProgress(95); finishLoad(); }
);
loadAudioAsync();
const loadFallback = setTimeout(() => { modelReady = true; finishLoad(); }, 2000);

function setProgress(pct) { elProgFill.style.width = pct + '%'; }
function finishLoad() {
  if (!modelReady) return;
  clearTimeout(loadFallback); setProgress(100);
  setTimeout(() => { elLoading.style.display = 'none'; }, 350);
}

// ── Audio ─────────────────────────────────────────────────────────────────────
let audioCtx = null, musicBuf = null, sfxBuf = null, musicSrc = null;
async function loadAudioAsync() {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const [mr, sr] = await Promise.allSettled([
      fetch(MUSIC_URL).then(r  => r.ok  ? r.arrayBuffer()  : Promise.reject()),
      fetch(COLLECT_URL).then(r => r.ok ? r.arrayBuffer()  : Promise.reject()),
    ]);
    if (mr.status === 'fulfilled') musicBuf = await audioCtx.decodeAudioData(mr.value).catch(() => null);
    if (sr.status === 'fulfilled') sfxBuf   = await audioCtx.decodeAudioData(sr.value).catch(() => null);
  } catch (_) {}
}
function startMusic() {
  if (!audioCtx || !musicBuf) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (musicSrc) { try { musicSrc.stop(); } catch (_) {} }
  musicSrc = audioCtx.createBufferSource();
  musicSrc.buffer = musicBuf; musicSrc.loop = true;
  const g = audioCtx.createGain(); g.gain.value = 0.2;
  musicSrc.connect(g).connect(audioCtx.destination); musicSrc.start();
}
function stopMusic() { if (musicSrc) { try { musicSrc.stop(); } catch (_) {} musicSrc = null; } }
function playSfx(vol = 0.65) {
  if (!audioCtx || !sfxBuf) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const src = audioCtx.createBufferSource(); src.buffer = sfxBuf;
  const g   = audioCtx.createGain(); g.gain.value = vol;
  src.connect(g).connect(audioCtx.destination); src.start();
}

// ── Game state ────────────────────────────────────────────────────────────────
let hunger = 1.0, score = 0, level = 0;
let hiScore = +localStorage.getItem('hq_hi') || 0;
let running = false, paused = false;
let simTime = 0, acc = 0, lastTs = 0;
let fps = 0, fpsFrames = 0, fpsAt = 0;
let comboCount = 0, lastCollectTime = -99;
let moveTime = 0;

const hPos    = new THREE.Vector3();
const hFacing = new THREE.Quaternion();
const upVec   = new THREE.Vector3(0, 1, 0);
function activeHedgehog() { return hedgehogNode || procHedgehog; }

// ── Food system ───────────────────────────────────────────────────────────────
const FOOD_TYPES = [
  {
    label: 'Μούρα', pts: 10,
    make() {
      const g = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(
          new THREE.SphereGeometry(0.21 + Math.random() * 0.08, 10, 8),
          new THREE.MeshStandardMaterial({ color: 0xcc1a1a, emissive: 0xaa0000, emissiveIntensity: 0.55, roughness: 0.2, metalness: 0.1 })
        );
        m.position.set((Math.random()-0.5)*0.35, Math.random()*0.2, (Math.random()-0.5)*0.35);
        m.castShadow = true; g.add(m);
      }
      return g;
    }
  },
  {
    label: 'Μανιτάρι', pts: 15,
    make() {
      const g = new THREE.Group();
      g.add(Object.assign(new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.15, 0.4, 9),
        new THREE.MeshStandardMaterial({ color: 0xf5e6cc, roughness: 0.8 })
      ), { position: { x:0, y:0.2, z:0 } }));
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.46, 12, 6, 0, Math.PI*2, 0, Math.PI/2),
        new THREE.MeshStandardMaterial({ color: 0xff3d00, emissive: 0x881100, emissiveIntensity: 0.45, roughness: 0.45 })
      );
      cap.position.y = 0.5; g.add(cap);
      for (let s = 0; s < 3; s++) {
        const spot = new THREE.Mesh(new THREE.CircleGeometry(0.055, 6),
          new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
        const a = s * Math.PI * 2 / 3 + 0.3;
        spot.rotation.x = -Math.PI/2; spot.position.set(Math.cos(a)*0.22, 0.52, Math.sin(a)*0.18);
        g.add(spot);
      }
      return g;
    }
  },
  {
    label: 'Σκουλήκι', pts: 20,
    make() {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0xff78c8, emissive: 0x880040, emissiveIntensity: 0.5, roughness: 0.4 });
      for (let i = 0; i < 5; i++) {
        const seg = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), mat);
        const a = (i/4) * Math.PI * 1.6;
        seg.position.set(Math.cos(a)*0.28, 0.1 + Math.sin(i*1.2)*0.06, Math.sin(a)*0.2);
        seg.castShadow = true; g.add(seg);
      }
      return g;
    }
  },
  {
    label: 'Καλαμπόκι', pts: 12,
    make() {
      const g = new THREE.Group();
      const cob = new THREE.Mesh(
        new THREE.CylinderGeometry(0.17, 0.12, 0.68, 10),
        new THREE.MeshStandardMaterial({ color: 0xf5c430, emissive: 0x886600, emissiveIntensity: 0.45, roughness: 0.4 })
      );
      cob.position.y = 0.34; g.add(cob);
      const leaf = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.1, 0.34, 6),
        new THREE.MeshStandardMaterial({ color: 0x4aaa28, roughness: 0.8 }));
      leaf.position.y = 0.8; g.add(leaf);
      return g;
    }
  },
  {
    label: 'Βελανίδι', pts: 8,
    make() {
      const g = new THREE.Group();
      const nut = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0x8b5e2a, roughness: 0.55 }));
      nut.scale.y = 1.3; nut.position.y = 0.24; g.add(nut);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 5, 0, Math.PI*2, 0, Math.PI*0.45),
        new THREE.MeshStandardMaterial({ color: 0x4a3010, roughness: 0.9 }));
      cap.position.y = 0.42; g.add(cap);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.15, 5),
        new THREE.MeshStandardMaterial({ color: 0x3a2008, roughness: 0.9 }));
      stem.position.y = 0.58; g.add(stem);
      return g;
    }
  }
];

const foodItems = [];
const particles = [];

function makeGolden(mesh) {
  mesh.traverse(m => {
    if (!m.isMesh) return;
    m.material = m.material.clone();
    m.material.color.set(0xffd700);
    m.material.emissive.set(0xff9900);
    m.material.emissiveIntensity = 1.2;
    m.material.metalness = 0.6;
    m.material.roughness = 0.1;
  });
}

function spawnFoodItem(forceGolden = false) {
  const type = FOOD_TYPES[Math.floor(Math.random() * FOOD_TYPES.length)];
  const mesh = type.make();
  const isGolden = forceGolden || Math.random() < GOLDEN_CHANCE;
  if (isGolden) makeGolden(mesh);

  let x, z, tries = 0;
  do {
    x = (Math.random() * 2 - 1) * (WORLD - 2.5);
    z = (Math.random() * 2 - 1) * (WORLD - 2.5);
    tries++;
  } while (Math.hypot(x - hPos.x, z - hPos.z) < 4.5 && tries < 25);

  mesh.position.set(x, 0.45, z);
  scene.add(mesh);
  foodItems.push({
    mesh, type, baseY: 0.45,
    phase: Math.random() * Math.PI * 2,
    sniffPhase: 0,
    isGolden,
    age: 0,
    life: isGolden ? GOLDEN_LIFE : Infinity,
  });
}

// ── Particles ─────────────────────────────────────────────────────────────────
const partGeos = [
  new THREE.SphereGeometry(0.1, 4, 4),
  new THREE.SphereGeometry(0.07, 4, 4),
  new THREE.TetrahedronGeometry(0.09),
];
const partMats = [0xf5c842, 0xff8c00, 0xee2222, 0x88dd44, 0xff44cc, 0xffd700].map(c =>
  new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.7, transparent: true })
);

function spawnParticles(x, y, z, count = 14, golden = false) {
  for (let i = 0; i < count; i++) {
    const matIdx = golden ? 5 : (i % (partMats.length - 1));
    const m = new THREE.Mesh(partGeos[i % partGeos.length], partMats[matIdx].clone());
    m.position.set(x, y, z);
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * (golden ? 9 : 6),
      2.0 + Math.random() * (golden ? 6 : 4.5),
      (Math.random() - 0.5) * (golden ? 9 : 6)
    );
    scene.add(m);
    particles.push({ mesh: m, vel, life: 0.6 + Math.random() * 0.5, age: 0 });
  }
}

// ── Screen shake ──────────────────────────────────────────────────────────────
function triggerShake(power) { shakeAmt = Math.max(shakeAmt, power); }

// ── Sniff rings ───────────────────────────────────────────────────────────────
const sniffRings = [];
const sniffRingGeo = new THREE.RingGeometry(0.5, 0.85, 48);

function spawnSniffRings() {
  for (let wave = 0; wave < 3; wave++) {
    const mat = new THREE.MeshBasicMaterial({
      color: [0x44ddff, 0x88ffcc, 0xffffff][wave],
      transparent: true, opacity: 0.75,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const ring = new THREE.Mesh(sniffRingGeo, mat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.18;
    scene.add(ring);
    sniffRings.push({ mesh: ring, age: -wave * 0.18, life: 0.85 });
  }
}

// ── Sniff arrows ──────────────────────────────────────────────────────────────
const sniffArrows = [];
function showSniffArrows() {
  sniffArrows.forEach(a => a.el.remove()); sniffArrows.length = 0;
  const near = foodItems
    .filter(fi => fi.mesh.position.distanceTo(hPos) < SNIFF_RANGE)
    .sort((a, b) => a.mesh.position.distanceTo(hPos) - b.mesh.position.distanceTo(hPos))
    .slice(0, 5);
  near.forEach(fi => {
    const sc = worldToScreen(fi.mesh.position);
    const cx = innerWidth / 2, cy = innerHeight / 2;
    const angle = Math.atan2(sc.y - cy, sc.x - cx);
    const r = Math.min(innerWidth, innerHeight) * 0.36;
    const el = document.createElement('div');
    el.className = fi.isGolden ? 'sniff-arrow sniff-arrow-gold' : 'sniff-arrow';
    el.style.left = (cx + Math.cos(angle) * r) + 'px';
    el.style.top  = (cy + Math.sin(angle) * r) + 'px';
    el.style.transform = `translate(-50%,-50%) rotate(${angle * 180 / Math.PI + 90}deg)`;
    document.body.appendChild(el);
    sniffArrows.push({ el, age: 0, life: 2.5 });
  });
}

// ── Input ─────────────────────────────────────────────────────────────────────
const KEY_MAP = { KeyW:'u',ArrowUp:'u', KeyS:'d',ArrowDown:'d', KeyA:'l',ArrowLeft:'l', KeyD:'r',ArrowRight:'r' };
const PAD_MAP = { 12:'u', 13:'d', 14:'l', 15:'r' };
const held    = new Set();

addEventListener('keydown', e => {
  const c = KEY_MAP[e.code]; if (c) { held.add(c); e.preventDefault(); }
  if (e.code === 'Space') { doSniff(); e.preventDefault(); }
});
addEventListener('keyup', e => { const c = KEY_MAP[e.code]; if (c) held.delete(c); });

if (navigator.maxTouchPoints > 0 || 'ontouchstart' in window) {
  elJoyBase.style.display = 'flex';
  elBtnSniff.style.display = 'flex';
}

const joyState = { x: 0, z: 0 };
let joyPointerId = null;
const joyOrigin  = { x: 0, y: 0 };
const JOY_RADIUS = 48;

function moveJoy(cx, cy) {
  let dx = cx - joyOrigin.x, dy = cy - joyOrigin.y;
  const len = Math.hypot(dx, dy);
  if (len > JOY_RADIUS) { dx *= JOY_RADIUS / len; dy *= JOY_RADIUS / len; }
  elJoyKnob.style.transform = `translate(${dx}px,${dy}px)`;
  joyState.x = dx / JOY_RADIUS; joyState.z = dy / JOY_RADIUS;
}
function resetJoy() { joyPointerId = null; joyState.x = joyState.z = 0; elJoyKnob.style.transform = ''; }

elJoyBase.addEventListener('pointerdown', e => {
  if (joyPointerId !== null) return;
  joyPointerId = e.pointerId; elJoyBase.setPointerCapture(e.pointerId);
  const r = elJoyBase.getBoundingClientRect();
  joyOrigin.x = r.left + r.width / 2; joyOrigin.y = r.top + r.height / 2;
  moveJoy(e.clientX, e.clientY);
});
elJoyBase.addEventListener('pointermove', e => { if (e.pointerId === joyPointerId) moveJoy(e.clientX, e.clientY); });
elJoyBase.addEventListener('pointerup',     e => { if (e.pointerId === joyPointerId) resetJoy(); });
elJoyBase.addEventListener('pointercancel', e => { if (e.pointerId === joyPointerId) resetJoy(); });

function getGamepadAxes() {
  let x = 0, z = 0;
  for (const gp of navigator.getGamepads?.() ?? []) {
    if (!gp) continue;
    gp.buttons.forEach((b, i) => {
      if (!b.pressed) return;
      if (PAD_MAP[i]==='u') z -= 1; if (PAD_MAP[i]==='d') z += 1;
      if (PAD_MAP[i]==='l') x -= 1; if (PAD_MAP[i]==='r') x += 1;
    });
    if (Math.abs(gp.axes[0]) > 0.15) x += gp.axes[0];
    if (Math.abs(gp.axes[1]) > 0.15) z += gp.axes[1];
  }
  return { x, z };
}

// ── Sniff ─────────────────────────────────────────────────────────────────────
let sniffCooldown = 0;
elBtnSniff.addEventListener('pointerdown', e => { e.preventDefault(); doSniff(); });
elBtnSniff.addEventListener('click', doSniff);

function doSniff() {
  if (!running || sniffCooldown > 0) return;
  sniffCooldown = SNIFF_CD;
  spawnSniffRings();
  showSniffArrows();
  foodItems.forEach(fi => { if (fi.mesh.position.distanceTo(hPos) < SNIFF_RANGE) fi.sniffPhase = 1.5; });
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function worldToScreen(pos) {
  const v = pos.clone().project(camera);
  return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
}

function showPop(text, x, y, cls = 'score-pop') {
  const el = document.createElement('div');
  el.className = cls; el.textContent = text;
  el.style.left = (x - 24) + 'px'; el.style.top = (y - 32) + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 950);
}

function updateHUD() {
  elScore.textContent = score;
  if (elLevel) elLevel.textContent = level + 1;
  const pct = Math.max(0, Math.min(1, hunger));
  elFill.style.width = (pct * 100).toFixed(1) + '%';
  const r = pct > 0.5 ? Math.round((1 - pct) * 2 * 200 + 40) : 240;
  const g = pct > 0.5 ? 180 : Math.round(pct * 2 * 150 + 30);
  elFill.style.background = `linear-gradient(90deg,rgb(${r},${g},20),rgb(${Math.min(r+30,255)},${Math.min(g+50,255)},60))`;

  // Sniff button: show countdown or label
  elBtnSniff.style.opacity = sniffCooldown > 0 ? '0.5' : '1';
  elBtnSniff.textContent   = sniffCooldown > 0 ? Math.ceil(sniffCooldown) + 's' : 'Μύρισε';

  // Hunger vignette — pulses at critical levels
  if (elVignette) {
    const danger = Math.max(0, 0.38 - pct) / 0.38;
    const pulse  = pct < 0.18 ? Math.abs(Math.sin(simTime * 5.5)) * 0.45 : 0;
    elVignette.style.opacity = Math.min(0.95, danger * 0.8 + pulse).toFixed(3);
  }

  // Combo
  if (elCombo) {
    if (comboCount >= 2) {
      elCombo.textContent  = `x${comboCount} COMBO!`;
      elCombo.style.display = 'block';
    } else {
      elCombo.style.display = 'none';
    }
  }
}

// ── Game flow ─────────────────────────────────────────────────────────────────
elStartBtn.addEventListener('click',    startGame);
elStartBtn.addEventListener('touchend', e => { e.preventDefault(); startGame(); });

function startGame() {
  hunger = 1.0; score = 0; level = 0;
  sniffCooldown = 0; comboCount = 0; lastCollectTime = -99; moveTime = 0;
  running = true;

  foodItems.forEach(fi => scene.remove(fi.mesh)); foodItems.length = 0;
  particles.forEach(p  => scene.remove(p.mesh));  particles.length = 0;
  sniffRings.forEach(sr => scene.remove(sr.mesh)); sniffRings.length = 0;
  sniffArrows.forEach(a => a.el.remove());         sniffArrows.length = 0;

  hPos.set(0, 0, 0); hFacing.identity();
  const h = activeHedgehog();
  if (h) { h.position.set(0, 0, 0); h.quaternion.identity(); }

  for (let i = 0; i < MAX_FOOD; i++) spawnFoodItem();

  elOverlay.style.display = 'none';
  if (elVignette) elVignette.style.opacity = '0';
  if (elCombo)    elCombo.style.display = 'none';
  lastTs = performance.now();
  startMusic();
}

function endGame() {
  running = false; stopMusic();
  sniffArrows.forEach(a => a.el.remove()); sniffArrows.length = 0;
  if (elVignette) elVignette.style.opacity = '0';
  if (elCombo)    elCombo.style.display = 'none';
  if (score > hiScore) { hiScore = score; localStorage.setItem('hq_hi', hiScore); }

  elOvEmoji.textContent   = '😢';
  elOvTitle.textContent   = 'Πολύ Πεινασμένος!';
  elOvDesc.textContent    = 'Ο σκαντζόχοιρός σου έμεινε χωρίς φαγητό…';
  elOvHint.textContent    = '';
  elOvScore.textContent   = 'Σκορ: ' + score;
  elOvHi.textContent      = 'Ρεκόρ: ' + hiScore;
  elOvScore.style.display = '';
  elOvHi.style.display    = '';
  elStartBtn.textContent  = 'Παίξε Ξανά';
  elOverlay.style.display = 'flex';
}

// ── Simulation ────────────────────────────────────────────────────────────────
function update(dt) {
  if (!running) return;
  simTime += dt;

  // ── Movement ──
  let ix = 0, iz = 0;
  if (held.has('l')) ix -= 1; if (held.has('r')) ix += 1;
  if (held.has('u')) iz -= 1; if (held.has('d')) iz += 1;
  const gp = getGamepadAxes();
  ix += joyState.x + gp.x; iz += joyState.z + gp.z;
  const ilen = Math.hypot(ix, iz);
  if (ilen > 1) { ix /= ilen; iz /= ilen; }
  const moving = ilen > 0.05;

  // Speed ramp up when running continuously
  moveTime = moving ? Math.min(moveTime + dt, 1.5) : Math.max(0, moveTime - dt * 2.5);
  const speedMult = 1 + 0.3 * (moveTime / 1.5);

  if (moving) {
    hPos.x = Math.max(-WORLD, Math.min(WORLD, hPos.x + ix * SPEED * speedMult * dt));
    hPos.z = Math.max(-WORLD, Math.min(WORLD, hPos.z + iz * SPEED * speedMult * dt));
    // Nose always faces movement direction (instant)
    hFacing.setFromAxisAngle(upVec, Math.atan2(ix, iz));
  }
  // Tree collision: push hedgehog out of tree trunks
  for (const obs of treeObstacles) {
    const dx = hPos.x - obs.x, dz = hPos.z - obs.z;
    const dist2 = dx * dx + dz * dz;
    const minD  = obs.r + 0.45;
    if (dist2 < minD * minD && dist2 > 0.0001) {
      const inv = minD / Math.sqrt(dist2);
      hPos.x = obs.x + dx * inv;
      hPos.z = obs.z + dz * inv;
    }
  }

  const bob = moving ? Math.sin(simTime * 9) * 0.09 : 0;
  const h   = activeHedgehog();
  if (h) { h.position.set(hPos.x, bob, hPos.z); h.quaternion.copy(hFacing); }

  // Camera follows with smooth lag
  camera.position.lerp(
    new THREE.Vector3(hPos.x, 0, hPos.z).add(CAM_OFFSET),
    1 - Math.pow(0.003, dt)
  );
  // Screen shake decay + apply
  shakeAmt *= Math.pow(0.0001, dt);
  if (shakeAmt > 0.002) {
    camera.position.x += (Math.random() - 0.5) * shakeAmt;
    camera.position.y += (Math.random() - 0.5) * shakeAmt * 0.4;
  }
  camLookTarget.set(hPos.x, 0.5, hPos.z);
  camera.lookAt(camLookTarget);

  if (sniffCooldown > 0) sniffCooldown = Math.max(0, sniffCooldown - dt);

  // Sniff rings
  for (let i = sniffRings.length - 1; i >= 0; i--) {
    const sr = sniffRings[i]; sr.age += dt;
    if (sr.age < 0) continue;
    const t = sr.age / sr.life;
    if (t >= 1) { scene.remove(sr.mesh); sniffRings.splice(i, 1); continue; }
    sr.mesh.position.x = hPos.x; sr.mesh.position.z = hPos.z;
    sr.mesh.scale.setScalar(t * (SNIFF_RANGE / 0.7));
    sr.mesh.material.opacity = Math.sin(t * Math.PI) * 0.65;
  }

  // Sniff arrows fade
  for (let i = sniffArrows.length - 1; i >= 0; i--) {
    const sa = sniffArrows[i]; sa.age += dt;
    if (sa.age >= sa.life) { sa.el.remove(); sniffArrows.splice(i, 1); continue; }
    sa.el.style.opacity = (1 - sa.age / sa.life).toFixed(3);
  }

  // Food: animate, golden expiry, magnet, collection
  for (let i = foodItems.length - 1; i >= 0; i--) {
    const fi = foodItems[i];
    fi.age += dt;

    // Golden food: blink when < 2s left, expire
    if (fi.isGolden) {
      const remaining = fi.life - fi.age;
      if (remaining < 2.0) fi.mesh.visible = Math.sin(simTime * 18) > 0;
      if (fi.age >= fi.life) {
        scene.remove(fi.mesh); foodItems.splice(i, 1);
        spawnFoodItem(); continue;
      }
    }

    // Float + spin
    fi.mesh.position.y = fi.baseY + Math.sin(simTime * 2.1 + fi.phase) * 0.16;
    fi.mesh.rotation.y += dt * (fi.isGolden ? 2.5 : 1.2);
    if (fi.sniffPhase > 0) {
      fi.sniffPhase -= dt * 3;
      fi.mesh.position.y += Math.sin(fi.sniffPhase * Math.PI) * 0.8;
    }

    // Magnet: pull food toward hedgehog when close
    const dx = fi.mesh.position.x - hPos.x;
    const dz = fi.mesh.position.z - hPos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < MAGNET_R && dist > 0.1) {
      const pull = (1 - dist / MAGNET_R) * 5.5 * dt;
      fi.mesh.position.x -= (dx / dist) * pull;
      fi.mesh.position.z -= (dz / dist) * pull;
    }

    if (dist < COLLECT_R) {
      const sc  = worldToScreen(fi.mesh.position);
      const now = simTime;
      comboCount = (now - lastCollectTime < COMBO_WINDOW) ? comboCount + 1 : 1;
      lastCollectTime = now;
      const mult = comboCount >= 4 ? 4 : comboCount >= 3 ? 3 : comboCount >= 2 ? 2 : 1;
      const basePts = fi.isGolden ? fi.type.pts * 3 : fi.type.pts;
      const pts     = basePts * mult;

      showPop((fi.isGolden ? '⭐ ' : '') + (mult > 1 ? `x${mult} ` : '') + '+' + pts, sc.x, sc.y);
      showPop(fi.type.label, sc.x, sc.y + 28, 'food-name-pop');
      spawnParticles(fi.mesh.position.x, fi.mesh.position.y, fi.mesh.position.z, fi.isGolden ? 22 : 14, fi.isGolden);
      triggerShake(fi.isGolden ? 0.35 : 0.14);

      score  += pts;
      hunger  = Math.min(1, hunger + (fi.isGolden ? RESTORE * 1.5 : RESTORE));
      // Sniff recharges partially on collection
      sniffCooldown = Math.max(0, sniffCooldown - 0.7);
      playSfx(fi.isGolden ? 1.0 : 0.65);

      // Level-up check
      const newLevel = Math.floor(score / 60);
      if (newLevel > level) {
        level = newLevel;
        showPop('⬆ ΕΠΙΠΕΔΟ ' + (level + 1) + '!', innerWidth / 2, innerHeight / 2 - 60, 'level-pop');
        triggerShake(0.4);
      }

      scene.remove(fi.mesh); foodItems.splice(i, 1);
      spawnFoodItem();
    }
  }

  while (foodItems.length < MAX_FOOD) spawnFoodItem();

  // Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.age += dt;
    const life = p.age / p.life;
    if (life >= 1) { scene.remove(p.mesh); particles.splice(i, 1); continue; }
    p.vel.y -= 10 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.scale.setScalar(1 - life * 0.85);
    p.mesh.material.opacity = 1 - life;
  }

  // Hunger drain: slightly higher when standing still (encourages movement)
  const drainMult = moving ? 1.0 : 1.3;
  hunger = Math.max(0, hunger - (BASE_DRAIN + score * DRAIN_SCALE) * drainMult * dt);
  if (hunger <= 0) { endGame(); return; }

  updateHUD();

  if (DEV) {
    fpsFrames++;
    const now = performance.now();
    if (now - fpsAt >= 500) {
      fps = Math.round(fpsFrames * 1000 / (now - fpsAt));
      fpsFrames = 0; fpsAt = now;
      elDev.textContent = `${fps} fps  food:${foodItems.length}  parts:${particles.length}  lv:${level}`;
    }
  }
}

// ── Render loop ───────────────────────────────────────────────────────────────
function frame(now) {
  requestAnimationFrame(frame);
  if (paused) return;
  acc += (now - lastTs) / 1000; lastTs = now;
  if (acc > 0.25) acc = 0.25;
  while (acc >= STEP) { update(STEP); acc -= STEP; }
  renderer.render(scene, camera);
}

if (DEV) elDev.style.display = 'block';
requestAnimationFrame(ts => { lastTs = ts; fpsAt = ts; requestAnimationFrame(frame); });

// ── Seeded RNG ────────────────────────────────────────────────────────────────
function seededRNG(seed) {
  let s = seed | 0;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 1 | s);
    s ^= s + Math.imul(s ^ (s >>> 7), 61 | s);
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
}
