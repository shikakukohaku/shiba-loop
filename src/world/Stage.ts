import type { Draw } from '../core/Draw';
import { Enemy, type EnemyKind } from '../entities/Enemy';
import type { Rect } from '../core/geom';

interface Spawn {
  /** 飼い主がこの x を越えたら湧く */
  at: number;
  kind: EnemyKind;
  /** 飼い主の何 px 先に出すか */
  ahead: number;
  y: number;
}

export const GOAL_X = 4200;
const START_X = -400;
const END_X = GOAL_X + 600;

/** 一本道の街路。飼い主は地面をまっすぐ歩き、犬は上も使える。 */
export class Stage {
  /** 犬が乗れるもの全部 */
  readonly solids: Rect[] = [];
  /**
   * 飼い主と怪異が歩く床。地面だけ。
   * 犬用の足場まで当たり判定に入れると、飼い主が箱に引っかかって進めなくなる。
   * 横から見た絵なので「箱は道の反対側にある」という扱いにする。
   */
  readonly ground: Rect[] = [];
  readonly enemies: Enemy[] = [];
  private spawns: Spawn[] = [];
  private spawned = new Set<Spawn>();

  constructor() {
    // 地面（飼い主はここしか歩かない）
    const floor = { x: START_X, y: -60, w: END_X - START_X, h: 60 };
    this.solids.push(floor);
    this.ground.push(floor);

    // 犬用の足場。リード（200）で届く高さに置く
    const boxes: Array<[number, number, number, number]> = [
      [380, 0, 70, 62], [470, 0, 70, 104],
      [900, 150, 190, 22],
      [1180, 90, 120, 22],
      [1520, 0, 74, 68], [1600, 0, 74, 116], [1680, 0, 74, 62],
      [2180, 118, 210, 22], [2470, 196, 170, 22],
      [2900, 0, 70, 84],
      [3180, 132, 160, 22], [3400, 92, 120, 22],
      [3760, 0, 70, 70], [3840, 0, 70, 120],
    ];
    for (const [x, y, w, h] of boxes) this.solids.push({ x, y, w, h });

    this.spawns = [
      { at: 260, kind: 'walker', ahead: 620, y: 0 },
      { at: 780, kind: 'walker', ahead: 640, y: 0 },
      { at: 1150, kind: 'flyer', ahead: 660, y: 120 },
      { at: 1750, kind: 'brute', ahead: 700, y: 0 },
      { at: 2300, kind: 'walker', ahead: 620, y: 0 },
      { at: 2420, kind: 'flyer', ahead: 700, y: 150 },
      { at: 2900, kind: 'walker', ahead: 600, y: 0 },
      { at: 3000, kind: 'walker', ahead: 760, y: 0 },
      { at: 3150, kind: 'flyer', ahead: 700, y: 130 },
      { at: 3500, kind: 'brute', ahead: 640, y: 0 },
      { at: 3620, kind: 'walker', ahead: 700, y: 0 },
    ];
  }

  reset(): void {
    this.enemies.length = 0;
    this.spawned.clear();
  }

  update(ownerX: number): void {
    for (const s of this.spawns) {
      if (this.spawned.has(s) || ownerX < s.at) continue;
      this.spawned.add(s);
      this.enemies.push(new Enemy(s.kind, ownerX + s.ahead, s.y));
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive && e.binding <= 0 && (e.y < -400 || e.x < ownerX - 900)) this.enemies.splice(i, 1);
    }
  }

  /** 遠景。視差をつけて2枚だけ */
  drawBackground(d: Draw, camX: number, camY: number): void {
    d.sky('#8fb3cc', '#cfd8cf');

    const layers: Array<[number, string, number, number]> = [
      [0.3, '#9aa9b6', 150, 190],
      [0.58, '#7d8a7c', 95, 140],
    ];
    for (const [p, color, base, span] of layers) {
      d.begin({ x: camX, y: camY }, p);
      const left = camX * p - d.viewWidth;
      const step = 190;
      const from = Math.floor(left / step) * step;
      for (let x = from; x < left + d.viewWidth * 2.4; x += step) {
        const h = base + (Math.sin(x * 0.013) * 0.5 + 0.5) * span;
        const w = step * 0.78;
        d.rect(x, -60, w, h, color);
        d.alpha(0.22, () => {
          for (let wy = 46; wy < h - 34; wy += 42) {
            d.rect(x + 14, -60 + wy, w - 28, 16, '#2f3a44');
          }
        });
      }
    }
  }

  drawGround(d: Draw): void {
    // 画面の下端まで埋める。中途半端に切ると空が透けて見える
    d.rect(START_X, -800, END_X - START_X, 800, '#4e5348');
    d.rect(START_X, -60, END_X - START_X, 60, '#5c6152');
    d.rect(START_X, -8, END_X - START_X, 8, '#9a9b93');
    // 縁石のリズム
    for (let x = START_X; x < END_X; x += 120) d.rect(x, -14, 60, 4, '#8a8b83');
    for (let x = START_X; x < END_X; x += 200) d.rect(x, -46, 96, 5, '#585d4f');

    for (const s of this.solids) {
      if (s.y < -10) continue;
      d.rect(s.x, s.y, s.w, s.h, '#a08a63');
      d.rect(s.x, s.y + s.h - 6, s.w, 6, '#bda274');
      d.alpha(0.25, () => d.rect(s.x + 6, s.y + 6, s.w - 12, Math.max(4, s.h - 16), '#6d5a45'));
    }

    // 電柱（奥行きの目印。まだリードは引っかからない）
    for (let x = 200; x < END_X; x += 520) {
      d.rect(x, 0, 10, 260, '#b0aca3');
      d.rect(x - 34, 250, 78, 8, '#8b8880');
    }

    // ゴール（帰る家の門）
    d.rect(GOAL_X - 6, 0, 12, 150, '#b5aa98');
    d.rect(GOAL_X + 90, 0, 12, 150, '#b5aa98');
    d.rect(GOAL_X - 20, 150, 136, 16, '#8a4a3c');
    d.roundRect(GOAL_X + 8, 0, 76, 96, 6, '#d8cbb4');
  }
}
