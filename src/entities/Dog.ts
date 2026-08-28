import * as THREE from 'three';
import { CONFIG } from '../config';

const C_FUR = 0xd07a34;
const C_CREAM = 0xf6e7d0;
const C_DARK = 0x1a1614;
const C_COLLAR = 0xc03a3a;

export type DogPose = 'idle' | 'walk' | 'brace' | 'beg';

export interface DogSnapshot {
  x: number;
  z: number;
  facing: number;
  walkPhase: number;
  poseBlend: number;
  begTimer: number;
  pose: DogPose;
}

/** 柴犬。プリミティブの寄せ集めで作る。y=0 が地面。 */
export class Dog {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group(); // 姿勢（伏せ・お座り）用の内側グループ
  private readonly legs: THREE.Mesh[] = [];
  private readonly ears: THREE.Mesh[] = [];
  private readonly tail = new THREE.Group();
  private readonly gem: THREE.Mesh;

  readonly position = new THREE.Vector3(0, 0, 0);
  /** このフレームで犬が自分の意思で動いた量（リードの引っ張り判定に使う） */
  readonly lastDelta = new THREE.Vector2();
  facing = 0;              // Y軸まわりの向き（ラジアン）
  pose: DogPose = 'idle';
  braceTimer = 0;          // 拒否柴の見た目を少し尾を引かせる
  begTimer = 0;            // 抱っこをせがむモーションの残り時間
  gemActive = false;       // 首輪のアイテムが光っているか

  private walkPhase = 0;
  private poseBlend = 0;   // 0 = 立ち, 1 = 伏せ

