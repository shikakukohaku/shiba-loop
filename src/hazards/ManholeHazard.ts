import * as THREE from 'three';
import { CONFIG } from '../config';
import { MANHOLE_SPOT } from '../world/World';
import type { Advice, Hazard, HazardContext } from './Hazard';

type Phase = 'closed' | 'opening' | 'open' | 'done';

interface ManholeSnapshot {
  phase: Phase;
  slide: number;
  hitDone: boolean;
  nearMissDone: boolean;
}

/**
 * 事故3: 蓋の外れたマンホール。
 * 止めても再開すれば結局落ちるので、これだけは「横にずらす」しかない。
 * リードを張って引っ張るための事故。
 */
export class ManholeHazard implements Hazard {
  readonly name = 'manhole';
  readonly label = 'マンホール';
  readonly advice: Advice = 'pull';
  readonly nearMissLine = 'お、蓋が開いてるな。あぶないあぶない';
  readonly root = new THREE.Group();

  triggerX = MANHOLE_SPOT.x - CONFIG.manholeOpenDistance;
  readonly dangerX = MANHOLE_SPOT.x;

  private lid: THREE.Mesh;
  private hole: THREE.Mesh;
  private rim: THREE.Mesh;
  private hitRing: THREE.Mesh;
  private phase: Phase = 'closed';
  private slide = 0; // 0=閉、1=開
  private hitDone = false;
  private nearMissDone = false;

  constructor() {
    const r = CONFIG.manholeRadius;

    this.hole = new THREE.Mesh(
      new THREE.CircleGeometry(r, 24),
      new THREE.MeshBasicMaterial({ color: 0x0a0b0d }),
    );
    this.hole.rotation.x = -Math.PI / 2;
    this.hole.position.set(MANHOLE_SPOT.x, 0.03, MANHOLE_SPOT.z);
    this.root.add(this.hole);

    this.rim = new THREE.Mesh(
      new THREE.TorusGeometry(r + 0.04, 0.05, 6, 24),
      new THREE.MeshLambertMaterial({ color: 0x6b6f73 }),
    );
    this.rim.rotation.x = -Math.PI / 2;
    this.rim.position.set(MANHOLE_SPOT.x, 0.04, MANHOLE_SPOT.z);
    this.root.add(this.rim);

    this.lid = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, 0.07, 24),
      new THREE.MeshLambertMaterial({ color: 0x555a5e }),
    );
    this.lid.castShadow = true;
    this.root.add(this.lid);

    this.hitRing = new THREE.Mesh(
      new THREE.RingGeometry(r - 0.03, r, 24),
      new THREE.MeshBasicMaterial({ color: 0xff3b6b, side: THREE.DoubleSide }),
    );
    this.hitRing.rotation.x = -Math.PI / 2;
    this.hitRing.position.set(MANHOLE_SPOT.x, 0.08, MANHOLE_SPOT.z);
    this.hitRing.visible = false;
    this.root.add(this.hitRing);

    this.reset();
  }

  setDebugVisible(v: boolean): void {
    this.hitRing.visible = v;
  }

  reset(): void {
    this.phase = 'closed';
    this.slide = 0;
    this.hitDone = false;
    this.nearMissDone = false;
    this.applySlide();
  }

  forceTrigger(_ctx: HazardContext): void {
    this.phase = 'opening';
  }

  update(dt: number, ctx: HazardContext): void {
    const ox = ctx.owner.position.x;

    if (this.phase === 'closed') {
      if (ox >= this.triggerX) this.phase = 'opening';
      return;
    }

    if (this.phase === 'opening') {
      this.slide = Math.min(1, this.slide + dt * 1.6);
      this.applySlide();
      if (this.slide >= 1) this.phase = 'open';
      return;
    }

    if (this.phase !== 'open') return;

    if (!this.hitDone && ctx.owner.state !== 'DEAD') {
      const d = Math.hypot(ox - MANHOLE_SPOT.x, ctx.owner.position.z - MANHOLE_SPOT.z);
      if (d < CONFIG.manholeRadius) {
        this.hitDone = true;
        ctx.onOwnerHit(this);
        return;
      }
    }

    // 穴を通り過ぎたら「避けられた」
    if (!this.hitDone && !this.nearMissDone && ox > MANHOLE_SPOT.x + 0.8) {
      this.nearMissDone = true;
      this.phase = 'done';
      ctx.onNearMiss(this);
    }
  }

  /** 蓋が横にずれていく */
  private applySlide(): void {
    const r = CONFIG.manholeRadius;
    this.lid.position.set(
      MANHOLE_SPOT.x - this.slide * (r * 2 + 0.14),
      0.035 - this.slide * 0.005,
      MANHOLE_SPOT.z - this.slide * 0.22,
    );
    this.lid.rotation.z = this.slide * 0.12;
    (this.hole.material as THREE.MeshBasicMaterial).opacity = 1;
  }

  snapshot(): ManholeSnapshot {
    return {
      phase: this.phase,
      slide: this.slide,
      hitDone: this.hitDone,
      nearMissDone: this.nearMissDone,
    };
  }

  restore(s: unknown): void {
    const snap = s as ManholeSnapshot;
    this.phase = snap.phase;
    this.slide = snap.slide;
    this.hitDone = snap.hitDone;
    this.nearMissDone = snap.nearMissDone;
    this.applySlide();
  }
}
