import { CONFIG } from '../config';
import type { Draw } from '../core/Draw';
import { moveAndCollide, type Body, type Rect } from '../core/geom';

const C_COAT = '#4a6fa5';
const C_PANTS = '#39404d';
const C_SKIN = '#e8bb96';
const C_HAIR = '#2b2320';

/**
 * 飼い主。操作できない。ただ右へ歩き、何も気づかない。
 * プレイヤーにとっては「動く支点」であり「守る対象」でもある。
 */
export class Owner implements Body {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  w = CONFIG.ownerWidth;
  h = CONFIG.ownerHeight;
  grounded = false;

  hp = CONFIG.ownerMaxHp;
  invincible = 0;
  private walkPhase = 0;
  private speedFactor = 1;
  /** 手（リードの持ち手）の上下の揺れ */
  private handBob = 0;

  reset(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.hp = CONFIG.ownerMaxHp;
    this.invincible = 0;
    this.walkPhase = 0;
    this.speedFactor = 1;
  }

  setSpeedFactor(f: number): void {
    this.speedFactor = f;
  }

  get handX(): number {
    return this.x - 2;
  }

  get handY(): number {
    return this.y + CONFIG.ownerHandHeight + this.handBob;
  }

  /** @returns 実際に減ったか */
  damage(): boolean {
    if (this.invincible > 0 || this.hp <= 0) return false;
    this.hp--;
    this.invincible = CONFIG.ownerInvincible;
    return true;
  }

  update(dt: number, solids: Rect[], stopped: boolean): void {
    this.invincible = Math.max(0, this.invincible - dt);
    this.vx = stopped ? 0 : CONFIG.ownerSpeed * this.speedFactor;
    this.vy -= CONFIG.gravity * dt;
    this.vy = Math.max(this.vy, -CONFIG.maxFallSpeed);
    moveAndCollide(this, dt, solids);
    if (this.grounded) this.walkPhase += Math.abs(this.vx) * dt * 0.09;
    this.handBob = Math.sin(this.walkPhase * 2) * 2.5;
  }

  draw(d: Draw): void {
    // 被弾直後は点滅させる
    if (this.invincible > 0 && Math.floor(this.invincible * 14) % 2 === 0) return;

    const x = this.x;
    const y = this.y;
    const swing = Math.sin(this.walkPhase) * 9;

    // 脚
    d.line([[x, y + 34], [x - swing * 0.5, y + 1]], 9, C_PANTS);
    d.line([[x, y + 34], [x + swing * 0.5, y + 1]], 9, C_PANTS);
    // 胴
    d.roundRect(x - 13, y + 30, 26, 32, 8, C_COAT);
    // 腕（リードを持つ側）
    d.line([[x - 8, y + 56], [this.handX, this.handY]], 7, C_COAT);
    d.circle(this.handX, this.handY, 4, C_SKIN);
    // 首と頭
    d.rect(x - 4, y + 60, 8, 6, C_SKIN);
    d.circle(x, y + 72, 11, C_SKIN);
    d.arc(x, y + 73, 11.5, 0.1, Math.PI - 0.1, 7, C_HAIR);
    d.circle(x + 6, y + 71, 1.8, '#2b2320');
  }
}
