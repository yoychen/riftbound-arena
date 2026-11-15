"""
小兵 → art/minion.blend、src/assets/models/minion.glb

    python art/build_minion.py
    HERO_PREVIEW=/path/sheet.png python art/build_minion.py
    HERO_ANIM_PREVIEW=/path/anim.png python art/build_minion.py

共同的匯出約定見 lowpoly.py，骨架與動作見 rig.py。這個模型的約定
（src/render/models.ts 依此讀取）：

- 原點在腳底、朝遊戲的 +Z，身高約 1.45（英雄約 2.5），和原本程式拼出來的小兵
  一樣大，選取光圈不用改。
- 只有兩個物件 —— 場上同時有幾十隻小兵，每多一個物件就多一次繪製：
  - `Team`：上衣、盔纓、盾面。頂點色只帶明暗，隊伍色由遊戲決定，兩隊共用
    同一個模型。
  - `Gear`：皮膚、金屬、皮革、褲子、眼睛。**例外**：這個物件的頂點色直接帶
    顏色（明暗已乘進去），遊戲用白色材質畫，不另外上色。其他模型都把色相
    留在程式裡，這裡為了少一次繪製才把顏色烘進頂點。
- 綁了 rig.py 的骨架，帶 `Idle`、`Walk`、`Attack`。
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rig  # noqa: E402
from hero_common import along, arm, finish_hero, new_parts, v  # noqa: E402
from lowpoly import mirror_x, tube  # noqa: E402
from rig import X, Y, Z, bind, bind_by_height, bind_limb, bind_rings, rot  # noqa: E402

rig.enable()

# Team 的顏色只用來渲染預覽圖（藍隊）；Gear 在預覽與遊戲裡都用白色，顏色在頂點上。
PREVIEW_TINTS = {"Team": 0x428F99, "Gear": 0xFFFFFF}

# Gear 各部位的顏色（烘進頂點色）
SKIN = 0xE2C49A
METAL = 0xB9CFC5
DARK = 0x33403F
LEATHER = 0x6A4A33
EYES = 0x1D2A2C

parts = new_parts(PREVIEW_TINTS)
team, gear = parts["Team"], parts["Gear"]
TORSO = [(0.45, "Hips"), (0.62, "Spine"), (0.82, "Chest")]

# Gear 的頂點 → 顏色。明暗寫好之後再乘上去。
colors = {}


def paint(verts, hexc):
    rgb = tuple(((hexc >> s) & 255) / 255 for s in (16, 8, 0))
    for vert in verts:
        colors[vert] = rgb
    return verts


# ── 腿與靴子 ───────────────────────────────────────────────
RIGHT_LEG = [(0.12, 0.45, 0.0), (0.13, 0.26, 0.02), (0.14, 0.12, 0.0)]  # 這條在 +X，是左腿
for leg in (RIGHT_LEG, mirror_x(RIGHT_LEG)):
    side = rig.side_of(leg[0][0])
    bind_limb(gear, paint(tube(gear, leg, [0.09, 0.08, 0.075], sides=6), DARK), f"Thigh.{side}", f"Shin.{side}")
    x = leg[2][0]
    boot = tube(gear, [(x, 0.17, -0.01), (x, 0.07, 0.0), (x, 0.04, 0.12), (x, 0.035, 0.17)], [0.085, 0.085, (0.07, 0.045), 0], sides=6)
    bind_rings(gear, paint(boot, LEATHER), [f"Shin.{side}", f"Foot.{side}", f"Foot.{side}", f"Foot.{side}"])

# ── 上衣（隊伍色）與腰帶 ───────────────────────────────────
tunic = tube(
    team,
    [(0, 0.30, -0.01), (0, 0.46, 0.0), (0, 0.58, 0.0), (0, 0.76, 0.01), (0, 0.90, 0.0), (0, 0.98, 0.0), (0, 1.02, 0.0)],
    [(0.29, 0.26), (0.25, 0.21), (0.22, 0.19), (0.26, 0.2), (0.28, 0.19), (0.17, 0.14), (0.1, 0.09)],
    sides=8,
)
bind_by_height(team, tunic, TORSO)
belt = tube(gear, [(0, 0.52, 0.0), (0, 0.58, 0.0)], [(0.235, 0.205), (0.23, 0.2)], sides=8)
bind_by_height(gear, paint(belt, LEATHER), TORSO)

# ── 手臂（袖子是隊伍色）─────────────────────────────────────
SWORD_ARM = [(-0.27, 0.90, 0.0), (-0.36, 0.71, 0.05), (-0.38, 0.60, 0.20)]
SHIELD_ARM = [(0.27, 0.90, 0.0), (0.35, 0.71, 0.04), (0.36, 0.60, 0.17)]
hand_verts = len(gear.verts)
sword_hand, _ = arm(team, gear, SWORD_ARM, radii=(0.08, 0.07, 0.065), hand=(0.05, 0.055, 0.035))
shield_hand, _ = arm(team, gear, SHIELD_ARM, radii=(0.08, 0.07, 0.065), hand=(0.05, 0.055, 0.035))
gear.verts.ensure_lookup_table()
paint(gear.verts[hand_verts:], SKIN)  # arm() 剛加進 Gear 的就是兩隻手

# ── 頭、眼睛、尖頂頭盔與隊伍色盔纓 ─────────────────────────
head = tube(
    gear,
    [(0, 0.99, 0.02), (0, 1.07, 0.03), (0, 1.18, 0.02), (0, 1.30, 0.0), (0, 1.38, -0.01), (0, 1.42, -0.01)],
    [0.1, (0.2, 0.19), (0.24, 0.23), (0.22, 0.21), (0.13, 0.12), 0],
    sides=8,
)
bind(gear, paint(head, SKIN), "Head")
for s in (1, -1):
    eye = tube(gear, [(0.08 * s, 1.14, 0.225), (0.08 * s, 1.21, 0.225)], [(0.024, 0.014)] * 2, sides=4)
    bind(gear, paint(eye, EYES), "Head")
HELM_SIDES = 8
helmet = tube(
    gear,
    [(0, 1.16, -0.01), (0, 1.30, -0.01), (0, 1.42, -0.02), (0, 1.52, -0.02)],
    [(0.265, 0.255), (0.25, 0.24), (0.16, 0.155), 0],
    sides=HELM_SIDES,
)
# 手動拉點：前緣拉高到眉毛上方露出眼睛，後緣往下包住後腦。
for vert in helmet[:HELM_SIDES]:
    vert.co.z += 0.22 * (-vert.co.y)
bind(gear, paint(helmet, METAL), "Head")
brim = tube(gear, [(0, 1.235, 0.0), (0, 1.26, 0.0)], [(0.285, 0.275), (0.28, 0.27)], sides=HELM_SIDES)
bind(gear, paint(brim, METAL), "Head")
plume = tube(  # 從頭盔頂往後垂的盔纓：隊伍色，從遠處也認得出是哪一隊
    team,
    [(0, 1.50, 0.04), (0, 1.56, -0.08), (0, 1.52, -0.22), (0, 1.40, -0.32)],
    [(0.035, 0.07), (0.04, 0.08), (0.035, 0.06), 0],
    sides=4,
    ref=(1, 0, 0),
)
bind(team, plume, "Head")

# ── 短劍 ─────────────────────────────────────────────────
axis = v(-0.45, 0.6, 0.65).normalized()
flat = axis.cross(v(0, 0, 1)).normalized()
bind(gear, paint(tube(gear, [along(sword_hand, axis, t) for t in (-0.07, 0.07)], [0.022, 0.022], sides=5), LEATHER), "Hand.R")
guard = sword_hand + axis * 0.08
bind(
    gear,
    paint(tube(gear, [along(guard, flat, -0.09), along(guard, flat, 0.09)], [(0.025, 0.02)] * 2, sides=4, ref=tuple(axis)), METAL),
    "Hand.R",
)
blade = tube(gear, [along(sword_hand, axis, t) for t in (0.09, 0.18, 0.62, 0.72)], [(0.045, 0.012), (0.042, 0.011), (0.036, 0.009), 0], sides=4, ref=tuple(flat))
bind(gear, paint(blade, METAL), "Hand.R")

# ── 圓盾：盾面隊伍色，邊緣與盾心金屬 ───────────────────────
n = v(0.55, 0.05, 0.83).normalized()
c = shield_hand + n * 0.07
bind(gear, paint(tube(gear, [along(c, n, -0.025), along(c, n, 0.02)], [0.27, 0.27], sides=10, ref=(0, 1, 0)), METAL), "Forearm.L")
bind(team, tube(team, [along(c, n, -0.01), along(c, n, 0.04)], [0.24, 0.23], sides=10, ref=(0, 1, 0)), "Forearm.L")
boss = tube(gear, [along(c, n, 0.03), along(c, n, 0.07), along(c, n, 0.1)], [0.07, 0.05, 0], sides=6, ref=(0, 1, 0))
bind(gear, paint(boss, METAL), "Forearm.L")


missing = [vert for vert in gear.verts if vert not in colors]
if missing:
    raise RuntimeError(f"Gear 有 {len(missing)} 個頂點沒有上色")

# ── 骨架與動作 ─────────────────────────────────────────────
legs = {rig.side_of(leg[0][0]): leg for leg in (RIGHT_LEG, mirror_x(RIGHT_LEG))}
JOINTS = rig.humanoid({"R": SWORD_ARM, "L": SHIELD_ARM}, legs, hips_y=0.45, chest_y=0.72, neck_y=0.99, head_top=1.45)


def actions(skeleton):
    idle = rig.idle(skeleton)
    walk = rig.walk(skeleton, JOINTS, arm_swing=(0.4, 0.4), lean=6)
    # 普攻：舉劍到肩上，再往前下方劈。小兵每 1.1 秒打一下，動作約 0.6 秒。
    attack = rig.one_shot(
        skeleton,
        "Attack",
        [
            (0, {}),
            (6, {
                "Spine": rot((Y, -20)),
                "UpperArm.R": rot((Z, -40), (X, -50)),
                "Forearm.R": rot((X, -70)),
                "UpperArm.L": rot((X, -25)),
            }),
            (10, {
                "Spine": rot((X, 14), (Y, 18)),
                "UpperArm.R": rot((X, -75), (Y, 30)),
                "Forearm.R": rot((X, -5)),
                # 劍原本朝上；往前劈到朝前下方，手腕要往前轉很多（同鬥士的戰鎚）
                "Hand.R": rot((X, 150)),
                "UpperArm.L": rot((X, -30)),
            }),
            (13, {
                "Spine": rot((X, 10), (Y, 20)),
                "UpperArm.R": rot((X, -45), (Y, 40)),
                "Hand.R": rot((X, 140)),
                "UpperArm.L": rot((X, -25)),
            }),
            (18, {}),
        ],
    )
    return [(idle, [0, 15, 30, 45]), (walk, [0, 2, 4, 6, 8, 10, 12, 14]), (attack, [0, 6, 10, 13])]


finish_hero("minion", parts, PREVIEW_TINTS, joints=JOINTS, actions=actions, vertex_colors={"Gear": colors})
