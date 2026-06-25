import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

clearTimeout(window.__emergencyTimer);

// ── Config ────────────────────────────────────────────────────────────────────
const HEDGEHOG_URL   = './assets/hedgehog.glb';
const GROUND_TEX_URL = 'https://d8j0ntlcm91z4.cloudfront.net/user_3Aj4UpTS3to1n1H7M2bIRV76drb/hf_20260625_141421_6abab39d-6fa3-4dfc-ba52-0fda3bfe5530.png';
const MUSIC_URL      = 'https://d8j0ntlcm91z4.cloudfront.net/user_3Aj4UpTS3to1n1H7M2bIRV76drb/hf_20260625_141450_8c0d6f66-dfa9-49f9-9072-ed7afc41516c.m4a';
const COLLECT_URL    = 'https://d8j0ntlcm91z4.cloudfront.net/user_3Aj4UpTS3to1n1H7M2bIRV76drb/hf_20260625_141452_d51b6392-abad-4eff-ac73-df6076365ec5.mp3';
const WORLD        = 18;
const SPEED        = 5.5;
const BASE_DRAIN   = 0.038;
const DRAIN_SCALE  = 0.00008;
const RESTORE      = 0.30;
const MAX_FOOD     = 5;
const COLLECT_R    = 1.5;
const STEP         = 1 / 60;
const DEV          = new URLSearchParams(location.search).has('dev');
const DPR_CAP      = 1.5;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const elScore    = document.getElementById('score');
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
scene.fog = new THREE.FogExp2(0x8ec8e8, 0.016);

// ── Camera ────────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 80);
const CAM_OFFSET = new THREE.Vector3(0, 12, 9);
camera.position.copy(CAM_OFFSET);
camera.lookAt(0, 0, 0);
const camLookTarget = new THREE.Vector3();

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
addEventListener('blur',  () => { paused = true; });
addEventListener('focus', () => { paused = false; lastTs = performance.now(); });

// ── Sky dome ──────────────────────────────────────────────────────────────────
scene.add(new THREE.Mesh(
  new THREE.SphereGeometry(72, 20, 10),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop:    { value: new THREE.Color(0x2060b0) },
      uHorizon:{ value: new THREE.Color(0x7ec8e8) },
    },
    vertexShader: `
      varying vec3 vPos;
      void main(){ vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
    `,
    fragmentShader: `
      uniform vec3 uTop,uHorizon;
      varying vec3 vPos;
      void main(){
        float t=clamp(vPos.y/55.0,0.0,1.0);
        gl_FragColor=vec4(mix(uHorizon,uTop,t*t),1.0);
      }
    `,
  })
));

// ── Lights ────────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffeedd, 0.35));

const sun = new THREE.DirectionalLight(0xfff8e8, 2.4);
sun.position.set(18, 28, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far  = 70;
sun.shadow.camera.left   = -28;
sun.shadow.camera.right  =  28;
sun.shadow.camera.bottom = -28;
sun.shadow.camera.top    =  28;
sun.shadow.bias = -0.0008;
scene.add(sun);

const skyFill = new THREE.DirectionalLight(0x88ccff, 0.55);
skyFill.position.set(-12, 18, -8);
scene.add(skyFill);

scene.add(new THREE.HemisphereLight(0x8ec8e8, 0x5a9a40, 0.45));

// ── Ground ────────────────────────────────────────────────────────────────────
const texLoader = new THREE.TextureLoader();
const groundGeo = new THREE.PlaneGeometry(WORLD * 2, WORLD * 2);

function buildGround(tex) {
  let mat;
  if (tex) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(9, 9);
    tex.colorSpace = THREE.SRGBColorSpace;
    mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.0 });
  } else {
    mat = new THREE.MeshStandardMaterial({ color: 0x3d7a30, roughness: 0.9 });
  }
  const mesh = new THREE.Mesh(groundGeo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  scene.add(mesh);
}
texLoader.load(GROUND_TEX_URL, buildGround, undefined, () => buildGround(null));

