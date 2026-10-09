import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { AvatarEmotion } from '@/types';

export interface TalkingHeadOptions {
  url?: string;
  accentColor?: number;
  skinTone?: number;
  /** Cap for devicePixelRatio (2 = HD, ~1.25 = low-power). */
  pixelRatio?: number;
  onReady?: () => void;
  onError?: (err: Error) => void;
}

/* Ready Player Me / ARKit blendshape aliases → normalised controls. */
const MORPH = {
  jawOpen: ['jawOpen', 'JawOpen', 'viseme_aa', 'viseme_AA', 'mouthOpen'],
  smile: ['mouthSmile', 'mouthSmileLeft', 'mouthSmileRight', 'viseme_sil', 'mouthSmile_L', 'mouthSmile_R'],
  browUp: ['browInnerUp', 'browDownLeft', 'browDownRight', 'browInnerUp_L', 'browInnerUp_R'],
  blink: ['eyeBlink', 'eyeBlinkLeft', 'eyeBlinkRight', 'eyesClosed', 'Fcl_EYE_Close'],
  frown: ['mouthFrown', 'mouthFrownLeft', 'mouthFrownRight', 'viseme_FF'],
  pucker: ['mouthPucker', 'viseme_O', 'viseme_OW'],
};

/**
 * TalkingHead — a real-time 3D interviewer avatar.
 *
 * Primary path: loads a Ready Player Me GLB and drives ARKit/RPM morph targets
 * (visemes for lip-sync, eyeBlink, brow, smile) plus head-pose motion.
 * Fallback path: a fully procedural stylised head built in-scene, so the app
 * works offline with zero asset downloads.
 */
export class TalkingHead {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;

  private headPivot = new THREE.Group();
  private procedural: THREE.Group | null = null;

  /* procedural parts */
  private eyelids: THREE.Mesh[] = [];
  private eyes: THREE.Group[] = [];
  private mouth!: THREE.Mesh;
  private jawGroup = new THREE.Group();
  private brows: THREE.Mesh[] = [];

  /* morph target lookups for GLB path */
  private morphTargets: { mesh: THREE.Mesh; index: number; key: keyof typeof MORPH }[] = [];

