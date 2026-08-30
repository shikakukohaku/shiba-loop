import { CONFIG } from './config';
import { Draw, type Camera } from './core/Draw';
import { Input } from './core/Input';
import { Touch } from './core/Touch';
import { clamp, overlaps, bodyRect } from './core/geom';
import { Dog } from './entities/Dog';
import { Owner } from './entities/Owner';
import type { Enemy } from './entities/Enemy';
import { Leash } from './systems/Leash';
import { Stage, GOAL_X } from './world/Stage';
import { UI } from './ui/UI';

export type GameState = 'PLAYING' | 'REWINDING' | 'CLEAR';

const STEP = 1 / 120;      // 物理はこの刻みで進める（速いのですり抜け防止）
const MAX_STEPS = 8;
const SPEECH_COOLDOWN = 2.6;

/** 場所で出るチュートリアル。1回出したら終わり */
interface Tip {
  at: number;
  text: string;
}

export class Game {
  private draw: Draw;
  private input = new Input();
  private touch: Touch;
  private ui: UI;

  private stage = new Stage();
  private dog = new Dog();
  private owner = new Owner();
  private leash = new Leash();

  state: GameState = 'PLAYING';
  private cam: Camera = { x: 0, y: CONFIG.cameraBaseY };
  private view = CONFIG.viewHeight;
  private shake = 0;
  private stateTime = 0;
  private speechCooldown = 0;
  private hintTimer = 0;
  private debug = false;
  private loops = 1;
  private acc = 0;
  private last = performance.now();

  private tips: Tip[] = [];
  private tipsDone = new Set<Tip>();
  private sawSwing = false;
  private sawBrute = false;

  constructor(container: HTMLElement) {
    this.draw = new Draw(container);
    this.ui = new UI(() => this.input.injectConfirm());
    this.touch = new Touch(this.input);
    this.draw.canvas.addEventListener('click', () => this.input.injectConfirm());
    this.resetTips();
    this.restart();
  }

  private resetTips(): void {
    const t = this.touch.enabled;
    this.tips = [
      { at: -Infinity, text: t ? '左をなぞって走る / ジャンプで跳ぶ' : '← → で走る　Space でジャンプ' },
      { at: 420, text: t ? '怪異は「かみつき」で倒す' : 'J：かみつき。怪異は飼い主しか狙っていない' },
      { at: 1180, text: t ? '後ろでリードを張ると、飼い主が足を止める' : '飼い主の後ろでリードを張ると、足を止められる' },
    ];
    this.tipsDone.clear();
  }

  restart(): void {
    this.state = 'PLAYING';
    this.stateTime = 0;
    this.shake = 0;
    this.speechCooldown = 0;
    this.hintTimer = 0;
    this.sawSwing = false;
    this.sawBrute = false;
    this.resetTips();

    this.stage.reset();
    this.owner.reset(0, 0);
    this.dog.reset(70, 0);
    this.leash.reset();
    this.cam.x = this.owner.x + CONFIG.cameraLeadX;
    this.cam.y = CONFIG.cameraBaseY;
    this.view = CONFIG.viewHeight;
    this.draw.setViewHeight(this.view);

    this.ui.hideOverlay();
    this.ui.clearSpeech();
    this.ui.setRewinding(false);
    this.ui.setHp(this.owner.hp);
  }

  start(): void {
    const tick = () => {
      requestAnimationFrame(tick);
      this.frame();
    };
    requestAnimationFrame(tick);
  }

  // --- ループ -----------------------------------------------------------

  private frame(): void {
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;

    this.input.update();
    if (this.input.wasPressed('reset')) this.restart();
    if (this.input.wasPressed('debug')) this.debug = !this.debug;

    this.stateTime += dt;
    this.speechCooldown = Math.max(0, this.speechCooldown - dt);
    this.hintTimer = Math.max(0, this.hintTimer - dt);
    this.shake = Math.max(0, this.shake - dt * 3.2 - this.shake * dt * 4);

    if (this.state === 'PLAYING') {
      this.acc = Math.min(this.acc + dt, STEP * MAX_STEPS);
      let steps = 0;
      while (this.acc >= STEP && steps++ < MAX_STEPS) {
        this.step(STEP);
        this.acc -= STEP;
      }
      this.updateHints();
    } else if (this.state === 'REWINDING') {
      if (this.stateTime > CONFIG.rewindDuration) {
        this.loops++;
        this.restart();
      }
    } else if (this.state === 'CLEAR') {
      if (this.stateTime > CONFIG.goalHoldTime) {
        this.ui.showOverlay({
          title: 'SHIBA LOOP',
          text: `散歩、完了<br>巻き戻した回数: ${this.loops - 1}`,
          action: 'もう一度あそぶ',
          mode: 'black',
        });
        if (this.input.wasPressed('confirm')) {
          this.loops = 1;
          this.restart();
        }
      }
    }

    this.updateCamera(dt);
    this.render();

    const head = this.draw.toScreen(this.cam, this.owner.x, this.owner.y + this.owner.h + 26);
    this.ui.update(dt, head.x, head.y);
    this.ui.setHp(this.owner.hp);
    this.ui.setDebug(this.debug, this.debugText());

    this.input.endFrame();
  }

