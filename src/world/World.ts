import * as THREE from 'three';

/** 散歩コース。飼い主はこの順に歩く。 */
export const OWNER_WAYPOINTS: THREE.Vector2[] = [
  new THREE.Vector2(-2.0, 1.2),
  new THREE.Vector2(4.0, 1.5),
  new THREE.Vector2(10.0, 1.1),
  new THREE.Vector2(18.0, 1.4),
  new THREE.Vector2(30.0, 1.2),
];

export const OWNER_START = new THREE.Vector3(-9, 0, 1.2);
export const DOG_START = new THREE.Vector3(-8.2, 0, 2.4);

/** 工事現場。看板はここから飛んでくる。 */
export const SIGN_ORIGIN = new THREE.Vector3(8.6, 2.3, -3.4);
/** 怪異が立つ位置（工事現場の奥） */
export const WRAITH_SPOT = new THREE.Vector3(12.8, 0, -7.4);

const C_GROUND = 0x6f7a63;
const C_ROAD = 0x3a3d44;
const C_WALK = 0x9a9b93;

/** 街。全部プリミティブ。 */
export class World {
  readonly root = new THREE.Group();
  readonly debug = new THREE.Group();

  constructor() {
    this.root.add(this.debug);
    this.debug.visible = false;

    this.buildGround();
    this.buildBuildings();
    this.buildFarSideWall();
    this.buildPoles();
    this.buildConstructionSite();
    this.buildProps();
    this.buildDebugMarkers();
  }

