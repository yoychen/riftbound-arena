"""
暮光法師（英雄 2）→ art/hero_mage.blend、src/assets/models/hero_mage.glb

    python art/build_hero_mage.py
    HERO_PREVIEW=/path/sheet.png python art/build_hero_mage.py
    HERO_ANIM_PREVIEW=/path/anim.png python art/build_hero_mage.py

約定和逐風劍士相同（見 build_hero_swordsman.py）：原點在腳底、朝 +Z、
每種顏色一個物件，色相在 src/render/models.ts。物件：
`Robe`（英雄色）、`Trim`、`Skin`、`Dark`、`Hair`、`Sash`、`Shoes`、
`Staff`、`Orb`、`Moon`。`Orb` 在遊戲裡會自己發光。綁了 rig.py 的骨架，
帶 `Idle`、`Walk`、`Attack`；腿藏在袍子裡，袍子的下半部跟著大腿擺。

造型：拖地長袍、喇叭袖、帽尖往後垂的寬沿尖帽、銀白長髮。右手的法杖頂端
有一輪新月托著法球，左手掌心上方浮著一顆小法球。帽尖最高約 3.1，比其他
英雄高 —— 原本程式拼出來的法師帽子也一樣高。
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rig  # noqa: E402
from hero_common import along, arm, finish_hero, hair_shell, head, leg_joints, new_parts, v  # noqa: E402
from lowpoly import tube  # noqa: E402
from rig import X, Y, Z, bind, bind_by_height, bind_skirt, rot  # noqa: E402

rig.enable()

PREVIEW_TINTS = {
    "Robe": 0xB399EF,
    "Trim": 0x7D65AB,
    "Skin": 0xE4C9A0,
    "Dark": 0x294343,
    "Hair": 0xDCD6EC,
    "Sash": 0xE0C27A,
    "Shoes": 0x3D3350,
    "Staff": 0xC5B58D,
    "Orb": 0xBEA0FC,
    "Moon": 0xF2DC9B,
}

parts = new_parts(PREVIEW_TINTS)
TORSO = [(0.80, "Hips"), (1.10, "Spine"), (1.42, "Chest")]
WAIST_Y, HEM_Y = 0.85, 0.05


def ball(bm, center, r, axis=(0, 1, 0), sides=8):
    """沿 axis 拉五圈做成的低多邊形球。"""
    c, a = v(*center), v(*axis).normalized()
    return tube(bm, [along(c, a, t * r) for t in (-1, -0.7, 0, 0.7, 1)], [0, 0.7 * r, r, 0.7 * r, 0], sides=sides)


# ── 長袍：從地面拉到脖子，下擺外擴 ─────────────────────────
robe = tube(
    parts["Robe"],
    [(0, 0.03, -0.02), (0, 0.30, -0.01), (0, 0.70, 0.0), (0, 0.96, 0.0), (0, 1.22, 0.01), (0, 1.47, 0.0), (0, 1.60, 0.0), (0, 1.67, 0.0)],
    [(0.58, 0.52), (0.51, 0.45), (0.42, 0.35), (0.35, 0.28), (0.39, 0.29), (0.42, 0.27), (0.29, 0.21), (0.16, 0.15)],
    sides=8,
)
bind_skirt(parts["Robe"], robe, TORSO, WAIST_Y, HEM_Y)
hem = tube(parts["Trim"], [(0, 0.01, -0.02), (0, 0.13, -0.02)], [(0.6, 0.54), (0.57, 0.51)], sides=8)  # 下擺的滾邊
bind_skirt(parts["Trim"], hem, TORSO, WAIST_Y, HEM_Y)
for s in (1, -1):  # 從袍子底下露出的鞋尖
    shoe = tube(parts["Shoes"], [(0.18 * s, 0.07, 0.30), (0.19 * s, 0.06, 0.52), (0.19 * s, 0.05, 0.6)], [(0.09, 0.06), (0.08, 0.05), 0], sides=6)
    bind(parts["Shoes"], shoe, f"Foot.{rig.side_of(s)}")
# 腰帶與垂在前面的帶尾
bind_by_height(parts["Sash"], tube(parts["Sash"], [(0, 0.89, 0.0), (0, 0.99, 0.0)], [(0.37, 0.30), (0.36, 0.29)], sides=8), TORSO)
sash_tail = tube(
    parts["Sash"],
    [(0.14, 0.92, 0.29), (0.16, 0.70, 0.37), (0.15, 0.48, 0.42), (0.16, 0.34, 0.45)],
    [(0.06, 0.015)] * 3 + [(0.05, 0.012)],
    sides=4,
    ref=(1, 0, 0),
)
bind_skirt(parts["Sash"], sash_tail, TORSO, WAIST_Y, HEM_Y)

# ── 喇叭袖與手 ─────────────────────────────────────────────
STAFF_ARM = [(-0.42, 1.47, 0.0), (-0.60, 1.20, 0.08), (-0.64, 1.05, 0.30)]
SPELL_ARM = [(0.42, 1.47, 0.0), (0.60, 1.20, 0.12), (0.63, 1.12, 0.40)]
staff_hand, _ = arm(parts["Robe"], parts["Skin"], STAFF_ARM, radii=(0.14, 0.16, 0.23))
spell_hand, _ = arm(parts["Robe"], parts["Skin"], SPELL_ARM, radii=(0.14, 0.16, 0.23))
for path in (STAFF_ARM, SPELL_ARM):  # 袖口滾邊
    elbow, wrist = v(*path[1]), v(*path[2])
    d = (wrist - elbow).normalized()
    cuff = tube(parts["Trim"], [along(wrist, d, -0.05), along(wrist, d, 0.0)], [0.235, 0.24], sides=6)
    bind(parts["Trim"], cuff, f"Forearm.{rig.side_of(path[0][0])}")
bind(parts["Orb"], ball(parts["Orb"], tuple(spell_hand + v(0, 0.24, 0.04)), 0.09), "Hand.L")

# ── 頭與銀白長髮 ───────────────────────────────────────────
head(parts["Skin"], parts["Dark"])
hair = parts["Hair"]
hair_shell(hair, hairline=0.3)
long_hair = tube(  # 披在背後的長髮
    hair,
    [(0, 2.12, -0.30), (0, 1.85, -0.42), (0, 1.55, -0.42), (0, 1.30, -0.38)],
    [(0.36, 0.14), (0.36, 0.12), (0.32, 0.09), (0.24, 0.05)],
    sides=6,
    ref=(1, 0, 0),
)
bind(hair, long_hair, "Head")
for s in (1, -1):  # 垂在臉旁的兩綹
    bind(hair, tube(hair, [(0.35 * s, 2.10, 0.14), (0.38 * s, 1.85, 0.16), (0.37 * s, 1.58, 0.12)], [0.09, 0.07, 0], sides=5), "Head")

# ── 尖帽：寬帽沿，帽尖往後垂 ───────────────────────────────
bind(parts["Trim"], tube(parts["Trim"], [(0, 2.27, -0.02), (0, 2.31, -0.02)], [0.74, 0.72], sides=10), "Head")
hat = tube(
    parts["Trim"],
    [(0, 2.30, -0.03), (0, 2.62, -0.06), (0, 2.90, -0.14), (0, 3.07, -0.30), (0, 3.10, -0.50)],
    [0.42, 0.29, 0.17, 0.08, 0],
    sides=8,
)
bind(parts["Trim"], hat, "Head")
bind(parts["Moon"], tube(parts["Moon"], [(0, 2.32, -0.03), (0, 2.40, -0.04)], [0.42, 0.40], sides=8), "Head")  # 帽帶

# ── 法杖：新月托著法球 ─────────────────────────────────────
axis = v(-0.18, 1.0, 0.12).normalized()
side = axis.cross(v(0, 0, 1)).normalized()
top = staff_hand + axis * 1.25
bind(parts["Staff"], tube(parts["Staff"], [along(staff_hand, axis, -0.98), tuple(staff_hand), tuple(top)], [0.035, 0.04, 0.045], sides=6), "Hand.R")
bind(parts["Moon"], tube(parts["Moon"], [along(top, axis, -0.06), along(top, axis, 0.02)], [0.065, 0.06], sides=6), "Hand.R")  # 杖頭的箍
orb = top + axis * 0.3
bind(parts["Orb"], ball(parts["Orb"], tuple(orb), 0.16, axis=tuple(axis)), "Hand.R")
R = 0.27
crescent = []
for deg in range(-140, 141, 20):  # 0° 在法球正下方，開口朝上
    a = math.radians(deg)
    crescent.append(tuple(orb + side * (R * math.sin(a)) - axis * (R * math.cos(a))))
widths = [0.06 * math.cos(math.radians(d) * 0.62) for d in range(-140, 141, 20)]
widths[0] = widths[-1] = 0
bind(parts["Moon"], tube(parts["Moon"], crescent, [(w, 0.03) for w in widths], sides=4, ref=tuple(side.cross(axis))), "Hand.R")

# ── 骨架與動作 ─────────────────────────────────────────────
# 腿藏在袍子裡，關節照一般身形放；鞋尖跟著腳、袍子下半部跟著大腿。
JOINTS = rig.humanoid({"R": STAFF_ARM, "L": SPELL_ARM}, leg_joints())


def actions(skeleton):
    idle = rig.idle(skeleton)
    walk = rig.walk(skeleton, JOINTS, arm_swing=(0.3, 0.6))  # 拿法杖的右手幾乎不擺
    # 普攻：左手往後收、蓄力，再朝前方推出掌心放出法球，法杖跟著往前點。
    # 只動上半身。普攻每 0.65 秒一次，動作約 0.6 秒。
    attack = rig.one_shot(
        skeleton,
        "Attack",
        [
            (0, {}),
            (5, {
                "Spine": rot((X, -6), (Y, 18)),
                "UpperArm.L": rot((X, 10), (Z, 25)),
                "Forearm.L": rot((X, -50)),
                "UpperArm.R": rot((X, -10)),
            }),
            (9, {
                "Spine": rot((X, 14), (Y, -15)),
                "Head": rot((X, -6)),
                "UpperArm.L": rot((X, -80), (Y, -15)),
                "Forearm.L": rot((X, 20)),
                "Hand.L": rot((X, -30)),
                "UpperArm.R": rot((X, -40)),
                "Forearm.R": rot((X, -10)),
                "Hand.R": rot((X, 40)),  # 手腕反轉，法杖保持接近直立
            }),
            (13, {
                "Spine": rot((X, 10), (Y, -12)),
                "UpperArm.L": rot((X, -75), (Y, -15)),
                "Forearm.L": rot((X, 15)),
                "UpperArm.R": rot((X, -32)),
                "Hand.R": rot((X, 30)),
            }),
            (19, {}),
        ],
    )
    return [(idle, [0, 15, 30, 45]), (walk, [0, 2, 4, 6, 8, 10, 12, 14]), (attack, [0, 5, 9, 13])]


finish_hero("hero_mage", parts, PREVIEW_TINTS, bright=("Orb", "Moon"), joints=JOINTS, actions=actions)
