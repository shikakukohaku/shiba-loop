import { CONFIG } from '../config';
import type { Draw } from '../core/Draw';
import { clamp, moveAndCollide, type Body, type Rect } from '../core/geom';

const C_FUR = '#d07a34';
const C_CREAM = '#f6e7d0';
const C_DARK = '#1a1614';
const C_COLLAR = '#c03a3a';

export type DogState = 'idle' | 'run' | 'air' | 'dash' | 'bite';

/** 柴犬。プレイヤーが操作するのはこれだけ。 */
export class Dog implements Body {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  w = CONFIG.dogWidth;
  h = CONFIG.dogHeight;
  grounded = false;

  facing = 1;
  state: DogState = 'idle';

  private coyote = 0;
  private jumpBuffer = 0;
  private airJumps = 0;
  private dashTimer = 0;
  private dashCooldown = 0;
  private biteTimer = 0;
  private biteCooldown = 0;
  private cutJump = false; // 「ジャンプの高さをキーで調整する」対象かどうか
  private runPhase = 0;
  private tailPhase = 0;
  private squash = 0; // 着地・ジャンプのつぶれ

  /** リードが張って振り子になっているか（Leash が毎フレーム入れる） */
  swinging = false;

  reset(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.grounded = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.airJumps = 0;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.biteTimer = 0;
    this.biteCooldown = 0;
    this.squash = 0;
    this.cutJump = false;
  }

  get biting(): boolean {
    return this.biteTimer > 0;
  }

  get dashing(): boolean {
    return this.dashTimer > 0;
  }

  /** かみつきの当たり判定。口の先に出る */
  biteBox(): Rect {
    const reach = CONFIG.biteReach;
    const cx = this.x + this.facing * (this.w / 2);
    return {
      x: this.facing > 0 ? cx : cx - reach,
      y: this.y + 2,
      w: reach,
      h: this.h - 2,
    };
  }

  /** 押した瞬間の入力を受け取る。ジャンプは Leash 側から呼ばれることもある */
  update(
    dt: number,
    axisX: number,
    wantJump: boolean,
    holdJump: boolean,
    wantDash: boolean,
    wantBite: boolean,
    solids: Rect[],
  ): void {
    this.coyote = this.grounded ? CONFIG.dogCoyoteTime : Math.max(0, this.coyote - dt);
    this.jumpBuffer = wantJump ? CONFIG.dogJumpBuffer : Math.max(0, this.jumpBuffer - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.biteCooldown = Math.max(0, this.biteCooldown - dt);
    if (this.grounded) this.airJumps = CONFIG.dogAirJumps;

    if (axisX !== 0) this.facing = axisX > 0 ? 1 : -1;

    // かみつき：前へ踏み込む
    if (wantBite && this.biteCooldown <= 0) {
      this.biteTimer = CONFIG.biteDuration;
      this.biteCooldown = CONFIG.biteDuration + CONFIG.biteCooldown;
      this.vx = this.facing * CONFIG.biteLunge;
    }
    this.biteTimer = Math.max(0, this.biteTimer - dt);

    // ダッシュ
    if (wantDash && this.dashCooldown <= 0) {
      this.dashTimer = CONFIG.dashDuration;
      this.dashCooldown = CONFIG.dashDuration + CONFIG.dashCooldown;
      this.vy = Math.max(this.vy, 0);
    }
    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      this.vx = this.facing * CONFIG.dashSpeed;
      this.vy *= 0.82;
    } else if (this.biteTimer <= 0) {
      // ふつうの移動
      const accel = this.grounded ? CONFIG.dogAccel : CONFIG.dogAirAccel;
      const cap = CONFIG.dogRunSpeed;
      if (axisX !== 0) {
        const target = axisX * cap;
        if (Math.abs(this.vx) > cap && Math.sign(this.vx) === Math.sign(axisX)) {
          // ダッシュや振り子でついた勢いは、押しても足さず、ゆっくり通常速度へ戻す
          this.vx += (target - this.vx) * Math.min(1, dt * 2.2);
        } else {
          this.vx += axisX * accel * dt;
          if (Math.sign(this.vx) === Math.sign(axisX) && Math.abs(this.vx) > cap) this.vx = target;
        }
      } else if (this.grounded) {
        const drop = CONFIG.dogFriction * dt;
        this.vx = Math.abs(this.vx) <= drop ? 0 : this.vx - Math.sign(this.vx) * drop;
      }
    }

    // ジャンプ（振り子中の扱いは Leash 側で速度を足してから来る）
    if (this.jumpBuffer > 0 && this.dashTimer <= 0) {
      if (this.coyote > 0) {
        this.vy = CONFIG.dogJumpSpeed;
        this.coyote = 0;
        this.jumpBuffer = 0;
        this.squash = -1;
        this.cutJump = true;
      } else if (this.airJumps > 0 && !this.swinging) {
        this.vy = CONFIG.dogJumpSpeed * 0.9;
        this.airJumps--;
        this.jumpBuffer = 0;
        this.squash = -1;
        this.cutJump = true;
      }
    }
    // キーを離したら上りを1回だけ切る。自分のジャンプのときだけ。
    // 毎フレーム削ると、軽く押しただけのジャンプが潰れてしまう
    const minRise = CONFIG.dogJumpSpeed * CONFIG.dogJumpCutoff;
    if (this.cutJump && !holdJump && this.vy > minRise) {
      this.vy = minRise;
      this.cutJump = false;
    }
    if (this.vy <= 0) this.cutJump = false;

    if (this.dashTimer <= 0) {
      this.vy -= CONFIG.gravity * dt;
      this.vy = Math.max(this.vy, -CONFIG.maxFallSpeed);
    }

    const wasAir = !this.grounded;
    moveAndCollide(this, dt, solids);
    if (wasAir && this.grounded) this.squash = 1;

    // 見た目
    this.runPhase += Math.abs(this.vx) * dt * 0.05;
    this.tailPhase += dt * (6 + Math.abs(this.vx) * 0.02);
    this.squash *= Math.pow(0.0015, dt);
    if (Math.abs(this.squash) < 0.01) this.squash = 0;

    this.state = this.biteTimer > 0 ? 'bite'
      : this.dashTimer > 0 ? 'dash'
        : !this.grounded ? 'air'
          : Math.abs(this.vx) > 20 ? 'run' : 'idle';
  }

