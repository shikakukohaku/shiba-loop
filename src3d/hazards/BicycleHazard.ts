import * as THREE from 'three';
import { CONFIG } from '../config';
import { BIKE_X } from '../world/World';
import type { Advice, Hazard, HazardContext } from './Hazard';

type Phase = 'armed' | 'waiting' | 'riding' | 'gone';

interface BikeSnapshot {
  phase: Phase;
  z: number;
  wheel: number;
  warn: number;
  hitDone: boolean;
  nearMissDone: boolean;
}

/**
 * 事故4: 路地から飛び出す自転車。
 * 決まった場所を決まった速さで横切るだけ。数秒足を止めれば前を通り過ぎる。
 * 手前に電柱があるので、リードを引っかけて止めるのが本命。拒否柴でもよい。
 */
export class BicycleHazard implements Hazard {
  readonly name = 'bicycle';
  readonly label = '飛び出す自転車';
  readonly advice: Advice = 'pole';
  readonly nearMissLine = 'わっ。自転車、危ないなあ';
  readonly root = new THREE.Group();

  readonly dangerX = BIKE_X;
  triggerX = this.dangerX - CONFIG.ownerSpeed
    * (CONFIG.bikeWarnDelay + (1.4 - CONFIG.bikeStartZ) / CONFIG.bikeSpeed);

  private bike = new THREE.Group();
  private wheels: THREE.Mesh[] = [];
  private hitSphere: THREE.Mesh;
  private phase: Phase = 'armed';
  private wheelSpin = 0;
  private warn = 0;
  private hitDone = false;
  private nearMissDone = false;

  constructor() {
    const metal = new THREE.MeshLambertMaterial({ color: 0x2f6f8f });
    const dark = new THREE.MeshLambertMaterial({ color: 0x24262a });

    for (const dz of [-0.52, 0.52]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.055, 6, 16), dark);
      wheel.position.set(0, 0.33, dz);
      wheel.rotation.y = Math.PI / 2;
      wheel.castShadow = true;
      this.bike.add(wheel);
      this.wheels.push(wheel);
    }

    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 1.05), metal);
    frame.position.set(0, 0.52, 0);
    this.bike.add(frame);

    const seatPost = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.08), metal);
    seatPost.position.set(0, 0.7, -0.3);
    this.bike.add(seatPost);

    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.06), metal);
    bar.position.set(0, 0.9, 0.45);
    this.bike.add(bar);

    const rider = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.17, 0.42, 4, 8),
      new THREE.MeshLambertMaterial({ color: 0x6b7f4a }),
    );
    rider.position.set(0, 1.12, -0.1);
    rider.rotation.x = -0.35;
    rider.castShadow = true;
    this.bike.add(rider);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 12, 10),
      new THREE.MeshLambertMaterial({ color: 0xe8bb96 }),
    );
    head.position.set(0, 1.5, 0.05);
    this.bike.add(head);

    this.hitSphere = new THREE.Mesh(
      new THREE.SphereGeometry(CONFIG.bikeHitRadius, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xff3b6b, wireframe: true }),
    );
    this.hitSphere.position.y = 0.8;
    this.hitSphere.visible = false;
    this.bike.add(this.hitSphere);

    this.bike.visible = false;
    this.root.add(this.bike);
    this.reset();
  }

  setDebugVisible(v: boolean): void {
    this.hitSphere.visible = v;
  }

  reset(): void {
    this.phase = 'armed';
    this.wheelSpin = 0;
    this.warn = 0;
    this.hitDone = false;
    this.nearMissDone = false;
    this.bike.visible = false;
    this.bike.position.set(BIKE_X, 0, CONFIG.bikeStartZ - 2);
  }

  forceTrigger(_ctx: HazardContext): void {
    this.phase = 'riding';
    this.bike.visible = true;
    this.bike.position.set(BIKE_X, 0, CONFIG.bikeStartZ);
  }

  update(dt: number, ctx: HazardContext): void {
    const ox = ctx.owner.position.x;

    if (this.phase === 'armed') {
      if (ox >= this.triggerX) {
        // 路地の奥からゆっくり近づいてくるのが見える（予告）
        this.phase = 'waiting';
        this.warn = CONFIG.bikeWarnDelay;
        this.bike.visible = true;
        this.bike.position.set(BIKE_X, 0, CONFIG.bikeStartZ - 3.2);
      }
      return;
    }
    if (this.phase === 'waiting') {
      this.warn -= dt;
      const t = 1 - Math.max(0, this.warn) / CONFIG.bikeWarnDelay;
      this.bike.position.z = CONFIG.bikeStartZ - 3.2 * (1 - t);
      this.wheelSpin += dt * 3;
      for (const w of this.wheels) w.rotation.x = this.wheelSpin;
      if (this.warn <= 0) this.phase = 'riding';
      return;
    }
    if (this.phase !== 'riding') return;

    // 当たり判定は細かく刻む
    let remaining = dt;
    while (remaining > 0) {
      const step = Math.min(remaining, 1 / 120);
      this.bike.position.z += CONFIG.bikeSpeed * step;
      remaining -= step;
      if (this.checkHit(ctx)) return;
    }

    this.wheelSpin += dt * 14;
    for (const w of this.wheels) w.rotation.x = this.wheelSpin;

    if (this.bike.position.z > CONFIG.bikeEndZ) {
      this.phase = 'gone';
      this.bike.visible = false;
    } else if (!this.hitDone && !this.nearMissDone && this.bike.position.z > ctx.owner.position.z + 1.4) {
      this.nearMissDone = true;
      ctx.onNearMiss(this, Math.hypot(
        ctx.owner.position.x - this.bike.position.x,
        ctx.owner.position.z - this.bike.position.z,
      ));
    }
  }

  private checkHit(ctx: HazardContext): boolean {
    if (this.hitDone || ctx.owner.state === 'DEAD') return false;
    const d = Math.hypot(
      ctx.owner.position.x - this.bike.position.x,
      ctx.owner.position.z - this.bike.position.z,
    );
    if (d < CONFIG.bikeHitRadius) {
      this.hitDone = true;
      ctx.onOwnerHit(this);
      return true;
    }
    return false;
  }

  snapshot(): BikeSnapshot {
    return {
      phase: this.phase,
      z: this.bike.position.z,
      wheel: this.wheelSpin,
      warn: this.warn,
      hitDone: this.hitDone,
      nearMissDone: this.nearMissDone,
    };
  }

  restore(s: unknown): void {
    const snap = s as BikeSnapshot;
    this.phase = snap.phase;
    this.bike.position.set(BIKE_X, 0, snap.z);
    this.wheelSpin = snap.wheel;
    this.warn = snap.warn;
    this.hitDone = snap.hitDone;
    this.nearMissDone = snap.nearMissDone;
    this.bike.visible = snap.phase === 'riding' || snap.phase === 'waiting';
    for (const w of this.wheels) w.rotation.x = snap.wheel;
  }
}
