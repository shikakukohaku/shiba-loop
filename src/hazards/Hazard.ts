import type * as THREE from 'three';
import type { Owner } from '../entities/Owner';
import type { Dog } from '../entities/Dog';

export interface HazardContext {
  owner: Owner;
  dog: Dog;
  /** ループ開始からの経過秒 */
  time: number;
  /** 飼い主に当たったときに呼ぶ */
  onOwnerHit: () => void;
  /** 飼い主のすぐ上を通り過ぎたときに呼ぶ（＝回避成功） */
  onNearMiss: () => void;
}

/**
 * 事故の共通インターフェース。
 * 事故を増やすときは、これを実装したクラスを1つ足して Game に登録するだけにする。
 */
export interface Hazard {
  readonly name: string;
  readonly root: THREE.Object3D;
  /** ループ開始から何秒で発動するか */
  triggerTime: number;
  update(dt: number, ctx: HazardContext): void;
  /** ループの最初の状態に戻す */
  reset(): void;
  /** デバッグ用に即発動させる */
  forceTrigger(ctx: HazardContext): void;
  /** タイムリープ用。中身の型はハザードごとに自由。 */
  snapshot(): unknown;
  restore(snapshot: unknown): void;
}
