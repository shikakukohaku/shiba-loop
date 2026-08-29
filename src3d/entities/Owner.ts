import * as THREE from 'three';
import { CONFIG } from '../config';
import { approachAngle } from './Dog';

export type OwnerState = 'WALKING' | 'STOPPED' | 'CROUCHING' | 'DEAD';

export interface OwnerSnapshot {
  x: number;
  z: number;
  facing: number;
  state: OwnerState;
  crouchTimer: number;
  stopTimer: number;
  waypointIndex: number;
  crouchBlend: number;
  deathBlend: number;
  walkPhase: number;
  sinking: boolean;
  sinkBlend: number;
}

const C_COAT = 0x4a6fa5;
const C_PANTS = 0x39404d;
const C_SKIN = 0xe8bb96;
const C_HAIR = 0x2b2320;

/** 飼い主。プレイヤーは操作できない。Waypoint を順に歩くだけ。 */
export class Owner {
  readonly root = new THREE.Group();
  private readonly figure = new THREE.Group(); // しゃがみ・転倒用
  private readonly legs: THREE.Mesh[] = [];
  private readonly arms: THREE.Mesh[] = [];

  readonly position = new THREE.Vector3();
  facing = 0;
  state: OwnerState = 'WALKING';
  waypointIndex = 0;
  crouchTimer = 0;
  stopTimer = 0;

  private waypoints: THREE.Vector2[] = [];
  private crouchBlend = 0;
  private deathBlend = 0;
  private sinking = false;  // マンホールに落ちた場合は倒れずに沈む
  private sinkBlend = 0;
  private walkPhase = 0;
  private speedFactor = 1; // 拒否柴などによる減速（毎フレーム外から設定）

