import * as THREE from 'three';
import { CONFIG } from '../config';
import { POLES } from '../world/World';
import type { Dog } from '../entities/Dog';
import type { Owner } from '../entities/Owner';

export interface LeashState {
  /** リードが実際に使っている長さ（巻きついていれば折れ線の合計） */
  distance: number;
  /** リードが張っているか */
  taut: boolean;
  /** このフレームで飼い主が引きずられた距離 */
  pulled: number;
  /** 電柱に引っかかっているか */
  wrapped: boolean;
  /** このフレームで電柱から外れたか */
  released: boolean;
}

/**
 * リード。犬を届く範囲に閉じ込め、はみ出そうとした分だけ飼い主を引く。
 *
 * 犬が電柱の向こう側へ回り込むと、リードが電柱に引っかかる。
 * そのあいだリードは「飼い主 → 電柱 → 犬」の折れ線になり、
 * 飼い主は電柱から離れられなくなる。ボタンを押さずに足を止められる唯一の手段。
 */
export class Leash {
  readonly root = new THREE.Group();
  readonly debug = new THREE.Group();

  private mesh: THREE.Mesh;
  private material: THREE.MeshBasicMaterial;
  private rangeRing: THREE.Mesh;
  private anchorMark: THREE.Mesh;
  private readonly hand = new THREE.Vector3();
  private readonly collar = new THREE.Vector3();

  /** 引っかかっている電柱。なければ null */
  private anchor: THREE.Vector2 | null = null;
  /** ちゃんと向こう側へ回り込んだか。かすめただけなら外れる */
  private committed = false;
  private grace = 0;
  private held = 0;
  /** 外れた直後の電柱。すぐ巻き直すとガチャつくので少し待つ */
  private cooling: THREE.Vector2 | null = null;
  private coolTimer = 0;

  readonly state: LeashState = { distance: 0, taut: false, pulled: 0, wrapped: false, released: false };

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

    this.anchorMark = new THREE.Mesh(
      new THREE.TorusGeometry(0.4, 0.04, 6, 16),
      new THREE.MeshBasicMaterial({ color: 0xffcc33 }),
    );
    this.anchorMark.rotation.x = -Math.PI / 2;
    this.anchorMark.position.y = 0.1;
    this.anchorMark.visible = false;
    this.debug.add(this.anchorMark);