// ── Boundary trees ────────────────────────────────────────────────────────────
const trunkMat   = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.95 });
const foliageColors = [0x2d6626, 0x3a7a2a, 0x265520, 0x327030];
const trunkGeo   = new THREE.CylinderGeometry(0.22, 0.34, 1.8, 7);
const foliageGeo = new THREE.SphereGeometry(1.1, 8, 6);
const rng = seededRNG(42);
for (let i = 0; i < 32; i++) {
  const a   = (i / 32) * Math.PI * 2 + rng() * 0.25;
  const rad = WORLD + 1.6 + rng() * 2.2;
  const x   = Math.cos(a) * rad;
  const z   = Math.sin(a) * rad;
  const h   = 1.5 + rng() * 1.2;

  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.set(x, h * 0.45, z);
  trunk.scale.y = h / 1.8;
  scene.add(trunk);

  const foliageMat = new THREE.MeshStandardMaterial({
    color: foliageColors[i % foliageColors.length],
    roughness: 0.85,
  });
  const top = new THREE.Mesh(foliageGeo, foliageMat);
  top.scale.set(0.85 + rng() * 0.35, 1.1 + rng() * 0.5, 0.85 + rng() * 0.35);
  top.position.set(x, h * 0.9 + 1.4, z);
  scene.add(top);

  if (rng() > 0.5) {
    const top2 = new THREE.Mesh(foliageGeo, foliageMat);
    top2.scale.setScalar(0.55 + rng() * 0.2);
    top2.position.set(x + rng() * 0.6, h * 0.9 + 2.8, z + rng() * 0.6);
    scene.add(top2);
  }
}

// ── Scattered pebbles and flowers ─────────────────────────────────────────────
const pebbleGeo = new THREE.SphereGeometry(0.11, 5, 4);
const pebbleMat = new THREE.MeshStandardMaterial({ color: 0x9a8878, roughness: 0.9 });
const pebbleInst = new THREE.InstancedMesh(pebbleGeo, pebbleMat, 50);
const dummy = new THREE.Object3D();
const rp = seededRNG(77);
for (let i = 0; i < 50; i++) {
  dummy.position.set((rp() * 2 - 1) * (WORLD - 1.5), 0.07, (rp() * 2 - 1) * (WORLD - 1.5));
  dummy.scale.setScalar(0.5 + rp() * 1.0);
  dummy.rotation.y = rp() * Math.PI * 2;
  dummy.updateMatrix();
  pebbleInst.setMatrixAt(i, dummy.matrix);
}
pebbleInst.receiveShadow = true;
scene.add(pebbleInst);

const flowerColors = [0xffee55, 0xff88bb, 0xffffff, 0xff6644];
const flowerGeo  = new THREE.CircleGeometry(0.18, 5);
const rf = seededRNG(55);
for (let i = 0; i < 70; i++) {
  const mat  = new THREE.MeshBasicMaterial({
    color: flowerColors[i % flowerColors.length],
    side: THREE.DoubleSide,
  });
  const fl = new THREE.Mesh(flowerGeo, mat);
  fl.position.set((rf() * 2 - 1) * (WORLD - 1.5), 0.04, (rf() * 2 - 1) * (WORLD - 1.5));
  fl.rotation.x = -Math.PI / 2 + (rf() - 0.5) * 0.3;
  fl.rotation.z = rf() * Math.PI * 2;
  scene.add(fl);
}