  constructor(waypoints: THREE.Vector2[]) {
    this.waypoints = waypoints;

    const coat = new THREE.MeshLambertMaterial({ color: C_COAT });
    const pants = new THREE.MeshLambertMaterial({ color: C_PANTS });
    const skin = new THREE.MeshLambertMaterial({ color: C_SKIN });
    const hair = new THREE.MeshLambertMaterial({ color: C_HAIR });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.42, 4, 12), coat);
    torso.position.y = 1.02;
    this.figure.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(CONFIG.ownerHeadRadius, 16, 12), skin);
    head.position.y = CONFIG.ownerHeadHeight;
    this.figure.add(head);

    const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(0.31, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), hair);
    hairMesh.position.y = CONFIG.ownerHeadHeight + 0.02;
    this.figure.add(hairMesh);

    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.44, 4, 8), pants);
      leg.position.set(sx * 0.11, 0.42, 0);
      this.figure.add(leg);
      this.legs.push(leg);

      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.36, 4, 8), coat);
      arm.position.set(sx * 0.29, 1.02, 0);
      this.figure.add(arm);
      this.arms.push(arm);
    }

    this.figure.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    this.root.add(this.figure);
  }

  get headHeight(): number {
    const stand = THREE.MathUtils.lerp(CONFIG.ownerHeadHeight, CONFIG.ownerCrouchHeadHeight, this.crouchBlend);
    if (this.sinking) return stand - CONFIG.manholeSinkDepth * this.sinkBlend;
    return THREE.MathUtils.lerp(stand, 0.35, this.deathBlend);
  }

  getHeadPoint(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.position.x, this.headHeight, this.position.z);
  }

  /** リードを握っている手の位置 */
  getHandPoint(out = new THREE.Vector3()): THREE.Vector3 {
    const y = THREE.MathUtils.lerp(0.95, 0.5, Math.max(this.crouchBlend, this.deathBlend));
    const side = new THREE.Vector3(0.3, 0, 0.05).applyEuler(new THREE.Euler(0, this.facing, 0));
    return out.set(this.position.x + side.x, y, this.position.z + side.z);
  }

  setSpeedFactor(f: number): void {
    this.speedFactor = f;
  }

  crouch(): void {
    if (this.state === 'DEAD') return;
    this.state = 'CROUCHING';
    this.crouchTimer = CONFIG.crouchDuration;
  }

  stopFor(seconds: number): void {
    if (this.state === 'DEAD' || this.state === 'CROUCHING') return;
    this.state = 'STOPPED';
    this.stopTimer = Math.max(this.stopTimer, seconds);
  }

  /** sink=true ならその場に沈む（マンホール用） */
  kill(sink = false): void {
    this.state = 'DEAD';
    this.sinking = sink;
  }

  update(dt: number): void {
    if (this.state === 'DEAD') {
      if (this.sinking) this.sinkBlend = Math.min(1, this.sinkBlend + dt * 1.7);
      else this.deathBlend = Math.min(1, this.deathBlend + dt * 2.4);
      this.applyPose(dt, false);
      return;
    }

    if (this.state === 'CROUCHING') {
      this.crouchTimer -= dt;
      if (this.crouchTimer <= 0) this.state = 'WALKING';
    } else if (this.state === 'STOPPED') {
      this.stopTimer -= dt;
      if (this.stopTimer <= 0) this.state = 'WALKING';
    }

    let moving = false;
    if (this.state === 'WALKING') {
      const speed = CONFIG.ownerSpeed * this.speedFactor;
      const wp = this.waypoints[Math.min(this.waypointIndex, this.waypoints.length - 1)];
      const dx = wp.x - this.position.x;
      const dz = wp.y - this.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.35 && this.waypointIndex < this.waypoints.length - 1) {
        this.waypointIndex++;
      }
      if (dist > 0.001) {
        const step = Math.min(speed * dt, dist);
        this.position.x += (dx / dist) * step;
        this.position.z += (dz / dist) * step;
        this.facing = approachAngle(this.facing, Math.atan2(dx, dz), CONFIG.ownerTurnSpeed * dt);
        moving = step > 0.0005;
      }
      this.walkPhase += dt * speed * 4.2;
    }

    this.applyPose(dt, moving);
  }

  private applyPose(dt: number, moving: boolean): void {
    const wantCrouch = this.state === 'CROUCHING' ? 1 : 0;
    this.crouchBlend += (wantCrouch - this.crouchBlend) * Math.min(1, dt * 9);

    // しゃがむ：全体を沈めて脚を折る
    this.figure.position.y = -0.42 * this.crouchBlend;
    this.figure.scale.y = 1 - 0.28 * this.crouchBlend;
    for (const leg of this.legs) {
      leg.rotation.x = 0.7 * this.crouchBlend + (moving ? Math.sin(this.walkPhase) * 0.35 : 0) * (1 - this.crouchBlend);
    }
    for (let i = 0; i < this.arms.length; i++) {
      const s = i === 0 ? 1 : -1;
      this.arms[i].rotation.x = -0.5 * this.crouchBlend + (moving ? Math.sin(this.walkPhase) * 0.3 * s : 0);
    }

    if (this.sinking) {
      // マンホールに落ちる：倒れずに沈む
      this.figure.rotation.x = 0;
      this.figure.position.y = -CONFIG.manholeSinkDepth * ease(this.sinkBlend);
      return;
    }

    // 倒れる
    this.figure.rotation.x = (Math.PI / 2) * ease(this.deathBlend);
    if (this.deathBlend > 0) this.figure.position.y = -0.42 * this.crouchBlend + 0.1 * (1 - this.deathBlend);
  }

  sync(): void {
    this.root.position.copy(this.position);
    this.root.rotation.y = this.facing;
  }

  /** タイムリープ用のスナップショット */
  capture(): OwnerSnapshot {
    return {
      x: this.position.x,
      z: this.position.z,
      facing: this.facing,
      state: this.state,
      crouchTimer: this.crouchTimer,
      stopTimer: this.stopTimer,
      waypointIndex: this.waypointIndex,
      crouchBlend: this.crouchBlend,
      deathBlend: this.deathBlend,
      walkPhase: this.walkPhase,
      sinking: this.sinking,
      sinkBlend: this.sinkBlend,
    };
  }

  restore(s: OwnerSnapshot): void {
    this.position.set(s.x, 0, s.z);
    this.facing = s.facing;
    this.state = s.state;
    this.crouchTimer = s.crouchTimer;
    this.stopTimer = s.stopTimer;
    this.waypointIndex = s.waypointIndex;
    this.crouchBlend = s.crouchBlend;
    this.deathBlend = s.deathBlend;
    this.walkPhase = s.walkPhase;
    this.sinking = s.sinking;
    this.sinkBlend = s.sinkBlend;
    this.speedFactor = 1;
    this.applyPose(1, false);
    this.sync();
  }

  get crouching(): number {
    return this.crouchBlend;
  }
}

function ease(t: number): number {
  return t * t * (3 - 2 * t);
}
