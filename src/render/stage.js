// Renderer, post-processing chain and the frame loop.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { clock } from "../core/tween.js";
import { input } from "../core/input.js";

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uVignette: { value: 0.55 },
    uGrain: { value: 0.028 },
    uSat: { value: 1.08 },
    uContrast: { value: 1.07 },
    uTilt: { value: 0.5 },
    uFocus: { value: 0.46 },
    uFocusWidth: { value: 0.24 },
    uCA: { value: 0.006 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color('#ffffff') },
    uDesat: { value: 0 },
    uTint: { value: new THREE.Color(1, 1, 1) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 uRes;
    uniform float uTime, uVignette, uGrain, uSat, uContrast, uTilt, uFocus, uFocusWidth, uCA, uFlash, uDesat;
    uniform vec3 uFlashColor, uTint;
    varying vec2 vUv;

    vec3 blurSample(vec2 uv, float r) {
      vec3 acc = texture2D(tDiffuse, uv).rgb;
      float w = 1.0;
      for (int i = 0; i < 16; i++) {
        float fi = float(i);
        float a = fi * 2.39996;
        float d = sqrt(fi + 0.5) / 4.0;
        vec2 o = vec2(cos(a), sin(a)) * d * r / uRes;
        acc += texture2D(tDiffuse, uv + o).rgb;
        w += 1.0;
      }
      return acc / w;
    }

    void main() {
      vec2 uv = vUv;
      vec2 dc = uv - 0.5;
      float r2 = dot(dc, dc);
      float dy = abs(uv.y - uFocus);
      float blur = smoothstep(uFocusWidth, uFocusWidth + 0.38, dy) * uTilt;
      vec3 col = blur > 0.02 ? blurSample(uv, blur * 7.0) : texture2D(tDiffuse, uv).rgb;
      if (uCA > 0.0) {
        col.r = mix(col.r, texture2D(tDiffuse, uv + dc * uCA * r2 * 4.0).r, 0.7);
        col.b = mix(col.b, texture2D(tDiffuse, uv - dc * uCA * r2 * 4.0).b, 0.7);
      }
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat * (1.0 - uDesat));
      col = (col - 0.5) * uContrast + 0.5;
      col *= uTint;
      float vig = smoothstep(1.05, 0.28, length(dc * vec2(1.0, 0.9)));
      col *= mix(1.0, vig, uVignette);
      float n = fract(sin(dot(uv * uRes + fract(uTime) * 91.7, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * uGrain;
      col = mix(col, uFlashColor, uFlash);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

export class Stage {
  constructor(container, { quality = 'high' } = {}) {
    this.container = container;
    this.quality = quality;
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 2 : 1.25));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.1, 800);

    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.55;

    this.activeScene = this.scene;
    this.activeCamera = this.camera;

    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: quality === 'high' ? 4 : 0,
    });
    this.composer = new EffectComposer(renderer, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.3, 0.42, 1.05);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.grade.uniforms.uRes.value.set(size.x, size.y);

    this.updaters = new Set();
    this.last = performance.now();
    this.fps = 60;

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setQuality(q) {
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q === 'high' ? 2 : 1.25));
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    for (const cam of [this.camera, this.activeCamera]) {
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.grade.uniforms.uRes.value.set(size.x, size.y);
  }

  /** Switch what is rendered (board ↔ minigame arena). */
  setView(scene, camera) {
    this.activeScene = scene;
    this.activeCamera = camera;
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }

  onUpdate(fn) { this.updaters.add(fn); return () => this.updaters.delete(fn); }

  /** Advance one frame. Exposed for debugging (fast-forwarding a throttled tab). */
  frame(realDt, render = true) {
    const dt = clock.update(realDt);
    for (const fn of this.updaters) fn(dt, clock.time, realDt);
    this.grade.uniforms.uTime.value = clock.realTime;
    if (render) this.composer.render(realDt);
    input.endFrame();
  }

  start() {
    const loop = (now) => {
      requestAnimationFrame(loop);
      const realDt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.fps = this.fps * 0.95 + (1 / Math.max(realDt, 1e-3)) * 0.05;
      this.frame(realDt, true);
    };
    requestAnimationFrame(loop);
  }
}
