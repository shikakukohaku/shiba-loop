import * as THREE from 'three';
import { CONFIG } from '../config';
import { SIGN_ORIGIN } from '../world/World';
import type { Advice, Hazard, HazardContext } from './Hazard';
import type { Owner } from '../entities/Owner';

type Phase = 'armed' | 'waiting' | 'flying' | 'falling' | 'landed' | 'spent';

interface SignSnapshot {
  phase: Phase;
  px: number; py: number; pz: number;
  vx: number; vy: number; vz: number;
  rx: number; ry: number; rz: number;
  age: number;
  warn: number;
  hitDone: boolean;
  nearMissDone: boolean;
}

/** 事故1: 工事現場から吹き飛んでくる看板。飼い主の頭の高さを通る。 */
export class FlyingSignHazard implements Hazard {
  readonly name = 'flying-sign';
  readonly label = '飛来する看板';
  readonly advice: Advice = 'crouch';
  readonly nearMissLine = 'うわ、なんか飛んでったな';
  readonly root = new THREE.Group();

  triggerX = 3.3;
  readonly dangerX = 8;

  private mesh: THREE.Group;
  private hitBox: THREE.Mesh;
  private phase: Phase = 'armed';
  private velocity = new THREE.Vector3();
  private age = 0;
  private warn = 0;
  private hitDone = false;
  private nearMissDone = false;