  /** 振り子から飛び出す。接線速度を伸ばして上へ蹴る */
  swingLaunch(): void {
    this.cutJump = false;
    this.vx *= CONFIG.leashSwingBoost;
    this.vy = this.vy * CONFIG.leashSwingBoost + CONFIG.leashSwingLift;
    this.squash = -1;
    this.airJumps = Math.max(this.airJumps, 1);
  }

  draw(d: Draw): void {
    const f = this.facing;
    const cx = this.x;
    const cy = this.y;
    // つぶれ：着地で潰れ、ジャンプで伸びる
    const sq = clamp(this.squash, -1, 1);
    const sy = 1 - sq * 0.22;
    const sx = 1 + sq * 0.18;

    const bodyY = cy + 15 * sy;
    const bw = 21 * sx;
    const bh = 12 * sy;

    // 足
    const swing = this.grounded ? Math.sin(this.runPhase) * (this.state === 'run' ? 7 : 1) : 4;
    for (const [ox, phase] of [[-11, 1], [-6, -1], [8, -1], [12, 1]] as const) {
      const foot = this.grounded ? swing * phase : (ox > 0 ? 5 : -5);
      d.line([[cx + ox * f, bodyY - 2], [cx + ox * f + foot * f, cy + 1]], 5.5, C_FUR);
    }

    // しっぱ（くるん）
    const tail = Math.sin(this.tailPhase) * 0.5;
    d.arc(cx - 20 * f, bodyY + 8, 9, -0.4 + tail, 2.6 + tail, 5, C_CREAM);

    // 胴
    d.ellipse(cx, bodyY, bw, bh, 0, C_FUR);
    d.ellipse(cx, bodyY - 4 * sy, bw * 0.82, bh * 0.55, 0, C_CREAM);

    // 頭
    const hx = cx + 17 * f;
    const hy = bodyY + 8 * sy;
    d.circle(hx, hy, 12.5, C_FUR);
    d.ellipse(hx + 5 * f, hy - 3, 8, 6.5, 0, C_CREAM);
    // 耳
    d.poly([[hx - 3 * f, hy + 8], [hx + 3 * f, hy + 16], [hx + 7 * f, hy + 7]], C_FUR);
    d.poly([[hx + 6 * f, hy + 8], [hx + 12 * f, hy + 15], [hx + 13 * f, hy + 5]], C_FUR);
    // 鼻先と目
    const open = this.biting ? 4 : 0;
    d.poly([
      [hx + 8 * f, hy - 1 + open],
      [hx + 17 * f, hy - 2 + open * 1.4],
      [hx + 17 * f, hy - 6 - open],
      [hx + 8 * f, hy - 5 - open],
    ], C_CREAM);
    d.circle(hx + 17 * f, hy - 3 + open * 0.4, 2.4, C_DARK);
    d.circle(hx + 6 * f, hy + 2, 2.1, C_DARK);
    if (this.biting) d.poly([[hx + 9 * f, hy - 4], [hx + 16 * f, hy - 5], [hx + 12 * f, hy - 10]], '#8d2b2b');

    // 首輪（リードの根本）
    d.rect(cx + 8 * f - 2.5, bodyY - 2, 5, 13, C_COLLAR);
  }

  /** リードの根本（首輪）のワールド座標 */
  collarX(): number {
    return this.x + 9 * this.facing;
  }

  collarY(): number {
    return this.y + 20;
  }
}
