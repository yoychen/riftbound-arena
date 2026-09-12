/**
 * 每局隨機抽選的進化。
 *
 * `apply()` 直接改動玩家的實體 —— 大多是點亮 `mods` 上的一個旗標，戰鬥邏輯
 * 之後會查這些旗標；少數（生命之種）直接改數值。
 */

import type { Entity } from "../core/world.js";

export interface Upgrade {
  /** 池內唯一。注意不是全域唯一：射手與法師刻意共用 `bounce`。 */
  id: string;
  name: string;
  desc: string;
  icon: string;
  apply: (entity: Entity) => void;
}

export const commonUpgrades: Upgrade[] = [
  {
    id: "leech",
    name: "嗜血契約",
    desc: "造成傷害的 12% 轉為自身生命，越戰越勇。",
    icon: "♡",
    apply: (e: Entity) => (e.mods.leech = true),
  },
  {
    id: "haste",
    name: "時間碎片",
    desc: "所有英雄技能冷卻縮短 22%，更頻繁地打出連招。",
    icon: "⌛",
    apply: (e: Entity) => (e.mods.haste = true),
  },
  {
    id: "frost",
    name: "極寒附魔",
    desc: "所有攻擊短暫緩速敵人，更容易追擊與閃躲。",
    icon: "❄",
    apply: (e: Entity) => (e.mods.frost = true),
  },
  {
    id: "trail",
    name: "餘燼步伐",
    desc: "閃避與突進會在原地留下燃燒區域，持續 3 秒。",
    icon: "♨",
    apply: (e: Entity) => (e.mods.trail = true),
  },
  {
    id: "execute",
    name: "獵殺本能",
    desc: "對生命低於 35% 的敵人造成額外 40% 傷害。",
    icon: "◇",
    apply: (e: Entity) => (e.mods.execute = true),
  },
  {
    id: "vital",
    name: "生命之種",
    desc: "最大生命增加 350，立即恢復所有生命。",
    icon: "✚",
    apply: (e: Entity) => {
      e.maxHp += 350;
      e.hp = e.maxHp;
    },
  },
  {
    id: "power",
    name: "戰意湧動",
    desc: "所有傷害增加 20%，擊破敵人的防線。",
    icon: "✧",
    apply: (e: Entity) => (e.mods.power = (e.mods.power || 0) + 0.2),
  },
];
/** 索引對應 HEROES：每位英雄的專屬進化。 */
export const heroUpgrades: Upgrade[][] = [
  [
    {
      id: "blade",
      name: "破空劍氣",
      desc: "每次普攻附帶一道穿透劍氣，近戰也能壓制遠處敵人。",
      icon: "⚔",
      apply: (e: Entity) => (e.mods.blade = true),
    },
    {
      id: "reflect",
      name: "鏡心反擊",
      desc: "格擋期間每次受到攻擊，都會反射 45 點傷害。",
      icon: "◇",
      apply: (e: Entity) => (e.mods.reflect = true),
    },
  ],
  [
    {
      id: "bounce",
      name: "連鎖飛矢",
      desc: "箭矢命中後，彈射至附近另一名敵人。",
      icon: "➶",
      apply: (e: Entity) => (e.mods.bounce = true),
    },
    {
      id: "split",
      name: "三重星芒",
      desc: "普通攻擊一次射出三支箭，側箭造成 60% 傷害。",
      icon: "⋔",
      apply: (e: Entity) => (e.mods.split = true),
    },
    {
      id: "roll",
      name: "翻滾連射",
      desc: "靈巧翻滾立即追加三箭，共通閃避也提供攻速提升。",
      icon: "»",
      apply: (e: Entity) => (e.mods.roll = true),
    },
    {
      id: "mark",
      name: "爆裂印記",
      desc: "每四次命中引爆印記，追加 100 點傷害。",
      icon: "✹",
      apply: (e: Entity) => (e.mods.mark = true),
    },
  ],
  [
    {
      id: "combo",
      name: "冰火共鳴",
      desc: "技能命中緩速中的敵人，傷害增加 65%。",
      icon: "❄",
      apply: (e: Entity) => (e.mods.combo = true),
    },
    {
      id: "bounce",
      name: "電弧法球",
      desc: "法球命中後彈射至另一名敵人，形成連鎖攻擊。",
      icon: "ϟ",
      apply: (e: Entity) => (e.mods.bounce = true),
    },
    {
      id: "fan",
      name: "永凍穿透",
      desc: "寒霜法球穿透整條兵線，同時緩速所有命中目標。",
      icon: "✦",
      apply: (e: Entity) => (e.mods.fan = true),
    },
  ],
  [
    {
      id: "fortress",
      name: "不動堡壘",
      desc: "震地護盾額外提供 200 護盾，移動速度增加 10%。",
      icon: "⬡",
      apply: (e: Entity) => {
        e.mods.fortress = true;
        e.speed *= 1.1;
      },
    },
    {
      id: "thorns",
      name: "碎甲震波",
      desc: "護盾被打破時，對附近敵人造成 160 傷害。",
      icon: "✹",
      apply: (e: Entity) => (e.mods.thorns = true),
    },
  ],
];
