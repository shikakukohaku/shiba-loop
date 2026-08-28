import * as THREE from 'three';

/** 散歩コース。飼い主はこの順に歩く。 */
export const OWNER_WAYPOINTS: THREE.Vector2[] = [
  new THREE.Vector2(-2.0, 1.2),
  new THREE.Vector2(6.0, 1.5),
  new THREE.Vector2(14.0, 1.1),
  new THREE.Vector2(22.0, 1.4),
  new THREE.Vector2(30.0, 1.2),
  new THREE.Vector2(38.0, 1.5),
  new THREE.Vector2(48.0, 1.2),
];

export const OWNER_START = new THREE.Vector3(-9, 0, 1.2);
export const DOG_START = new THREE.Vector3(-8.2, 0, 2.4);

/** ここまで歩けたら散歩は終わり */
export const GOAL_X = 46;

/** 事故1: 工事現場。看板はここから飛んでくる */
export const SIGN_ORIGIN = new THREE.Vector3(8.6, 2.3, -3.4);
/** 事故2: 足場の真下。鉄骨が落ちてくる地点 */
export const FALL_SPOT = new THREE.Vector3(20, 0, 1.32);
/** 事故3: 蓋の外れたマンホール */
export const MANHOLE_SPOT = new THREE.Vector3(27, 0, 1.28);
/** 事故4: 自転車が飛び出してくる路地の x */
export const BIKE_X = 40;
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
    this.buildScaffoldTower();
    this.buildAlley();
    this.buildGoal();
    this.buildProps();
    this.buildDebugMarkers();
  }

  private buildGround(): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 80),
      new THREE.MeshLambertMaterial({ color: C_GROUND }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.x = 20;
    ground.receiveShadow = true;
    this.root.add(ground);

    // 歩道（飼い主が歩く帯）
    const walk = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 3.4),
      new THREE.MeshLambertMaterial({ color: C_WALK }),
    );
    walk.rotation.x = -Math.PI / 2;
    walk.position.set(20, 0.01, 1.2);
    walk.receiveShadow = true;
    this.root.add(walk);

    for (const z of [-0.55, 2.95]) {
      const curb = new THREE.Mesh(
        new THREE.BoxGeometry(160, 0.16, 0.18),
        new THREE.MeshLambertMaterial({ color: 0xc2c3ba }),
      );
      curb.position.set(20, 0.08, z);
      curb.receiveShadow = true;
      this.root.add(curb);
    }

    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 7),
      new THREE.MeshLambertMaterial({ color: C_ROAD }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(20, 0.005, 6.6);
    road.receiveShadow = true;
    this.root.add(road);

    const lineMat = new THREE.MeshBasicMaterial({ color: 0xd9d6c8 });
    for (let x = -56; x < 96; x += 4) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.16), lineMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.012, 6.6);
      this.root.add(dash);
    }
  }

  private buildBuildings(): void {
    const palette = [0xb9ac96, 0x8f9aa6, 0xc8b7a6, 0x7f8b7a, 0xa89a8c, 0x93a2ad];
    // [x, z, 幅, 高さ]。工事現場(5〜14)・足場(20)・路地(37〜43)は空けてある
    const specs: Array<[number, number, number, number]> = [
      [-20, -8.5, 6, 6], [-14, -8, 6, 7], [-6, -9, 5, 5], [0.5, -8.5, 4, 8.5],
      [16, -9, 3.5, 6], [25, -8.5, 5, 7], [31, -9, 5, 5.5], [35.5, -9, 4, 8],
      [46, -9.5, 6, 6.5], [53, -8.5, 6, 9],
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
      new THREE.BoxGeometry(160, 1.3, 0.35),
      new THREE.MeshLambertMaterial({ color: 0xa9a496 }),
    );
    wall.position.set(20, 0.65, 12);
    wall.castShadow = true;
    wall.receiveShadow = true;
    this.root.add(wall);

    for (let x = -56; x < 96; x += 3.2) {
      const hedge = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.9, 0.9),
        new THREE.MeshLambertMaterial({ color: 0x55703f }),
      );
      hedge.position.set(x, 1.6, 12.4);
      this.root.add(hedge);
    }
  }

  private buildPoles(): void {
    for (let x = -12; x < 56; x += 8) {
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

    const dirt = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 6),
      new THREE.MeshLambertMaterial({ color: 0x6d5a45 }),
    );
    dirt.rotation.x = -Math.PI / 2;
    dirt.position.y = 0.02;
    site.add(dirt);

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

  /** 事故2の舞台。歩道の上まで足場がせり出している建物 */
  private buildScaffoldTower(): void {
    const g = new THREE.Group();
    g.position.set(FALL_SPOT.x, 0, -4.5);

    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(5, 12, 5),
      new THREE.MeshLambertMaterial({ color: 0x9d968a }),
    );
    tower.position.y = 6;
    tower.castShadow = true;
    tower.receiveShadow = true;
    g.add(tower);

    const sheet = new THREE.Mesh(
      new THREE.BoxGeometry(5.4, 11, 0.08),
      new THREE.MeshLambertMaterial({ color: 0x6f7d86, transparent: true, opacity: 0.85 }),
    );
    sheet.position.set(0, 6, 2.6);
    g.add(sheet);

    // 歩道の上へ張り出した足場（ここから落ちてくる）
    const pipe = new THREE.MeshLambertMaterial({ color: 0x9aa0a6 });
    for (const sx of [-2.2, 2.2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 11, 6), pipe);
      post.position.set(sx, 5.5, 5.8);
      post.castShadow = true;
      g.add(post);
    }
    for (const y of [3, 6, 9, 10.5]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.09, 0.09), pipe);
      beam.position.set(0, y, 5.8);
      g.add(beam);
      const cross = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 3.4), pipe);
      cross.position.set(-2.2, y, 4.1);
      g.add(cross);
    }
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(4.6, 0.12, 1.5),
      new THREE.MeshLambertMaterial({ color: 0x8a8f94 }),
    );
    deck.position.set(0, 10.5, 5.6);
    deck.castShadow = true;
    g.add(deck);

    this.root.add(g);
  }

  /** 事故4の舞台。建物のあいだの細い路地 */
  private buildAlley(): void {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 12),
      new THREE.MeshLambertMaterial({ color: 0x555a52 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(BIKE_X, 0.015, -7);
    this.root.add(floor);

    for (const sx of [-2.6, 2.6]) {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 4.5, 11),
        new THREE.MeshLambertMaterial({ color: 0x7e7669 }),
      );
      wall.position.set(BIKE_X + sx, 2.25, -7.5);
      wall.castShadow = true;
      this.root.add(wall);
    }

    // 路地の口。ここから何か出てくる、と分かる程度の目印
    for (const sx of [-2.4, 2.4]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.09, 0.9, 6),
        new THREE.MeshLambertMaterial({ color: 0xc9c2b4 }),
      );
      post.position.set(BIKE_X + sx, 0.45, -1.4);
      post.castShadow = true;
      this.root.add(post);
    }
  }

  /** 散歩の終わり。ここまで歩ければクリア */
  private buildGoal(): void {
    const g = new THREE.Group();
    g.position.set(GOAL_X + 2.5, 0, -5.5);

    const house = new THREE.Mesh(
      new THREE.BoxGeometry(5, 3.2, 5),
      new THREE.MeshLambertMaterial({ color: 0xd8cbb4 }),
    );
    house.position.y = 1.6;
    house.castShadow = true;
    house.receiveShadow = true;
    g.add(house);

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(4.2, 1.8, 4),
      new THREE.MeshLambertMaterial({ color: 0x8a4a3c }),
    );
    roof.position.y = 4.1;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);

    // 門柱（歩道から見える目印）
    for (const sx of [-1.4, 1.4]) {
      const gate = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 1.3, 0.4),
        new THREE.MeshLambertMaterial({ color: 0xb5aa98 }),
      );
      gate.position.set(sx, 0.65, 3.4);
      gate.castShadow = true;
      g.add(gate);
    }

    this.root.add(g);
  }

  private buildProps(): void {
    const carSpecs: Array<[number, number]> = [[-16, 0x8a3f3f], [12, 0x35506b], [34, 0x4a6b4a]];
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
  }

  private buildDebugMarkers(): void {
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, wireframe: true });
    for (const wp of OWNER_WAYPOINTS) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.05, 12), mat);
      m.position.set(wp.x, 0.05, wp.y);
      this.debug.add(m);
    }
    const origin = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff4477, wireframe: true }),
    );
    origin.position.copy(SIGN_ORIGIN);
    this.debug.add(origin);

    const goal = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 3, 3.4),
      new THREE.MeshBasicMaterial({ color: 0xffee55, wireframe: true }),
    );
    goal.position.set(GOAL_X, 1.5, 1.2);
    this.debug.add(goal);
  }

  setDebugVisible(v: boolean): void {
    this.debug.visible = v;
  }
}
