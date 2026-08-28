/**
 * 調整用の数値はすべてここに置く。処理の中に数字を埋めない。
 * ブラウザのコンソールから `CONFIG.dogSpeed = 9` のように書き換えると
 * リロードなしで反映される（毎フレーム参照しているため）。
 */
export const CONFIG = {
  // --- 犬 ---
  dogSpeed: 5,          // 移動速度 (world units / 秒)
  dogTurnSpeed: 12,     // 向きの追従速度
  braceSpeedFactor: 0.2, // 拒否柴中に犬自身が動ける割合

  // --- リード ---
  leashLength: 3,        // リードの最大長
  leashTautMargin: 0.15, // これ以内まで伸びたら「張っている」扱い
  leashPullFactor: 0.55, // 張った状態で犬が引くと飼い主がどれだけ引きずられるか
  leashMaxPullPerSecond: 0.9, // 飼い主が引かれる速度の上限

  // --- 飼い主 ---
  ownerSpeed: 1.5,
  ownerTurnSpeed: 4,
  braceOwnerSpeedFactor: 0.1, // 拒否柴でリードが張っているときの歩行速度倍率
  crouchDuration: 1.8,        // 抱っこでしゃがんでいる時間
  hugRange: 1.6,              // 抱っこをせがめる距離
  ownerHeadHeight: 1.52,      // 立っているときの頭の高さ
  ownerCrouchHeadHeight: 0.62, // しゃがんだときの頭の高さ
  ownerHeadRadius: 0.3,
  ownerHitRadius: 0.26,   // 当たり判定のカプセル半径（見た目より少し細く）

  // --- 事故（飛来する看板） ---
  hazardTriggerTime: 9.5,  // 何秒後に看板が飛び出すか
  // 看板は「発射した瞬間の飼い主の位置と速度」から着弾点を計算して飛ぶ。
  // 速すぎると予測が当たりすぎて、足を止めさせても当たってしまう。
  // 遅いほど「歩みを止める／横にずらす」が効くようになる。
  signSpeed: 8.5,          // 看板の飛行速度
  signLeadTime: 0.0,       // 予測射撃の補正（+で先読み）
  signLifetime: 3.0,       // 発射から消えるまで
  signHitRadius: 0.36,     // 看板の当たり判定の半径

  // --- タイムリープ ---
  rewindSeconds: 6,     // 死亡時点から何秒巻き戻すか
  rewindDuration: 1.4,  // 巻き戻し演出の長さ（実時間）
  deathPauseDuration: 0.35, // 直撃時に時間が止まる長さ

  // --- カメラ ---
  cameraOffset: { x: 9, y: 11, z: 11 }, // 注視点からのオフセット（斜め45度見下ろし）
  cameraFrustumHeight: 12,              // 表示する高さ（大きいほど引き）
  cameraDamping: 1.6,                   // 注視点の追従の鈍さ（小さいほど鈍い）
  cameraDogWeight: 0.45,                // 注視点における犬と飼い主の重み
  cameraTargetBias: { x: 0.6, z: -1.3 }, // 注視点をずらす（工事現場側を広く映す）
  shakeDecay: 3.5,

  // --- 怪異 ---
  wraithFadeIn: 0.6,
  wraithHold: 2.6,
  wraithFadeOut: 1.0,
};

export type Config = typeof CONFIG;

declare global {
  interface Window {
    CONFIG: Config;
  }
}

// コンソールから触れるようにしておく（プロトタイプ用）
window.CONFIG = CONFIG;
