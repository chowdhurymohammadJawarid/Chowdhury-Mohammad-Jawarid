import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ThemePreset, UltronState } from '../types/ultron';

interface UltronHologramProps {
  state: UltronState;
  theme: ThemePreset;
  zoomScale: number; // 0.5 to 2.2
  onZoomChange: (nextZoom: number) => void;
  audioLevelRef: React.MutableRefObject<number>;
  particleBudget: number;
}

const THEME_PALETTES: Record<
  ThemePreset,
  {
    bgHex: number;
    coreHex: number;
    wireHex: number;
    waveHex: number;
    deepOrangeHex: number;
    reticleHex: number;
  }
> = {
  'amber-cyan': {
    bgHex: 0x070402,
    coreHex: 0xfde047,
    wireHex: 0xf59e0b,
    waveHex: 0xea580c,
    deepOrangeHex: 0x9a3412,
    reticleHex: 0xfbbf24,
  },
  'pure-cyan': {
    bgHex: 0x030810,
    coreHex: 0xa5f3fc,
    wireHex: 0x06b6d4,
    waveHex: 0x0284c7,
    deepOrangeHex: 0x1e3a8a,
    reticleHex: 0x67e8f9,
  },
  'cobalt-ice': {
    bgHex: 0x040712,
    coreHex: 0xbfdbfe,
    wireHex: 0x3b82f6,
    waveHex: 0x06b6d4,
    deepOrangeHex: 0xf59e0b,
    reticleHex: 0x93c5fd,
  },
};

const TELEMETRY_TOKENS = [
  'use std',
  'TCP/SYN',
  'HEAP 4K',
  'RSA 4096',
  'AES-256',
  'hash256',
  'SYNC OK',
  '01101001',
  'IRQ 0x7',
  'mutex.lk',
  'ptr ref',
  'malloc()',
  'HTTP/2',
  'REG EAX',
  'PATCH /',
  'sys.init()',
  'arc::new',
  'eth0: UP',
  'TLS 1.3',
  'fork()',
];

function createHexBokehTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const cx = 64;
  const cy = 64;

  // Soft outer radial glow (neutral white so uTint colors all themes cleanly)
  const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, 60);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.35, 'rgba(255, 240, 215, 0.72)');
  grad.addColorStop(0.7, 'rgba(255, 220, 180, 0.18)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  // Crisp hexagon core
  ctx.beginPath();
  const r = 30;
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createCodeSpriteTexture(label: string, glowStrength: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = '600 24px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
  ctx.shadowBlur = glowStrength;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.fillText(label, 128, 32);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function UltronHologram({
  state,
  theme,
  zoomScale,
  onZoomChange,
  audioLevelRef,
  particleBudget,
}: UltronHologramProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<UltronState>(state);
  const themeRef = useRef<ThemePreset>(theme);
  const targetZoomRef = useRef<number>(zoomScale);
  const onZoomChangeRef = useRef(onZoomChange);
  const [contextLost, setContextLost] = useState(false);

  stateRef.current = state;
  themeRef.current = theme;
  targetZoomRef.current = zoomScale;
  onZoomChangeRef.current = onZoomChange;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const initialPalette = THEME_PALETTES[themeRef.current];

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(initialPalette.bgHex);
    scene.fog = new THREE.FogExp2(initialPalette.bgHex, 0.055);

    const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 100);
    const BASE_DISTANCE = 9.2;
    camera.position.set(0, 0.25, BASE_DISTANCE / Math.max(0.5, targetZoomRef.current));

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const onContextRestored = () => setContextLost(false);
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.055;
    controls.enablePan = false;
    controls.minDistance = BASE_DISTANCE / 2.2;
    controls.maxDistance = BASE_DISTANCE / 0.5;
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_ROTATE,
    };

    let userZooming = false;
    const onControlsStart = () => {
      userZooming = true;
    };
    const onControlsEnd = () => {
      userZooming = false;
      const dist = camera.position.length();
      const computedZoom = THREE.MathUtils.clamp(BASE_DISTANCE / dist, 0.5, 2.2);
      onZoomChangeRef.current(Math.round(computedZoom * 100) / 100);
    };
    controls.addEventListener('start', onControlsStart);
    controls.addEventListener('end', onControlsEnd);

    const masterGroup = new THREE.Group();
    scene.add(masterGroup);

    // =========================================================================
    // 1. SWEEPING INTERFERENCE CONTOUR WAVE RIBBONS (Horizontal & Vertical Mesh)
    // =========================================================================
    const hLines = 34;
    const hSegs = 96;
    const hPositions = new Float32Array(hLines * hSegs * 3);
    const hUvs = new Float32Array(hLines * hSegs * 2);
    const hIndices: number[] = [];

    for (let l = 0; l < hLines; l++) {
      const vNorm = l / (hLines - 1);
      const yBase = (vNorm - 0.5) * 6.4;
      for (let s = 0; s < hSegs; s++) {
        const uNorm = s / (hSegs - 1);
        const x = (uNorm - 0.5) * 16.5;
        const idx = l * hSegs + s;
        hPositions[idx * 3] = x;
        hPositions[idx * 3 + 1] = yBase;
        hPositions[idx * 3 + 2] = 0;
        hUvs[idx * 2] = uNorm;
        hUvs[idx * 2 + 1] = vNorm;
        if (s < hSegs - 1) {
          hIndices.push(idx, idx + 1);
        }
      }
    }

    const hWaveGeo = new THREE.BufferGeometry();
    hWaveGeo.setAttribute('position', new THREE.BufferAttribute(hPositions, 3));
    hWaveGeo.setAttribute('uv', new THREE.BufferAttribute(hUvs, 2));
    hWaveGeo.setIndex(hIndices);

    const hWaveMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uAudio: { value: 0 },
        uColorA: { value: new THREE.Color(initialPalette.waveHex) },
        uColorB: { value: new THREE.Color(initialPalette.wireHex) },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uAudio;
        varying vec2 vUv;
        varying float vCrest;

        void main() {
          vUv = uv;
          vec3 p = position;
          float wave1 = sin(p.x * 0.48 + uv.y * 5.2 - uTime * 0.9) * 0.65;
          float wave2 = cos(p.x * 0.28 - uv.y * 7.5 + uTime * 0.65) * 0.55;
          float pinch = sin(uv.y * 3.14159) * (0.9 + uAudio * 0.85);
          p.y += (wave1 + wave2 * 0.5) * pinch;
          p.z += cos(p.x * 0.42 + uv.y * 6.0 + uTime * 0.75) * (1.3 + uAudio * 0.9) - 1.2;
          vCrest = clamp(0.5 + 0.5 * sin(p.x * 0.6 + uv.y * 4.0 - uTime * 1.1), 0.0, 1.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform float uAudio;
        varying vec2 vUv;
        varying float vCrest;

        void main() {
          float edgeFade = sin(vUv.x * 3.14159) * (0.25 + 0.75 * sin(vUv.y * 3.14159));
          vec3 col = mix(uColorA, uColorB, vCrest);
          float alpha = edgeFade * (0.34 + vCrest * 0.34 + uAudio * 0.22);
          gl_FragColor = vec4(col * 1.15, alpha);
        }
      `,
    });
    const hWaveLines = new THREE.LineSegments(hWaveGeo, hWaveMat);
    masterGroup.add(hWaveLines);

    // Vertical sweeping interference ribbons (matching the tall dense wave crest on the left-center of the reference image)
    const vLines = 28;
    const vSegs = 80;
    const vPositions = new Float32Array(vLines * vSegs * 3);
    const vUvs = new Float32Array(vLines * vSegs * 2);
    const vIndices: number[] = [];

    for (let l = 0; l < vLines; l++) {
      const uNorm = l / (vLines - 1);
      const xBase = -3.8 + uNorm * 7.6;
      for (let s = 0; s < vSegs; s++) {
        const vNorm = s / (vSegs - 1);
        const y = (vNorm - 0.5) * 9.5;
        const idx = l * vSegs + s;
        vPositions[idx * 3] = xBase;
        vPositions[idx * 3 + 1] = y;
        vPositions[idx * 3 + 2] = 0;
        vUvs[idx * 2] = uNorm;
        vUvs[idx * 2 + 1] = vNorm;
        if (s < vSegs - 1) {
          vIndices.push(idx, idx + 1);
        }
      }
    }

    const vWaveGeo = new THREE.BufferGeometry();
    vWaveGeo.setAttribute('position', new THREE.BufferAttribute(vPositions, 3));
    vWaveGeo.setAttribute('uv', new THREE.BufferAttribute(vUvs, 2));
    vWaveGeo.setIndex(vIndices);

    const vWaveMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uAudio: { value: 0 },
        uColorA: { value: new THREE.Color(initialPalette.deepOrangeHex) },
        uColorB: { value: new THREE.Color(initialPalette.coreHex) },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uAudio;
        varying vec2 vUv;
        varying float vCrest;

        void main() {
          vUv = uv;
          vec3 p = position;
          float bend = sin(p.y * 0.45 + uv.x * 4.5 + uTime * 0.75) * (1.1 + uAudio * 0.65);
          float twist = cos(p.y * 0.32 - uv.x * 3.8 - uTime * 0.55) * 0.85;
          p.x += bend * 0.72 + twist * 0.35;
          p.z += sin(p.y * 0.5 + uv.x * 5.0 - uTime * 0.85) * 1.4 - 0.8;
          vCrest = smoothstep(0.2, 0.9, sin(uv.x * 3.14159));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform float uAudio;
        varying vec2 vUv;
        varying float vCrest;

        void main() {
          float fadeY = sin(vUv.y * 3.14159);
          float fadeX = sin(vUv.x * 3.14159);
          vec3 col = mix(uColorA, uColorB, vCrest * 0.75);
          float alpha = fadeY * fadeX * (0.38 + uAudio * 0.25);
          gl_FragColor = vec4(col * 1.2, alpha);
        }
      `,
    });
    const vWaveLines = new THREE.LineSegments(vWaveGeo, vWaveMat);
    masterGroup.add(vWaveLines);

    // =========================================================================
    // 2. GEODESIC POLYHEDRAL WIREFRAME CORE (Matches Glowing Polyhedral Sphere)
    // =========================================================================
    const geoSphereGroup = new THREE.Group();
    geoSphereGroup.position.set(1.55, 0.1, 0.5);
    masterGroup.add(geoSphereGroup);

    const outerIcoSrc = new THREE.IcosahedronGeometry(1.55, 2);
    const outerWireGeo = new THREE.WireframeGeometry(outerIcoSrc);
    outerIcoSrc.dispose();
    const outerWireMat = new THREE.LineBasicMaterial({
      color: initialPalette.coreHex,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const outerWireMesh = new THREE.LineSegments(outerWireGeo, outerWireMat);
    geoSphereGroup.add(outerWireMesh);

    const innerIcoSrc = new THREE.IcosahedronGeometry(1.12, 1);
    const innerWireGeo = new THREE.WireframeGeometry(innerIcoSrc);
    innerIcoSrc.dispose();
    const innerWireMat = new THREE.LineBasicMaterial({
      color: initialPalette.wireHex,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const innerWireMesh = new THREE.LineSegments(innerWireGeo, innerWireMat);
    geoSphereGroup.add(innerWireMesh);

    // Inner incandescent plasma haze inside the geodesic lattice
    const plasmaGeo = new THREE.SphereGeometry(0.95, 32, 32);
    const plasmaMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uAudio: { value: 0 },
        uColorCore: { value: new THREE.Color(initialPalette.coreHex) },
        uColorEdge: { value: new THREE.Color(initialPalette.waveHex) },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uAudio;
        uniform vec3 uColorCore;
        uniform vec3 uColorEdge;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vec3 vd = normalize(cameraPosition - vWorldPos);
          float rim = pow(max(0.0, dot(vd, vNormal)), 1.6);
          float pulse = 0.78 + 0.22 * sin(uTime * 2.8);
          vec3 col = mix(uColorEdge, uColorCore, rim);
          float alpha = (0.28 + rim * 0.55 + uAudio * 0.3) * pulse;
          gl_FragColor = vec4(col * (1.0 + uAudio * 0.5), alpha);
        }
      `,
    });
    const plasmaMesh = new THREE.Mesh(plasmaGeo, plasmaMat);
    geoSphereGroup.add(plasmaMesh);

    // =========================================================================
    // 3. TARGET RETICLE RING (Left Interference Field)
    // =========================================================================
    const reticleGroup = new THREE.Group();
    reticleGroup.position.set(-2.9, 0.72, 1.4);
    masterGroup.add(reticleGroup);

    const reticleRingGeo = new THREE.RingGeometry(0.14, 0.175, 48);
    const reticleRingMat = new THREE.MeshBasicMaterial({
      color: initialPalette.reticleHex,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const reticleRing = new THREE.Mesh(reticleRingGeo, reticleRingMat);
    reticleGroup.add(reticleRing);

    const reticleDotGeo = new THREE.CircleGeometry(0.035, 20);
    const reticleDot = new THREE.Mesh(reticleDotGeo, reticleRingMat);
    reticleGroup.add(reticleDot);

    // =========================================================================
    // 4. HEXAGONAL & EMBER BOKEH PARTICLES
    // =========================================================================
    const hexTexture = createHexBokehTexture();
    const bokehCount = Math.max(90, Math.min(260, Math.round(particleBudget * 0.25)));
    const bPos = new Float32Array(bokehCount * 3);
    const bPhase = new Float32Array(bokehCount);
    const bSize = new Float32Array(bokehCount);

    for (let i = 0; i < bokehCount; i++) {
      bPos[i * 3] = (Math.random() - 0.5) * 14.5;
      bPos[i * 3 + 1] = (Math.random() - 0.5) * 7.8;
      bPos[i * 3 + 2] = (Math.random() - 0.5) * 6.5;
      bPhase[i] = Math.random() * Math.PI * 2;
      bSize[i] = 16 + Math.random() * 44;
    }

    const bokehGeo = new THREE.BufferGeometry();
    bokehGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
    bokehGeo.setAttribute('aPhase', new THREE.BufferAttribute(bPhase, 1));
    bokehGeo.setAttribute('aSize', new THREE.BufferAttribute(bSize, 1));

    const bokehMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uAudio: { value: 0 },
        uMap: { value: hexTexture },
        uTint: { value: new THREE.Color(initialPalette.wireHex) },
        uPixelRatio: { value: isSoftwareGl ? 1.0 : Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        attribute float aPhase;
        attribute float aSize;
        uniform float uTime;
        uniform float uAudio;
        uniform float uPixelRatio;
        varying float vAlpha;

        void main() {
          vec3 p = position;
          p.x += sin(uTime * 0.35 + aPhase) * 0.35;
          p.y += cos(uTime * 0.28 + aPhase * 1.3) * 0.28;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vAlpha = 0.25 + 0.55 * (0.5 + 0.5 * sin(uTime * 1.4 + aPhase)) + uAudio * 0.2;
          gl_PointSize = (aSize * (1.0 + uAudio * 0.35)) * uPixelRatio / max(1.0, -mv.z * 0.35);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform vec3 uTint;
        varying float vAlpha;
        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          if (tex.a < 0.02) discard;
          gl_FragColor = vec4(tex.rgb * uTint * 1.35, tex.a * vAlpha);
        }
      `,
    });
    const bokehPoints = new THREE.Points(bokehGeo, bokehMat);
    masterGroup.add(bokehPoints);

    // =========================================================================
    // 5. FLOATING DEPTH-OF-FIELD TELEMETRY SPRITES
    // =========================================================================
    interface CodeSpriteItem {
      sprite: THREE.Sprite;
      tex: THREE.CanvasTexture;
      mat: THREE.SpriteMaterial;
      baseX: number;
      baseY: number;
      baseZ: number;
      speed: number;
      phase: number;
    }
    const codeSprites: CodeSpriteItem[] = [];
    const spriteCount = isSoftwareGl ? 22 : 34;

    for (let i = 0; i < spriteCount; i++) {
      const label = TELEMETRY_TOKENS[i % TELEMETRY_TOKENS.length];
      const depthTier = i % 3; // 0 = foreground bokeh, 1 = mid, 2 = far crisp
      const blur = depthTier === 0 ? 12 : depthTier === 1 ? 5 : 2;
      const tex = createCodeSpriteTexture(label, blur);
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: depthTier === 0 ? 0.52 : depthTier === 1 ? 0.65 : 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        color: initialPalette.wireHex,
      });
      const sprite = new THREE.Sprite(mat);
      const baseX = (Math.random() - 0.5) * 13.5;
      const baseY = (Math.random() - 0.5) * 6.8;
      const baseZ = depthTier === 0 ? 2.5 + Math.random() * 1.6 : depthTier === 1 ? (Math.random() - 0.5) * 2.2 : -2.6 - Math.random() * 2.0;
      const scale = depthTier === 0 ? 1.85 : depthTier === 1 ? 0.95 : 0.65;
      sprite.position.set(baseX, baseY, baseZ);
      sprite.scale.set(scale * 1.6, scale * 0.42, 1);
      masterGroup.add(sprite);
      codeSprites.push({
        sprite,
        tex,
        mat,
        baseX,
        baseY,
        baseZ,
        speed: 0.14 + Math.random() * 0.25,
        phase: Math.random() * Math.PI * 2,
      });
    }

    // Pre-allocated math objects
    const _bgColor = new THREE.Color();
    const _coreColor = new THREE.Color();
    const _wireColor = new THREE.Color();
    const _waveColor = new THREE.Color();
    const _deepColor = new THREE.Color();
    const _reticleColor = new THREE.Color();
    const _camDir = new THREE.Vector3();

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clock = new THREE.Clock();
    let frameId = 0;
    let smoothedAudio = 0;

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const syncState = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (syncState === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 75);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      const delta = Math.min(0.08, clock.getDelta());
      const elapsed = clock.getElapsedTime();
      const curState = stateRef.current;
      const pal = THEME_PALETTES[themeRef.current];

      smoothedAudio = THREE.MathUtils.damp(smoothedAudio, audioLevelRef.current, 12, delta);

      const speedMult =
        curState === 'halted'
          ? 0.08
          : curState === 'thinking'
          ? 2.1
          : curState === 'speaking'
          ? 1.5 + smoothedAudio * 1.1
          : curState === 'listening'
          ? 1.35
          : 0.85;

      _bgColor.setHex(pal.bgHex);
      _coreColor.setHex(curState === 'halted' ? 0xfca5a5 : curState === 'listening' ? 0x67e8f9 : pal.coreHex);
      _wireColor.setHex(curState === 'halted' ? 0xef4444 : curState === 'listening' ? 0x22d3ee : pal.wireHex);
      _waveColor.setHex(curState === 'halted' ? 0x991b1b : pal.waveHex);
      _deepColor.setHex(curState === 'halted' ? 0x7f1d1d : pal.deepOrangeHex);
      _reticleColor.setHex(curState === 'halted' ? 0xf87171 : pal.reticleHex);

      (scene.background as THREE.Color).lerp(_bgColor, 0.08);
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.lerp(_bgColor, 0.08);
      }

      // Animate interference wave ribbons
      hWaveMat.uniforms.uTime.value = elapsed * speedMult;
      hWaveMat.uniforms.uAudio.value = smoothedAudio;
      hWaveMat.uniforms.uColorA.value.lerp(_waveColor, 0.08);
      hWaveMat.uniforms.uColorB.value.lerp(_wireColor, 0.08);

      vWaveMat.uniforms.uTime.value = elapsed * speedMult;
      vWaveMat.uniforms.uAudio.value = smoothedAudio;
      vWaveMat.uniforms.uColorA.value.lerp(_deepColor, 0.08);
      vWaveMat.uniforms.uColorB.value.lerp(_coreColor, 0.08);

      // Animate Geodesic Core
      outerWireMesh.rotation.y += delta * 0.24 * speedMult;
      outerWireMesh.rotation.x += delta * 0.11 * speedMult;
      innerWireMesh.rotation.y -= delta * 0.34 * speedMult;
      innerWireMesh.rotation.z += delta * 0.15 * speedMult;

      const geoScale = 1.0 + smoothedAudio * 0.22 + Math.sin(elapsed * 2.1) * 0.025;
      geoSphereGroup.scale.setScalar(geoScale);
      outerWireMat.color.lerp(_coreColor, 0.08);
      innerWireMat.color.lerp(_wireColor, 0.08);

      plasmaMat.uniforms.uTime.value = elapsed;
      plasmaMat.uniforms.uAudio.value = smoothedAudio;
      plasmaMat.uniforms.uColorCore.value.lerp(_coreColor, 0.08);
      plasmaMat.uniforms.uColorEdge.value.lerp(_waveColor, 0.08);

      // Animate Target Reticle
      reticleGroup.position.x = -2.9 + Math.sin(elapsed * 0.55) * 0.35;
      reticleGroup.position.y = 0.72 + Math.cos(elapsed * 0.7) * 0.25;
      reticleRingMat.color.lerp(_reticleColor, 0.08);

      // Animate Bokeh & Code Sprites
      bokehMat.uniforms.uTime.value = elapsed * speedMult;
      bokehMat.uniforms.uAudio.value = smoothedAudio;
      bokehMat.uniforms.uTint.value.lerp(_wireColor, 0.08);

      for (const item of codeSprites) {
        const driftX = ((elapsed * item.speed * speedMult + item.baseX + 7.5) % 15.0) - 7.5;
        item.sprite.position.x = driftX;
        item.sprite.position.y = item.baseY + Math.sin(elapsed * 0.6 + item.phase) * 0.22;
        item.mat.color.lerp(_wireColor, 0.08);
      }

      // Smooth Zoom Damping
      if (!userZooming) {
        const desiredDist = BASE_DISTANCE / THREE.MathUtils.clamp(targetZoomRef.current, 0.5, 2.2);
        const curDist = camera.position.length();
        if (Math.abs(curDist - desiredDist) > 0.01) {
          const nextDist = THREE.MathUtils.damp(curDist, desiredDist, 8, delta);
          _camDir.copy(camera.position).normalize();
          camera.position.copy(_camDir.multiplyScalar(nextDist));
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (prefersReducedMotion) return;
      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    tick();

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', onControlsStart);
      controls.removeEventListener('end', onControlsEnd);
      controls.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);

      hWaveGeo.dispose();
      hWaveMat.dispose();
      vWaveGeo.dispose();
      vWaveMat.dispose();
      outerWireGeo.dispose();
      outerWireMat.dispose();
      innerWireGeo.dispose();
      innerWireMat.dispose();
      plasmaGeo.dispose();
      plasmaMat.dispose();
      reticleRingGeo.dispose();
      reticleDotGeo.dispose();
      reticleRingMat.dispose();
      bokehGeo.dispose();
      bokehMat.dispose();
      hexTexture.dispose();
      codeSprites.forEach((c) => {
        c.tex.dispose();
        c.mat.dispose();
      });

      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [particleBudget, audioLevelRef]);

  return (
    <div className="relative w-full h-full overflow-hidden select-none touch-none">
      <div ref={mountRef} className="w-full h-full" aria-label="ULTRON Animated Interference Core" />
      {contextLost && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#070402]/95 text-center p-6">
          <img
            src="/assets/aistudio/image_4905f6a6.png"
            alt="ULTRON Interference Fallback"
            className="w-72 h-56 object-cover rounded-xl border border-amber-500/30 mb-4"
            referrerPolicy="no-referrer"
          />
          <p className="font-display text-sm text-amber-300">
            WebGL context paused. Restoring animated holographic interference...
          </p>
        </div>
      )}
    </div>
  );
}
