import * as THREE from 'three';
import { CONFIG } from './config';
import { Dog } from './entities/Dog';
import { Owner } from './entities/Owner';
import { Wraith } from './entities/Wraith';
import { Input } from './systems/Input';
import { Leash } from './systems/Leash';
import { CameraRig } from './systems/CameraRig';
import { History } from './systems/History';
import { FlyingSignHazard } from './hazards/FlyingSignHazard';
import type { Hazard, HazardContext } from './hazards/Hazard';
import { World, OWNER_WAYPOINTS, OWNER_START, DOG_START, WRAITH_SPOT } from './world/World';
import { UI } from './ui/UI';

export type GameState =
  | 'INTRO'
  | 'PLAYING_FIRST_LOOP'
  | 'OWNER_DEAD'
  | 'REWINDING'
  | 'PLAYING_SECOND_LOOP'
  | 'CLEAR';

const INTRO_DURATION = 1.4;
const DEAD_PROMPT_DELAY = 2.6;   // 死んでから「巻き戻す」を出すまで
const WRAITH_NEAR_DISTANCE = 2.6; // 犬が飼い主に近付いたと見なす距離
const SUCCESS_DELAY = 1.2;        // 回避してから成功シーケンスに入るまで
const SPEECH_COOLDOWN = 3.5;

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private rig: CameraRig;
  private sun: THREE.DirectionalLight;

  private world = new World();
  private dog = new Dog();
  private owner = new Owner(OWNER_WAYPOINTS);
  private wraith = new Wraith();
  private leash = new Leash();
  private input = new Input();
  private ui: UI;

  private sign = new FlyingSignHazard();
  private hazards: Hazard[] = [];

  private history = new History(CONFIG.rewindSeconds + 4);

  state: GameState = 'INTRO';
  private loop = 1;
  private loopTime = 0;
  private stateTime = 0;
  private hitPause = 0;
  private rewindFrom = 0;
  private rewindTo = 0;
  private debugVisible = false;
  private speechCooldown = 0;
  private avoided = false;
  private successPhase = 0;
  private wraithShown = false;
  private hugPromptShown = false;
  private huggedThisLoop = false;

  private clock = new THREE.Clock();
  private anchor = new THREE.Vector3();
  private moveDir = new THREE.Vector3();

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x93b0c6);
    this.scene.fog = new THREE.Fog(0x93b0c6, 34, 68);

    this.scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x6a6b55, 1.9));
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 60;
    this.scene.add(this.sun, this.sun.target);

    this.hazards = [this.sign];
    this.scene.add(this.world.root, this.dog.root, this.owner.root, this.wraith.root, this.leash.root, this.sign.root);

    this.rig = new CameraRig(innerWidth / innerHeight);
    this.ui = new UI(() => this.input.injectConfirm());

    addEventListener('resize', () => this.onResize());
    this.renderer.domElement.addEventListener('click', () => this.input.injectConfirm());

    this.resetAll();
  }

  private onResize(): void {
    this.renderer.setSize(innerWidth, innerHeight);
    this.rig.setAspect(innerWidth / innerHeight);
  }

  // --- 進行 -------------------------------------------------------------

  /** 最初から。デバッグの R もここに来る。 */
  resetAll(): void {
    this.state = 'INTRO';
    this.loop = 1;
    this.loopTime = 0;
    this.stateTime = 0;
    this.hitPause = 0;
    this.avoided = false;
    this.successPhase = 0;
    this.wraithShown = false;
    this.hugPromptShown = false;
    this.huggedThisLoop = false;
    this.speechCooldown = 0;

    this.dog.restore({
      x: DOG_START.x, z: DOG_START.z, facing: Math.PI / 2,
      walkPhase: 0, poseBlend: 0, begTimer: 0, pose: 'idle',
    });
    this.dog.gemActive = false;
    this.owner.restore({
      x: OWNER_START.x, z: OWNER_START.z, facing: Math.PI / 2,
      state: 'WALKING', crouchTimer: 0, stopTimer: 0, waypointIndex: 0,
      crouchBlend: 0, deathBlend: 0, walkPhase: 0,
    });
    for (const h of this.hazards) h.reset();
    this.wraith.hide();
    this.history.clear();

    this.rig.setZoom(1);
    this.rig.snapTo(this.dog.position, this.owner.position);
    this.leash.apply(this.dog, this.owner, 0);

    this.ui.hideOverlay();
    this.ui.clearSpeech();
    this.ui.setRewinding(false);
    this.ui.showHint('WASD / 矢印キー：柴犬を動かす');
  }

  private hazardContext(): HazardContext {
    return {
      owner: this.owner,
      dog: this.dog,
      time: this.loopTime,
      onOwnerHit: () => this.onOwnerHit(),
      onNearMiss: () => this.onNearMiss(),
    };
  }

  private onOwnerHit(): void {
    if (this.owner.state === 'DEAD') return;
    this.owner.kill();
    this.state = 'OWNER_DEAD';
    this.stateTime = 0;
    this.hitPause = CONFIG.deathPauseDuration;
    this.wraithShown = false;
    this.rig.shake(0.55);
    this.ui.clearSpeech();
    this.ui.hideHint();
  }

  private onNearMiss(): void {
    if (this.owner.state === 'DEAD') return;
    this.rig.shake(0.12);
    this.say('うわ、なんか飛んでったな', 2.2, true);
  }

  private say(text: string, seconds = 2.4, force = false): void {
    if (!force && this.speechCooldown > 0) return;
    this.ui.say(text, seconds);
    this.speechCooldown = SPEECH_COOLDOWN;
  }

  // --- ループ -----------------------------------------------------------

  start(): void {
    const tick = () => {
      requestAnimationFrame(tick);
      this.frame();
    };
    requestAnimationFrame(tick);
  }

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.input.update();
    this.handleDebugKeys();

    this.stateTime += dt;
    this.speechCooldown = Math.max(0, this.speechCooldown - dt);

    switch (this.state) {
      case 'INTRO':
        this.simulate(dt, false);
        if (this.stateTime > INTRO_DURATION) {
          this.state = 'PLAYING_FIRST_LOOP';
          this.stateTime = 0;
          this.loopTime = 0;
          this.history.clear();
        }
        break;
      case 'PLAYING_FIRST_LOOP':
      case 'PLAYING_SECOND_LOOP':
        this.updatePlaying(dt);
        break;
      case 'OWNER_DEAD':
        this.updateDead(dt);
        break;
      case 'REWINDING':
        this.updateRewind(dt);
        break;
      case 'CLEAR':
        this.updateClear(dt);
        break;
      default:
        break;
    }

    this.wraith.update(dt, this.dog.position);
    this.rig.update(dt, this.dog.position, this.owner.position);
    this.updateSun();

    this.anchor.set(this.owner.position.x, this.owner.headHeight + 0.5, this.owner.position.z);
    this.ui.update(dt, this.anchor, this.rig.camera);
    this.ui.setDebugText(this.debugText());

    this.renderer.render(this.scene, this.rig.camera);
    this.input.endFrame();
  }

  private updateSun(): void {
    const t = this.owner.position;
    this.sun.position.set(t.x + 7, 16, t.z + 9);
    this.sun.target.position.set(t.x, 0, t.z);
    this.sun.target.updateMatrixWorld();
  }

  /** 犬・飼い主・リード・事故を1フレーム進める */
  private simulate(dt: number, hazardsActive: boolean): void {
    const { right, forward } = this.rig.getGroundBasis();
    this.moveDir.set(0, 0, 0)
      .addScaledVector(right, this.input.move.x)
      .addScaledVector(forward, -this.input.move.y);
    const move = new THREE.Vector2(this.moveDir.x, this.moveDir.z);
    if (move.lengthSq() > 1) move.normalize();

    const bracing = this.input.isDown('brace') && this.owner.state !== 'DEAD';
    this.dog.update(dt, move, bracing);

    // リードが張った状態で踏ん張ると、飼い主の足が止まる
    const leash = this.leash.state;
    this.owner.setSpeedFactor(bracing && leash.taut ? CONFIG.braceOwnerSpeedFactor : 1);
    this.owner.update(dt);

    this.leash.apply(this.dog, this.owner, dt);
    this.dog.sync();
    this.owner.sync();

    if (hazardsActive) {
      const ctx = this.hazardContext();
      for (const h of this.hazards) h.update(dt, ctx);
    }

    if (bracing && leash.taut) this.say('こら、どうした。行くぞー');
    else if (leash.pulled > 0.004) this.say('引っ張るなって');
  }

  private updatePlaying(dt: number): void {
    if (this.hitPause > 0) {
      this.hitPause -= dt;
      return;
    }
    this.loopTime += dt;
    this.simulate(dt, true);
    this.recordFrame();

    // 抱っこ
    if (this.input.wasPressed('hug')) this.tryHug();

    this.updatePlayingHints();

    // 事故をやり過ごせたか
    if (!this.avoided && this.owner.state !== 'DEAD' && this.loopTime > this.sign.triggerTime + SUCCESS_DELAY) {
      this.avoided = true;
      this.successPhase = 0;
      this.stateTime = 0;
    }
    if (this.avoided) this.updateSuccess();
  }

  private tryHug(): void {
    if (this.owner.state === 'DEAD' || this.owner.state === 'CROUCHING') return;
    const d = Math.hypot(this.dog.position.x - this.owner.position.x, this.dog.position.z - this.owner.position.z);
    if (d > CONFIG.hugRange) {
      this.ui.showHint('抱っこをせがむには、もっと飼い主に近づく', true);
      return;
    }
    this.owner.crouch();
    this.dog.beg();
    this.huggedThisLoop = true;
    this.say('はいはい、抱っこね', 1.8, true);
    this.ui.hideHint();
  }

  private updatePlayingHints(): void {
    if (this.avoided) return;
    const toHazard = this.sign.triggerTime - this.loopTime;

    if (this.owner.state === 'CROUCHING') {
      this.ui.hideHint();
    } else if (this.state === 'PLAYING_SECOND_LOOP' && toHazard < 3.2 && toHazard > -0.6) {
      const d = Math.hypot(this.dog.position.x - this.owner.position.x, this.dog.position.z - this.owner.position.z);
      this.ui.showHint(d > CONFIG.hugRange ? 'E：抱っこをせがむ（飼い主に近づく）' : 'E：抱っこをせがむ', true);
      this.hugPromptShown = true;
    } else if (this.hugPromptShown && toHazard <= -0.6) {
      this.ui.hideHint();
    } else if (this.state === 'PLAYING_FIRST_LOOP' && this.loopTime > 3 && this.loopTime < 6) {
      this.ui.showHint('Space：拒否柴（踏ん張って飼い主を止める）');
    } else if (this.state === 'PLAYING_FIRST_LOOP' && this.loopTime >= 6) {
      this.ui.hideHint();
    }
  }

  /** 事故を避けたあとの流れ。飼い主は何も分かっていない。 */
  private updateSuccess(): void {
    const t = this.stateTime;
    // 「うわ、なんか飛んでったな」を言い終わるまで待ってから次の台詞に移る
    if (this.successPhase === 0 && this.owner.state !== 'CROUCHING' && t > 1.6) {
      this.successPhase = 1;
      this.say(this.huggedThisLoop ? '今日は甘えん坊だな' : 'なんだったんだ、今の', 2.6, true);
    }
    if (this.successPhase === 1 && t > 3.0) {
      this.successPhase = 2;
      this.wraith.show(WRAITH_SPOT, this.dog.position);
    }
    if (this.successPhase === 2 && t > 6.4) {
      this.successPhase = 3;
      this.state = 'CLEAR';
      this.stateTime = 0;
      this.ui.hideHint();
      this.ui.showOverlay({ mode: 'black' });
    }
  }

  private updateDead(dt: number): void {
    if (this.hitPause > 0) {
      this.hitPause -= dt;
      this.rig.shake(0.4);
      return;
    }
    // 飼い主は倒れたが、犬はまだ動ける
    this.simulate(dt, true);
    this.loopTime += dt;

    const nearOwner = Math.hypot(
      this.dog.position.x - this.owner.position.x,
      this.dog.position.z - this.owner.position.z,
    ) < WRAITH_NEAR_DISTANCE;

    if (!this.wraithShown && (nearOwner || this.stateTime > 3.4) && this.stateTime > 1.2) {
      this.wraithShown = true;
      this.wraith.show(WRAITH_SPOT, this.dog.position);
    }

    if (this.stateTime > DEAD_PROMPT_DELAY) {
      this.dog.gemActive = true;
      this.ui.showOverlay({
        text: '首輪のアイテムが光っている。',
        action: '時間を巻き戻す（Enter / クリック）',
        mode: 'dim',
      });
      if (this.input.wasPressed('confirm')) this.beginRewind();
    }
  }

  private beginRewind(): void {
    const last = this.history.last;
    const first = this.history.first;
    if (!last || !first) {
      this.resetAll();
      return;
    }
    this.state = 'REWINDING';
    this.stateTime = 0;
    this.rewindFrom = last.t;
    this.rewindTo = Math.max(first.t, last.t - CONFIG.rewindSeconds);
    this.ui.hideOverlay();
    this.ui.clearSpeech();
    this.ui.hideHint();
    this.ui.setRewinding(true);
    this.rig.setZoom(1.3);
    this.wraith.hide();
  }

  private updateRewind(dt: number): void {
    const p = Math.min(1, this.stateTime / CONFIG.rewindDuration);
    const t = THREE.MathUtils.lerp(this.rewindFrom, this.rewindTo, easeInOut(p));
    const frame = this.history.at(t);
    if (frame) {
      this.dog.restore(frame.dog);
      this.owner.restore(frame.owner);
      for (let i = 0; i < this.hazards.length; i++) this.hazards[i].restore(frame.hazards[i]);
      this.leash.apply(this.dog, this.owner, dt);
    }
    void dt;

    if (p >= 1) {
      this.loopTime = this.rewindTo;
      this.loop += 1;
      this.state = 'PLAYING_SECOND_LOOP';
      this.stateTime = 0;
      this.avoided = false;
      this.successPhase = 0;
      this.hugPromptShown = false;
      this.huggedThisLoop = false;
      this.dog.gemActive = false;
      this.history.clear();
      this.ui.setRewinding(false);
      this.rig.setZoom(1);
      this.say('……', 0.8, true);
    }
  }

  private updateClear(dt: number): void {
    void dt;
    if (this.stateTime > 1.2 && this.stateTime < 4.2) {
      this.ui.showOverlay({ title: 'SHIBA LOOP', mode: 'black' });
    } else if (this.stateTime >= 4.2) {
      this.ui.showOverlay({
        title: 'SHIBA LOOP',
        text: 'Prototype Clear',
        action: 'R：もう一度',
        mode: 'black',
      });
      if (this.input.wasPressed('confirm')) this.resetAll();
    }
  }

  private recordFrame(): void {
    this.history.push({
      t: this.loopTime,
      dog: this.dog.capture(),
      owner: this.owner.capture(),
      hazards: this.hazards.map((h) => h.snapshot()),
    });
  }

  // --- デバッグ ---------------------------------------------------------

  private handleDebugKeys(): void {
    if (this.input.wasPressed('r')) this.resetAll();
    if (this.input.wasPressed('h')) {
      this.debugVisible = !this.debugVisible;
      this.world.setDebugVisible(this.debugVisible);
      this.leash.setDebugVisible(this.debugVisible);
      this.sign.setDebugVisible(this.debugVisible);
    }
    if (this.input.wasPressed('t')) this.skipToHazard();
    if (this.input.wasPressed('g')) this.sign.forceTrigger(this.hazardContext());
  }

  /** 事故の1.5秒前まで早送りする */
  private skipToHazard(): void {
    if (this.state === 'INTRO') {
      this.state = 'PLAYING_FIRST_LOOP';
      this.stateTime = 0;
      this.loopTime = 0;
      this.history.clear();
    }
    if (this.state !== 'PLAYING_FIRST_LOOP' && this.state !== 'PLAYING_SECOND_LOOP') return;
    const target = this.sign.triggerTime - 1.5;
    const step = 1 / 60;
    let guard = 0;
    while (this.loopTime < target && guard++ < 6000) {
      this.loopTime += step;
      this.owner.setSpeedFactor(1);
      this.owner.update(step);
      this.leash.apply(this.dog, this.owner, step);
      this.dog.sync();
      this.owner.sync();
      this.recordFrame();
    }
    this.rig.snapTo(this.dog.position, this.owner.position);
  }

  private debugText(): string {
    const l = this.leash.state;
    return [
      `state : ${this.state}`,
      `loop  : ${this.loop}`,
      `time  : ${this.loopTime.toFixed(2)}s`,
      `owner : ${this.owner.state}`,
      `leash : ${l.distance.toFixed(2)} / ${CONFIG.leashLength}${l.taut ? ' [TAUT]' : ''}`,
    ].join('\n');
  }
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