  private buildGround(): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 80),
      new THREE.MeshLambertMaterial({ color: C_GROUND }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.root.add(ground);

    // 歩道（飼い主が歩く帯）
    const walk = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 3.4),
      new THREE.MeshLambertMaterial({ color: C_WALK }),
    );
    walk.rotation.x = -Math.PI / 2;
    walk.position.set(0, 0.01, 1.2);
    walk.receiveShadow = true;
    this.root.add(walk);

    // 縁石
    for (const z of [-0.55, 2.95]) {
      const curb = new THREE.Mesh(
        new THREE.BoxGeometry(120, 0.16, 0.18),
        new THREE.MeshLambertMaterial({ color: 0xc2c3ba }),
      );
      curb.position.set(0, 0.08, z);
      curb.receiveShadow = true;
      this.root.add(curb);
    }

    // 車道
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 7),
      new THREE.MeshLambertMaterial({ color: C_ROAD }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.005, 6.6);
    road.receiveShadow = true;
    this.root.add(road);

    // センターライン（白破線）
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xd9d6c8 });
    for (let x = -56; x < 56; x += 4) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.16), lineMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.012, 6.6);
      this.root.add(dash);
    }
  }

  private buildBuildings(): void {
    const palette = [0xb9ac96, 0x8f9aa6, 0xc8b7a6, 0x7f8b7a, 0xa89a8c, 0x93a2ad];
    const specs: Array<[number, number, number, number]> = [
      // [x, z, 幅, 高さ]
      [-14, -8, 6, 7], [-6, -9, 5, 5], [1, -8.5, 5.5, 8.5], [-20, -8.5, 6, 6],
      [18, -9, 6, 6.5], [24, -8, 5, 9], [30, -9, 6, 5.5],
    ];
    specs.forEach(([x, z, w, h], i) => {
      const depth = 5 + (i % 3);
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, depth),
        new THREE.MeshLambertMaterial({ color: palette[i % palette.length] }),
      );
      b.position.set(x, h / 2, z);
      b.castShadow = true;
      b.receiveShadow = true;
      this.root.add(b);

      // 窓を1枚のグリッドで済ませる（正面だけ）
      const win = new THREE.Mesh(
        new THREE.PlaneGeometry(w * 0.7, h * 0.66),
        new THREE.MeshBasicMaterial({ color: 0x2f3a44 }),
      );
      win.position.set(x, h * 0.55, z + depth / 2 + 0.01);
      this.root.add(win);
    });
  }

  /**
   * 手前（カメラ側）には背の高いものを置かない。
   * 置くとカメラと犬のあいだに入って画面を塞ぐ。低い塀で通りの縁だけ示す。
   */
  private buildFarSideWall(): void {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(120, 1.3, 0.35),
      new THREE.MeshLambertMaterial({ color: 0xa9a496 }),
    );
    wall.position.set(0, 0.65, 12);
    wall.castShadow = true;
    wall.receiveShadow = true;
    this.root.add(wall);

    for (let x = -56; x < 56; x += 3.2) {
      const hedge = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.9, 0.9),
        new THREE.MeshLambertMaterial({ color: 0x55703f }),
      );
      hedge.position.set(x, 1.6, 12.4);
      this.root.add(hedge);
    }
  }

  private buildPoles(): void {
    for (const x of [-12, -4, 4, 14, 22]) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.13, 6, 8),
        new THREE.MeshLambertMaterial({ color: 0xb0aca3 }),
      );
      pole.position.set(x, 3, 2.7);
      pole.castShadow = true;
      this.root.add(pole);

      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.09, 0.09),
        new THREE.MeshLambertMaterial({ color: 0x8b8880 }),
      );
      arm.position.set(x, 5.5, 2.7);
      this.root.add(arm);
    }
  }

  private buildConstructionSite(): void {
    const site = new THREE.Group();
    site.position.set(9.5, 0, -5.0);

    // 掘り返した地面
    const dirt = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 6),
      new THREE.MeshLambertMaterial({ color: 0x6d5a45 }),
    );
    dirt.rotation.x = -Math.PI / 2;
    dirt.position.y = 0.02;
    site.add(dirt);

    // 仮囲い（黄と黒）
    const fenceMats = [
      new THREE.MeshLambertMaterial({ color: 0xd8b23a }),
      new THREE.MeshLambertMaterial({ color: 0x2a2723 }),
    ];
    for (let i = 0; i < 10; i++) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.08), fenceMats[i % 2]);
      panel.position.set(-4.05 + i * 0.9, 0.55, 3.0);
      panel.castShadow = true;
      site.add(panel);
    }
    for (let i = 0; i < 6; i++) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.9), fenceMats[i % 2]);
      panel.position.set(-4.45, 0.55, 2.6 - i * 0.9);
      site.add(panel);
    }

    // 足場
    const pipe = new THREE.MeshLambertMaterial({ color: 0x9aa0a6 });
    for (let i = 0; i < 4; i++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5, 6), pipe);
      post.position.set(-2 + (i % 2) * 4, 2.5, -1 - Math.floor(i / 2) * 2);
      post.castShadow = true;
      site.add(post);
    }
    for (const y of [1.6, 3.2, 4.6]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.08, 0.08), pipe);
      beam.position.set(0, y, -1);
      site.add(beam);
    }

    // 積んである鉄板（これが飛んでくる仲間）
    for (let i = 0; i < 3; i++) {
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.09, 1.3),
        new THREE.MeshLambertMaterial({ color: 0x7d8894 }),
      );
      plate.position.set(2.4, 0.06 + i * 0.1, 1.2);
      plate.rotation.y = 0.12 * i;
      plate.castShadow = true;
      site.add(plate);
    }

    // カラーコーン
    for (let i = 0; i < 5; i++) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.22, 0.62, 8),
        new THREE.MeshLambertMaterial({ color: 0xe2662c }),
      );
      cone.position.set(-4.2 + i * 2.1, 0.31, 3.6);
      cone.castShadow = true;
      site.add(cone);
    }

    this.root.add(site);
  }

  private buildProps(): void {
    // 路上駐車（将来の車ハザードの下敷き）
    const carSpecs: Array<[number, number]> = [[-16, 0x8a3f3f], [20, 0x35506b]];
    for (const [x, color] of carSpecs) {
      const car = new THREE.Group();
      const bodyMesh = new THREE.Mesh(
        new THREE.BoxGeometry(3.8, 0.85, 1.7),
        new THREE.MeshLambertMaterial({ color }),
      );
      bodyMesh.position.y = 0.62;
      bodyMesh.castShadow = true;
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(1.9, 0.6, 1.5),
        new THREE.MeshLambertMaterial({ color: 0x2b3238 }),
      );
      cabin.position.set(-0.2, 1.3, 0);
      car.add(bodyMesh, cabin);
      car.position.set(x, 0, 4.6);
      this.root.add(car);
    }

    // マンホール（将来のハザード用に置いておくだけ）
    const manhole = new THREE.Mesh(
      new THREE.CircleGeometry(0.45, 20),
      new THREE.MeshLambertMaterial({ color: 0x555a5e }),
    );
    manhole.rotation.x = -Math.PI / 2;
    manhole.position.set(14.5, 0.015, 1.2);
    this.root.add(manhole);
  }

  private buildDebugMarkers(): void {
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, wireframe: true });
    for (const wp of OWNER_WAYPOINTS) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.05, 12), mat);
      m.position.set(wp.x, 0.05, wp.y);
      this.debug.add(m);
    }
    const origin = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4477, wireframe: true }));
    origin.position.copy(SIGN_ORIGIN);
    this.debug.add(origin);
  }

  setDebugVisible(v: boolean): void {
    this.debug.visible = v;
  }
}