// ── Procedural hedgehog ───────────────────────────────────────────────────────
function makeProcHedgehog() {
  const root    = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x9b6b40, roughness: 0.8 });
  const faceMat = new THREE.MeshStandardMaterial({ color: 0xf0d5a8, roughness: 0.75 });
  const spineMat= new THREE.MeshStandardMaterial({ color: 0x2e2010, roughness: 0.6 });
  const eyeMat  = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.3 });
  const noseMat = new THREE.MeshStandardMaterial({ color: 0x1a0a0a, roughness: 0.3 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.58, 14, 10), bodyMat);
  body.scale.set(1, 0.72, 1.12);
  body.position.y = 0.42;
  body.castShadow = true;
  root.add(body);

  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), faceMat);
  snout.position.set(0, 0.36, 0.54);
  root.add(snout);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.075, 7, 6), noseMat);
  nose.position.set(0, 0.38, 0.76);
  root.add(nose);

  for (const ex of [-0.15, 0.15]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.058, 7, 6), eyeMat);
    eye.position.set(ex, 0.52, 0.65);
    root.add(eye);
  }

  const spineGeo = new THREE.ConeGeometry(0.065, 0.5, 5);
  const localRng = seededRNG(7);
  for (let i = 0; i < 30; i++) {
    const phi   = Math.PI * 0.08 + localRng() * Math.PI * 0.58;
    const theta = localRng() * Math.PI * 2;
    const sp    = new THREE.Mesh(spineGeo, spineMat);
    const dir   = new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta) * 0.88 - 0.1
    ).normalize();
    sp.position.copy(dir.clone().multiplyScalar(0.52)).add(new THREE.Vector3(0, 0.42, 0));
    sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    sp.castShadow = true;
    root.add(sp);
  }
  return root;
}

// ── GLB loader ────────────────────────────────────────────────────────────────
let hedgehogNode = null;
let procHedgehog = makeProcHedgehog();
scene.add(procHedgehog);
let modelReady = false;

const gltfLoader = new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder);
setProgress(25);

gltfLoader.load(
  HEDGEHOG_URL,
  (gltf) => {
    hedgehogNode = gltf.scene;
    hedgehogNode.traverse(m => {
      if (m.isMesh) {
        m.castShadow    = true;
        m.receiveShadow = true;
        if (m.material) {
          m.material.needsUpdate = true;
        }
      }
    });
    const box  = new THREE.Box3().setFromObject(hedgehogNode);
    const size = box.getSize(new THREE.Vector3());
    const s    = 1.9 / Math.max(size.x, size.y, size.z);
    hedgehogNode.scale.setScalar(s);
    box.setFromObject(hedgehogNode);
    hedgehogNode.position.y = -box.min.y;
    scene.add(hedgehogNode);
    scene.remove(procHedgehog);
    procHedgehog = null;
    modelReady = true;
    setProgress(95);
    finishLoad();
  },
  (prog) => { if (prog.total > 0) setProgress(25 + (prog.loaded / prog.total) * 65); },
  () => {
    modelReady = true;
    setProgress(95);
    finishLoad();
  }
);

loadAudioAsync();

const loadFallback = setTimeout(() => { modelReady = true; finishLoad(); }, 2000);

function setProgress(pct) { elProgFill.style.width = pct + '%'; }

function finishLoad() {
  if (!modelReady) return;
  clearTimeout(loadFallback);
  setProgress(100);
  setTimeout(() => { elLoading.style.display = 'none'; }, 350);
}

// ── Audio ─────────────────────────────────────────────────────────────────────
let audioCtx = null, musicBuf = null, sfxBuf = null, musicSrc = null;