  /* state */
  private level = 0;
  private levelSmooth = 0;
  private emotion: AvatarEmotion = 'neutral';
  private emotionUntil = 0;
  private gaze = new THREE.Vector2(0, 0);
  private gazeTarget = new THREE.Vector2(0, 0);
  private blinkAt = 1.4;
  private blinkPhase = 0;
  private time = 0;
  private speakingFlag = false;
  private nodImpulse = 0;
  private loading = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly opts: TalkingHeadOptions = {},
  ) {
    const w = container.clientWidth || 640;
    const h = container.clientHeight || 480;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.pixelRatio ?? 2));
    this.renderer.setSize(w, h, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(28, w / h, 0.1, 100);
    this.camera.position.set(0, 0.12, 4.6);

    this.setupLights();
    this.scene.add(this.headPivot);
    this.buildProceduralHead();

    this.resize();
    this.animate();

    if (opts.url) void this.loadModel(opts.url);
  }

  /* ------------------------------ lighting -------------------------------- */

  private setupLights() {
    const hemi = new THREE.HemisphereLight(0xdfe9ff, 0x101426, 1.15);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(2.2, 3.0, 3.2);
    key.castShadow = false;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x9dbaff, 0.75);
    fill.position.set(-3.0, 0.6, 1.6);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0x38f2c6, 0.85);
    rim.position.set(-1.4, 2.4, -3.4);
    this.scene.add(rim);

    const warm = new THREE.PointLight(0xffc8a8, 0.6, 12);
    warm.position.set(1.4, -0.8, 2.4);
    this.scene.add(warm);
  }

  /* ----------------------- procedural stylised head ------------------------ */

  private buildProceduralHead() {
    const g = new THREE.Group();
    this.procedural = g;

    const skin = this.opts.skinTone ?? 0xd9a884;
    const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.62, metalness: 0.02 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x241c1a, roughness: 0.85 });
    const clothMat = new THREE.MeshStandardMaterial({
      color: this.opts.accentColor ?? 0x1f2a4a,
      roughness: 0.75,
    });

    // Torso / shoulders
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.78, 0.5, 8, 24), clothMat);
    torso.position.y = -1.62;
    torso.scale.set(1.15, 1, 0.72);
    g.add(torso);

    // Collar
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 12, 32, Math.PI), clothMat);
    collar.position.y = -1.12;
    collar.rotation.x = Math.PI / 2;
    collar.rotation.z = Math.PI;
    g.add(collar);

    // Neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.4, 24), skinMat);
    neck.position.y = -1.02;
    g.add(neck);

    // Head group pivots around the neck for nods/turns
    const head = new THREE.Group();
    head.position.y = -0.85;
    this.headPivot.add(head);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.62, 48, 40), skinMat);
    skull.scale.set(1, 1.14, 1.02);
    skull.position.y = 0.62;
    head.add(skull);

    // Jaw (rotates for mouth-open when morphs are absent)
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.5, 40, 28, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), skinMat);
    jaw.scale.set(1, 0.8, 1);
    jaw.position.y = 0.36;
    this.jawGroup.add(jaw);
    head.add(this.jawGroup);

    // Ears
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), skinMat);
      ear.scale.set(0.5, 1, 0.7);
      ear.position.set(side * 0.62, 0.6, -0.03);
      head.add(ear);
    }

    // Nose
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.24, 16), skinMat);
    nose.rotation.x = Math.PI * 0.52;
    nose.position.set(0, 0.56, 0.6);
    head.add(nose);

    // Eyes
    const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf7f9ff, roughness: 0.25 });
    const irisMat = new THREE.MeshStandardMaterial({ color: 0x3b6fd6, roughness: 0.2 });
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x090b14, roughness: 0.15 });
    const lidMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6, side: THREE.DoubleSide });

    for (const side of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(side * 0.24, 0.72, 0.44);

      const white = new THREE.Mesh(new THREE.SphereGeometry(0.125, 24, 20), eyeWhiteMat);
      white.scale.set(1, 1, 0.72);
      eye.add(white);

      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.062, 20, 16), irisMat);
      iris.position.z = 0.078;
      eye.add(iris);

      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), pupilMat);
      pupil.position.z = 0.11;
      eye.add(pupil);

      const glint = new THREE.Mesh(
        new THREE.SphereGeometry(0.014, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      glint.position.set(0.028, 0.03, 0.125);
      eye.add(glint);

      // Eyelid: a sphere shell scaled over the eye
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.135, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), lidMat);
      lid.position.y = 0.005;
      lid.rotation.x = -0.06;
      eye.add(lid);
      this.eyelids.push(lid);

      head.add(eye);
      this.eyes.push(eye);
    }

    // Brows
    const browMat = new THREE.MeshStandardMaterial({ color: 0x2a211d, roughness: 0.9 });
    for (const side of [-1, 1]) {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.045, 0.05), browMat);
      brow.position.set(side * 0.24, 0.9, 0.5);
      brow.rotation.z = side * -0.08;
      head.add(brow);
      this.brows.push(brow);
    }

    // Mouth — outer lip ring + inner dark cavity scaled by openness
    const lipMat = new THREE.MeshStandardMaterial({ color: 0xa9645c, roughness: 0.5 });
    const cavityMat = new THREE.MeshStandardMaterial({ color: 0x360f12, roughness: 0.9 });

    const lips = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.032, 12, 32), lipMat);
    lips.scale.set(1, 0.5, 1);
    lips.position.set(0, 0.34, 0.56);
    head.add(lips);

    this.mouth = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 16), cavityMat);
    this.mouth.scale.set(1, 0.1, 0.35);
    this.mouth.position.set(0, 0.34, 0.5);
    head.add(this.mouth);

    // Hair cap
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.645, 40, 32, 0, Math.PI * 2, 0, Math.PI * 0.58),
      hairMat,
    );
    hair.scale.set(1, 1.1, 1.03);
    hair.position.y = 0.63;
    head.add(hair);

    g.position.y = 1.15;
    this.scene.add(g);
  }

  /* ------------------------------ GLB loading ------------------------------ */

  async loadModel(url: string): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    try {
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(url);

      const model = gltf.scene;
      model.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          const dict = mesh.morphTargetDictionary;
          if (dict) {
            for (const key of Object.keys(MORPH) as (keyof typeof MORPH)[]) {
              for (const alias of MORPH[key]) {
                const index = dict[alias];
                if (index !== undefined) {
                  this.morphTargets.push({ mesh, index, key });
                  break;
                }
              }
            }
          }
        }
      });

      // Frame the model: Ready Player Me avatars are ~1.7m tall at origin.
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const targetHeight = 2.6;
      const scale = size.y > 0 ? targetHeight / size.y : 1;
      model.scale.setScalar(scale);

      const scaledBox = new THREE.Box3().setFromObject(model);
      const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
      model.position.x -= scaledCenter.x;
      model.position.z -= scaledCenter.z;
      model.position.y -= scaledBox.min.y + 0.35;

      // Aim the camera at head height.
      this.camera.position.set(0, targetHeight * 0.74, 5.0);
      this.camera.lookAt(0, targetHeight * 0.74, 0);

      this.headPivot.add(model);

      // Hide the procedural head if we successfully mounted a real avatar.
      if (this.procedural) this.procedural.visible = false;

      this.opts.onReady?.();
    } catch (err) {
      // Keep the procedural head — never leave the tile empty.
      this.opts.onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.loading = false;
    }
  }

  /* --------------------------------- API ---------------------------------- */

  setLevel(v: number) {
    this.level = Math.max(0, Math.min(1, v));
    this.speakingFlag = v > 0.03;
  }

  setSpeaking(on: boolean) {
    this.speakingFlag = on;
    if (!on) this.level = 0;
  }

  setEmotion(emotion: AvatarEmotion, holdMs = 2200) {
    this.emotion = emotion;
    this.emotionUntil = performance.now() + holdMs;
    if (emotion === 'nod') this.nodImpulse = 1;
  }

  /** Normalised -1..1 screen-space gaze target (eye/head tracking). */
  setGaze(x: number, y: number) {
    this.gazeTarget.set(
      Math.max(-1, Math.min(1, x)),
      Math.max(-1, Math.min(1, y)),
    );
  }

  resize() {
    const w = this.container.clientWidth || 640;
    const h = this.container.clientHeight || 480;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private applyMorphs(key: keyof typeof MORPH, value: number) {
    for (const t of this.morphTargets) {
      if (t.key === key) t.mesh.morphTargetInfluences![t.index] = value;
    }
  }

  private hasMorph(key: keyof typeof MORPH) {
    return this.morphTargets.some((t) => t.key === key);
  }

  /* -------------------------------- loop ---------------------------------- */

  private animate = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private update(dt: number) {
    const t = this.time;

    // Smooth mouth level
    this.levelSmooth += (this.level - this.levelSmooth) * Math.min(1, dt * 16);

    if (performance.now() > this.emotionUntil && this.emotion !== 'neutral') {
      this.emotion = 'neutral';
    }

    /* ---- gaze smoothing ---- */
    this.gaze.lerp(this.gazeTarget, Math.min(1, dt * 6));

    /* ---- idle breathing + micro-motion ---- */
    const breathe = Math.sin(t * 1.5) * 0.012;
    const idleYaw = Math.sin(t * 0.55) * 0.05 + Math.sin(t * 0.23) * 0.03;
    const idlePitch = Math.sin(t * 0.42 + 1.2) * 0.03;

    /* ---- emotion shaping ---- */
    let browRaise = 0;
    let smile = 0;
    let frown = 0;
    let targetNod = 0;
    let yawScale = 1;

    switch (this.emotion) {
      case 'nod':
        targetNod = Math.sin(t * 9) * 0.16;
        browRaise = 0.15;
        break;
      case 'smile':
        smile = 0.55;
        browRaise = 0.2;
        break;
      case 'impressed':
        smile = 0.35;
        browRaise = 0.6;
        break;
      case 'thinking':
        frown = 0.25;
        yawScale = 0.6;
        break;
      case 'concern':
        frown = 0.55;
        browRaise = -0.2;
        yawScale = 0.7;
        break;
      default:
        smile = 0.1;
    }

    this.nodImpulse *= Math.pow(0.02, dt);
    if (this.emotion === 'nod') this.nodImpulse = Math.max(this.nodImpulse, 0.6);

    /* ---- head pose ---- */
    this.headPivot.rotation.y = (idleYaw + this.gaze.x * 0.28) * yawScale;
    this.headPivot.rotation.x = idlePitch - this.gaze.y * 0.14 + targetNod - this.nodImpulse * 0.1;
    this.headPivot.rotation.z = Math.sin(t * 0.31) * 0.025;
    this.headPivot.position.y = breathe;

    /* ---- blinking ---- */
    this.blinkAt -= dt;
    if (this.blinkAt <= 0) {
      this.blinkPhase = 1;
      this.blinkAt = 2.2 + Math.random() * 3.4;
    }
    if (this.blinkPhase > 0) this.blinkPhase = Math.max(0, this.blinkPhase - dt * 7);
    const blinkShape = Math.sin(this.blinkPhase * Math.PI);
    const autoBlink = this.emotion === 'concern' ? 0.45 : 0;

    /* ---- eyes track gaze ---- */
    for (const eye of this.eyes) {
      eye.rotation.y = this.gaze.x * 0.22;
      eye.rotation.x = -this.gaze.y * 0.16;
    }

    const lidClose = Math.min(1, blinkShape + autoBlink);
    for (const lid of this.eyelids) {
      lid.scale.set(1, 1 + lidClose * 3.4, 1);
      lid.position.y = 0.005 - lidClose * 0.12;
    }

    /* ---- mouth / lip-sync ---- */
    const open = this.levelSmooth;
    if (this.hasMorph('jawOpen')) {
      this.applyMorphs('jawOpen', open * 0.95);
      this.applyMorphs('smile', Math.max(smile, open * 0.1));
      this.applyMorphs('browUp', Math.max(0, browRaise));
      this.applyMorphs('blink', lidClose);
      this.applyMorphs('frown', Math.max(0, frown));
      this.applyMorphs('pucker', Math.max(0, 0.2 - open) * (this.speakingFlag ? 0.4 : 0));
    } else if (this.procedural) {
      const w = 1 + smile * 0.35 - frown * 0.2;
      this.mouth.scale.set(w, 0.1 + open * 2.4, 0.35);
      this.mouth.position.y = 0.34 - open * 0.045;
      this.jawGroup.rotation.x = open * 0.24;

      for (const brow of this.brows) {
        brow.position.y = 0.9 + browRaise * 0.06 + Math.sin(t * 1.7) * 0.004;
        brow.rotation.z += ((brow.position.x > 0 ? -1 : 1) * (0.08 + smile * 0.05 - frown * 0.04) - brow.rotation.z) * 0.2;
      }
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
