import * as THREE from 'three';
import { CONFIG } from '../config';

/**
 * 斜め45度前後から見下ろす固定カメラ。
 * 犬と飼い主の中間をゆっくり追うだけで、細かくは動かさない。
 */
export class CameraRig {
  readonly camera: THREE.OrthographicCamera;

  private readonly target = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private aspect = 1;
  private shakeAmount = 0;
  private zoom = 1;      // 実際の引き
  private zoomTarget = 1; // 目標の引き（巻き戻し中は少し引く）

  constructor(aspect: number) {
    this.aspect = aspect;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    this.applyFrustum();
  }

  /** 追従を飛ばして、いまの注視点に瞬間移動する */
  snapTo(dog: THREE.Vector3, owner: THREE.Vector3): void {
    this.computeDesired(dog, owner);
    this.target.copy(this.desired);
    this.place();
  }

  update(dt: number, dog: THREE.Vector3, owner: THREE.Vector3): void {
    this.computeDesired(dog, owner);
    const k = 1 - Math.exp(-CONFIG.cameraDamping * dt);
    this.target.lerp(this.desired, k);

    this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, dt * 4);
    this.applyFrustum();

    this.shakeAmount = Math.max(0, this.shakeAmount - CONFIG.shakeDecay * this.shakeAmount * dt - dt * 0.02);
    this.place();
  }

  private computeDesired(dog: THREE.Vector3, owner: THREE.Vector3): void {
    const w = CONFIG.cameraDogWeight;
    this.desired.set(
      owner.x * (1 - w) + dog.x * w + CONFIG.cameraTargetBias.x,
      0,
      owner.z * (1 - w) + dog.z * w + CONFIG.cameraTargetBias.z,
    );
  }

  private place(): void {
    this.offset.set(CONFIG.cameraOffset.x, CONFIG.cameraOffset.y, CONFIG.cameraOffset.z);
    const s = this.shakeAmount;
    const t = performance.now() * 0.001;
    const shake = new THREE.Vector3(
      Math.sin(t * 47.3) * s,
      Math.sin(t * 61.7) * s * 0.6,
      Math.cos(t * 53.1) * s,
    );
    this.camera.position.copy(this.target).add(this.offset).add(shake);
    this.camera.lookAt(this.target.x + shake.x * 0.4, this.target.y + 0.9, this.target.z + shake.z * 0.4);
  }

  private applyFrustum(): void {
    const h = (CONFIG.cameraFrustumHeight * this.zoom) / 2;
    const w = h * this.aspect;
    this.camera.left = -w;
    this.camera.right = w;
    this.camera.top = h;
    this.camera.bottom = -h;
    this.camera.updateProjectionMatrix();
  }

  setAspect(aspect: number): void {
    this.aspect = aspect;
    this.applyFrustum();
  }

  shake(amount: number): void {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  /** 1 で通常、1 より大きいと引く */
  setZoom(z: number): void {
    this.zoomTarget = z;
  }

  /** 入力をカメラ基準にするための、地面上の右方向と奥方向 */
  getGroundBasis(): { right: THREE.Vector3; forward: THREE.Vector3 } {
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    right.y = 0;
    right.normalize();
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    forward.y = 0;
    forward.normalize();
    return { right, forward };
  }
}
