import { CONFIG } from '../config';
import type { Draw } from '../core/Draw';
import type { Dog } from '../entities/Dog';
import type { Owner } from '../entities/Owner';
import type { Enemy } from '../entities/Enemy';

export interface LeashState {
  distance: number;
  taut: boolean;
  /** 空中で張っている＝振り子。ここでジャンプすると飛び出せる */
  swinging: boolean;
  /** 犬が後ろへ踏ん張っていて飼い主が減速しているか */
  braking: boolean;
}

/**
 * リード。このゲームの主役。
 *
 * - 犬は飼い主の手から一定距離までしか離れられない
 * - 張った状態で空中にいると振り子になる（外向きの速度だけ消して接線を残す）
 * - そこでジャンプすると、勢いを足してリードから飛び出す
 * - 怪異のまわりを一周すると、リードが巻きついて締め上げる
 */
export class Leash {
  readonly state: LeashState = { distance: 0, taut: false, swinging: false, braking: false };

  private release = 0;
  /** 怪異ごとの「リードのどちら側にいたか」。巻き取りの判定に使う */
  private side = new Map<Enemy, number>();
  private forget = new Map<Enemy, number>();

  reset(): void {
    this.release = 0;
    this.side.clear();
    this.forget.clear();
  }

  /** 振り子から飛び出した直後は、しばらくリードを緩めておく */
  notifyLaunch(): void {
    this.release = CONFIG.leashReleaseTime;
  }

  update(dt: number, dog: Dog, owner: Owner, enemies: Enemy[], axisX: number): void {
    this.release = Math.max(0, this.release - dt);

    const hx = owner.handX;
    const hy = owner.handY;
    let dx = dog.collarX() - hx;
    let dy = dog.collarY() - hy;
    let dist = Math.hypot(dx, dy) || 0.0001;

    const max = this.release > 0 ? CONFIG.leashLength * CONFIG.leashReleaseStretch : CONFIG.leashLength;

    if (dist > max) {
      const nx = dx / dist;
      const ny = dy / dist;

      // 位置は一気に戻さない。上限速度で寄せる
      const correct = Math.min(dist - max, CONFIG.leashReelSpeed * dt);
      dog.x -= nx * correct;
      dog.y -= ny * correct;

      // 外向きの速度だけ消す。接線が残るので振り子になる
      const rvx = dog.vx - owner.vx;
      const rvy = dog.vy - owner.vy;
      const outward = rvx * nx + rvy * ny;
      if (outward > 0) {
        dog.vx -= nx * outward;
        dog.vy -= ny * outward;
      }

      // 犬が引いた分、飼い主も少しだけ持っていかれる
      if (owner.hp > 0) owner.x += nx * correct * CONFIG.leashPullOwner;

      dx = dog.collarX() - hx;
      dy = dog.collarY() - hy;
      dist = Math.hypot(dx, dy) || 0.0001;
    }

    this.state.distance = dist;
    this.state.taut = dist > CONFIG.leashLength - CONFIG.leashTautMargin && this.release <= 0;
    this.state.swinging = this.state.taut && !dog.grounded;
    // 後ろ側でリードを張って踏ん張っている＝飼い主を待たせている
    this.state.braking = this.state.taut && dog.grounded && dog.x < owner.x && axisX < 0;

    this.updateWraps(dt, dog, owner, enemies);
  }

  /**
   * リードで巻き取る判定。
   *
   * 横から見た絵なので「相手のまわりを一周する」はできない（地面の下を通れない）。
   * 代わりに「犬が相手より向こう側にいる」状態で、リードが相手の体を
   * 上下に横切るたびに1回とカウントする。飛び越えて、戻って、また飛び越える。
   */
  private updateWraps(dt: number, dog: Dog, owner: Owner, enemies: Enemy[]): void {
    const hx = owner.handX;
    const hy = owner.handY;
    const dx = dog.collarX() - hx;
    const dy = dog.collarY() - hy;
    const dogDist = Math.hypot(dx, dy);

    for (const e of enemies) {
      if (!e.alive || e.binding > 0) {
        this.side.delete(e);
        this.forget.delete(e);
        e.wraps = 0;
        continue;
      }

      const ex = e.centerX() - hx;
      const ey = e.centerY() - hy;
      const enemyDist = Math.hypot(ex, ey);

      // リードが相手に届いていて、かつ犬が相手より向こう側にいること
      const engaged = enemyDist < CONFIG.leashLength
        && dogDist > enemyDist + CONFIG.bindLeadMargin;

      if (!engaged) {
        this.side.delete(e);
      } else {
        const cross = dx * ey - dy * ex;
        const side = Math.sign(cross);
        const prev = this.side.get(e);
        if (prev !== undefined && side !== 0 && prev !== 0 && side !== prev) {
          e.wraps++;
          e.sweepFlash = 1;
          this.forget.set(e, CONFIG.bindForgetTime);
          if (e.wraps >= CONFIG.bindSweeps) {
            e.binding = CONFIG.bindHoldTime;
            e.wraps = 0;
            this.side.delete(e);
            this.forget.delete(e);
            continue;
          }
        }
        if (side !== 0) this.side.set(e, side);
      }

      // しばらく横切らなければ、巻きは緩んでほどける
      const t = (this.forget.get(e) ?? 0) - dt;
      if (e.wraps > 0) {
        if (t <= 0) {
          e.wraps = 0;
          this.forget.delete(e);
        } else {
          this.forget.set(e, t);
        }
      }
    }
  }

  draw(d: Draw, dog: Dog, owner: Owner): void {
    const hx = owner.handX;
    const hy = owner.handY;
    const cx = dog.collarX();
    const cy = dog.collarY();
    const slack = Math.max(0, 1 - this.state.distance / CONFIG.leashLength);
    const sag = slack * CONFIG.leashLength * 0.34;

    const pts: number[][] = [];
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      pts.push([
        hx + (cx - hx) * t,
        hy + (cy - hy) * t - Math.sin(t * Math.PI) * sag,
      ]);
    }
    const color = this.state.swinging ? '#ffb03a' : this.state.taut ? '#ff7a3d' : '#c0392b';
    d.line(pts, this.state.taut ? 3.4 : 2.8, color);
  }
}
