import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Dog } from '../entities/Dog';
import type { Owner } from '../entities/Owner';

export interface LeashState {
  /** 飼い主の手と犬のあいだの距離 */
  distance: number;
  /** リードが張っているか */
  taut: boolean;
  /** このフレームで飼い主が引きずられた距離 */
  pulled: number;
}

/**
 * リード。犬を円の内側に閉じ込め、はみ出そうとした分だけ飼い主を引く。
 * 「大きく引きずる」のではなく「半歩ずれる」程度に留める。
 */
export class Leash {
  readonly root = new THREE.Group();
  readonly debug = new THREE.Group();

  private mesh: THREE.Mesh;
  private material: THREE.MeshBasicMaterial;
  private rangeRing: THREE.Mesh;
  private readonly hand = new THREE.Vector3();
  private readonly collar = new THREE.Vector3();

  readonly state: LeashState = { distance: 0, taut: false, pulled: 0 };

  constructor() {
    this.material = new THREE.MeshBasicMaterial({ color: 0xc0392b });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.root.add(this.mesh);

    this.rangeRing = new THREE.Mesh(
      new THREE.RingGeometry(CONFIG.leashLength - 0.03, CONFIG.leashLength, 48),
      new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
    );
    this.rangeRing.rotation.x = -Math.PI / 2;
    this.rangeRing.position.y = 0.03;
    this.debug.add(this.rangeRing);
    this.debug.visible = false;
    this.root.add(this.debug);
  }

  setDebugVisible(v: boolean): void {
    this.debug.visible = v;
  }

  /** 犬の位置を制限し、必要なら飼い主を引く。描画も更新する。 */
  apply(dog: Dog, owner: Owner, dt: number): LeashState {
    owner.getHandPoint(this.hand);

    const dx = dog.position.x - this.hand.x;
    const dz = dog.position.z - this.hand.z;
    const dist = Math.hypot(dx, dz);
    const max = CONFIG.leashLength;

    let pulled = 0;
    if (dist > max && dist > 0.0001) {
      const nx = dx / dist;
      const nz = dz / dist;

      // 犬は円の内側に戻す
      dog.position.x = this.hand.x + nx * max;
      dog.position.z = this.hand.z + nz * max;

      // 飼い主が引かれるのは「犬が自分から外へ動こうとした分」だけ。
      // 犬がただ突っ立っているのに飼い主が減速する、という事故を防ぐ
      // （それをやりたいときは拒否柴を使う）。
      const push = Math.max(0, dog.lastDelta.x * nx + dog.lastDelta.y * nz);
      if (push > 0 && owner.state !== 'DEAD') {
        pulled = Math.min(push * CONFIG.leashPullFactor, CONFIG.leashMaxPullPerSecond * dt);
        owner.position.x += nx * pulled;
        owner.position.z += nz * pulled;
      }
    }

    this.state.distance = Math.min(dist, max);
    this.state.taut = this.state.distance > max - CONFIG.leashTautMargin;
    this.state.pulled = pulled;

    this.updateMesh(dog, owner);
    return this.state;
  }

  private updateMesh(dog: Dog, owner: Owner): void {
    owner.getHandPoint(this.hand);
    dog.getCollarPoint(this.collar);

    // 張っていないときはたるませる
    const slack = 1 - this.state.distance / CONFIG.leashLength;
    const sag = slack * 0.55;
    const points: THREE.Vector3[] = [];
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const p = new THREE.Vector3().lerpVectors(this.hand, this.collar, t);
      p.y -= Math.sin(t * Math.PI) * sag;
      points.push(p);
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const geo = new THREE.TubeGeometry(curve, 16, 0.028, 5, false);
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
    this.material.color.setHex(this.state.taut ? 0xff7a3d : 0xc0392b);

    this.rangeRing.position.set(this.hand.x, 0.03, this.hand.z);
  }
}