  /** 物理1ステップ */
  private step(dt: number): void {
    const wantJump = this.input.wasPressed('jump');
    const holdJump = this.input.isDown('jump');
    const wantDash = this.input.wasPressed('dash');
    const wantBite = this.input.wasPressed('bite');
    const axisX = this.input.axisX;

    // 振り子中のジャンプは「飛び出す」に化ける
    let jump = wantJump;
    if (wantJump && this.leash.state.swinging) {
      this.dog.swingLaunch();
      this.leash.notifyLaunch();
      this.say('うわ、引っ張るな');
      jump = false;
      if (!this.sawSwing) {
        this.sawSwing = true;
        this.showHint('リードの反動で飛んだ', 2.4);
      }
    }

    this.dog.swinging = this.leash.state.swinging;
    this.dog.update(dt, axisX, jump, holdJump, wantDash, wantBite, this.stage.solids);

    this.owner.setSpeedFactor(this.leash.state.braking ? CONFIG.ownerBrakeFactor : 1);
    this.owner.update(dt, this.stage.ground, this.owner.hp <= 0);

    this.leash.update(dt, this.dog, this.owner, this.stage.enemies, axisX);

    this.stage.update(this.owner.x);
    for (const e of this.stage.enemies) e.update(dt, this.owner.x, this.stage.ground);

    this.resolveCombat();

    // 落ちたら飼い主のそばへ戻す
    if (this.dog.y < CONFIG.respawnY) {
      this.dog.reset(this.owner.x - 40, this.owner.y + 140);
    }

    if (this.owner.x >= GOAL_X && this.state === 'PLAYING') this.reachGoal();
  }

  private resolveCombat(): void {
    const biteBox = this.dog.biteBox();
    const ownerBox = bodyRect(this.owner);

    for (const e of this.stage.enemies) {
      if (!e.alive || e.binding > 0) continue;
      const box = e.rect();

      // かみつき
      if (this.dog.biting && overlaps(biteBox, box)) {
        if (e.biteable) {
          e.hit(this.dog.x);
          this.shake = Math.max(this.shake, 0.3);
          this.say('急にどうした');
        } else {
          // 硬いのでこちらが弾かれる
          this.dog.vx = -Math.sign(e.x - this.dog.x) * CONFIG.biteBounce;
          this.dog.vy = Math.max(this.dog.vy, 260);
          this.shake = Math.max(this.shake, 0.2);
          if (!this.sawBrute) {
            this.sawBrute = true;
            this.showHint('かみつきが効かない。飛び越えて向こう側へ回り、リードを何度も横切らせて締め上げる', 5.5);
          }
        }
        continue;
      }

      // 飼い主に到達＝被弾
      if (overlaps(box, ownerBox)) {
        if (this.owner.damage()) {
          this.shake = Math.max(this.shake, 0.6);
          this.say('いてっ。なんだ今の', 2.0, true);
          if (this.owner.hp <= 0) this.fail();
        }
        e.hit(this.owner.x);
      }
    }

    // 締め上げが決まった瞬間の演出
    for (const e of this.stage.enemies) {
      if (e.binding > 0 && e.binding > CONFIG.bindHoldTime - 0.02) {
        this.shake = Math.max(this.shake, 0.45);
        this.say('こら、ぐるぐる回るな');
      }
    }
  }

  private fail(): void {
    this.state = 'REWINDING';
    this.stateTime = 0;
    this.ui.setRewinding(true);
    this.ui.hideHint();
    this.ui.clearSpeech();
    this.ui.showOverlay({ text: '時間を巻き戻す', mode: 'dim' });
  }

  private reachGoal(): void {
    this.state = 'CLEAR';
    this.stateTime = 0;
    this.ui.hideHint();
    this.say('今日はよく走ったなあ', 3, true);
  }

