import * as THREE from 'three';

/**
 * キーボード入力。押しっぱなし（移動・拒否柴）と、押した瞬間だけ（抱っこ・デバッグ）を分けて持つ。
 */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();

  /** カメラ基準の移動ベクトル（XZ平面、長さ0〜1） */
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
    // 画面の上方向 = ワールドの -Z、右 = +X（カメラを +X+Z 側から見下ろしているため）
    const x = (this.down.has('right') ? 1 : 0) - (this.down.has('left') ? 1 : 0);
    const z = (this.down.has('down') ? 1 : 0) - (this.down.has('up') ? 1 : 0);
    this.move.set(x, z);
    if (this.move.lengthSq() > 1) this.move.normalize();
  }

  /** 毎フレーム末尾で呼ぶ。 */
  endFrame(): void {
    this.pressed.clear();
  }

  isDown(key: string): boolean {
    return this.down.has(key);
  }

  /** このフレームで押された瞬間かどうか */
  wasPressed(key: string): boolean {
    return this.pressed.has(key);
  }

  /** 外部（クリックなど）から確定入力を注入する */
  injectConfirm(): void {
    this.pressed.add('confirm');
  }
}
