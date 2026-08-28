import type * as THREE from 'three';
import type { Owner } from '../entities/Owner';
import type { Dog } from '../entities/Dog';

/** その事故をどう避けるか。画面のヒント文はゲーム側でこれから引く。 */
export type Advice = 'crouch' | 'stop' | 'pull' | 'pole';

export interface HazardContext {
  owner: Owner;
  dog: Dog;
  /** ループ開始からの経過秒 */
  time: number;
  /** 未来視中か。true のときは飼い主を殺さず、危険地点の記録だけする */
  vision: boolean;
  /** 飼い主に当たったときに呼ぶ。1ループにつき1回だけ */
  onOwnerHit: (hazard: Hazard) => void;
  /** 飼い主に当たらずに済んだときに呼ぶ。distance はどれだけ近くをかすめたか */
  onNearMiss: (hazard: Hazard, distance: number) => void;
}

/**
 * 事故の共通インターフェース。
 * 事故を増やすときは、これを実装したクラスを1つ足して Game に登録するだけにする。
 *
 * 発動条件を「時刻」ではなく「飼い主の x 座標」にしているのが要点。
 * 時刻だと、序盤で拒否柴を使って飼い主を遅らせただけで、後半の事故が
 * 全部飼い主のいない場所で空振りしてしまう。
 *
 * ただし「事故の場所に着いた瞬間に起こす」のもだめで、手前で足を止めたら
 * 何も起きなくなり、先へ進めない。だから triggerX で予告を始めて、
 * そこから決まった秒数後に必ず起こす。止めれば事故だけが先に起きる。
 */
export interface Hazard {
  /** 内部名 */
  readonly name: string;
  /** 画面に出す名前 */
  readonly label: string;
  /** 避け方 */
  readonly advice: Advice;
  /** 避けられたときに飼い主が言うこと。事故の意味は分かっていない */
  readonly nearMissLine: string;
  readonly root: THREE.Object3D;

  /** 飼い主がこの x を越えたら予告が始まる */
  triggerX: number;
  /** 事故が実際に起きる x。ヒントとマーカーの近さはこれで測る */
  readonly dangerX: number;

  update(dt: number, ctx: HazardContext): void;
  /** ループの最初の状態に戻す */
  reset(): void;
  /** デバッグ用に即発動させる */
  forceTrigger(ctx: HazardContext): void;
  /** タイムリープ用。中身の型はハザードごとに自由。 */
  snapshot(): unknown;
  restore(snapshot: unknown): void;
  /** 当たり判定を見せる */
  setDebugVisible(v: boolean): void;
}
