import { CONFIG } from '../config';

export interface Camera {
  x: number;
  y: number;
}

/**
 * Canvas2D の薄いラッパー。
 * ワールド座標は y が上向きなので、変換行列で上下を反転させてから描く。
 * （そのぶん文字は描けないので、文字はすべて DOM 側で出す）
 */
export class Draw {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  cssW = 0;
  cssH = 0;
  scale = 1;

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    container.appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas2D が取れない');
    this.ctx = ctx;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize(): void {
    this.dpr = Math.min(devicePixelRatio || 1, matchMedia('(pointer: coarse)').matches ? 2 : 2);
    this.cssW = innerWidth;
    this.cssH = innerHeight;
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;
    this.scale = this.cssH / CONFIG.viewHeight;
  }

  /** 画面に映るワールドの幅 */
  get viewWidth(): number {
    return this.cssW / this.scale;
  }

  /** ワールド座標を CSS ピクセルの画面座標に直す（DOMの吹き出し用） */
  toScreen(cam: Camera, wx: number, wy: number): { x: number; y: number } {
    return {
      x: this.cssW / 2 + (wx - cam.x) * this.scale,
      y: this.cssH / 2 - (wy - cam.y) * this.scale,
    };
  }

  clear(color: string): void {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.cssW, this.cssH);
  }

  /** 空。画面座標のまま縦グラデーションを敷く */
  sky(top: string, bottom: string): void {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const g = this.ctx.createLinearGradient(0, 0, 0, this.cssH);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    this.ctx.fillStyle = g;
    this.ctx.fillRect(0, 0, this.cssW, this.cssH);
  }

  /** parallax=1 でワールドと同じ。小さいほど遠景 */
  begin(cam: Camera, parallax = 1): void {
    const s = this.dpr * this.scale;
    this.ctx.setTransform(
      s, 0, 0, -s,
      this.dpr * (this.cssW / 2 - cam.x * parallax * this.scale),
      this.dpr * (this.cssH / 2 + cam.y * parallax * this.scale),
    );
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
  }

  roundRect(x: number, y: number, w: number, h: number, r: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.roundRect(x, y, w, h, r);
    this.ctx.fill();
  }

  circle(x: number, y: number, r: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.ctx.fill();
  }

  ellipse(x: number, y: number, rx: number, ry: number, rot: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    this.ctx.fill();
  }

  poly(points: number[][], color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    points.forEach(([px, py], i) => (i === 0 ? this.ctx.moveTo(px, py) : this.ctx.lineTo(px, py)));
    this.ctx.closePath();
    this.ctx.fill();
  }

  line(points: number[][], width: number, color: string, round = true): void {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width;
    this.ctx.lineCap = round ? 'round' : 'butt';
    this.ctx.lineJoin = 'round';
    this.ctx.beginPath();
    points.forEach(([px, py], i) => (i === 0 ? this.ctx.moveTo(px, py) : this.ctx.lineTo(px, py)));
    this.ctx.stroke();
  }

  arc(x: number, y: number, r: number, from: number, to: number, width: number, color: string): void {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width;
    this.ctx.lineCap = 'round';
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, from, to);
    this.ctx.stroke();
  }

  /** 影や当たり判定など、薄く重ねたいとき */
  alpha(a: number, fn: () => void): void {
    const prev = this.ctx.globalAlpha;
    this.ctx.globalAlpha = a;
    fn();
    this.ctx.globalAlpha = prev;
  }
}