async function loadAudioAsync() {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const [mr, sr] = await Promise.allSettled([
      fetch(MUSIC_URL).then(r => r.ok ? r.arrayBuffer() : Promise.reject()),
      fetch(COLLECT_URL).then(r => r.ok ? r.arrayBuffer() : Promise.reject()),
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
  musicSrc.buffer = musicBuf;
  musicSrc.loop   = true;
  const gain = audioCtx.createGain();
  gain.gain.value = 0.2;
  musicSrc.connect(gain).connect(audioCtx.destination);
  musicSrc.start();
}

function stopMusic() {
  if (musicSrc) { try { musicSrc.stop(); } catch (_) {} musicSrc = null; }
}

function playSfx() {
  if (!audioCtx || !sfxBuf) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const src  = audioCtx.createBufferSource();
  src.buffer = sfxBuf;
  const gain = audioCtx.createGain();
  gain.gain.value = 0.65;
  src.connect(gain).connect(audioCtx.destination);
  src.start();
}

// ── Game state ────────────────────────────────────────────────────────────────
let hunger = 1.0, score = 0;
let hiScore = +localStorage.getItem('hq_hi') || 0;
let running = false, paused = false;
let simTime = 0, acc = 0, lastTs = 0;
let fps = 0, fpsFrames = 0, fpsAt = 0;

const hPos    = new THREE.Vector3();
const hFacing = new THREE.Quaternion();
const upVec   = new THREE.Vector3(0, 1, 0);

function activeHedgehog() { return hedgehogNode || procHedgehog; }

// ── Food system ───────────────────────────────────────────────────────────────
const FOOD_TYPES = [
  {
    label: 'Berry', pts: 10,
    make() {
      const g = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(
          new THREE.SphereGeometry(0.2 + Math.random() * 0.08, 10, 8),
          new THREE.MeshStandardMaterial({
            color: 0xcc1a1a, emissive: 0x880000, emissiveIntensity: 0.5,
            roughness: 0.25, metalness: 0.05,
          })
        );
        m.position.set((Math.random() - 0.5) * 0.35, Math.random() * 0.2, (Math.random() - 0.5) * 0.35);
        m.castShadow = true;
        g.add(m);
      }
      return g;
    }
  },
  {
    label: 'Mushroom', pts: 15,
    make() {
      const g = new THREE.Group();
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.15, 0.4, 9),
        new THREE.MeshStandardMaterial({ color: 0xf5e6cc, roughness: 0.8 })
      );
      stem.position.y = 0.2;
      g.add(stem);
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({
          color: 0xff3d00, emissive: 0x661000, emissiveIntensity: 0.4,
          roughness: 0.5, metalness: 0.05,
        })
      );
      cap.position.y = 0.5;
      g.add(cap);
      const spot = new THREE.Mesh(
        new THREE.CircleGeometry(0.06, 6),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 })
      );
      spot.rotation.x = -Math.PI / 2;
      spot.position.set(0.15, 0.51, 0.1);
      g.add(spot);
      return g;
    }
  },
  {
    label: 'Worm', pts: 20,
    make() {
      const g = new THREE.Group();
      const wormMat = new THREE.MeshStandardMaterial({
        color: 0xff78c8, emissive: 0x660030, emissiveIntensity: 0.45,
        roughness: 0.4, metalness: 0.0,
      });
      for (let i = 0; i < 5; i++) {
        const seg = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), wormMat);
        const a = (i / 4) * Math.PI * 1.6;
        seg.position.set(Math.cos(a) * 0.28, 0.1 + Math.sin(i * 1.2) * 0.06, Math.sin(a) * 0.2);
        seg.castShadow = true;
        g.add(seg);
      }
      return g;
    }
  },
  {
    label: 'Corn', pts: 12,
    make() {
      const g = new THREE.Group();
      const cob = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.12, 0.65, 10),
        new THREE.MeshStandardMaterial({
          color: 0xf5c430, emissive: 0x664400, emissiveIntensity: 0.45,
          roughness: 0.45, metalness: 0.05,
        })
      );
      cob.position.y = 0.33;
      g.add(cob);
      const leaf = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.1, 0.32, 6),
        new THREE.MeshStandardMaterial({ color: 0x4aaa28, roughness: 0.8 })
      );
      leaf.position.y = 0.78;
      g.add(leaf);
      return g;
    }
  },
  {
    label: 'Acorn', pts: 8,
    make() {
      const g = new THREE.Group();
      const nut = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0x8b5e2a, roughness: 0.6 })
      );
      nut.scale.y = 1.3;
      nut.position.y = 0.24;
      g.add(nut);
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.45),
        new THREE.MeshStandardMaterial({ color: 0x4a3010, roughness: 0.9 })
      );
      cap.position.y = 0.42;
      g.add(cap);
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.15, 5),
        new THREE.MeshStandardMaterial({ color: 0x3a2008, roughness: 0.9 })
      );
      stem.position.y = 0.58;
      g.add(stem);
      return g;
    }
  }
];

const foodItems = [];
const particles = [];

function spawnFoodItem() {
  const type = FOOD_TYPES[Math.floor(Math.random() * FOOD_TYPES.length)];
  const mesh = type.make();
  let x, z, tries = 0;
  do {
    x = (Math.random() * 2 - 1) * (WORLD - 2.5);
    z = (Math.random() * 2 - 1) * (WORLD - 2.5);
    tries++;
  } while (Math.hypot(x - hPos.x, z - hPos.z) < 4.5 && tries < 25);
  const baseY = 0.45;
  mesh.position.set(x, baseY, z);
  scene.add(mesh);
  foodItems.push({ mesh, type, baseY, phase: Math.random() * Math.PI * 2, sniffPhase: 0 });
}