  constructor() {
    const fur = new THREE.MeshLambertMaterial({ color: C_FUR });
    const cream = new THREE.MeshLambertMaterial({ color: C_CREAM });
    const dark = new THREE.MeshBasicMaterial({ color: C_DARK });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 4, 12), fur);
    torso.rotation.x = Math.PI / 2;
    torso.position.set(0, 0.42, 0);
    this.body.add(torso);

    const belly = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.36, 4, 10), cream);
    belly.rotation.x = Math.PI / 2;
    belly.position.set(0, 0.33, 0.02);
    this.body.add(belly);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), fur);
    head.position.set(0, 0.58, 0.34);
    this.body.add(head);

    const cheeks = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), cream);
    cheeks.scale.set(1.05, 0.7, 0.8);
    cheeks.position.set(0, 0.52, 0.42);
    this.body.add(cheeks);

    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.14), cream);
    snout.position.set(0, 0.53, 0.5);
    this.body.add(snout);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), dark);
    nose.position.set(0, 0.55, 0.57);
    this.body.add(nose);

    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.16, 4), fur);
      ear.position.set(sx * 0.11, 0.73, 0.3);
      ear.rotation.z = sx * 0.18;
      this.body.add(ear);
      this.ears.push(ear);

      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), dark);
      eye.position.set(sx * 0.085, 0.61, 0.47);
      this.body.add(eye);

      for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.32, 8), fur);
        leg.position.set(sx * 0.13, 0.16, sz * 0.22);
        this.body.add(leg);
        this.legs.push(leg);
      }
    }

    // くるんと巻いた尻尾
    const tailSeg = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.045, 6, 14, Math.PI * 1.4), cream);
    tailSeg.rotation.y = Math.PI / 2;
    this.tail.position.set(0, 0.6, -0.3);
    this.tail.add(tailSeg);
    this.body.add(this.tail);

    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.175, 0.035, 6, 16),
      new THREE.MeshLambertMaterial({ color: C_COLLAR }),
    );
    collar.position.set(0, 0.5, 0.19);
    collar.rotation.x = 0.25;
    this.body.add(collar);

    this.gem = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.062, 0),
      new THREE.MeshBasicMaterial({ color: 0x6fd6ff }),
    );
    this.gem.position.set(0, 0.37, 0.29);
    this.body.add(this.gem);

    this.body.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
      }
    });

    this.root.add(this.body);
  }

  /** リードの根本（首輪の位置）をワールド座標で返す */
  getCollarPoint(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(0, 0.5, 0.22).applyEuler(new THREE.Euler(0, this.facing, 0)).add(this.position);
  }

  /**
   * 入力にしたがって動かす。リードによる制限は Leash 側で後からかける。
   * @returns このフレームで動こうとした方向（リードが張っているかの判定に使う）
   */
  update(dt: number, move: THREE.Vector2, bracing: boolean): void {
    const speed = CONFIG.dogSpeed * (bracing ? CONFIG.braceSpeedFactor : 1);
    this.lastDelta.set(0, 0);
    if (move.lengthSq() > 0.0001) {
      this.lastDelta.set(move.x * speed * dt, move.y * speed * dt);
      this.position.x += this.lastDelta.x;
      this.position.z += this.lastDelta.y;
      const target = Math.atan2(move.x, move.y);
      this.facing = approachAngle(this.facing, target, CONFIG.dogTurnSpeed * dt);
      this.walkPhase += dt * (bracing ? 2 : 11);
    } else {
      this.walkPhase += dt * 1.5;
    }

    if (this.begTimer > 0) this.begTimer -= dt;
    this.pose = this.begTimer > 0 ? 'beg' : bracing ? 'brace' : move.lengthSq() > 0.0001 ? 'walk' : 'idle';
    this.applyPose(dt, move.lengthSq() > 0.0001);
  }

  private applyPose(dt: number, moving: boolean): void {
    const wantLow = this.pose === 'brace' ? 1 : 0;
    this.poseBlend += (wantLow - this.poseBlend) * Math.min(1, dt * 10);

    // 伏せると腰が落ちて、耳が寝る
    this.body.position.y = -0.13 * this.poseBlend;
    this.body.rotation.x = 0.16 * this.poseBlend;
    for (let i = 0; i < this.ears.length; i++) {
      this.ears[i].rotation.x = 0.9 * this.poseBlend;
    }

    // 抱っこをせがむ：前足を上げて立ち上がる
    if (this.pose === 'beg') {
      const t = Math.min(1, (CONFIG.crouchDuration * 0.35 - this.begTimer) * 6 + 0.4);
      this.body.rotation.x = -0.55 * Math.min(1, t);
      this.body.position.y = 0.1 * Math.min(1, t);
    }

    // 歩行：前後の足を交互に振る
    const swing = Math.sin(this.walkPhase) * (moving ? 0.55 : 0.05);
    for (let i = 0; i < this.legs.length; i++) {
      const phase = i === 0 || i === 3 ? 1 : -1;
      this.legs[i].rotation.x = swing * phase * (1 - this.poseBlend);
    }

    // 尻尾は常に振っている
    this.tail.rotation.z = Math.sin(this.walkPhase * 1.7) * 0.35;

    // 首輪のアイテム
    const pulse = 0.9 + Math.sin(performance.now() * 0.006) * 0.35;
    this.gem.scale.setScalar(this.gemActive ? pulse * 1.5 : 1);
    (this.gem.material as THREE.MeshBasicMaterial).color.setHex(this.gemActive ? 0xbdefff : 0x3f7f96);
  }

  /** 位置と向きをシーングラフに反映する */
  sync(): void {
    this.root.position.copy(this.position);
    this.root.rotation.y = this.facing;
  }

  /** タイムリープ用のスナップショット */
  capture(): DogSnapshot {
    return {
      x: this.position.x,
      z: this.position.z,
      facing: this.facing,
      walkPhase: this.walkPhase,
      poseBlend: this.poseBlend,
      begTimer: this.begTimer,
      pose: this.pose,
    };
  }

  restore(s: DogSnapshot): void {
    this.position.set(s.x, 0, s.z);
    this.facing = s.facing;
    this.walkPhase = s.walkPhase;
    this.poseBlend = s.poseBlend;
    this.begTimer = s.begTimer;
    this.pose = s.pose;
    this.applyPose(1, s.pose === 'walk');
    this.sync();
  }

  beg(): void {
    this.begTimer = CONFIG.crouchDuration * 0.35;
  }
}

export function approachAngle(current: number, target: number, maxDelta: number): number {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return current + THREE.MathUtils.clamp(d, -maxDelta, maxDelta);
}
