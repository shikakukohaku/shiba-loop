import type { DogSnapshot } from '../entities/Dog';
import type { OwnerSnapshot } from '../entities/Owner';

export interface Frame {
  t: number;
  dog: DogSnapshot;
  owner: OwnerSnapshot;
  hazards: unknown[];
}

/**
 * 巻き戻し用の記録。
 * 「本格的な状態履歴保存」はしない。毎フレームの姿勢を配列に積むだけ。
 * これで逆再生の見た目と、戻り先の状態復元を同時にまかなう。
 */
export class History {
  private frames: Frame[] = [];
  private maxSeconds: number;

  constructor(maxSeconds: number) {
    this.maxSeconds = maxSeconds;
  }

  clear(): void {
    this.frames.length = 0;
  }

  push(frame: Frame): void {
    this.frames.push(frame);
    // 古すぎるものは捨てる（巻き戻す範囲より少し余分に持つ）
    const cutoff = frame.t - this.maxSeconds;
    let drop = 0;
    while (drop < this.frames.length && this.frames[drop].t < cutoff) drop++;
    if (drop > 0) this.frames.splice(0, drop);
  }

  get length(): number {
    return this.frames.length;
  }

  get first(): Frame | undefined {
    return this.frames[0];
  }

  get last(): Frame | undefined {
    return this.frames[this.frames.length - 1];
  }

  /** t 以下で最も新しいフレーム（なければ最も古いもの） */
  at(t: number): Frame | undefined {
    if (this.frames.length === 0) return undefined;
    let lo = 0;
    let hi = this.frames.length - 1;
    if (t <= this.frames[0].t) return this.frames[0];
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.frames[mid].t <= t) lo = mid;
      else hi = mid - 1;
    }
    return this.frames[lo];
  }
}
