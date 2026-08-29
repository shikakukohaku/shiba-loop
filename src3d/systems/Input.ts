import * as THREE from 'three';

/**
 * キーボード入力。押しっぱなし（移動・拒否柴）と、押した瞬間だけ（抱っこ・デバッグ）を分けて持つ。
 */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  // タッチ（画面上のスティックとボタン）から入る分。キーボードと同じ扱いにする
  private virtualDown = new Set<string>();
  private virtualPressed = new Set<string>();
  private readonly axis = new THREE.Vector2();

  /** 画面基準の移動ベクトル（x=右, y=下、長さ0〜1） */
  readonly move = new THREE.Vector2();

  constructor() {
    window.addEventListener('keydown', (e) => {
      const k = this.normalize(e);
      if (!k) return;
      if (!this.down.has(k)) this.pressed.add(k);
      this.down.add(k);
      // 矢印キーとスペースでページがスクロールしないように
      if (k !== 'r' && k !== 't' && k !== 'g' && k !== 'h') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      const k = this.normalize(e);
      if (k) this.down.delete(k);
    });
    window.addEventListener('blur', () => this.down.clear());
  }

  private normalize(e: KeyboardEvent): string | null {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': return 'up';
      case 'KeyS': case 'ArrowDown': return 'down';
      case 'KeyA': case 'ArrowLeft': return 'left';
      case 'KeyD': case 'ArrowRight': return 'right';
      case 'Space': return 'brace';
      case 'KeyE': return 'hug';
      case 'Enter': case 'NumpadEnter': return 'confirm';
      case 'KeyR': return 'r';
      case 'KeyT': return 't';
      case 'KeyG': return 'g';
      case 'KeyH': return 'h';
      default: return null;
    }
  }

  /** 毎フレーム先頭で呼ぶ。移動ベクトルを更新する。 */
  update(): void {
    const x = (this.down.has('right') ? 1 : 0) - (this.down.has('left') ? 1 : 0);
    const z = (this.down.has('down') ? 1 : 0) - (this.down.has('up') ? 1 : 0);
    this.move.set(x, z);
    if (this.move.lengthSq() > 1) this.move.normalize();
    // キーが押されていなければ、スティックの倒し具合をそのまま使う
    if (this.move.lengthSq() < 0.0001) this.move.copy(this.axis);
  }

  /** 毎フレーム末尾で呼ぶ。 */
  endFrame(): void {
    this.pressed.clear();
    this.virtualPressed.clear();
  }

  isDown(key: string): boolean {
    return this.down.has(key) || this.virtualDown.has(key);
  }

  /** このフレームで押された瞬間かどうか */
  wasPressed(key: string): boolean {
    return this.pressed.has(key) || this.virtualPressed.has(key);
  }

  /** 画面上のスティックから移動を入れる（x=右, y=下、長さ0〜1） */
  setAxis(x: number, y: number): void {
    this.axis.set(x, y);
    if (this.axis.lengthSq() > 1) this.axis.normalize();
  }

  /** 画面上のボタンの押しっぱなしを入れる */
  setVirtualKey(key: string, down: boolean): void {
    if (down) {
      if (!this.virtualDown.has(key)) this.virtualPressed.add(key);
      this.virtualDown.add(key);
    } else {
      this.virtualDown.delete(key);
    }
  }

  /** 画面上のボタンのタップ（押した瞬間だけ）を入れる */
  pressVirtualKey(key: string): void {
    this.virtualPressed.add(key);
  }

  /** 外部（クリックなど）から確定入力を注入する */
  injectConfirm(): void {
    this.pressed.add('confirm');
  }
}
