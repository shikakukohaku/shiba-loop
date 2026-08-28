import type { Input } from './Input';

/** スティックを倒しきったと見なす距離（px） */
const STICK_RADIUS = 62;
/** これ以下の動きは無視する（px） */
const DEAD_ZONE = 6;

/**
 * iPad などタッチ操作の端末向けの入力。
 * 画面左半分がスティック（触った場所に出る）、右下が拒否柴と抱っこのボタン。
 * 出てくる値は Input に流し込むので、ゲーム側はキーボードと区別しない。
 */
export class Touch {
  readonly enabled: boolean;

  private input: Input;
  private zone: HTMLElement | null = null;
  private base: HTMLElement | null = null;
  private knob: HTMLElement | null = null;
  private pointerId: number | null = null;
  private origin = { x: 0, y: 0 };

  constructor(input: Input) {
    this.input = input;
    this.enabled = Touch.detect();
    if (!this.enabled) return;

    document.body.classList.add('touch');
    this.zone = document.getElementById('stickZone');
    this.base = document.getElementById('stickBase');
    this.knob = document.getElementById('stickKnob');
    this.bindStick();
    this.bindButton('btnBrace', 'brace', true);
    this.bindButton('btnHug', 'hug', false);

    // ダブルタップ拡大とスクロールを止める（ゲーム中に画面が動くと事故になる）
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  /** タッチ端末か。`?touch=1` を付ければPCでも試せる */
  private static detect(): boolean {
    if (new URLSearchParams(location.search).has('touch')) return true;
    return matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  }

  private bindStick(): void {
    const zone = this.zone;
    if (!zone || !this.base || !this.knob) return;

    zone.addEventListener('pointerdown', (e) => {
      if (this.pointerId !== null) return;
      e.preventDefault();
      this.pointerId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      this.origin = { x: e.clientX, y: e.clientY };
      this.base!.style.left = `${e.clientX}px`;
      this.base!.style.top = `${e.clientY}px`;
      this.base!.classList.add('show');
      this.moveKnob(0, 0);
    });

    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.pointerId) return;
      e.preventDefault();
      const dx = e.clientX - this.origin.x;
      const dy = e.clientY - this.origin.y;
      const len = Math.hypot(dx, dy);
      if (len < DEAD_ZONE) {
        this.moveKnob(0, 0);
        this.input.setAxis(0, 0);
        return;
      }
      const clamped = Math.min(len, STICK_RADIUS);
      const nx = (dx / len) * clamped;
      const ny = (dy / len) * clamped;
      this.moveKnob(nx, ny);
      this.input.setAxis(nx / STICK_RADIUS, ny / STICK_RADIUS);
    });

    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.base!.classList.remove('show');
      this.moveKnob(0, 0);
      this.input.setAxis(0, 0);
    };
    zone.addEventListener('pointerup', release);
    zone.addEventListener('pointercancel', release);
  }

  private moveKnob(x: number, y: number): void {
    if (this.knob) this.knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  }

  /** hold=true なら押しっぱなし、false ならタップ1回 */
  private bindButton(id: string, key: string, hold: boolean): void {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.classList.add('active');
      if (hold) this.input.setVirtualKey(key, true);
      else this.input.pressVirtualKey(key);
    });
    const up = (e: Event) => {
      e.preventDefault();
      el.classList.remove('active');
      if (hold) this.input.setVirtualKey(key, false);
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  }
}
