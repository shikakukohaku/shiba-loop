import * as THREE from 'three';

/** DOM 側の表示をまとめる。3D 側からは文字列を投げるだけにする。 */
export class UI {
  private stage = document.getElementById('stage') as HTMLDivElement;
  private debugPanel = document.getElementById('debugPanel') as HTMLDivElement;
  private hint = document.getElementById('hint') as HTMLDivElement;
  private speech = document.getElementById('speech') as HTMLDivElement;
  private overlay = document.getElementById('overlay') as HTMLDivElement;
  private overlayTitle = document.getElementById('overlayTitle') as HTMLDivElement;
  private overlayText = document.getElementById('overlayText') as HTMLDivElement;
  private overlayAction = document.getElementById('overlayAction') as HTMLButtonElement;

  private speechTimer = 0;
  private screenPos = new THREE.Vector3();

  constructor(onAction: () => void) {
    this.overlayAction.addEventListener('click', onAction);
  }

  setDebugText(text: string): void {
    this.debugPanel.textContent = text;
  }

  showHint(text: string, urgent = false): void {
    if (this.hint.textContent !== text) this.hint.textContent = text;
    this.hint.classList.add('show');
    this.hint.classList.toggle('urgent', urgent);
  }

  hideHint(): void {
    this.hint.classList.remove('show');
  }

  /** 飼い主のセリフ。犬には意味が分かっていて、飼い主には分かっていない。 */
  say(text: string, seconds = 2.4): void {
    this.speech.textContent = text;
    this.speech.classList.add('show');
    this.speechTimer = seconds;
  }

  clearSpeech(): void {
    this.speechTimer = 0;
    this.speech.classList.remove('show');
  }

  update(dt: number, anchor: THREE.Vector3, camera: THREE.Camera): void {
    if (this.speechTimer > 0) {
      this.speechTimer -= dt;
      if (this.speechTimer <= 0) this.speech.classList.remove('show');
    }
    this.screenPos.copy(anchor).project(camera);
    const x = (this.screenPos.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-this.screenPos.y * 0.5 + 0.5) * window.innerHeight;
    this.speech.style.left = `${x}px`;
    this.speech.style.top = `${y - 12}px`;
  }

  setRewinding(on: boolean): void {
    this.stage.classList.toggle('rewinding', on);
  }

  showOverlay(opts: { title?: string; text?: string; action?: string; mode?: 'dim' | 'dark' | 'black' }): void {
    this.overlayTitle.textContent = opts.title ?? '';
    this.overlayText.innerHTML = opts.text ?? '';
    if (opts.action) {
      this.overlayAction.textContent = opts.action;
      this.overlayAction.classList.remove('hidden');
    } else {
      this.overlayAction.classList.add('hidden');
    }
    this.overlay.classList.toggle('dark', opts.mode === 'dark');
    this.overlay.classList.toggle('black', opts.mode === 'black');
    this.overlay.classList.add('show');
  }

  hideOverlay(): void {
    this.overlay.classList.remove('show', 'dark', 'black');
  }
}
