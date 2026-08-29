import type { Input } from './Input';

const STICK_RADIUS = 58;
const DEAD_ZONE = 7;

/** iPad 用。左半分が横移動のスティック、右下がジャンプ・かみつき・ダッシュ。 */
export class Touch {
  readonly enabled: boolean;
  private input: Input;
  private zone: HTMLElement | null = null;
  private base: HTMLElement | null = null;
  private knob: HTMLElement | null = null;
  private pointerId: number | null = null;
  private originX = 0;

  constructor(input: Input) {
    this.input = input;
    this.enabled = Touch.detect();
    if (!this.enabled) return;

    document.body.classList.add('touch');
    this.zone = document.getElementById('stickZone');
    this.base = document.getElementById('stickBase');
    this.knob = document.getElementById('stickKnob');
    this.bindStick();
    this.bindButton('btnJump', 'jump', true);
    this.bindButton('btnBite', 'bite', false);
    this.bindButton('btnDash', 'dash', false);

    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

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
      this.originX = e.clientX;
      this.base!.style.left = `${e.clientX}px`;
      this.base!.style.top = `${e.clientY}px`;
      this.base!.classList.add('show');
      this.knob!.style.transform = 'translate(-50%, -50%)';
    });

    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.pointerId) return;
      e.preventDefault();
      const dx = e.clientX - this.originX;
      if (Math.abs(dx) < DEAD_ZONE) {
        this.knob!.style.transform = 'translate(-50%, -50%)';
        this.input.setTouchAxis(0);
        return;
      }
      const clamped = Math.max(-STICK_RADIUS, Math.min(STICK_RADIUS, dx));
      this.knob!.style.transform = `translate(calc(-50% + ${clamped}px), -50%)`;
      // 少し倒すだけで最高速まで出す（アクションなので鈍らせない）
      this.input.setTouchAxis(Math.sign(clamped) * Math.min(1, Math.abs(clamped) / (STICK_RADIUS * 0.55)));
    });

    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.base!.classList.remove('show');
      this.input.setTouchAxis(0);
    };
    zone.addEventListener('pointerup', release);
    zone.addEventListener('pointercancel', release);
  }

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
