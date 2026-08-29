/** 押しっぱなしと「押した瞬間」を分けて持つ。タッチからも同じ口に流し込む。 */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private virtualDown = new Set<string>();
  private virtualPressed = new Set<string>();

  /** -1 / 0 / +1 。タッチのスティックはアナログ値になる */
  axisX = 0;
  private touchAxisX = 0;

  constructor() {
    addEventListener('keydown', (e) => {
      const k = this.map(e.code);
      if (!k) return;
      if (!this.down.has(k)) this.pressed.add(k);
      this.down.add(k);
      if (k !== 'debug' && k !== 'reset') e.preventDefault();
    });
    addEventListener('keyup', (e) => {
      const k = this.map(e.code);
      if (k) this.down.delete(k);
    });
    addEventListener('blur', () => this.down.clear());
  }

  private map(code: string): string | null {
    switch (code) {
      case 'ArrowLeft': case 'KeyA': return 'left';
      case 'ArrowRight': case 'KeyD': return 'right';
      case 'ArrowUp': case 'KeyW': case 'Space': return 'jump';
      case 'KeyJ': case 'KeyZ': return 'bite';
      case 'KeyK': case 'KeyX': case 'ShiftLeft': case 'ShiftRight': return 'dash';
      case 'Enter': case 'NumpadEnter': return 'confirm';
      case 'KeyR': return 'reset';
      case 'KeyH': return 'debug';
      default: return null;
    }
  }

  update(): void {
    const k = (this.down.has('right') ? 1 : 0) - (this.down.has('left') ? 1 : 0);
    this.axisX = k !== 0 ? k : this.touchAxisX;
  }

  endFrame(): void {
    this.pressed.clear();
    this.virtualPressed.clear();
  }

  isDown(key: string): boolean {
    return this.down.has(key) || this.virtualDown.has(key);
  }

  wasPressed(key: string): boolean {
    return this.pressed.has(key) || this.virtualPressed.has(key);
  }

  setTouchAxis(x: number): void {
    this.touchAxisX = Math.max(-1, Math.min(1, x));
  }

  setVirtualKey(key: string, down: boolean): void {
    if (down) {
      if (!this.virtualDown.has(key)) this.virtualPressed.add(key);
      this.virtualDown.add(key);
    } else {
      this.virtualDown.delete(key);
    }
  }

  pressVirtualKey(key: string): void {
    this.virtualPressed.add(key);
  }

  injectConfirm(): void {
    this.pressed.add('confirm');
  }
}
