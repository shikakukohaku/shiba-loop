import { CONFIG } from '../config';
import type { Draw } from '../core/Draw';
import { moveAndCollide, type Body, type Rect } from '../core/geom';

export type EnemyKind = 'walker' | 'flyer' | 'brute';

const EYE = '#d8e6ff';

/**
 * 怪異。飼い主だけをまっすぐ狙う。飼い主には見えていない。
 * walker と flyer はかみつきで倒せる。brute は硬いので、リードで巻いて締めるしかない。
 */
export class Enemy implements Body {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  w = 0;
  h = 0;
  grounded = false;

  readonly kind: EnemyKind;
  readonly homeY: number;
  alive = true;
  /** 締め上げの演出中 */
  binding = 0;
  /** リードが体を横切った回数。Leash が入れる */
  wraps = 0;
  /** 直近で横切った瞬間の光り */
  sweepFlash = 0;
  private phase = Math.random() * Math.PI * 2;
  private wobble = 0;
  private hurt = 0;

  constructor(kind: EnemyKind, x: number, y: number) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.homeY = y;
    if (kind === 'brute') { this.w = 48; this.h = 70; }
    else if (kind === 'flyer') { this.w = 30; this.h = 34; }
    else { this.w = 30; this.h = 46; }
  }

  get biteable(): boolean {
    return this.kind !== 'brute';
  }

  rect(): Rect {
    return { x: this.x - this.w / 2, y: this.y, w: this.w, h: this.h };
  }

  centerX(): number {
    return this.x;
  }

  centerY(): number {
    return this.y + this.h / 2;
  }

  hit(fromX: number): void {
    this.alive = false;
    this.vx = Math.sign(this.x - fromX) * CONFIG.enemyKnockback;
    this.vy = 380;
  }

  update(dt: number, targetX: number, solids: Rect[]): void {
    this.hurt = Math.max(0, this.hurt - dt);
    this.wobble += dt * 3;
    this.sweepFlash = Math.max(0, this.sweepFlash - dt * 4);

    if (this.binding > 0) {
      // 締め上げられている。縮んでから消える
      this.binding -= dt;
      if (this.binding <= 0) this.alive = false;
      return;
    }

    if (!this.alive) {
      // 吹き飛んでいる最中
      this.vy -= CONFIG.gravity * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      return;
    }

    const dir = Math.sign(targetX - this.x) || -1;
    if (this.kind === 'flyer') {
      this.x += dir * CONFIG.flyerSpeed * dt;
      this.phase += (dt / CONFIG.flyerPeriod) * Math.PI * 2;
      this.y = this.homeY + Math.sin(this.phase) * CONFIG.flyerAmplitude;
      return;
    }

    const speed = this.kind === 'brute' ? CONFIG.bruteSpeed : CONFIG.walkerSpeed;
    this.vx = dir * speed;
    this.vy -= CONFIG.gravity * dt;
    moveAndCollide(this, dt, solids);
  }

  draw(d: Draw): void {
    const cx = this.x;
    const y = this.y;
    const w = this.w;
    const h = this.h;
    const sway = Math.sin(this.wobble) * 2;
    const squeeze = this.binding > 0 ? 1 - (1 - this.binding / CONFIG.bindHoldTime) * 0.55 : 1;
    const body = this.hurt > 0 ? '#4a1a22' : '#0b0d13';

    d.alpha(this.alive || this.binding > 0 ? 0.94 : 0.5, () => {
      if (this.kind === 'flyer') {
        d.ellipse(cx, y + h / 2, (w / 2) * squeeze, h / 2, sway * 0.02, body);
        // ぼろ布のような裾
        d.poly([
          [cx - w / 2, y + h * 0.4], [cx + w / 2, y + h * 0.4],
          [cx + w * 0.2, y - 10 + sway], [cx, y + 2], [cx - w * 0.25, y - 12 - sway],
        ], body);
      } else {
        const bw = (w / 2) * squeeze;
        d.roundRect(cx - bw, y, bw * 2, h * 0.62, bw * 0.6, body);
        d.circle(cx + sway * 0.4, y + h * 0.76, w * 0.32 * squeeze, body);
        if (this.kind === 'brute') {
          // 肩の張り出し
          d.poly([[cx - bw - 8, y + h * 0.5], [cx - bw + 4, y + h * 0.62], [cx - bw + 2, y + h * 0.3]], body);
          d.poly([[cx + bw + 8, y + h * 0.5], [cx + bw - 4, y + h * 0.62], [cx + bw - 2, y + h * 0.3]], body);
        }
      }
      // 目
      const ey = this.kind === 'flyer' ? y + h * 0.62 : y + h * 0.78;
      d.circle(cx - 4 + sway * 0.3, ey, 1.9, EYE);
      d.circle(cx + 4 + sway * 0.3, ey, 1.9, EYE);
    });

    // 巻き付きの進み具合
    if (this.alive && this.binding <= 0 && this.wraps > 0) {
      const r = Math.max(w, h) * 0.72;
      const t = Math.min(1, this.wraps / CONFIG.bindSweeps);
      d.arc(cx, y + h / 2, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t, 4, `rgba(255,170,60,${0.45 + t * 0.5})`);
    }
    if (this.sweepFlash > 0) {
      // リードが体を横切った合図。輪が締まるように見せる
      const r = Math.max(w, h) * (0.55 + this.sweepFlash * 0.25);
      d.alpha(this.sweepFlash * 0.85, () => d.arc(cx, y + h / 2, r, 0, Math.PI * 2, 5, '#ffc878'));
    }
  }
}
