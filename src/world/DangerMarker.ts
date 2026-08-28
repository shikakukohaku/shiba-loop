import * as THREE from 'three';

const C_DANGER = 0xff4d5e;

/**
 * 未来視で見た事故の場所に残す印。
 * 「どこで何が起きるか」を犬だけが覚えている、という形にする。
 */
export class DangerMarker {
  readonly root = new THREE.Group();
  private ring: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private icon: THREE.Mesh;
  private iconMat: THREE.MeshBasicMaterial;
  private bob = Math.random() * 6;

  constructor(position: THREE.Vector3) {
    this.ringMat = new THREE.MeshBasicMaterial({
      color: C_DANGER,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.8, 28), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.05;
    this.root.add(this.ring);

    this.iconMat = new THREE.MeshBasicMaterial({ color: C_DANGER, transparent: true, opacity: 0.75 });
    this.icon = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0), this.iconMat);
    this.icon.position.y = 1.5;
    this.root.add(this.icon);

    this.root.position.set(position.x, 0, position.z);
  }

  /** proximity: 0 = まだ遠い, 1 = 目の前 */
  update(dt: number, proximity: number): void {
    this.bob += dt * (1.5 + proximity * 5);
    const pulse = 0.5 + Math.sin(this.bob * 2) * 0.5;
    this.ringMat.opacity = 0.25 + proximity * 0.35 + pulse * 0.12 * proximity;
    this.iconMat.opacity = 0.4 + proximity * 0.5;
    this.ring.scale.setScalar(1 + pulse * 0.06 * proximity);
    this.icon.position.y = 1.45 + Math.sin(this.bob) * 0.1;
    this.icon.rotation.y += dt * 1.4;
  }
}