  constructor() {
    this.mesh = new THREE.Group();

    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.08, 1.05),
      new THREE.MeshLambertMaterial({ color: 0xd9c24b }),
    );
    plate.castShadow = true;
    this.mesh.add(plate);

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.02, 0.26),
      new THREE.MeshBasicMaterial({ color: 0x24211c }),
    );
    stripe.position.y = 0.05;
    this.mesh.add(stripe);

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(1.78, 0.03, 1.13),
      new THREE.MeshBasicMaterial({ color: 0x3a352c }),
    );
    frame.position.y = -0.04;
    this.mesh.add(frame);

    this.hitBox = new THREE.Mesh(
      new THREE.SphereGeometry(CONFIG.signHitRadius, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xff3b6b, wireframe: true }),
    );
    this.hitBox.visible = false;
    this.mesh.add(this.hitBox);

    this.mesh.visible = false;
    this.root.add(this.mesh);
  }

  setDebugVisible(v: boolean): void {
    this.hitBox.visible = v;
  }

  reset(): void {
    this.phase = 'armed';
    this.age = 0;
    this.warn = 0;
    this.hitDone = false;
    this.nearMissDone = false;
    this.velocity.set(0, 0, 0);
    this.mesh.visible = false;
    this.mesh.position.copy(SIGN_ORIGIN);
    this.mesh.rotation.set(0, 0, 0);
  }

  forceTrigger(ctx: HazardContext): void {
    if (this.phase !== 'armed') this.reset();
    this.launch(ctx.owner);
  }

  update(dt: number, ctx: HazardContext): void {
    if (this.phase === 'armed') {
      if (ctx.owner.position.x >= this.triggerX) {
        this.phase = 'waiting';
        this.warn = CONFIG.signWarnDelay;
      }
      return;
    }
    if (this.phase === 'waiting') {
      this.warn -= dt;
      if (this.warn <= 0) this.launch(ctx.owner);
      return;
    }
    if (this.phase === 'falling') {
      this.fall(dt);
      return;
    }
    if (this.phase !== 'flying') return;

    this.age += dt;

    // 速いので、当たり判定は細かく刻んでから進める（すり抜け防止）
    const travel = this.velocity.length() * dt;
    const steps = Math.max(1, Math.ceil(travel / 0.18));
    const sub = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.mesh.position.addScaledVector(this.velocity, sub);
      if (this.checkHit(ctx)) return;
    }

    this.mesh.rotation.x += dt * 5.5;
    this.mesh.rotation.z += dt * 2.3;

    if (this.mesh.position.y <= 0.06) {
      this.phase = 'falling';
      this.velocity.multiplyScalar(0.35);
    }

    if (!this.nearMissDone && !this.hitDone && this.passedOwner(ctx.owner)) {
      this.nearMissDone = true;
      ctx.onNearMiss(this);
    }

    if (this.age > CONFIG.signLifetime) {
      this.phase = 'spent';
      this.mesh.visible = false;
    }
  }

  private launch(owner: Owner): void {
    this.phase = 'flying';
    this.age = 0;
    this.mesh.visible = true;
    this.mesh.position.copy(SIGN_ORIGIN);

    // 「今の速度で歩き続けたら居るはずの場所」を狙う。
    // だから足を止めさせても、しゃがませても外れる。
    const aim = this.predictHead(owner);
    this.velocity.copy(aim).sub(SIGN_ORIGIN).normalize().multiplyScalar(CONFIG.signSpeed);
    this.mesh.lookAt(aim);
  }

  private predictHead(owner: Owner): THREE.Vector3 {
    const vel = new THREE.Vector3();
    if (owner.state === 'WALKING') {
      vel.set(Math.sin(owner.facing), 0, Math.cos(owner.facing)).multiplyScalar(CONFIG.ownerSpeed);
    }
    const target = new THREE.Vector3(owner.position.x, CONFIG.ownerHeadHeight - 0.04, owner.position.z);
    let t = target.distanceTo(SIGN_ORIGIN) / CONFIG.signSpeed;
    for (let i = 0; i < 3; i++) {
      target.set(
        owner.position.x + vel.x * (t + CONFIG.signLeadTime),
        CONFIG.ownerHeadHeight - 0.04,
        owner.position.z + vel.z * (t + CONFIG.signLeadTime),
      );
      t = target.distanceTo(SIGN_ORIGIN) / CONFIG.signSpeed;
    }
    return target;
  }

  private checkHit(ctx: HazardContext): boolean {
    const owner = ctx.owner;
    if (this.hitDone || owner.state === 'DEAD') return false;

    // 飼い主を「腰から頭まで」のカプセルとみなす
    const top = owner.headHeight;
    const bottom = owner.headHeight * 0.55;
    const d = distancePointToSegment(
      this.mesh.position,
      new THREE.Vector3(owner.position.x, bottom, owner.position.z),
      new THREE.Vector3(owner.position.x, top, owner.position.z),
    );
    if (d < CONFIG.signHitRadius + CONFIG.ownerHitRadius) {
      this.hitDone = true;
      this.phase = 'falling';
      this.velocity.multiplyScalar(0.22);
      this.velocity.y = 1.4;
      ctx.onOwnerHit(this);
      return true;
    }
    return false;
  }

  /** 落ちて地面に転がる */
  private fall(dt: number): void {
    this.age += dt;
    this.velocity.y -= 20 * dt;
    this.mesh.position.addScaledVector(this.velocity, dt);
    this.mesh.rotation.x += dt * 3.2;
    if (this.mesh.position.y <= 0.06) {
      this.mesh.position.y = 0.06;
      this.mesh.rotation.set(0, this.mesh.rotation.y, 0.1);
      this.velocity.set(0, 0, 0);
      this.phase = 'landed';
    }
  }

  /** 飼い主の横を通り過ぎたか（当たらずに抜けた瞬間） */
  private passedOwner(owner: Owner): boolean {
    const toOwner = new THREE.Vector2(
      owner.position.x - this.mesh.position.x,
      owner.position.z - this.mesh.position.z,
    );
    const dir = new THREE.Vector2(this.velocity.x, this.velocity.z);
    return toOwner.dot(dir) < 0 && toOwner.length() < 4;
  }

  snapshot(): SignSnapshot {
    return {
      phase: this.phase,
      px: this.mesh.position.x, py: this.mesh.position.y, pz: this.mesh.position.z,
      vx: this.velocity.x, vy: this.velocity.y, vz: this.velocity.z,
      rx: this.mesh.rotation.x, ry: this.mesh.rotation.y, rz: this.mesh.rotation.z,
      age: this.age,
      warn: this.warn,
      hitDone: this.hitDone,
      nearMissDone: this.nearMissDone,
    };
  }

  restore(s: unknown): void {
    const snap = s as SignSnapshot;
    this.phase = snap.phase;
    this.mesh.position.set(snap.px, snap.py, snap.pz);
    this.velocity.set(snap.vx, snap.vy, snap.vz);
    this.mesh.rotation.set(snap.rx, snap.ry, snap.rz);
    this.age = snap.age;
    this.warn = snap.warn;
    this.hitDone = snap.hitDone;
    this.nearMissDone = snap.nearMissDone;
    this.mesh.visible = snap.phase === 'flying' || snap.phase === 'falling' || snap.phase === 'landed';
  }
}

function distancePointToSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
  const ab = new THREE.Vector3().subVectors(b, a);
  const t = THREE.MathUtils.clamp(new THREE.Vector3().subVectors(p, a).dot(ab) / ab.lengthSq(), 0, 1);
  return new THREE.Vector3().copy(a).addScaledVector(ab, t).distanceTo(p);
}
