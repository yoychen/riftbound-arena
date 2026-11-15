"""
磐石鬥士（英雄 3）→ art/hero_fighter.blend、src/assets/models/hero_fighter.glb

    python art/build_hero_fighter.py
    HERO_PREVIEW=/path/sheet.png python art/build_hero_fighter.py
    HERO_ANIM_PREVIEW=/path/anim.png python art/build_hero_fighter.py

約定和逐風劍士相同（見 build_hero_swordsman.py）：原點在腳底、朝 +Z、
每種顏色一個物件，色相在 src/render/models.ts。物件：
`Armor`（英雄色）、`Plate`、`Stone`、`Skin`、`Dark`、`Boots`、`Beard`、
`Shield`、`Wood`。綁了 rig.py 的骨架，帶 `Idle`、`Walk`、`Attack`。

造型：比其他英雄寬厚的身形、石塊般的肩甲、頭盔與大鬍子。左手一面六角盾
（呼應選角畫面的 ⬡ 圖示），右手一把石頭鎚頭的戰鎚。石頭的部分在拉完形狀
後再把每個頂點隨機推一點，做出不規則的稜角。
"""

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rig  # noqa: E402
from hero_common import along, arm, finish_hero, hair_shell, head, leg_joints, legs, new_parts, v  # noqa: E402
from lowpoly import tube  # noqa: E402
from rig import X, Y, Z, bind, bind_by_height, rot  # noqa: E402

rig.enable()

PREVIEW_TINTS = {
    "Armor": 0xEC9B70,
    "Plate": 0x859890,
    "Stone": 0x9A9282,
    "Skin": 0xE4C9A0,
    "Dark": 0x294343,
    "Boots": 0x5A4636,
    "Beard": 0x8A5A3A,
    "Shield": 0xC8AC70,
    "Wood": 0x6E6655,
}

rng = random.Random(3)
parts = new_parts(PREVIEW_TINTS)
TORSO = [(0.74, "Hips"), (1.05, "Spine"), (1.38, "Chest")]
LEGS = dict(hip=(0.26, 0.74, 0.0), knee=(0.30, 0.42, 0.03), ankle=(0.30, 0.20, 0.0))


def roughen(verts, amount):
    """手動拉點：把每個頂點往隨機方向推一點，讓石頭有不規則的稜角。"""
    for vert in verts:
        vert.co.x += rng.uniform(-amount, amount)
        vert.co.y += rng.uniform(-amount, amount)
        vert.co.z += rng.uniform(-amount, amount)


# ── 粗壯的腿 ───────────────────────────────────────────────
legs(
    parts["Dark"],
    parts["Boots"],
    **LEGS,
    radii=(0.20, 0.18, 0.16),
    boot_r=0.18,
    toe=(0.14, 0.09),
)

# ── 身體：寬胸、厚腰，下面是一圈短裙甲 ─────────────────────
body = tube(
    parts["Armor"],
    [(0, 0.50, -0.02), (0, 0.72, 0.0), (0, 0.95, 0.02), (0, 1.20, 0.02), (0, 1.45, 0.0), (0, 1.58, 0.0), (0, 1.66, 0.0)],
    [(0.62, 0.52), (0.58, 0.48), (0.60, 0.47), (0.66, 0.46), (0.64, 0.42), (0.40, 0.30), (0.20, 0.18)],
    sides=8,
)
bind_by_height(parts["Armor"], body, TORSO)
bind_by_height(parts["Dark"], tube(parts["Dark"], [(0, 0.80, 0.0), (0, 0.94, 0.01)], [(0.61, 0.50), (0.62, 0.49)], sides=8), TORSO)  # 寬腰帶
buckle = tube(parts["Plate"], [(0, 0.80, 0.49), (0, 0.95, 0.50)], [(0.12, 0.04)] * 2, sides=4, phase=math.pi / 4)  # 帶扣
bind_by_height(parts["Plate"], buckle, TORSO)
for ang in (-0.9, -0.3, 0.3, 0.9):  # 垂在腰帶下的護甲片
    x, z = 0.64 * math.sin(ang), 0.52 * math.cos(ang)
    tasset = tube(
        parts["Plate"],
        [(x, 0.82, z), (x * 1.05, 0.60, z * 1.06), (x * 1.08, 0.46, z * 1.08)],
        [(0.14, 0.03)] * 3,
        sides=4,
        ref=(math.cos(ang), 0, -math.sin(ang)),
    )
    bind(parts["Plate"], tasset, "Hips")

