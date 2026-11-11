/** 四位英雄的數值、技能名稱、冷卻與選角畫面的文案。 */

export interface Hero {
  name: string;
  /** 選角畫面的定位標籤，例如「近戰・突進・反擊」。 */
  role: string;
  icon: string;
  /** 技能特效的主色。 */
  color: number;
  hp: number;
  damage: number;
  range: number;
  speed: number;
  /** 普攻間隔（秒）。 */
  rate: number;
  /** Q / E / R 的名稱。 */
  skills: [string, string, string];
  /** 技能格上顯示的符號。 */
  symbols: [string, string, string];
  /** Q / E / R 的冷卻秒數。閃避的冷卻是固定的，不在這裡。 */
  cd: [number, number, number];
  desc: string;
}

export const HEROES: Hero[] = [
  {
    name: "逐風劍士",
    role: "近戰・突進・反擊",
    icon: "⚔",
    color: 0x70d5bd,
    hp: 1100,
    damage: 67,
    range: 3.4,
    speed: 8.6,
    rate: 0.48,
    skills: ["疾風斬", "鏡心格擋", "千刃風暴"],
    symbols: ["➶", "◇", "✺"],
    cd: [5, 8, 24],
    desc: "突進切入敵陣，格擋後反擊。用千刃風暴席捲身邊的敵人。",
  },
  {
    name: "晨星射手",
    role: "遠程・翻滾・精準",
    icon: "➶",
    color: 0xe3c16d,
    hp: 840,
    damage: 48,
    range: 14,
    speed: 8.3,
    rate: 0.46,
    skills: ["穿星箭", "靈巧翻滾", "流星箭雨"],
    symbols: ["➳", "»", "✧"],
    cd: [5, 6, 24],
    desc: "邊移動邊射擊，翻滾保持距離。穿透箭與箭雨壓制整條兵線。",
  },
  {
    name: "暮光法師",
    role: "遠程・元素・爆發",
    icon: "✦",
    color: 0xb399ef,
    hp: 870,
    damage: 56,
    range: 12,
    speed: 7.7,
    rate: 0.65,
    skills: ["寒霜法球", "烈焰印記", "雷霆領域"],
    symbols: ["❄", "♨", "ϟ"],
    cd: [5, 7, 25],
    desc: "冰球緩速後用烈焰引爆。預判敵人走位，召喚持續落雷的領域。",
  },
  {
    name: "磐石鬥士",
    role: "近戰・控制・守護",
    icon: "⬡",
    color: 0xec9b70,
    hp: 1500,
    damage: 80,
    range: 3.8,
    speed: 7.2,
    rate: 0.72,
    skills: ["山崩衝撞", "震地護盾", "大地崩裂"],
    symbols: ["▰", "◎", "✹"],
    cd: [6, 8, 25],
    desc: "衝撞打散敵陣，震地獲得護盾。大地崩裂能擊退並暈眩一群敵人。",
  },
];
