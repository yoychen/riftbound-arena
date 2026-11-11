/**
 * UI 狀態機。
 *
 * `state` 決定「現在要不要推進模擬」以及哪些輸入有效，所以它不屬於 world ——
 * 它是應用程式的狀態，不是戰局的狀態。放在一個可變物件裡而不是模組層的
 * `let`，各層才能共用同一份而不需要 getter / setter。
 *
 * - select：選角畫面
 * - playing：戰鬥進行中
 * - paused / shop / upgrade / route：戰場暫停，等待玩家在覆蓋層做決定
 * - ended：勝負已分
 */
export const session = {
  /** @type {"select"|"playing"|"paused"|"shop"|"upgrade"|"route"|"ended"} */
  state: "select",
  /** 選角畫面上目前反白的英雄索引。 */
  selected: 0,
};
