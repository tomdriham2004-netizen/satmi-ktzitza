// A self-contained 3D stage for duels: its own scene, camera, lights,
// gradient backdrop, floating ambience and effects. Minigames dress it up.
import * as THREE from "three";
import { Effects } from "../render/effects.js";
import { Pawn } from "../render/characters.js";
import { damp } from "../core/tween.js";

export class Arena {
  constructor(stage, { top = '#6a5cff', bottom = '#ffb3c7', fog = null, ground = null, ambience = 'motes' } = {}) {
    this.stage = stage;
    this.scene = new THREE.Scene();
    this.scene.environment = stage.envMap;
    this.scene.environmentIntensity = 0.3;
    this.camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 400);
    this.camera.position.set(0, 5, 12);
    this.updaters = [];
    this.pawns = [];

    // backdrop dome
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(200, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: { uTop: { value: new THREE.Color(top) }, uBot: { value: new THREE.Color(bottom) } },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
        fragmentShader: `uniform vec3 uTop, uBot; varying vec3 vP;
          void main(){ float h = smoothstep(-0.35, 0.7, vP.y); vec3 c = mix(uBot, uTop, h);
          float glow = pow(max(0.0, 1.0 - abs(vP.y + 0.05) * 3.0), 3.0); c += uBot * glow * 0.25;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          }`,
      }),
    );
    sky.renderOrder = -10;
    this.scene.add(sky);
    this.sky = sky;
    if (fog) this.scene.fog = new THREE.Fog(fog, 30, 120);

    const hemi = new THREE.HemisphereLight('#ffffff', ground || bottom, 0.55);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight('#fff4e0', 2.4);
    key.position.set(6, 12, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 });
    key.shadow.camera.updateProjectionMatrix();
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 3;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(top, 1.1);
    rim.position.set(-8, 6, -10);
    this.scene.add(rim);
    this.key = key;

    this.fx = new Effects(this.scene, stage);
    this.fx.setScale(this.camera);

    if (ambience) this.addAmbience(ambience);

    // camera rig
    this.rig = { target: new THREE.Vector3(0, 1, 0), pos: new THREE.Vector3(0, 5, 12), lambda: 3 };
    this.camTarget = this.rig.target.clone();
    this.shakeAmt = 0;
  }

  addAmbience(kind) {
    const N = 160;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    const seeds = [];
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 40;
      pos[i * 3 + 1] = Math.random() * 14 - 3;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 40 - 5;
      seeds.push(Math.random() * 10);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: kind === 'stars' ? '#ffffff' : '#fff3d0', size: kind === 'stars' ? 0.12 : 0.09, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, m);
    this.scene.add(pts);
    this.updaters.push((dt, t) => {
      for (let i = 0; i < N; i++) {
        pos[i * 3 + 1] += dt * 0.25;
        pos[i * 3] += Math.sin(t * 0.5 + seeds[i]) * dt * 0.1;
        if (pos[i * 3 + 1] > 12) pos[i * 3 + 1] = -3;
      }
      geo.attributes.position.needsUpdate = true;
    });
  }

  spawn(player, pos, faceTo) {
    const p = new Pawn(player.charId, { scale: 1.35 });
    p.root.position.copy(pos);
    if (faceTo) p.faceTowards(faceTo, true);
    this.scene.add(p.root);
    this.pawns.push(p);
    return p;
  }

  /** Set the camera goal (eased every frame). */
  look(pos, target, lambda = 3) {
    this.rig.pos.copy(pos);
    this.rig.target.copy(target);
    this.rig.lambda = lambda;
  }
  snap(pos, target) {
    this.rig.pos.copy(pos); this.rig.target.copy(target);
    this.camera.position.copy(pos); this.camTarget.copy(target);
    this.camPos = pos.clone();
    this.camera.lookAt(target);
  }
  shake(a = 0.3) { this.shakeAmt = Math.max(this.shakeAmt, a); }

  update(dt, t, realDt) {
    const k = this.rig.lambda;
    // keep the action framed on narrow / portrait screens
    const fit = Math.min(2.2, Math.max(1, 1.55 / this.camera.aspect));
    this.camPos = this.camPos || this.camera.position.clone();
    const c = this.camPos;
    c.x = damp(c.x, this.rig.pos.x, k, realDt);
    c.y = damp(c.y, this.rig.pos.y, k, realDt);
    c.z = damp(c.z, this.rig.pos.z, k, realDt);
    this.camTarget.x = damp(this.camTarget.x, this.rig.target.x, k, realDt);
    this.camTarget.y = damp(this.camTarget.y, this.rig.target.y, k, realDt);
    this.camTarget.z = damp(this.camTarget.z, this.rig.target.z, k, realDt);
    this.camera.position.copy(this.camTarget).addScaledVector(c.clone().sub(this.camTarget), fit);
    this.camera.lookAt(this.camTarget);
    if (this.shakeAmt > 0.002) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmt;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= Math.exp(-6 * realDt);
    }
    for (const fn of this.updaters) fn(dt, t);
    for (const p of this.pawns) p.update(dt, t, this.camera);
    this.fx.update(dt);
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o.geometry && !o.geometry.userData?.cached) o.geometry.dispose();
      if (o.material && o.userData.ownMaterial) o.material.dispose?.();
    });
    this.pawns = [];
    this.updaters = [];
  }
}
