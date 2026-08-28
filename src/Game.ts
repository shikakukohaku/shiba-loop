import * as THREE from 'three';
import { CONFIG } from './config';
import { Dog } from './entities/Dog';
import { Owner } from './entities/Owner';
import { Wraith } from './entities/Wraith';
import { Input } from './systems/Input';
import { Touch } from './systems/Touch';
import { Leash } from './systems/Leash';
import { CameraRig } from './systems/CameraRig';
import { History } from './systems/History';
import { FlyingSignHazard } from './hazards/FlyingSignHazard';
import { FallingObjectHazard } from './hazards/FallingObjectHazard';
import { ManholeHazard } from './hazards/ManholeHazard';
import { BicycleHazard } from './hazards/BicycleHazard';
import type { Advice, Hazard, HazardContext } from './hazards/Hazard';
import { World, OWNER_WAYPOINTS, OWNER_START, DOG_START, WRAITH_SPOT, GOAL_X } from './world/World';
import { UI } from './ui/UI';

export type GameState =
  | 'INTRO'
  | 'PLAYING_FIRST_LOOP'
  | 'OWNER_DEAD'
  | 'REWINDING'
  | 'PRECOGNITION'
  | 'PLAYING_LOOP'
  | 'CLEAR';

const INTRO_DURATION = 1.4;
const FIRST_DEAD_PROMPT_DELAY = 2.6; // 初回だけ、怪異を見せてから巻き戻しを出す
const RETRY_PROMPT_DELAY = 1.0;      // 2回目以降はすぐ出す
const WRAITH_NEAR_DISTANCE = 2.6;
const SPEECH_COOLDOWN = 3.2;
const HINT_DISTANCE = 9;   // 事故の何メートル手前からヒントを出すか
const VISION_HINT_HOLD = 3.4; // 未来視の直後、この秒数はヒントを書き換えない

/** 操作説明はキーボードとタッチで文言を変える */
const TEXT = {
  move: {
    key: 'WASD / 矢印キー：柴犬を動かす',
    touch: '画面の左側をなぞって柴犬を動かす',
  },
  brace: {
    key: 'Space：拒否柴（踏ん張って飼い主を止める）',
    touch: '「拒否柴」を押しっぱなしにすると踏ん張る',
  },
  hugFar: {
    key: 'E：抱っこをせがむ（飼い主に近づく）',
    touch: '飼い主に近づいて「抱っこ」を押す',
  },
  hug: {
    key: 'E：抱っこをせがむ',
    touch: '「抱っこ」を押す',
  },
  skip: {
    key: 'Enter：スキップ',
    touch: 'タップでスキップ',
  },
} as const;

/** 事故ごとの避け方を、そのまま画面に出す文言にする */
const ADVICE_TEXT: Record<Advice, { key: string; touch: string }> = {
  crouch: { key: 'E：抱っこをせがんでしゃがませる', touch: '「抱っこ」でしゃがませる' },
  stop: { key: 'Space：拒否柴で足を止める', touch: '「拒否柴」で足を止める' },
  pull: { key: 'リードを張って横へ引っ張る', touch: 'リードを張って横へ引っ張る' },
  pole: { key: '電柱の向こうへ回り込んでリードを引っかける', touch: '電柱の向こうへ回り込んでリードを引っかける' },
};

