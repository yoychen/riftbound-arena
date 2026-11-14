"""
逐風劍士（英雄 0）→ art/hero_swordsman.blend、src/assets/models/hero_swordsman.glb

    python art/build_hero_swordsman.py        # pip 安裝的 bpy
    blender --background --factory-startup --python art/build_hero_swordsman.py

    HERO_PREVIEW=/path/sheet.png python art/build_hero_swordsman.py   # 另外輸出多視角預覽圖

共同的匯出約定見 lowpoly.py。這個模型的約定（src/render/models.ts 依此讀取）：

- 原點在腳底中心（y = 0），角色朝遊戲的 +Z。身高約 2.5，和原本程式拼出來
  的英雄一樣大，選取光圈（半徑 1）不用改。
- 每種顏色一個物件，物件名稱就是顏色的用途：
  `Coat`（英雄色）、`Skin`、`Dark`、`Boots`、`Hair`、`Scarf`、`Blade`、`Gold`。
  實際色相在 models.ts，這裡只有明暗。
- 整個模型不拆骨架、沒有動畫，和原本一樣由遊戲整體旋轉、受擊時整體放大。

所有形狀都用 lowpoly.tube 沿路徑一圈一圈拉出來，座標都是遊戲座標
（+Y 向上、+Z 朝前、+X 是角色的左手邊 —— 從正面看在畫面右側）。
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hero_common import along, arm, finish_hero, hair_shell, head, legs, new_parts, v  # noqa: E402
from lowpoly import tube  # noqa: E402

# 遊戲裡的顏色，只用來渲染預覽圖；真正的調色盤在 src/render/models.ts。
PREVIEW_TINTS = {
    "Coat": 0x70D5BD,
    "Skin": 0xE4C9A0,
    "Dark": 0x294343,
    "Boots": 0x5A4636,
    "Hair": 0x324E4C,
    "Scarf": 0xEEF3EA,
    "Blade": 0xDBEDE3,
    "Gold": 0xCBB477,
}

parts = new_parts(PREVIEW_TINTS)

# ── 腿與靴子 ───────────────────────────────────────────────
legs(parts["Dark"], parts["Boots"])
# ── 外套：由下擺往上拉到脖子。下擺外擴，腰收窄，肩膀最寬 ───────
tube(
    parts["Coat"],
    [
        (0, 0.52, -0.03),
        (0, 0.78, 0.0),
        (0, 0.96, 0.0),
        (0, 1.22, 0.01),
        (0, 1.47, 0.0),
        (0, 1.60, 0.0),
        (0, 1.67, 0.0),
    ],
    [(0.50, 0.44), (0.40, 0.33), (0.35, 0.28), (0.41, 0.30), (0.45, 0.28), (0.30, 0.22), (0.16, 0.15)],
    sides=8,
)
# 背後兩片往後飄的下襬（取代原本的披風）
for s in (1, -1):
    tube(
        parts["Coat"],
        [(0.13 * s, 0.92, -0.26), (0.17 * s, 0.70, -0.40), (0.22 * s, 0.50, -0.58), (0.26 * s, 0.38, -0.74)],
        [(0.15, 0.035), (0.16, 0.03), (0.15, 0.03), (0.11, 0.02)],
        sides=4,
        ref=(1, 0, 0),
    )
# 腰帶與帶扣
tube(parts["Dark"], [(0, 0.88, 0.0), (0, 0.98, 0.0)], [(0.38, 0.31), (0.37, 0.30)], sides=8)
tube(parts["Gold"], [(0, 0.88, 0.31), (0, 0.99, 0.31)], [(0.07, 0.03), (0.07, 0.03)], sides=4, phase=math.pi / 4)

# ── 手臂（袖子屬於外套）與手 ───────────────────────────────
# 右手（-X）往前伸出握劍，左手（+X）自然下垂。
SWORD_ARM = [(-0.42, 1.47, 0.0), (-0.60, 1.18, 0.10), (-0.64, 1.00, 0.32)]
FREE_ARM = [(0.42, 1.47, 0.0), (0.58, 1.15, 0.0), (0.60, 0.90, 0.08)]
hands = [arm(parts["Coat"], parts["Skin"], path)[0] for path in (SWORD_ARM, FREE_ARM)]

# ── 頭與頭髮：被風往後吹的髮束、前額的瀏海 ─────────────────
head(parts["Skin"], parts["Dark"])
hair = parts["Hair"]
hair_shell(hair)
# 往後飛的髮束：根部在頭頂後方，尖端往後、略往外。
for x, rise in ((-0.24, 0.0), (-0.08, 0.06), (0.08, 0.06), (0.24, 0.0), (0.0, 0.12)):
    tube(
        hair,
        [(x, 2.30 + rise, -0.12), (x * 1.3, 2.42 + rise, -0.42), (x * 1.6, 2.36 + rise, -0.72)],
        [0.14, 0.08, 0],
        sides=5,
    )
# 前額的瀏海
for x in (-0.16, 0.02, 0.18):
    tube(hair, [(x, 2.28, 0.26), (x + 0.04, 2.18, 0.40), (x + 0.06, 2.06, 0.45)], [0.09, 0.05, 0], sides=4)

# ── 圍巾：繞脖子一圈，兩條尾巴往後飄 ────────────────────────
neck_loop = [(0.27 * math.sin(a), 1.64, 0.24 * math.cos(a)) for a in (i * math.tau / 8 for i in range(8))]
tube(parts["Scarf"], neck_loop, [0.075] * 8, sides=6, ref=(0, 1, 0), loop=True)
tube(
    parts["Scarf"],
    [(0.06, 1.62, -0.22), (0.14, 1.56, -0.46), (0.04, 1.49, -0.74), (0.18, 1.43, -1.00), (0.12, 1.41, -1.22)],
    [(0.12, 0.025), (0.12, 0.025), (0.11, 0.02), (0.10, 0.02), (0.07, 0.015)],
    sides=4,
    ref=(1, 0.4, 0),
)
tube(
    parts["Scarf"],
    [(-0.06, 1.60, -0.22), (-0.16, 1.50, -0.42), (-0.12, 1.39, -0.62), (-0.2, 1.33, -0.8)],
    [(0.10, 0.025), (0.10, 0.02), (0.08, 0.02), (0.05, 0.015)],
    sides=4,
    ref=(1, -0.3, 0),
)

# ── 劍：握在右手，劍尖朝前上方 ─────────────────────────────
grip = hands[0]
axis = v(-0.55, 0.5, 0.55).normalized()  # 劍身方向：往外、往前、往上，從遊戲鏡頭看才不會被壓短
flat = axis.cross(v(0, 0, 1)).normalized()  # 劍身的寬度方向（大致水平）
tube(parts["Dark"], [along(grip, axis, t) for t in (-0.15, 0.13)], [0.035, 0.035], sides=6)
tube(parts["Gold"], [along(grip, axis, t) for t in (-0.22, -0.16)], [0.06, 0.06], sides=6)
guard = grip + axis * 0.15
tube(
    parts["Gold"],
    [along(guard, flat, -0.2), along(guard, flat, 0.2)],
    [(0.05, 0.035)] * 2,
    sides=4,
    ref=tuple(axis),
    phase=math.pi / 4,
)
tube(
    parts["Blade"],
    [along(grip, axis, t) for t in (0.17, 0.32, 1.30, 1.50)],
    [(0.085, 0.022), (0.08, 0.02), (0.07, 0.015), 0],
    sides=4,
    ref=tuple(flat),
)

# ── 收尾 ─────────────────────────────────────────────────
finish_hero("hero_swordsman", parts, PREVIEW_TINTS, bright=("Blade",))