    this.debug.visible = false;
    this.root.add(this.debug);
  }

  setDebugVisible(v: boolean): void {
    this.debug.visible = v;
  }

  reset(): void {
    if (this.anchor) {
      this.cooling = this.anchor;
      this.coolTimer = CONFIG.poleRewrapDelay;
    }
    this.anchor = null;
    this.committed = false;
    this.grace = 0;
    this.held = 0;
  }

  /** 完全に初期化する（ゲームのリセット・巻き戻し用） */
  clear(): void {
    this.anchor = null;
    this.committed = false;
    this.grace = 0;
    this.held = 0;
    this.cooling = null;
    this.coolTimer = 0;
  }

  /** 犬の位置を制限し、必要なら飼い主を引く。描画も更新する。 */
  apply(dog: Dog, owner: Owner, dt: number): LeashState {
    owner.getHandPoint(this.hand);
    const handXZ = new THREE.Vector2(this.hand.x, this.hand.z);
    const dogXZ = new THREE.Vector2(dog.position.x, dog.position.z);

    const wasWrapped = this.anchor !== null;
    this.updateAnchor(handXZ, dogXZ, dt);

    if (this.anchor) this.applyWrapped(dog, owner, dt, handXZ, dogXZ);
    else this.applyDirect(dog, owner, dt, handXZ, dogXZ);

    // 張りっぱなしで進めない状態が続いたら、リードは電柱を滑って外れる。
    // これがないと、犬が飼い主側へ戻ったときに角度が変わらず永久に固定される
    if (this.anchor && this.state.taut) {
      this.held += dt;
      if (this.held > CONFIG.poleHoldMax) this.reset();
    } else if (this.anchor) {
      this.held = Math.max(0, this.held - dt);
    }

    this.state.wrapped = this.anchor !== null;
    this.state.released = wasWrapped && this.anchor === null;
    this.updateMesh(dog, owner);
    return this.state;
  }

  /**
   * 電柱に引っかかったか／外れたかを判定する。
   *
   * 引っかかった直後はリードがほぼ一直線なので、角度だけで判定すると
   * 次のフレームで即外れてしまう。犬が向こう側へ回り込んで折れ角が
   * はっきり付いた（committed）ときだけ、角度で外れるようにする。
   */
  private updateAnchor(hand: THREE.Vector2, dog: THREE.Vector2, dt: number): void {
    if (this.coolTimer > 0) {
      this.coolTimer -= dt;
      if (this.coolTimer <= 0) this.cooling = null;
    }
    if (this.anchor) {
      const a = new THREE.Vector2().subVectors(hand, this.anchor);
      const b = new THREE.Vector2().subVectors(dog, this.anchor);
      // 犬が電柱の根本まで戻ってきたら、自分で外したことにする
      if (a.length() < 0.2 || b.length() < 0.5) {
        this.reset();
        return;
      }
      const cos = a.normalize().dot(b.normalize());
      if (!this.committed) {
        if (cos > CONFIG.poleCommitCos) this.committed = true;
        else {
          this.grace -= dt;
          if (this.grace <= 0) this.reset();
        }
        return;
      }
      if (cos < CONFIG.poleUnwrapCos) this.reset();
      return;
    }

    for (const pole of POLES) {
      if (pole === this.cooling) continue;
      if (Math.abs(pole.x - hand.x) > CONFIG.leashLength + 1) continue;
      if (distancePointToSegment2(pole, hand, dog) > CONFIG.poleWrapRadius) continue;
      if (pole.distanceTo(hand) < 0.4 || pole.distanceTo(dog) < 0.4) continue;
      this.anchor = pole;
      this.committed = false;
      this.grace = CONFIG.poleGrace;
      return;
    }
  }

  /** 引っかかっていない、ふつうの状態 */
  private applyDirect(dog: Dog, owner: Owner, dt: number, hand: THREE.Vector2, dogXZ: THREE.Vector2): void {
    const d = new THREE.Vector2().subVectors(dogXZ, hand);
    const dist = d.length();
    const max = CONFIG.leashLength;

    let pulled = 0;
    if (dist > max && dist > 0.0001) {
      const n = d.clone().divideScalar(dist);
      dog.position.x = hand.x + n.x * max;
      dog.position.z = hand.y + n.y * max;
      pulled = this.pullOwner(dog, owner, n, dt);
    }

    this.state.distance = Math.min(dist, max);
    this.state.taut = this.state.distance > max - CONFIG.leashTautMargin;
    this.state.pulled = pulled;
  }

  /**
   * 電柱に引っかかっている状態。
   * 飼い主→電柱→犬 の合計がリードの長さを超えられない。
   * まず犬を電柱まわりに閉じ込め、それでも足りなければ飼い主を電柱から離さない。
   */
  private applyWrapped(dog: Dog, owner: Owner, dt: number, hand: THREE.Vector2, dogXZ: THREE.Vector2): void {
    const pole = this.anchor!;
    const max = CONFIG.leashLength;

    let toDog = new THREE.Vector2().subVectors(dogXZ, pole);
    let dDog = toDog.length();
    const toHand = new THREE.Vector2().subVectors(hand, pole);
    const dHand = toHand.length();

    // 1) 犬を「リードの残り」の中に閉じ込める
    let pulled = 0;
    const dogBudget = Math.max(CONFIG.poleMinSlack, max - dHand);
    if (dDog > dogBudget && dDog > 0.0001) {
      const n = toDog.clone().divideScalar(dDog);
      dog.position.x = pole.x + n.x * dogBudget;
      dog.position.z = pole.y + n.y * dogBudget;
      toDog = n.multiplyScalar(dogBudget);
      dDog = dogBudget;
      // 犬が外へ行こうとした分は、電柱ごしに飼い主を引く
      pulled = this.pullOwner(dog, owner, new THREE.Vector2(-toHand.x, -toHand.y).normalize(), dt);
    }

    // 2) それでも足りなければ、飼い主は電柱から離れられない
    const handBudget = Math.max(0.3, max - dDog);
    if (dHand > handBudget && owner.state !== 'DEAD' && dHand > 0.0001) {
      const n = toHand.clone().divideScalar(dHand);
      const targetX = pole.x + n.x * handBudget;
      const targetZ = pole.y + n.y * handBudget;
      owner.position.x += targetX - hand.x;
      owner.position.z += targetZ - hand.y;
    }

    this.state.distance = Math.min(dHand + dDog, max);
    this.state.taut = dHand + dDog > max - CONFIG.leashTautMargin;
    this.state.pulled = pulled;
  }

  /**
   * 飼い主が引かれるのは「犬が自分から外へ動こうとした分」だけ。
   * 犬がただ突っ立っているのに飼い主が減速する、という事故を防ぐ
   * （それをやりたいときは拒否柴か、電柱を使う）。
   */
  private pullOwner(dog: Dog, owner: Owner, n: THREE.Vector2, dt: number): number {
    if (owner.state === 'DEAD') return 0;
    const push = Math.max(0, dog.lastDelta.x * n.x + dog.lastDelta.y * n.y);
    if (push <= 0) return 0;
    const pulled = Math.min(push * CONFIG.leashPullFactor, CONFIG.leashMaxPullPerSecond * dt);
    owner.position.x += n.x * pulled;
    owner.position.z += n.y * pulled;
    return pulled;
  }

  private updateMesh(dog: Dog, owner: Owner): void {
    owner.getHandPoint(this.hand);
    dog.getCollarPoint(this.collar);

    const knots: THREE.Vector3[] = [this.hand.clone()];
    if (this.anchor) {
      // 電柱に触れている点を、折れの外側に寄せて置く
      const a = new THREE.Vector2(this.hand.x - this.anchor.x, this.hand.z - this.anchor.y).normalize();
      const b = new THREE.Vector2(this.collar.x - this.anchor.x, this.collar.z - this.anchor.y).normalize();
      const bis = a.add(b);
      if (bis.lengthSq() < 0.0001) bis.set(1, 0);
      bis.normalize().multiplyScalar(CONFIG.poleContactRadius);
      knots.push(new THREE.Vector3(this.anchor.x + bis.x, 0.62, this.anchor.y + bis.y));
    }
    knots.push(this.collar.clone());

    const slack = 1 - this.state.distance / CONFIG.leashLength;
    const points: THREE.Vector3[] = [];
    for (let seg = 0; seg < knots.length - 1; seg++) {
      const steps = 5;
      for (let i = 0; i <= steps; i++) {
        if (seg > 0 && i === 0) continue;
        const t = i / steps;
        const p = new THREE.Vector3().lerpVectors(knots[seg], knots[seg + 1], t);
        p.y -= Math.sin(t * Math.PI) * slack * 0.5;
        points.push(p);
      }
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const geo = new THREE.TubeGeometry(curve, 20, 0.028, 5, false);
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
    this.material.color.setHex(this.anchor ? 0xffb03a : this.state.taut ? 0xff7a3d : 0xc0392b);

    this.rangeRing.position.set(this.hand.x, 0.03, this.hand.z);
    this.anchorMark.visible = this.anchor !== null;
    if (this.anchor) this.anchorMark.position.set(this.anchor.x, 0.1, this.anchor.y);
  }
}

function distancePointToSegment2(p: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2): number {
  const ab = new THREE.Vector2().subVectors(b, a);
  const lenSq = ab.lengthSq();
  if (lenSq < 0.0001) return p.distanceTo(a);
  const t = THREE.MathUtils.clamp(new THREE.Vector2().subVectors(p, a).dot(ab) / lenSq, 0, 1);
  return new THREE.Vector2().copy(a).addScaledVector(ab, t).distanceTo(p);
}
