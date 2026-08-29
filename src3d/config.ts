/**
 * 調整用の数値はすべてここに置く。処理の中に数字を埋めない。
 * ブラウザのコンソールから `CONFIG.dogSpeed = 9` のように書き換えると
 * リロードなしで反映される（毎フレーム参照しているため）。
 */
export const CONFIG = {
  // --- 犬 ---
  dogSpeed: 5,           // 移動速度 (world units / 秒)
  dogTurnSpeed: 12,      // 向きの追従速度
  braceSpeedFactor: 0.2, // 拒否柴中に犬自身が動ける割合

  // --- リード ---
  leashLength: 3,        // リードの最大長
  leashTautMargin: 0.15, // これ以内まで伸びたら「張っている」扱い
  leashPullFactor: 0.55, // 張った状態で犬が引くと飼い主がどれだけ引きずられるか
  leashMaxPullPerSecond: 1.2, // 飼い主が引かれる速度の上限

  // --- リードを電柱に巻きつける ---
  // 犬が電柱の向こう側へ回り込むと、リードが電柱に引っかかる。
  // そうなると飼い主は「電柱からリードの長さまで」しか進めない。
  poleWrapRadius: 0.26,    // リードがこの距離まで電柱に寄ったら引っかかる
  poleContactRadius: 0.16, // 見た目上、リードが電柱に触る半径
  poleUnwrapCos: -0.966,   // 角度が165度を超えて真っ直ぐになったら外れる
  poleCommitCos: -0.766,   // 角度が140度を切ったら「ちゃんと回り込んだ」とみなす
  poleGrace: 0.5,          // 回り込まないまま触れただけなら、この秒数で外れる
  poleHoldMax: 3.0,        // 張りっぱなしがこの秒数を超えたら滑って外れる（詰み防止）
  poleRewrapDelay: 1.2,    // 外れた直後に同じ電柱へ巻き直さないための待ち
  poleMinSlack: 0.35,      // 電柱と犬のあいだに最低限残す長さ

  // --- 飼い主 ---
  ownerSpeed: 1.5,
  ownerTurnSpeed: 4,
  braceOwnerSpeedFactor: 0.1,  // 拒否柴でリードが張っているときの歩行速度倍率
  crouchDuration: 1.8,         // 抱っこでしゃがんでいる時間
  hugRange: 1.6,               // 抱っこをせがめる距離
  ownerHeadHeight: 1.52,       // 立っているときの頭の高さ
  ownerCrouchHeadHeight: 0.62, // しゃがんだときの頭の高さ
  ownerHeadRadius: 0.3,
  ownerHitRadius: 0.26,        // 当たり判定のカプセル半径（見た目より少し細く）

  // --- 事故の発動 ---
  // どの事故も「飼い主が予告地点(triggerX)を越えたら、そこから決まった秒数後に必ず起きる」。
  // 「その場所に着いたら起きる」にすると、手前で足を止めた瞬間に永久に発生せず、
  // 先へ進めなくなる。予告してから時間で起こすことで、拒否柴が「ずらす」手段になる。

  // --- 事故1: 飛来する看板 ---
  // 看板は「発射した瞬間の飼い主の位置と速度」から着弾点を計算して飛ぶ。
  // 速すぎると予測が当たりすぎて、足を止めさせても当たってしまう。
  // 遅いほど「歩みを止める／横にずらす」が効くようになる。
  signSpeed: 8.5,
  signWarnDelay: 1.5,  // 予告地点を越えてから飛んでくるまで
  signLeadTime: 0.0,   // 予測射撃の補正（+で先読み）
  signLifetime: 3.0,   // 発射から消えるまで
  signHitRadius: 0.36,

  // --- 事故2: 落下物 ---
  fallHeight: 9,        // 落ち始める高さ
  fallGravity: 20,
  fallHitRadius: 0.85,  // この距離に飼い主がいたら当たる
  fallWarnDelay: 1.4,   // 予告地点を越えてから落ち始めるまで

  // --- 事故3: マンホール ---
  manholeRadius: 0.46,      // 穴の半径。ここに飼い主が入ると落ちる
  manholeOpenDistance: 3.4, // 飼い主がこれだけ近づくと蓋が外れる
  manholeSinkDepth: 2.4,

  // --- 事故4: 自転車 ---
  bikeSpeed: 7.5,
  bikeHitRadius: 0.8,
  bikeStartZ: -8,   // 路地の奥から
  bikeEndZ: 11,     // 車道の方へ抜ける
  bikeWarnDelay: 1.5, // 予告地点を越えてから飛び出すまで

  // --- タイムリープ ---
  rewindSeconds: 6,         // 死亡時点から何秒巻き戻すか
  rewindDuration: 1.4,      // 巻き戻し演出の長さ（実時間）
  deathPauseDuration: 0.35, // 直撃時に時間が止まる長さ

  // --- ギリギリで避けたときの演出 ---
  slowMoDuration: 0.6,   // 実時間で何秒スローにするか
  slowMoFactor: 0.25,    // その間の時間の流れ
  closeCallDistance: 2.0, // これより近くをかすめたらスローにする

  // --- 未来視 ---
  visionSpeed: 5,          // 未来視中に時間を何倍で流すか
  visionFreezeDuration: 0.9, // 事故の瞬間に止める時間（実時間）

  // --- カメラ ---
  cameraOffset: { x: 5, y: 12, z: 14 }, // 注視点からのオフセット（斜め見下ろし）
  cameraFrustumHeight: 12,              // 表示する高さ（大きいほど引き）
  cameraDamping: 1.6,                   // 注視点の追従の鈍さ（小さいほど鈍い）
  cameraDogWeight: 0.45,                // 注視点における犬と飼い主の重み
  cameraTargetBias: { x: 0.6, z: -1.3 }, // 注視点をずらす（危険側を広く映す）
  visionZoom: 1.25,                     // 未来視中は少し引く
  shakeDecay: 3.5,

  // --- 怪異 ---
  wraithFadeIn: 0.6,
  wraithHold: 2.6,
  wraithFadeOut: 1.0,
};

export type Config = typeof CONFIG;

// コンソールから触れるようにしておく（プロトタイプ用）。
// 2D版と名前がぶつからないよう、こちらは CONFIG3D で出す
(window as unknown as Record<string, unknown>).CONFIG3D = CONFIG;