# ── 石塊肩甲 ───────────────────────────────────────────────
for s in (1, -1):
    c = v(0.58 * s, 1.42, 0.0)
    d = v(s, -0.6, 0.0).normalized()
    pauldron = tube(parts["Stone"], [along(c, d, t) for t in (-0.16, -0.02, 0.14, 0.24)], [0.28, 0.36, 0.30, 0], sides=6, ref=(0, 0, 1))
    roughen(pauldron, 0.05)
    # 一半跟著上臂、一半跟著胸口：舉鎚時肩甲跟著抬，又不會整塊離開肩膀
    bind(parts["Stone"], pauldron, {f"UpperArm.{rig.side_of(s)}": 0.6, "Chest": 0.4})

# ── 手臂與護手 ─────────────────────────────────────────────
SHIELD_ARM = [(0.66, 1.40, 0.0), (0.84, 1.10, 0.05), (0.86, 1.00, 0.36)]
HAMMER_ARM = [(-0.66, 1.40, 0.0), (-0.86, 1.12, 0.10), (-0.88, 0.98, 0.36)]
shield_hand, _ = arm(parts["Armor"], parts["Skin"], SHIELD_ARM, radii=(0.2, 0.17, 0.15), hand=(0.11, 0.12, 0.08))
hammer_hand, _ = arm(parts["Armor"], parts["Skin"], HAMMER_ARM, radii=(0.2, 0.17, 0.15), hand=(0.11, 0.12, 0.08))
for path in (SHIELD_ARM, HAMMER_ARM):
    elbow, wrist = v(*path[1]), v(*path[2])
    dd = wrist - elbow
    gauntlet = tube(parts["Plate"], [along(elbow, dd, 0.35), along(elbow, dd, 1.0)], [0.17, 0.165], sides=6)
    bind(parts["Plate"], gauntlet, f"Forearm.{rig.side_of(path[0][0])}")

# ── 頭：頭盔、護鼻、大鬍子 ─────────────────────────────────
HEAD_Y = -0.08  # 脖子比較短
head(parts["Skin"], parts["Dark"], y=HEAD_Y)
hair_shell(parts["Plate"], hairline=0.16, y=HEAD_Y)  # 頭盔
bind(parts["Plate"], tube(parts["Plate"], [(0, 2.12, 0.40), (0, 1.94, 0.43)], [(0.04, 0.03), (0.035, 0.03)], sides=4), "Head")  # 護鼻
crest = tube(parts["Stone"], [(0, 2.36, 0.30), (0, 2.50, 0.05), (0, 2.46, -0.22), (0, 2.30, -0.42)], [0, (0.07, 0.1), (0.07, 0.1), 0], sides=4, ref=(1, 0, 0))
roughen(crest, 0.02)  # 頭盔上的石脊
bind(parts["Stone"], crest, "Head")
beard = tube(  # 鬍子：從下巴往下、往前長，寬而扁
    parts["Beard"],
    [(0, 1.76, 0.30), (0, 1.60, 0.38), (0, 1.42, 0.36), (0, 1.30, 0.30)],
    [(0.30, 0.12), (0.28, 0.12), (0.18, 0.08), 0],
    sides=6,
    ref=(1, 0, 0),
)
bind(parts["Beard"], beard, "Head")
for s in (1, -1):  # 八字鬍
    bind(parts["Beard"], tube(parts["Beard"], [(0.02 * s, 1.83, 0.38), (0.14 * s, 1.80, 0.38), (0.24 * s, 1.72, 0.34)], [0.05, 0.045, 0], sides=4), "Head")

