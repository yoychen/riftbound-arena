"""
晨星射手（英雄 1）→ art/hero_archer.blend、src/assets/models/hero_archer.glb

    python art/build_hero_archer.py
    HERO_PREVIEW=/path/sheet.png python art/build_hero_archer.py

約定和逐風劍士相同（見 build_hero_swordsman.py）：原點在腳底、朝 +Z、
每種顏色一個物件，色相在 src/render/models.ts。物件：
`Tunic`（英雄色）、`Skin`、`Dark`、`Boots`、`Hair`、`Cloak`、`Leather`、
`Bow`、`String`、`Star`。

造型：金色短上衣、深色披肩與垂在背後的兜帽、馬尾、背上的箭袋，左手斜握
一把反曲弓（斜握是為了從遊戲鏡頭往下看時，弓不會只剩一條線），胸前一枚
晨星胸針。
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hero_common import along, arm, finish_hero, flat_shape, hair_shell, head, legs, new_parts, star_outline, v  # noqa: E402
from lowpoly import tube  # noqa: E402

PREVIEW_TINTS = {
    "Tunic": 0xE3C16D,
    "Skin": 0xE4C9A0,
    "Dark": 0x294343,
    "Boots": 0x5A4636,
    "Hair": 0x8A4B2F,
    "Cloak": 0x3C6650,
    "Leather": 0x7A5236,
    "Bow": 0xE6BC66,
    "String": 0xF0E0B3,
    "Star": 0xFFF1B8,
}

parts = new_parts(PREVIEW_TINTS)

# ── 腿：比劍士細一點 ───────────────────────────────────────
legs(parts["Dark"], parts["Boots"], radii=(0.14, 0.12, 0.11), boot_r=0.13)

# ── 短上衣：下擺比劍士的外套短、收得窄 ─────────────────────
tube(
    parts["Tunic"],
    [(0, 0.62, -0.02), (0, 0.80, 0.0), (0, 0.96, 0.0), (0, 1.22, 0.01), (0, 1.47, 0.0), (0, 1.60, 0.0), (0, 1.67, 0.0)],
    [(0.44, 0.38), (0.38, 0.31), (0.34, 0.27), (0.39, 0.29), (0.43, 0.27), (0.29, 0.21), (0.16, 0.15)],
    sides=8,
)
tube(parts["Leather"], [(0, 0.88, 0.0), (0, 0.97, 0.0)], [(0.37, 0.30), (0.36, 0.29)], sides=8)

# ── 手臂：左手（+X）往前舉弓，右手（-X）放鬆垂下 ─────────────
BOW_ARM = [(0.42, 1.47, 0.0), (0.62, 1.30, 0.22), (0.68, 1.22, 0.50)]
FREE_ARM = [(-0.42, 1.47, 0.0), (-0.56, 1.16, -0.05), (-0.58, 0.92, 0.02)]
bow_hand, _ = arm(parts["Tunic"], parts["Skin"], BOW_ARM, radii=(0.13, 0.11, 0.10))
arm(parts["Tunic"], parts["Skin"], FREE_ARM, radii=(0.13, 0.11, 0.10))
# 護臂：套在前臂上的皮革
for path in (BOW_ARM, FREE_ARM):
    elbow, wrist = v(*path[1]), v(*path[2])
    d = wrist - elbow
    tube(parts["Leather"], [along(elbow, d, 0.5), along(elbow, d, 0.95)], [0.12, 0.115], sides=6)

# ── 頭、頭髮與馬尾 ─────────────────────────────────────────
head(parts["Skin"], parts["Dark"])
hair = parts["Hair"]
hair_shell(hair)
for x, dz in ((-0.2, 0.0), (0.0, 0.03), (0.18, 0.0)):  # 往一側撥的瀏海
    tube(hair, [(x, 2.30, 0.24 + dz), (x + 0.1, 2.18, 0.38 + dz), (x + 0.16, 2.08, 0.42)], [0.09, 0.05, 0], sides=4)
tube(  # 馬尾：從後腦綁起，往後下方垂
    hair,
    [(0, 2.24, -0.36), (0, 2.12, -0.52), (0.02, 1.90, -0.62), (0.05, 1.62, -0.6), (0.06, 1.42, -0.54)],
    [0.1, 0.13, 0.12, 0.08, 0],
    sides=6,
)
tube(parts["Leather"], [(0, 2.27, -0.33), (0, 2.21, -0.42)], [0.11, 0.11], sides=6)  # 髮圈

# ── 披肩與兜帽 ─────────────────────────────────────────────
# 披肩下緣不封口：遊戲鏡頭只從上方看，封口反而會在胸口切出一圈平面。
tube(parts["Cloak"], [(0, 1.73, 0.0), (0, 1.60, 0.0), (0, 1.36, -0.02)], [(0.2, 0.19), (0.42, 0.33), (0.56, 0.42)], sides=8, cap=False)
tube(
    parts["Cloak"],
    [(0, 1.74, -0.18), (0, 1.64, -0.36), (0, 1.48, -0.44), (0, 1.32, -0.42)],
    [(0.26, 0.10), (0.25, 0.10), (0.18, 0.08), 0],
    sides=6,
)
flat_shape(parts["Star"], star_outline(0.1, 0.045), (0.2, 1.52, 0.37), (1, 0, 0), (0, 1, 0.35), 0.035)

# ── 箭袋：斜背在背上，露出三支箭 ───────────────────────────
q_bottom, q_top = v(-0.2, 0.98, -0.36), v(0.22, 1.74, -0.40)
q = (q_top - q_bottom).normalized()
tube(parts["Leather"], [tuple(q_bottom), tuple(q_top)], [0.1, 0.11], sides=6)
side = q.cross(v(0, 0, 1)).normalized()
for k, off in enumerate((-0.05, 0.0, 0.05)):
    base = q_top + side * off - q * 0.05
    tip = base + q * (0.28 + 0.04 * k)
    tube(parts["Bow"], [tuple(base), tuple(tip)], [0.014, 0.014], sides=4)
    tube(parts["String"], [along(tip, q, -0.13), along(tip, q, -0.02), along(tip, q, 0.02)], [(0.05, 0.008), (0.05, 0.008), 0], sides=4, ref=tuple(side))

# ── 弓：握在左手，弓臂往外斜，弓背朝前 ─────────────────────
up = v(0.45, 0.89, 0.0).normalized()  # 弓的長軸（往外斜）
front = v(0.0, 0.0, 1.0)  # 弓背凸出的方向
R = 0.85
angles = [math.radians(a) for a in range(-55, 56, 11)]
arc = [bow_hand + up * (R * math.sin(a)) + front * (R * (math.cos(a) - 1)) for a in angles]
# 反曲的弓梢：兩端再往前翹一點
top_tip = arc[-1] + up * 0.08 + front * 0.07
bottom_tip = arc[0] - up * 0.08 + front * 0.07
limb = [bottom_tip, *arc, top_tip]
mid = len(limb) // 2
radii = [0.018 + 0.035 * max(0.0, 1 - abs(i - mid) / mid) ** 0.5 for i in range(len(limb))]
radii[0] = radii[-1] = 0
tube(parts["Bow"], [tuple(p) for p in limb], radii, sides=5, ref=(0, 0, 1))
tube(parts["Leather"], [along(bow_hand, up, -0.09), along(bow_hand, up, 0.09)], [0.055, 0.055], sides=6, ref=(0, 0, 1))
tube(parts["String"], [tuple(arc[0]), tuple(arc[-1])], [0.012, 0.012], sides=3, ref=(0, 0, 1))

finish_hero("hero_archer", parts, PREVIEW_TINTS, bright=("Star", "String"))
