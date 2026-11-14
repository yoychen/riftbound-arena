"""
四位英雄共用的身體部位與收尾流程。

座標都是遊戲座標（+Y 向上、+Z 朝前、+X 是角色的左手邊 —— 從正面看在畫面
右側）。預設參數就是逐風劍士的身形，其他英雄只改需要不同的地方。

每個部位都拆成獨立的 tube（大腿到腳踝、肩到手腕、頭、髮殼……），之後要綁
骨架做動畫時，每一段屬於哪根骨頭都很清楚。
"""

import math
import os

import rig
from lowpoly import export, finish, game_to_blender, mirror_x, render_preview, reset_scene, shade_by_height, tube

import bmesh  # noqa: E402  （lowpoly 已先載入 bpy）
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

# 整個角色共用一段由下往上的明暗：腳邊偏暗，像環境光遮蔽。
SHADE_LOW, SHADE_HIGH = 0.0, 2.5
SHADE_DARK = 0.78


def v(*p):
    return Vector(p)


def along(origin, direction, t):
    """origin + direction * t，回傳 tube 要的座標 tuple。"""
    p = origin + direction * t
    return (p.x, p.y, p.z)


def new_parts(tints):
    """
    清空場景，替每種顏色開一個 bmesh。要綁骨架時先建好權重層：bmesh 加新的
    資料層會讓既有的頂點參照失效，tube 回傳的頂點就不能再拿來綁權重了。
    """
    reset_scene()
    parts = {name: bmesh.new() for name in tints}
    if rig.enabled():
        for bm in parts.values():
            bm.verts.layers.deform.verify()
    return parts


def legs(pants, boots, hip=(0.19, 0.80, 0.0), knee=(0.22, 0.46, 0.03), ankle=(0.23, 0.22, 0.0),
         radii=(0.15, 0.13, 0.12), boot_r=0.14, toe=(0.11, 0.07)):
    """兩條腿加靴子。boots 傳 None 就只做腿。"""
    right = [hip, knee, ankle]
    for leg in (right, mirror_x(right)):
        side = rig.side_of(leg[0][0])
        rig.bind_limb(pants, tube(pants, leg, list(radii), sides=6), f"Thigh.{side}", f"Shin.{side}")
    if boots is None:
        return
    for s in (1, -1):
        x = ankle[0] * s
        z = ankle[2]
        side = rig.side_of(x)
        boot = tube(
            boots,
            [(x, 0.30, z - 0.02), (x, 0.12, z - 0.01), (x, 0.07, z + 0.2), (x, 0.06, z + 0.28)],
            [boot_r, boot_r, toe, 0],
            sides=6,
        )
        rig.bind_rings(boots, boot, [f"Shin.{side}", f"Foot.{side}", f"Foot.{side}", f"Foot.{side}"])


def leg_joints(hip=(0.19, 0.80, 0.0), knee=(0.22, 0.46, 0.03), ankle=(0.23, 0.22, 0.0)):
    """和 legs() 同樣的參數，回傳 rig.humanoid 要的 {"L": ..., "R": ...}。"""
    right = [hip, knee, ankle]
    return {rig.side_of(leg[0][0]): leg for leg in (right, mirror_x(right))}


def arm(sleeve, skin, path, radii=(0.14, 0.12, 0.11), hand=(0.08, 0.09, 0.06)):
    """一隻手臂（袖子）加手掌，回傳手掌中心（握武器的位置）與前臂方向。"""
    side = rig.side_of(path[0][0])
    rig.bind_limb(sleeve, tube(sleeve, path, list(radii), sides=6), f"UpperArm.{side}", f"Forearm.{side}")
    wrist, elbow = v(*path[-1]), v(*path[-2])
    d = (wrist - elbow).normalized()
    rig.bind(skin, tube(skin, [along(wrist, d, t) for t in (0.02, 0.09, 0.17)], list(hand), sides=6), f"Hand.{side}")
    return wrist + d * 0.09, d


