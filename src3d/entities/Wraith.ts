import * as THREE from 'three';
import { CONFIG } from '../config';

type Phase = 'hidden' | 'in' | 'hold' | 'out';

/** 怪異。黒い人型のシルエット。犬の方だけを見ている。 */
export class Wraith {
  readonly root = new THREE.Group();
  private readonly materials: THREE.Material[] = [];
  private readonly eyes: THREE.Mesh[] = [];
  private phase: Phase = 'hidden';
  private timer = 0;
  private opacity = 0;
  private bob = 0;

  constructor() {
    const silhouette = new THREE.MeshBasicMaterial({
      color: 0x05060a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.materials.push(silhouette);

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.9, 4, 12), silhouette);
    body.position.y = 0.95;
    this.root.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), silhouette);
    head.position.y = 1.72;
    this.root.add(head);

    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.72, 4, 8), silhouette);
      arm.position.set(sx * 0.32, 1.0, 0);
      this.root.add(arm);

      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xd8e6ff, transparent: true, opacity: 0 });
      this.materials.push(eyeMat);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), eyeMat);
      eye.position.set(sx * 0.085, 1.75, 0.21);
      this.root.add(eye);
      this.eyes.push(eye);
    }

    this.root.scale.setScalar(1.15);
    this.root.visible = false;
  }

  get visible(): boolean {
    return this.phase !== 'hidden';
  }

  /** at に現れて lookAt（犬）の方を向く */
  show(at: THREE.Vector3, lookAt: THREE.Vector3): void {
    this.root.position.copy(at);
    this.root.lookAt(lookAt.x, this.root.position.y, lookAt.z);
    this.phase = 'in';
    this.timer = 0;
    this.root.visible = true;
  }

  hide(): void {
    this.phase = 'hidden';
    this.opacity = 0;
    this.root.visible = false;
    this.applyOpacity();
  }

  /** 現れている間、犬の方を向き続ける */
  update(dt: number, lookAt: THREE.Vector3): void {
    if (this.phase === 'hidden') return;
    this.timer += dt;
    this.bob += dt;

    switch (this.phase) {
      case 'in':
        this.opacity = Math.min(1, this.timer / CONFIG.wraithFadeIn);
        if (this.timer >= CONFIG.wraithFadeIn) { this.phase = 'hold'; this.timer = 0; }
        break;
      case 'hold':
        this.opacity = 1;
        if (this.timer >= CONFIG.wraithHold) { this.phase = 'out'; this.timer = 0; }
        break;
      case 'out':
        this.opacity = Math.max(0, 1 - this.timer / CONFIG.wraithFadeOut);
        if (this.timer >= CONFIG.wraithFadeOut) { this.hide(); return; }
        break;
      default:
        break;
    }

    this.root.lookAt(lookAt.x, this.root.position.y, lookAt.z);
    this.root.position.y = Math.sin(this.bob * 1.6) * 0.05;
    this.applyOpacity();
  }

  private applyOpacity(): void {
    (this.materials[0] as THREE.MeshBasicMaterial).opacity = this.opacity * 0.96;
    for (let i = 1; i < this.materials.length; i++) {
      (this.materials[i] as THREE.MeshBasicMaterial).opacity = this.opacity * 0.85;
    }
  }
}
