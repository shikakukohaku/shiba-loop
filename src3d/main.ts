import './config';
import { Game } from './Game';

const container = document.getElementById('stage');
if (!container) throw new Error('#stage が見つからない');

const game = new Game(container);
game.start();

// プロトタイプなので、コンソールから触れるようにしておく
(window as unknown as { game: Game }).game = game;
