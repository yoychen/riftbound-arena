/**
 * 可重現的偽亂數。
 *
 * 地圖的樹木、石頭與草叢用固定種子生成，所以每一局的地形完全相同，
 * 而障礙物碰撞資料也因此可以在載入時預先算好。把種子狀態封裝成物件
 * （而非模組層的 `let seed`）讓測試能各自建立獨立的序列互不干擾。
 */

/** Lehmer / MINSTD 乘法同餘產生器。 */
export function createRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

/** 地形生成使用的種子，與最初的實作一致，改動會改變地圖外觀。 */
export const TERRAIN_SEED = 171;
