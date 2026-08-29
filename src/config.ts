/**
 * 調整用の数値はすべてここに置く。処理の中に数字を埋めない。
 * 単位は px と秒。ワールド座標は y が上向き（地面が y=0）。
 *
 * ブラウザのコンソールから `CONFIG.dogRunSpeed = 700` のように書き換えると
 * リロードなしで反映される（毎フレーム参照しているため）。
 */
export const CONFIG = {
  // --- 画面 ---
  viewHeight: 420,      // 画面の高さがワールド何px分か（小さいほど寄る）
  cameraLeadX: 130,     // 注視点を進行方向へずらす量
  cameraBaseY: 105,     // 地面が画面のどのあたりに来るか
  cameraDamping: 6,     // カメラの追従の速さ
  cameraDogWeight: 0.4, // 注視点における犬と飼い主の重み

  // --- 物理 ---
  gravity: 2400,
  maxFallSpeed: 1400,

  // --- 犬（身体能力は高めに） ---
  dogWidth: 46,
  dogHeight: 30,
  dogRunSpeed: 430,
  dogAccel: 3400,
  dogFriction: 3000,
  dogAirAccel: 2200,
  dogJumpSpeed: 760,
  dogJumpCutoff: 0.55,   // ジャンプ中にキーを離したときの上向き速度の残り（1回だけ切る）
  dogCoyoteTime: 0.09,   // 地面を離れてからジャンプを受け付ける猶予
  dogJumpBuffer: 0.11,   // 着地前にジャンプを押しても拾う猶予
  dogAirJumps: 1,        // 空中ジャンプの回数

  // ダッシュ（翻弄するための足）
  dashSpeed: 820,
  dashDuration: 0.15,
  dashCooldown: 0.45,

  // かみつき
  biteDuration: 0.16,
  biteCooldown: 0.26,
  biteLunge: 380,     // かみつくときに前へ出る速さ
  biteReach: 40,      // 口先の当たり判定の前方向の長さ
  biteBounce: 420,    // 硬い相手に弾かれたときの跳ね返り

  // --- 飼い主 ---
  ownerWidth: 28,
  ownerHeight: 78,
  ownerSpeed: 96,
  ownerHandHeight: 46,  // リードを持つ手の高さ
  ownerMaxHp: 3,
  ownerInvincible: 1.2, // 被弾後の無敵時間
  ownerBrakeFactor: 0.12, // リードが張って後ろへ引かれているときの歩行速度

  // --- リード ---
  leashLength: 235,
  leashTautMargin: 6,
  leashSwingBoost: 1.34,  // 振り子中にジャンプしたときの接線速度の倍率
  leashSwingLift: 330,    // そのとき足す上向きの速さ
  leashReleaseTime: 0.36, // 飛び出した直後、リードを緩めておく時間
  leashReleaseStretch: 1.65, // そのあいだ伸びる倍率
  leashReelSpeed: 1500,   // 伸びすぎた分を引き戻す速さ（一気に戻すと事故る）
  leashPullOwner: 0.16,   // 犬が引っ張ったとき飼い主がどれだけ持っていかれるか

  // リードで巻いて締め上げる。
  // 横から見た絵なので「相手のまわりを一周する」は成立しない（地面の下を通れない）。
  // 代わりに「相手の向こう側へ回り込んで、リードを相手の上下に何度も横切らせる」で巻き取る。
  bindSweeps: 4,          // 何回横切れば締まるか
  bindForgetTime: 1.5,    // 間が空くと巻きを忘れる
  bindHoldTime: 0.35,     // 締め上げの演出時間
  bindLeadMargin: 24,     // 犬が相手より「先にいる」と見なす余裕

  // --- 怪異 ---
  walkerSpeed: 78,
  flyerSpeed: 120,
  flyerAmplitude: 46,
  flyerPeriod: 1.6,
  bruteSpeed: 42,
  enemyKnockback: 520,

  // --- 進行 ---
  respawnY: -520,      // ここまで落ちたら飼い主のそばへ戻す
  rewindDuration: 0.9, // 失敗したときの巻き戻し演出
  goalHoldTime: 2.4,
};

export type Config = typeof CONFIG;

declare global {
  interface Window {
    CONFIG: Config;
  }
}

window.CONFIG = CONFIG;