interface VisionReturn {
  loopTime: number;
  dog: ReturnType<Dog['capture']>;
  owner: ReturnType<Owner['capture']>;
  hazards: unknown[];
}

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
  private touch: Touch;
  private ui: UI;

  /** x の小さい順に並べる。ヒントと未来視がこの順に依存している */
  private hazards: Hazard[] = [
    new FlyingSignHazard(),
    new FallingObjectHazard(),
    new ManholeHazard(),
    new BicycleHazard(),
  ];
  /** 未来視で見た事故の名前。見たものだけヒントが出る */
  private visionSeen = new Set<string>();

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
  private successPhase = 0;
  private reachedGoal = false;
  private wraithShown = false;
  private huggedThisLoop = false;
  private deaths = 0;
  private slowMo = 0;
  private hintLock = 0;

  // 未来視
  private visionDone = false;
  private visionFreeze = 0;
  private visionCaption = '';
  private visionReturn: VisionReturn | null = null;

  private clock = new THREE.Clock();
  private anchor = new THREE.Vector3();
  private moveDir = new THREE.Vector3();
  private zeroMove = new THREE.Vector2();

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    // タッチ端末は解像度を少し落とす。iPad の DPR 2 で影まで描くと重い
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
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
    sc.left = -14; sc.right = 14; sc.top = 16; sc.bottom = -14; sc.near = 1; sc.far = 60;
    this.scene.add(this.sun, this.sun.target);

    this.scene.add(this.world.root, this.dog.root, this.owner.root, this.wraith.root, this.leash.root);
    for (const h of this.hazards) this.scene.add(h.root);

    this.rig = new CameraRig(innerWidth / innerHeight);
    this.ui = new UI(() => this.input.injectConfirm());
    this.touch = new Touch(this.input);

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
    this.deaths = 0;
    this.loopTime = 0;
    this.stateTime = 0;
    this.hitPause = 0;
    this.successPhase = 0;
    this.reachedGoal = false;
    this.wraithShown = false;
    this.huggedThisLoop = false;
    this.speechCooldown = 0;
    this.visionDone = false;
    this.visionFreeze = 0;
    this.visionReturn = null;
    this.visionSeen.clear();
    this.slowMo = 0;
    this.hintLock = 0;

    this.dog.restore({
      x: DOG_START.x, z: DOG_START.z, facing: Math.PI / 2,
      walkPhase: 0, poseBlend: 0, begTimer: 0, pose: 'idle',
    });
    this.dog.gemActive = false;
    this.owner.restore({
      x: OWNER_START.x, z: OWNER_START.z, facing: Math.PI / 2,
      state: 'WALKING', crouchTimer: 0, stopTimer: 0, waypointIndex: 0,
      crouchBlend: 0, deathBlend: 0, walkPhase: 0, sinking: false, sinkBlend: 0,
    });
    for (const h of this.hazards) h.reset();
    this.leash.clear();
    this.wraith.hide();
    this.history.clear();

    this.rig.setZoom(1);
    this.rig.snapTo(this.dog.position, this.owner.position);
    this.leash.apply(this.dog, this.owner, 0);

    this.ui.hideOverlay();
    this.ui.clearSpeech();
    this.ui.setRewinding(false);
    this.ui.setVision(false);
    this.ui.showHint(this.text('move'));
  }

  /** 操作説明の文言を、キーボードかタッチかで選ぶ */
  private text(key: keyof typeof TEXT): string {
    return this.touch.enabled ? TEXT[key].touch : TEXT[key].key;
  }

  private adviceText(advice: Advice): string {
    return this.touch.enabled ? ADVICE_TEXT[advice].touch : ADVICE_TEXT[advice].key;
  }

  private hazardContext(): HazardContext {
    return {
      owner: this.owner,
      dog: this.dog,
      time: this.loopTime,
      vision: this.state === 'PRECOGNITION',
      onOwnerHit: (h) => this.onOwnerHit(h),
      onNearMiss: (h, d) => this.onNearMiss(h, d),
    };
  }

  private onOwnerHit(hazard: Hazard): void {
    // 未来視では死なない。何を見たかだけ覚えておく
    if (this.state === 'PRECOGNITION') {
      this.visionSeen.add(hazard.name);
      this.visionFreeze = CONFIG.visionFreezeDuration;
      this.visionCaption = hazard.label;
      return;
    }
    if (this.owner.state === 'DEAD') return;

    this.owner.kill(hazard.name === 'manhole');
    this.deaths++;
    this.state = 'OWNER_DEAD';
    this.stateTime = 0;
    this.hitPause = CONFIG.deathPauseDuration;
    this.wraithShown = false;
    this.rig.shake(0.55);
    this.ui.clearSpeech();
    this.ui.hideHint();
  }

  /** かすめて助かった瞬間。近ければ時間を落として「ギリギリ」を見せる */
  private onNearMiss(hazard: Hazard, distance: number): void {
    if (this.state === 'PRECOGNITION' || this.owner.state === 'DEAD') return;
    if (distance < CONFIG.closeCallDistance) {
      this.slowMo = CONFIG.slowMoDuration;
      this.rig.shake(0.22);
    } else {
      this.rig.shake(0.1);
    }
    this.say(hazard.nearMissLine, 2.2, true);
  }

  private say(text: string, seconds = 2.4, force = false): void {
    if (!force && this.speechCooldown > 0) return;
    this.ui.say(text, seconds);
    this.speechCooldown = SPEECH_COOLDOWN;
  }

  private get playing(): boolean {
    return this.state === 'PLAYING_FIRST_LOOP' || this.state === 'PLAYING_LOOP';
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
    let dt = Math.min(this.clock.getDelta(), 1 / 20);
    if (this.slowMo > 0) {
      this.slowMo -= dt;
      dt *= CONFIG.slowMoFactor;
    }
    this.hintLock = Math.max(0, this.hintLock - dt);
    this.input.update();
    this.handleDebugKeys();

    this.stateTime += dt;
    this.speechCooldown = Math.max(0, this.speechCooldown - dt);

    switch (this.state) {
      case 'INTRO':
        this.simulate(dt, false, true);
        if (this.stateTime > INTRO_DURATION) {
          this.state = 'PLAYING_FIRST_LOOP';
          this.stateTime = 0;
          this.loopTime = 0;
          this.history.clear();
        }
        break;
      case 'PLAYING_FIRST_LOOP':
      case 'PLAYING_LOOP':
        this.updatePlaying(dt);
        break;
      case 'OWNER_DEAD':
        this.updateDead(dt);
        break;
      case 'REWINDING':
        this.updateRewind(dt);
        break;
      case 'PRECOGNITION':
        this.updateVision(dt);
        break;
      case 'CLEAR':
        this.updateClear();
        break;
      default:
        break;
    }

    this.wraith.update(dt, this.dog.position);

    if (this.state === 'PRECOGNITION') {
      this.rig.snapTo(this.owner.position, this.owner.position);
    } else {
      this.rig.update(dt, this.dog.position, this.owner.position);
    }
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
  private simulate(dt: number, hazardsActive: boolean, playerControlled: boolean): void {
    let move = this.zeroMove.set(0, 0);
    if (playerControlled) {
      const { right, forward } = this.rig.getGroundBasis();
      this.moveDir.set(0, 0, 0)
        .addScaledVector(right, this.input.move.x)
        .addScaledVector(forward, -this.input.move.y);
      move = new THREE.Vector2(this.moveDir.x, this.moveDir.z);
      if (move.lengthSq() > 1) move.normalize();
    }

    const bracing = playerControlled && this.input.isDown('brace') && this.owner.state !== 'DEAD';
    this.dog.update(dt, move, bracing);

    // リードが張った状態で踏ん張るか、電柱に引っかかっていると、飼い主の足が止まる。
    // 電柱の場合に減速させないと、飼い主が電柱のまわりを滑って回り込んでしまう
    const leash = this.leash.state;
    const held = (bracing && leash.taut) || (leash.wrapped && leash.taut);
    this.owner.setSpeedFactor(held ? CONFIG.braceOwnerSpeedFactor : 1);
    this.owner.update(dt);

    this.leash.apply(this.dog, this.owner, dt);
    this.dog.sync();
    this.owner.sync();

    if (hazardsActive) {
      const ctx = this.hazardContext();
      for (const h of this.hazards) h.update(dt, ctx);
    }

    if (playerControlled && this.owner.state !== 'DEAD') {
      if (leash.released) this.say('お、外れた', 1.6);
      else if (leash.wrapped && leash.taut) this.say('あれ、引っかかってるぞ');
      else if (bracing && leash.taut) this.say('こら、どうした。行くぞー');
      else if (leash.pulled > 0.004) this.say('引っ張るなって');
    }
  }

  private updatePlaying(dt: number): void {
    if (this.hitPause > 0) {
      this.hitPause -= dt;
      return;
    }
    this.loopTime += dt;
    this.simulate(dt, true, true);
    this.recordFrame();

    if (this.input.wasPressed('hug')) this.tryHug();
    this.updatePlayingHints();

    if (!this.reachedGoal && this.owner.position.x >= GOAL_X && this.owner.state !== 'DEAD') {
      this.reachedGoal = true;
      this.successPhase = 0;
      this.stateTime = 0;
      this.owner.stopFor(60);
      this.ui.hideHint();
    }
    if (this.reachedGoal) this.updateSuccess();
  }

  private tryHug(): void {
    if (this.owner.state === 'DEAD' || this.owner.state === 'CROUCHING') return;
    const d = Math.hypot(this.dog.position.x - this.owner.position.x, this.dog.position.z - this.owner.position.z);
    if (d > CONFIG.hugRange) {
      this.ui.showHint(this.text('hugFar'), true);
      return;
    }
    this.owner.crouch();
    this.dog.beg();
    this.huggedThisLoop = true;
    this.say('はいはい、抱っこね', 1.8, true);
    this.ui.hideHint();
  }

  /** まだ通り過ぎていない、いちばん手前の事故 */
  private nextHazard(): Hazard | null {
    for (const h of this.hazards) {
      if (this.owner.position.x < h.dangerX + 2.5) return h;
    }
    return null;
  }

  private updatePlayingHints(): void {
    if (this.reachedGoal || this.hintLock > 0) return;
    const next = this.nextHazard();

    // 1周目はまだ何も知らない。基本操作だけ出す
    if (this.state === 'PLAYING_FIRST_LOOP') {
      if (this.loopTime > 3 && this.loopTime < 6.5) this.ui.showHint(this.text('brace'));
      else if (this.loopTime >= 6.5) this.ui.hideHint();
      return;
    }

    if (this.owner.state === 'CROUCHING') {
      this.ui.hideHint();
      return;
    }
    if (!next) {
      this.ui.hideHint();
      return;
    }

    const ahead = next.dangerX - this.owner.position.x;
    if (ahead > HINT_DISTANCE) {
      this.ui.hideHint();
      return;
    }

    // 未来視で見た事故だけヒントを出す（見ていないものは自分で気づく）
    if (!this.visionSeen.has(next.name)) {
      this.ui.hideHint();
      return;
    }

    let advice = this.adviceText(next.advice);
    if (next.advice === 'crouch') {
      const d = Math.hypot(
        this.dog.position.x - this.owner.position.x,
        this.dog.position.z - this.owner.position.z,
      );
      if (d > CONFIG.hugRange) advice = this.text('hugFar');
    }
    this.ui.showHint(`${next.label} — ${advice}`, ahead < 4);
  }

  /** 家に着いたあとの流れ。飼い主は何も分かっていない。 */
  private updateSuccess(): void {
    const t = this.stateTime;
    if (this.successPhase === 0 && this.owner.state !== 'CROUCHING' && t > 1.0) {
      this.successPhase = 1;
      this.say(this.huggedThisLoop ? '今日は甘えん坊だったな' : '今日はやけに落ち着かなかったな', 2.8, true);
    }
    if (this.successPhase === 1 && t > 3.6) {
      this.successPhase = 2;
      this.wraith.show(
        new THREE.Vector3(this.owner.position.x - 9, 0, -6.5),
        this.dog.position,
      );
    }
    if (this.successPhase === 2 && t > 7.0) {
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
    this.simulate(dt, true, true);
    this.loopTime += dt;

    const first = this.deaths === 1;
    if (first) {
      const nearOwner = Math.hypot(
        this.dog.position.x - this.owner.position.x,
        this.dog.position.z - this.owner.position.z,
      ) < WRAITH_NEAR_DISTANCE;
      if (!this.wraithShown && (nearOwner || this.stateTime > 3.4) && this.stateTime > 1.2) {
        this.wraithShown = true;
        this.wraith.show(WRAITH_SPOT, this.dog.position);
      }
    }

    if (this.stateTime > (first ? FIRST_DEAD_PROMPT_DELAY : RETRY_PROMPT_DELAY)) {
      this.dog.gemActive = true;
      this.ui.showOverlay({
        text: first ? '首輪のアイテムが光っている。' : '',
        action: '時間を巻き戻す',
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

    if (p >= 1) {
      this.loopTime = this.rewindTo;
      this.loop += 1;
      this.stateTime = 0;
      this.reachedGoal = false;
      this.successPhase = 0;
      this.huggedThisLoop = false;
      this.dog.gemActive = false;
      this.history.clear();
      this.ui.setRewinding(false);
      this.rig.setZoom(1);

      // 初回の巻き戻しのあとだけ、首輪のアイテムが未来を見せてくる
      this.leash.clear();
      if (!this.visionDone) this.beginVision();
      else this.state = 'PLAYING_LOOP';
    }
  }

  // --- 未来視 -----------------------------------------------------------

  /**
   * 犬にだけ見える、この先の散歩。
   * 別のカットシーンを作らず、本物のシミュレーションを早送りで流して見せる。
   * 飼い主は死なず、事故に当たった場所に印だけが残る。
   */
  private beginVision(): void {
    this.visionReturn = {
      loopTime: this.loopTime,
      dog: this.dog.capture(),
      owner: this.owner.capture(),
      hazards: this.hazards.map((h) => h.snapshot()),
    };
    this.state = 'PRECOGNITION';
    this.stateTime = 0;
    this.visionFreeze = 0;
    this.visionCaption = '';
    this.dog.gemActive = true;
    this.ui.setVision(true, '未来視');
    this.ui.showHint(this.text('skip'));
    this.rig.setZoom(CONFIG.visionZoom);
  }

  private updateVision(dt: number): void {
    if (this.input.wasPressed('confirm') && this.stateTime > 0.6) {
      this.endVision();
      return;
    }

    if (this.visionFreeze > 0) {
      this.visionFreeze -= dt;
      this.ui.setVision(true, `未来視 — ${this.visionCaption}`);
      return;
    }
    this.ui.setVision(true, '未来視');

    // 早送り。当たり判定を飛ばさないよう細かく刻む
    let remaining = dt * CONFIG.visionSpeed;
    while (remaining > 0) {
      const step = Math.min(remaining, 1 / 60);
      this.loopTime += step;
      this.simulate(step, true, false);
      remaining -= step;
      if (this.visionFreeze > 0) return;
    }

    const sawEverything = this.visionSeen.size >= this.hazards.length;
    if (sawEverything || this.owner.position.x >= GOAL_X) this.endVision();
  }

  private endVision(): void {
    const back = this.visionReturn;
    this.visionDone = true;
    if (back) {
      this.loopTime = back.loopTime;
      this.dog.restore(back.dog);
      this.owner.restore(back.owner);
      for (let i = 0; i < this.hazards.length; i++) this.hazards[i].restore(back.hazards[i]);
      this.leash.apply(this.dog, this.owner, 0);
    }
    this.visionReturn = null;
    this.history.clear();
    this.leash.clear();
    this.dog.gemActive = false;
    this.ui.setVision(false);
    this.rig.setZoom(1);
    this.rig.snapTo(this.dog.position, this.owner.position);
    this.state = 'PLAYING_LOOP';
    this.stateTime = 0;
    // 犬はしゃべらないので、飼い主の吹き出しではなく画面の文字で出す
    this.ui.showHint(`見えた。この先で ${this.visionSeen.size} 回、飼い主が死ぬ`, true);
    this.hintLock = VISION_HINT_HOLD;
  }

  private updateClear(): void {
    if (this.stateTime > 1.2 && this.stateTime < 4.2) {
      this.ui.showOverlay({ title: 'SHIBA LOOP', mode: 'black' });
    } else if (this.stateTime >= 4.2) {
      this.ui.showOverlay({
        title: 'SHIBA LOOP',
        text: `Prototype Clear<br>巻き戻した回数: ${this.deaths}`,
        action: 'もう一度あそぶ',
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
      for (const hz of this.hazards) hz.setDebugVisible(this.debugVisible);
    }
    if (this.input.wasPressed('t')) this.skipToNextHazard();
    if (this.input.wasPressed('g')) {
      const next = this.nextHazard();
      if (next) next.forceTrigger(this.hazardContext());
    }
  }

  /** 次の事故の少し手前まで早送りする */
  private skipToNextHazard(): void {
    if (this.state === 'INTRO') {
      this.state = 'PLAYING_FIRST_LOOP';
      this.stateTime = 0;
      this.loopTime = 0;
      this.history.clear();
    }
    if (!this.playing) return;
    const next = this.nextHazard();
    if (!next) return;
    const targetX = next.triggerX - 1.5;
    const step = 1 / 60;
    let guard = 0;
    while (this.owner.position.x < targetX && guard++ < 12000) {
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
    const next = this.nextHazard();
    return [
      `state : ${this.state}`,
      `loop  : ${this.loop}  deaths: ${this.deaths}`,
      `time  : ${this.loopTime.toFixed(2)}s`,
      `owner : ${this.owner.state}  x=${this.owner.position.x.toFixed(1)}`,
      `leash : ${l.distance.toFixed(2)} / ${CONFIG.leashLength}${l.taut ? ' [TAUT]' : ''}${l.wrapped ? ' [POLE]' : ''}`,
      `next  : ${next ? `${next.name} @${next.dangerX.toFixed(1)}` : '-'}`,
    ].join('\n');
  }
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