  private say(text: string, seconds = 2.2, force = false): void {
    if (!force && this.speechCooldown > 0) return;
    this.ui.say(text, seconds);
    this.speechCooldown = SPEECH_COOLDOWN;
  }

  private showHint(text: string, seconds: number): void {
    this.ui.showHint(text);
    this.hintTimer = seconds;
  }

  private updateHints(): void {
    for (const tip of this.tips) {
      if (this.tipsDone.has(tip) || this.owner.x < tip.at) continue;
      this.tipsDone.add(tip);
      this.showHint(tip.text, 4.5);
    }
    if (this.hintTimer <= 0) this.ui.hideHint();
  }

  // --- 描画 -------------------------------------------------------------

  /**
   * 犬と飼い主の両方を必ず画面に入れる。
   * リードが画面幅ぶん伸びるので、離れたら引き、寄れば戻す。
   */
  private updateCamera(dt: number): void {
    const gapX = Math.abs(this.dog.x - this.owner.x);
    const gapY = Math.abs(this.dog.y - this.owner.y);

    // 両方が収まるのに必要な表示高さ
    const needByWidth = (gapX + CONFIG.cameraMargin) / this.draw.aspect;
    const needByHeight = gapY + CONFIG.cameraMargin * 0.8;
    const wantView = clamp(
      Math.max(CONFIG.viewHeight, needByWidth, needByHeight),
      CONFIG.viewHeight,
      CONFIG.viewHeightMax,
    );
    const zk = 1 - Math.exp(-CONFIG.cameraZoomSpeed * dt);
    this.view += (wantView - this.view) * zk;
    this.draw.setViewHeight(this.view);

    // 離れているときは中点。近いときだけ進行方向へ寄せる
    const lead = CONFIG.cameraLeadX * (1 - Math.min(1, gapX / 600));
    const tx = (this.owner.x + this.dog.x) / 2 + lead;
    const scale = this.view / CONFIG.viewHeight;
    const ty = CONFIG.cameraBaseY * scale + Math.max(0, this.dog.y - 190 * scale) * 0.8;

    const k = 1 - Math.exp(-CONFIG.cameraDamping * dt);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
  }

  private render(): void {
    const d = this.draw;
    const s = this.shake * 26;
    const cam: Camera = {
      x: this.cam.x + (Math.random() - 0.5) * s,
      y: this.cam.y + (Math.random() - 0.5) * s,
    };

    this.stage.drawBackground(d, cam.x, cam.y);
    d.begin(cam);
    this.stage.drawGround(d);

    for (const e of this.stage.enemies) e.draw(d);
    this.owner.draw(d);
    this.leash.draw(d, this.dog, this.owner);
    this.dog.draw(d);

    if (this.debug) {
      d.alpha(0.35, () => {
        const b = bodyRect(this.dog);
        d.rect(b.x, b.y, b.w, b.h, '#00ffcc');
        const o = bodyRect(this.owner);
        d.rect(o.x, o.y, o.w, o.h, '#00aaff');
        if (this.dog.biting) {
          const bb = this.dog.biteBox();
          d.rect(bb.x, bb.y, bb.w, bb.h, '#ff3b6b');
        }
        for (const e of this.stage.enemies) {
          const r = e.rect();
          d.rect(r.x, r.y, r.w, r.h, '#ff3b6b');
        }
      });
    }
  }

  private debugText(): string {
    const l = this.leash.state;
    const near = this.stage.enemies.find((e: Enemy) => e.alive && e.wraps > 0);
    return [
      `state : ${this.state}  loop:${this.loops}`,
      `dog   : ${this.dog.state}  x=${this.dog.x.toFixed(0)} y=${this.dog.y.toFixed(0)}`,
      `owner : x=${this.owner.x.toFixed(0)} hp=${this.owner.hp}`,
      `leash : ${l.distance.toFixed(0)}/${CONFIG.leashLength}${l.taut ? ' TAUT' : ''}${l.swinging ? ' SWING' : ''}${l.braking ? ' BRAKE' : ''}`,
      `enemies: ${this.stage.enemies.length}  wraps:${near ? `${near.wraps}/${CONFIG.bindSweeps}` : '-'}`,
    ].join('\n');
  }

  // デバッグ・自動テストから触るための口
  get debugRefs() {
    return { dog: this.dog, owner: this.owner, leash: this.leash, stage: this.stage };
  }
}
