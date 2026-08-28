import * as THREE from 'three';
import { CONFIG } from '../config';
import { FALL_SPOT } from '../world/World';
import type { Advice, Hazard, HazardContext } from './Hazard';

type Phase = 'armed' | 'warning' | 'falling' | 'landed';

interface FallSnapshot {
  phase: Phase;
  y: number;
  vy: number;
  spin: number;
  warn: number;
  hitDone: boolean;
  nearMissDone: boolean;
}

/**
 * 事故2: 足場から落ちてくる鉄骨。
 * 落ちる場所は決まっているので、その場所に「居ないこと」で避ける。
 * 足を止めても、横にずらしてもよい。
 */
export class FallingObjectHazard implements Hazard {
  readonly name = 'falling-object';
  readonly label = '落下物';
  readonly advice: Advice = 'stop';
  readonly nearMissLine = 'うわっ。なんか落ちてきたぞ';
  readonly root = new THREE.Group();

  triggerX = FALL_SPOT.x - 5.5;
  readonly dangerX = FALL_SPOT.x;

  private beam: THREE.Mesh;
  private shadow: THREE.Mesh;
  private hitRing: THREE.Mesh;
  private phase: Phase = 'armed';
  private vy = 0;
  private spin = 0;
  private warn = 0;

  private hitDone = false;
  private nearMissDone = false;

  constructor() {
    this.beam = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 2.6, 0.3),
      new THREE.MeshLambertMaterial({ color: 0x8d949c }),
    );
    this.beam.castShadow = true;
    this.beam.visible = false;
    this.root.add(this.beam);

    // 落ちてくる場所を地面に出す。犬だけが先に気づける、の代わり
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(CONFIG.fallHitRadius, 24),
      new THREE.MeshBasicMaterial({ color: 0x14161a, transparent: true, opacity: 0 }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.set(FALL_SPOT.x, 0.04, FALL_SPOT.z);
    this.root.add(this.shadow);

    this.hitRing = new THREE.Mesh(
      new THREE.RingGeometry(CONFIG.fallHitRadius - 0.03, CONFIG.fallHitRadius, 24),
      new THREE.MeshBasicMaterial({ color: 0xff3b6b, side: THREE.DoubleSide }),
    );
    this.hitRing.rotation.x = -Math.PI / 2;
    this.hitRing.position.set(FALL_SPOT.x, 0.06, FALL_SPOT.z);
    this.hitRing.visible = false;
    this.root.add(this.hitRing);

    this.reset();
  }

  setDebugVisible(v: boolean): void {
    this.hitRing.visible = v;
  }

  reset(): void {
    this.phase = 'armed';
    this.vy = 0;
    this.spin = 0;
    this.warn = 0;
    this.hitDone = false;
    this.nearMissDone = false;
    this.beam.visible = false;
    this.beam.position.set(FALL_SPOT.x, CONFIG.fallHeight, FALL_SPOT.z);
    this.beam.rotation.set(0, 0, 0.1);
    this.setShadow(0);
  }

  forceTrigger(_ctx: HazardContext): void {
    if (this.phase === 'landed') this.reset();
    this.phase = 'falling';
    this.vy = 0;
    this.beam.visible = true;
    this.beam.position.y = CONFIG.fallHeight;
  }

  update(dt: number, ctx: HazardContext): void {
    const ox = ctx.owner.position.x;

    if (this.phase === 'armed') {
      if (ox >= this.triggerX) {
        this.phase = 'warning';
        this.warn = CONFIG.fallWarnDelay;
        this.beam.visible = true;
      }
      return;
    }

    if (this.phase === 'warning') {
      // 足場の上で揺れながら、落ちる場所の影がだんだん濃くなる
      this.warn -= dt;
      const t = 1 - this.warn / CONFIG.fallWarnDelay;
      this.setShadow(THREE.MathUtils.clamp(t, 0, 1) * 0.35);
      this.beam.position.y = CONFIG.fallHeight + Math.sin(performance.now() * 0.012) * 0.06;
      this.beam.rotation.z = 0.1 + Math.sin(performance.now() * 0.009) * 0.05;
      if (this.warn <= 0) {
        this.phase = 'falling';
        this.vy = 0;
      }
      return;
    }

    if (this.phase !== 'falling') return;

    // 落下。すり抜けないように細かく刻む
    let remaining = dt;
    while (remaining > 0) {
      const step = Math.min(remaining, 1 / 120);
      this.vy -= CONFIG.fallGravity * step;
      this.beam.position.y += this.vy * step;
      remaining -= step;
      if (this.beam.position.y <= 1.3 && this.checkHit(ctx)) return;
      if (this.beam.position.y <= 0.16) break;
    }

    this.spin += dt * 3;
    this.beam.rotation.z = 0.1 + this.spin * 0.35;

    // 近いほど影を濃く小さく
    const h = Math.max(0, this.beam.position.y);
    const k = 1 - h / CONFIG.fallHeight;
    this.setShadow(0.25 + k * 0.4, 1 - k * 0.45);

    if (this.beam.position.y <= 0.16) {
      this.land(ctx);
    }
  }

  private land(ctx: HazardContext): void {
    this.phase = 'landed';
    this.beam.position.y = 0.16;
    this.beam.rotation.set(Math.PI / 2, 0, Math.random() * 0.4 - 0.2);
    this.setShadow(0);
    if (!this.hitDone && !this.nearMissDone && ctx.owner.state !== 'DEAD') {
      this.nearMissDone = true;
      ctx.onNearMiss(this);
    }
  }

  private checkHit(ctx: HazardContext): boolean {
    if (this.hitDone || ctx.owner.state === 'DEAD') return false;
    const d = Math.hypot(ctx.owner.position.x - FALL_SPOT.x, ctx.owner.position.z - FALL_SPOT.z);
    if (d < CONFIG.fallHitRadius) {
      this.hitDone = true;
      this.phase = 'landed';
      this.beam.position.y = 0.5;
      this.beam.rotation.set(Math.PI / 2.4, 0, 0.3);
      this.setShadow(0);
      ctx.onOwnerHit(this);
      return true;
    }
    return false;
  }

  private setShadow(opacity: number, scale = 1): void {
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = opacity;
    this.shadow.scale.setScalar(Math.max(0.05, scale));
  }

  snapshot(): FallSnapshot {
    return {
      phase: this.phase,
      y: this.beam.position.y,
      vy: this.vy,
      spin: this.spin,
      warn: this.warn,
      hitDone: this.hitDone,
      nearMissDone: this.nearMissDone,
    };
  }

  restore(s: unknown): void {
    const snap = s as FallSnapshot;
    this.phase = snap.phase;
    this.beam.position.set(FALL_SPOT.x, snap.y, FALL_SPOT.z);
    this.vy = snap.vy;
    this.spin = snap.spin;
    this.warn = snap.warn;
    this.hitDone = snap.hitDone;
    this.nearMissDone = snap.nearMissDone;
    this.beam.visible = snap.phase !== 'armed';
    this.beam.rotation.set(snap.phase === 'landed' ? Math.PI / 2 : 0, 0, 0.1 + snap.spin * 0.35);
    this.setShadow(snap.phase === 'warning' || snap.phase === 'falling' ? 0.35 : 0);
  }
}