# ── 六角盾：套在左前臂，盾面朝外前方 ───────────────────────
n = v(0.6, 0.1, 0.8).normalized()
c = shield_hand + n * 0.14
# 盾牌綁在前臂上，跟著前臂走
bind(parts["Plate"], tube(parts["Plate"], [along(c, n, -0.04), along(c, n, 0.03)], [0.66, 0.66], sides=6, ref=(0, 1, 0)), "Forearm.L")  # 盾緣
bind(parts["Shield"], tube(parts["Shield"], [along(c, n, -0.02), along(c, n, 0.07)], [0.6, 0.58], sides=6, ref=(0, 1, 0)), "Forearm.L")
boss = tube(parts["Stone"], [along(c, n, 0.06), along(c, n, 0.12), along(c, n, 0.2)], [0.24, 0.2, 0], sides=6, ref=(0, 1, 0))
roughen(boss, 0.02)
bind(parts["Stone"], boss, "Forearm.L")

# ── 戰鎚：木柄、石頭鎚頭 ───────────────────────────────────
axis = v(-0.3, 0.85, 0.42).normalized()
side = axis.cross(v(0, 0, 1)).normalized()
head_dir = side  # 鎚頭的長軸：橫向，和柄成 T 字
bind(parts["Wood"], tube(parts["Wood"], [along(hammer_hand, axis, -0.35), along(hammer_hand, axis, 0.95)], [0.05, 0.05], sides=6), "Hand.R")
top = hammer_hand + axis * 1.08
bind(parts["Plate"], tube(parts["Plate"], [along(top, axis, -0.17), along(top, axis, -0.09)], [0.08, 0.08], sides=6), "Hand.R")  # 柄頭的箍
hammer_head = tube(parts["Stone"], [along(top, head_dir, t) for t in (-0.34, -0.3, 0.3, 0.34)], [0.18, 0.23, 0.23, 0.18], sides=4, ref=tuple(axis), phase=math.pi / 4)
roughen(hammer_head, 0.035)
bind(parts["Stone"], hammer_head, "Hand.R")

# ── 骨架與動作 ─────────────────────────────────────────────
JOINTS = rig.humanoid(
    {"R": HAMMER_ARM, "L": SHIELD_ARM},
    leg_joints(**LEGS),
    hips_y=0.74,
    chest_y=1.25,
    neck_y=1.56,
    head_top=2.22,
)


def actions(skeleton):
    idle = rig.idle(skeleton)
    walk = rig.walk(skeleton, JOINTS, arm_swing=(0.3, 0.3), lean=8)  # 兩手都拿著東西，擺幅小
    # 普攻：把戰鎚舉過頭，再往前砸下，身體跟著往前壓；盾牌護在身前。
    # 只動上半身。普攻每 0.72 秒一次，動作約 0.7 秒。
    attack = rig.one_shot(
        skeleton,
        "Attack",
        [
            (0, {}),
            (7, {  # 舉鎚：手舉到頭頂前上方，手腕把鎚頭翻上去
                "Spine": rot((X, -12), (Y, -15)),
                "UpperArm.R": rot((X, -120), (Z, -10)),
                "Forearm.R": rot((X, -20)),
                "Hand.R": rot((X, 120)),
                "UpperArm.L": rot((X, -20)),
            }),
            (11, {  # 砸下：鎚柄跟前臂連成一直線，鎚頭朝前下方，身體往前壓
                "Spine": rot((X, 28), (Y, 12)),
                "Head": rot((X, -12)),
                "UpperArm.R": rot((X, -70)),
                "Forearm.R": rot((X, -5)),
                "Hand.R": rot((X, 150)),
                "UpperArm.L": rot((X, -35)),
            }),
            (15, {
                "Spine": rot((X, 25), (Y, 10)),
                "Head": rot((X, -10)),
                "UpperArm.R": rot((X, -62)),
                "Hand.R": rot((X, 145)),
                "UpperArm.L": rot((X, -30)),
            }),
            (21, {}),
        ],
    )
    return [(idle, [0, 15, 30, 45]), (walk, [0, 2, 4, 6, 8, 10, 12, 14]), (attack, [0, 7, 11, 15])]


finish_hero("hero_fighter", parts, PREVIEW_TINTS, bright=("Plate",), joints=JOINTS, actions=actions)