def head(skin, eyes, y=0.0):
    """下巴往頭頂拉成的蛋形頭，加一對眼睛。y 可整顆上下移動。"""
    rig.bind(skin, tube(
        skin,
        [(0, 1.64 + y, 0.04), (0, 1.80 + y, 0.05), (0, 2.00 + y, 0.03), (0, 2.20 + y, 0.0),
         (0, 2.36 + y, -0.02), (0, 2.44 + y, -0.03)],
        [0.16, (0.32, 0.30), (0.40, 0.38), (0.38, 0.36), (0.24, 0.22), 0],
        sides=8,
    ), "Head")
    for s in (1, -1):
        rig.bind(eyes, tube(eyes, [(0.13 * s, 1.95 + y, 0.37), (0.13 * s, 2.06 + y, 0.37)], [(0.035, 0.02)] * 2, sides=4), "Head")


HAIR_SIDES = 8


def hair_shell(hair, hairline=0.36, y=0.0):
    """
    包住頭頂的髮殼。建好之後手動拉點：髮際線前高後低，額頭與眼睛才露得出來，
    後腦則包到脖子。hairline 是前後的高低差（每公尺）。
    """
    shell = tube(
        hair,
        [(0, 2.0 + y, -0.01), (0, 2.24 + y, -0.01), (0, 2.40 + y, -0.03), (0, 2.52 + y, -0.04)],
        [(0.44, 0.42), (0.42, 0.40), (0.30, 0.28), 0],
        sides=HAIR_SIDES,
    )
    for vert in shell[:HAIR_SIDES]:
        front = -vert.co.y  # Blender 的 -Y 是遊戲的 +Z（前方）
        vert.co.z += hairline * front
    rig.bind(hair, shell, "Head")
    return shell


def flat_shape(bm, outline, center, right, up, depth):
    """
    把 2D 輪廓（right/up 平面上的點列）擠出成有厚度的薄片，例如星形胸針。
    擠出方向是 right × up，從 center 往前後各一半。
    """
    right, up = v(*right).normalized(), v(*up).normalized()
    normal = right.cross(up)
    c = v(*center)
    front, back = [], []
    for x, y in outline:
        p = c + right * x + up * y
        front.append(bm.verts.new(game_to_blender(*(p + normal * depth / 2))))
        back.append(bm.verts.new(game_to_blender(*(p - normal * depth / 2))))
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[j], front[i], back[i], back[j]))


def star_outline(r_out, r_in, points=5):
    return [
        ((r_out if i % 2 == 0 else r_in) * math.sin(i * math.pi / points),
         (r_out if i % 2 == 0 else r_in) * math.cos(i * math.pi / points))
        for i in range(points * 2)
    ]


def finish_hero(name, parts, tints, bright=(), joints=None, actions=None):
    """
    寫入明暗、建立物件、匯出 .glb，有設 HERO_PREVIEW 時另外渲染預覽圖。
    bright 裡的部位（金屬、發光物）明暗漸層比較淡。

    綁骨架的英雄另外傳 joints（rig.humanoid 的結果）與 actions(骨架物件)：
    actions 建好每個動作並回傳 [(動作, 預覽影格)]；設 HERO_ANIM_PREVIEW 時把
    這些影格渲染成一張動作檢查圖。
    """
    objects = []
    for part, bm in parts.items():
        dark = 0.9 if part in bright else SHADE_DARK
        shade_by_height(bm, SHADE_LOW, SHADE_HIGH, dark, 1.0)
        if joints:
            rig.check_bound(part, bm)
        objects.append(finish(bm, part, groups=rig.BONES if joints else None))
    sheet = []
    if joints:
        arm = rig.build_armature(joints, objects)
        bpy.context.scene.render.fps = rig.FPS
        sheet = actions(arm)
    export(name, objects)
    total = sum(len(p.vertices) - 2 for o in objects for p in o.data.polygons)
    print(f"[{name}] total {total} tris")
    if os.environ.get("HERO_PREVIEW"):
        render_preview(os.environ["HERO_PREVIEW"], tints)
    if sheet and os.environ.get("HERO_ANIM_PREVIEW"):
        rig.render_action_sheet(os.environ["HERO_ANIM_PREVIEW"], tints, sheet)
