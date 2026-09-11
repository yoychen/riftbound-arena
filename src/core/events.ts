/**
 * 模擬層的副作用佇列。
 *
 * 戰鬥邏輯要放特效、跳字、播音效，但它不能直接呼叫 THREE 或碰 DOM——
 * 那會把整個 render 與 ui 層拖進核心，測試也就無從寫起。改成把副作用
 * 「描述」成資料推進佇列，每幀由 render / ui / audio 各自取用。
 *
 * 好處是副作用變成可斷言的值：測試可以直接檢查一次攻擊有沒有產生該有的
 * 事件，而不需要一個瀏覽器。
 */

/** 振盪器波形。自行定義而不用 DOM 的 OscillatorType，核心層才不需要 DOM 型別。 */
export type Waveform = "sine" | "square" | "sawtooth" | "triangle";

export type GameEvent =
  /** 地面擴散光環。 */
  | { type: "ring"; x: number; z: number; r: number; color: number; life: number }
  /** 粒子爆散。 */
  | { type: "burst"; x: number; z: number; color: number; count: number }
  /** 跳出的傷害數字。只在玩家出手或受擊時產生。 */
  | { type: "damage"; x: number; z: number; text: number; color: string }
  /** 畫面中央的大字提示。 */
  | { type: "announce"; text: string }
  /** 左上角的戰況訊息。 */
  | { type: "feed"; text: string }
  /** 玩家陣亡。呈現層藉此停止連續普攻等輸入狀態。 */
  | { type: "playerDeath" }
  /** 核心被摧毀，戰局結束。 */
  | { type: "matchEnd"; win: boolean }
  | {
      type: "sound";
      freq: number;
      duration: number;
      volume: number;
      wave: Waveform;
    };

export interface EventQueue {
  emit(event: GameEvent): void;
  /** 依發生順序取出並清空佇列。 */
  drain(handle: (event: GameEvent) => void): void;
  /** 丟棄尚未取用的事件，換局時用。 */
  clear(): void;
  readonly size: number;
}

export function createEventQueue(): EventQueue {
  let queue: GameEvent[] = [];
  return {
    emit(event) {
      queue.push(event);
    },
    drain(handle) {
      // 先換走再處理：處理過程中若又產生事件，留到下一次 drain，
      // 避免無界的遞迴。
      const pending = queue;
      queue = [];
      for (const event of pending) handle(event);
    },
    clear() {
      queue = [];
    },
    get size() {
      return queue.length;
    },
  };
}
