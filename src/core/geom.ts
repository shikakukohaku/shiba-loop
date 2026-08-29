/** (x, y) は左下。ワールドは y が上向き。 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export interface Body {
  /** 足元の中心 */
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  grounded: boolean;
}

export function bodyRect(b: Body): Rect {
  return { x: b.x - b.w / 2, y: b.y, w: b.w, h: b.h };
}

/**
 * 軸ごとに動かして押し戻す、いちばん素直な当たり判定。
 * プロトタイプではこれで足りる。
 */
export function moveAndCollide(b: Body, dt: number, solids: Rect[]): void {
  b.x += b.vx * dt;
  let r = bodyRect(b);
  for (const s of solids) {
    if (!overlaps(r, s)) continue;
    if (b.vx > 0) b.x = s.x - b.w / 2;
    else if (b.vx < 0) b.x = s.x + s.w + b.w / 2;
    b.vx = 0;
    r = bodyRect(b);
  }

  b.grounded = false;
  b.y += b.vy * dt;
  r = bodyRect(b);
  for (const s of solids) {
    if (!overlaps(r, s)) continue;
    if (b.vy <= 0) {
      b.y = s.y + s.h;
      b.grounded = true;
    } else {
      b.y = s.y - b.h;
    }
    b.vy = 0;
    r = bodyRect(b);
  }
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** -PI..PI に畳んだ角度差 */
export function angleDelta(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