// ── Particles ─────────────────────────────────────────────────────────────────
const partGeos = [
  new THREE.SphereGeometry(0.1, 4, 4),
  new THREE.SphereGeometry(0.07, 4, 4),
];
const partMats = [0xf5c842, 0xff8c00, 0xee2222, 0x88dd44].map(c =>
  new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.6, transparent: true })
);

function spawnParticles(x, y, z) {
  for (let i = 0; i < 10; i++) {
    const m   = new THREE.Mesh(partGeos[i % partGeos.length], partMats[i % partMats.length].clone());
    m.position.set(x, y, z);
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 5,
      1.5 + Math.random() * 4.0,
      (Math.random() - 0.5) * 5
    );
    scene.add(m);
    particles.push({ mesh: m, vel, life: 0.65 + Math.random() * 0.4, age: 0 });
  }
}

// ── Sniff rings ───────────────────────────────────────────────────────────────
const sniffRings = [];
const sniffRingGeo = new THREE.RingGeometry(0.6, 0.9, 44);

function spawnSniffRing() {
  const mat  = new THREE.MeshBasicMaterial({
    color: 0x44ddff, transparent: true, opacity: 0.7,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const ring = new THREE.Mesh(sniffRingGeo, mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.18;
  scene.add(ring);
  sniffRings.push({ mesh: ring, age: 0, life: 0.75 });
}

// ── Input ─────────────────────────────────────────────────────────────────────
const KEY_MAP = {
  KeyW:'u', ArrowUp:'u',
  KeyS:'d', ArrowDown:'d',
  KeyA:'l', ArrowLeft:'l',
  KeyD:'r', ArrowRight:'r',
};
const PAD_MAP = { 12:'u', 13:'d', 14:'l', 15:'r' };
const held    = new Set();

addEventListener('keydown', e => {
  const c = KEY_MAP[e.code];
  if (c) { held.add(c); e.preventDefault(); }
  if (e.code === 'Space') { doSniff(); e.preventDefault(); }
});
addEventListener('keyup', e => {
  const c = KEY_MAP[e.code];
  if (c) held.delete(c);
});

if (navigator.maxTouchPoints > 0 || 'ontouchstart' in window) {
  elJoyBase.style.display  = 'flex';
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
  joyState.x = dx / JOY_RADIUS;
  joyState.z = dy / JOY_RADIUS;
}

function resetJoy() {
  joyPointerId = null;
  joyState.x = joyState.z = 0;
  elJoyKnob.style.transform = '';
}

elJoyBase.addEventListener('pointerdown', e => {
  if (joyPointerId !== null) return;
  joyPointerId = e.pointerId;
  elJoyBase.setPointerCapture(e.pointerId);
  const r = elJoyBase.getBoundingClientRect();
  joyOrigin.x = r.left + r.width  / 2;
  joyOrigin.y = r.top  + r.height / 2;
  moveJoy(e.clientX, e.clientY);
});

elJoyBase.addEventListener('pointermove', e => {
  if (e.pointerId !== joyPointerId) return;
  moveJoy(e.clientX, e.clientY);
});

elJoyBase.addEventListener('pointerup',     e => { if (e.pointerId === joyPointerId) resetJoy(); });
elJoyBase.addEventListener('pointercancel', e => { if (e.pointerId === joyPointerId) resetJoy(); });

function getGamepadAxes() {
  let x = 0, z = 0;
  for (const gp of navigator.getGamepads?.() ?? []) {
    if (!gp) continue;
    gp.buttons.forEach((b, i) => {
      if (!b.pressed) return;
      if (PAD_MAP[i] === 'u') z -= 1;
      if (PAD_MAP[i] === 'd') z += 1;
      if (PAD_MAP[i] === 'l') x -= 1;
      if (PAD_MAP[i] === 'r') x += 1;
    });
    if (Math.abs(gp.axes[0]) > 0.15) x += gp.axes[0];
    if (Math.abs(gp.axes[1]) > 0.15) z += gp.axes[1];
  }
  return { x, z };
}

// ── Sniff ─────────────────────────────────────────────────────────────────────
let sniffCooldown = 0;
const SNIFF_RANGE = 7, SNIFF_CD = 3;

elBtnSniff.addEventListener('pointerdown', e => { e.preventDefault(); doSniff(); });
elBtnSniff.addEventListener('click', doSniff);

function doSniff() {
  if (!running || sniffCooldown > 0) return;
  sniffCooldown = SNIFF_CD;
  spawnSniffRing();
  foodItems.forEach(fi => {
    if (fi.mesh.position.distanceTo(hPos) < SNIFF_RANGE)
      fi.sniffPhase = 1.5;
  });
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function worldToScreen(pos) {
  const v = pos.clone().project(camera);
  return {
    x: ( v.x * 0.5 + 0.5) * innerWidth,
    y: (-v.y * 0.5 + 0.5) * innerHeight,
  };
}

function showPop(text, x, y, cls = 'score-pop') {
  const el = document.createElement('div');
  el.className = cls;
  el.textContent = text;
  el.style.left  = (x - 24) + 'px';
  el.style.top   = (y - 32) + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 950);
}

function updateHUD() {
  elScore.textContent = score;
  const pct = Math.max(0, Math.min(1, hunger));
  elFill.style.width = (pct * 100).toFixed(1) + '%';
  const r = pct > 0.5 ? Math.round((1 - pct) * 2 * 200 + 40)  : 240;
  const g = pct > 0.5 ? 180 : Math.round(pct * 2 * 150 + 30);
  elFill.style.background = `linear-gradient(90deg,rgb(${r},${g},20),rgb(${Math.min(r+30,255)},${Math.min(g+50,255)},60))`;
  elBtnSniff.style.opacity = sniffCooldown > 0 ? '0.45' : '1';
}

// ── Game flow ─────────────────────────────────────────────────────────────────
elStartBtn.addEventListener('click',    startGame);
elStartBtn.addEventListener('touchend', e => { e.preventDefault(); startGame(); });

function startGame() {
  hunger = 1.0;
  score  = 0;
  sniffCooldown = 0;
  running = true;

  foodItems.forEach(fi => scene.remove(fi.mesh));
  foodItems.length = 0;
  particles.forEach(p => scene.remove(p.mesh));
  particles.length = 0;
  sniffRings.forEach(sr => scene.remove(sr.mesh));
  sniffRings.length = 0;

  hPos.set(0, 0, 0);
  hFacing.identity();
  const h = activeHedgehog();
  if (h) { h.position.set(0, 0, 0); h.quaternion.identity(); }

  for (let i = 0; i < MAX_FOOD; i++) spawnFoodItem();

  elOverlay.style.display = 'none';
  lastTs = performance.now();
  startMusic();
}

function endGame() {
  running = false;
  stopMusic();
  if (score > hiScore) { hiScore = score; localStorage.setItem('hq_hi', hiScore); }

  elOvEmoji.textContent  = '😢';
  elOvTitle.textContent  = 'Too Hungry!';
  elOvDesc.textContent   = 'Your hedgehog ran out of food…';
  elOvHint.textContent   = '';
  elOvScore.textContent  = 'Score: ' + score;
  elOvHi.textContent     = 'Best: '  + hiScore;
  elOvScore.style.display = '';
  elOvHi.style.display    = '';
  elStartBtn.textContent  = 'Play Again';
  elOverlay.style.display = 'flex';
}

// ── Simulation ────────────────────────────────────────────────────────────────
function update(dt) {
  if (!running) return;
  simTime += dt;

  let ix = 0, iz = 0;
  if (held.has('l')) ix -= 1;
  if (held.has('r')) ix += 1;
  if (held.has('u')) iz -= 1;
  if (held.has('d')) iz += 1;
  const gp = getGamepadAxes();
  ix += joyState.x + gp.x;
  iz += joyState.z + gp.z;
  const ilen = Math.hypot(ix, iz);
  if (ilen > 1) { ix /= ilen; iz /= ilen; }
  const moving = ilen > 0.05;

  if (moving) {
    hPos.x = Math.max(-WORLD, Math.min(WORLD, hPos.x + ix * SPEED * dt));
    hPos.z = Math.max(-WORLD, Math.min(WORLD, hPos.z + iz * SPEED * dt));
    const targetAngle = Math.atan2(-ix, -iz);
    const targetQ     = new THREE.Quaternion().setFromAxisAngle(upVec, targetAngle);
    hFacing.slerp(targetQ, 1 - Math.pow(0.005, dt));
  }

  const bob = moving ? Math.sin(simTime * 9) * 0.09 : 0;
  const h   = activeHedgehog();
  if (h) {
    h.position.set(hPos.x, bob, hPos.z);
    h.quaternion.copy(hFacing);
  }

  const targetCamPos = new THREE.Vector3(hPos.x, 0, hPos.z).add(CAM_OFFSET);
  camera.position.lerp(targetCamPos, 1 - Math.pow(0.004, dt));
  camLookTarget.set(hPos.x, 0.5, hPos.z);
  camera.lookAt(camLookTarget);

  if (sniffCooldown > 0) sniffCooldown = Math.max(0, sniffCooldown - dt);

  // Sniff ring animation
  for (let i = sniffRings.length - 1; i >= 0; i--) {
    const sr = sniffRings[i];
    sr.age += dt;
    const t = sr.age / sr.life;
    if (t >= 1) { scene.remove(sr.mesh); sniffRings.splice(i, 1); continue; }
    const scale = t * (SNIFF_RANGE / 0.75);
    sr.mesh.position.x = hPos.x;
    sr.mesh.position.z = hPos.z;
    sr.mesh.scale.setScalar(scale);
    sr.mesh.material.opacity = (1 - t) * 0.65;
  }

  for (let i = foodItems.length - 1; i >= 0; i--) {
    const fi = foodItems[i];
    fi.mesh.position.y = fi.baseY + Math.sin(simTime * 2.1 + fi.phase) * 0.15;
    fi.mesh.rotation.y += dt * 1.1;
    if (fi.sniffPhase > 0) {
      fi.sniffPhase -= dt * 3;
      fi.mesh.position.y += Math.sin(fi.sniffPhase * Math.PI) * 0.7;
    }
    const dx = fi.mesh.position.x - hPos.x;
    const dz = fi.mesh.position.z - hPos.z;
    if (Math.hypot(dx, dz) < COLLECT_R) {
      const sc = worldToScreen(fi.mesh.position);
      showPop('+' + fi.type.pts, sc.x, sc.y);
      showPop(fi.type.label, sc.x, sc.y + 28, 'food-name-pop');
      spawnParticles(fi.mesh.position.x, fi.mesh.position.y, fi.mesh.position.z);
      score  += fi.type.pts;
      hunger  = Math.min(1, hunger + RESTORE);
      playSfx();
      scene.remove(fi.mesh);
      foodItems.splice(i, 1);
      spawnFoodItem();
    }
  }

  while (foodItems.length < MAX_FOOD) spawnFoodItem();

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.age += dt;
    const life = p.age / p.life;
    if (life >= 1) { scene.remove(p.mesh); particles.splice(i, 1); continue; }
    p.vel.y -= 10 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.scale.setScalar(1 - life * 0.85);
    p.mesh.material.opacity = 1 - life;
  }

  hunger = Math.max(0, hunger - (BASE_DRAIN + score * DRAIN_SCALE) * dt);
  if (hunger <= 0) { endGame(); return; }

  updateHUD();

  if (DEV) {
    fpsFrames++;
    const now = performance.now();
    if (now - fpsAt >= 500) {
      fps = Math.round(fpsFrames * 1000 / (now - fpsAt));
      fpsFrames = 0; fpsAt = now;
      elDev.textContent = `${fps} fps  food:${foodItems.length}  parts:${particles.length}`;
    }
  }
}

// ── Render loop ───────────────────────────────────────────────────────────────
function frame(now) {
  requestAnimationFrame(frame);
  if (paused) return;
  acc  += (now - lastTs) / 1000;
  lastTs = now;
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
