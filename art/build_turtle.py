"""
熔岩龜（中立巨獸）→ art/turtle.blend、src/assets/models/turtle.glb

    blender --background --factory-startup --python art/build_turtle.py

共同的匯出約定見 lowpoly.py。這個模型的約定（src/render/turtle.ts 依此讀取）：

- 尺寸、輪廓對齊原本程式拼出來的熔岩龜：寬約 5、長約 6.5，頭朝遊戲的 +Z。
- 兩個網格，都綁在同一副骨架上：
  - `TurtleBody`：龜殼、腹甲、頭、腳、尾巴。顏色直接畫在頂點色裡。
  - `TurtleLava`：殼上的熔岩結晶與眼睛。遊戲會給它自發光材質。
- 骨架：`Body`（身體與殼）、`Head`（脖子以上，是 Body 的子骨頭）、
  `LegFL` / `LegFR` / `LegBL` / `LegBR`（四隻腳，獨立於 Body，
  身體上下起伏時腳才會穩穩踩在地上）。
- 每個部位 100% 跟著一根骨頭。低多邊形的硬殼生物不需要關節處的平滑彎曲，
  這樣也最省事；之後要做會彎的角色時，再塗漸層權重。
- 三段動畫（Action），名稱就是遊戲裡用的名字：
  - `Idle`：待機，緩慢呼吸、點頭，2 秒循環。
  - `Walk`：爬行，對角的腳一起前後擺，1 秒循環。
  - `Attack`：前半身抬起再重重砸下，0.75 秒，播一次。
"""

import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lowpoly import combine, export, finish, game_to_blender, jittered_icosphere, paint, reset_scene  # noqa: E402

rng = random.Random(2700)
FPS = 24

ROCK = 0x655548
BELLY = 0x8a6d55
SKIN = 0x977155
LEG = 0x7f6b52
LAVA = 0xffa455
EYE = 0xffcc74

# 龜殼是一個壓扁的橢球：中心高度、左右半寬、前後半長、高度。
SHELL = dict(y=1.6, rx=2.45, rz=2.9, ry=1.7)
LEGS = {
    "LegFL": (1.75, 1.75),
    "LegFR": (-1.75, 1.75),
    "LegBL": (1.75, -1.75),
    "LegBR": (-1.75, -1.75),
}


def g(x, y, z):
    return game_to_blender(x, y, z)


def cone(r_bottom, r_top, height, sides, base, direction=(0, 1, 0)):
    """從 base 沿 direction（遊戲座標）長出的錐／柱。"""
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, segments=sides, radius1=r_bottom, radius2=r_top, depth=height
    )
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector((0, 0, height / 2)))
    axis = g(*direction).normalized()
    rot = Vector((0, 0, 1)).rotation_difference(axis).to_matrix()
    bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector((0, 0, 0)), matrix=rot)
    bmesh.ops.translate(bm, verts=bm.verts, vec=g(*base))
    return bm


def blob(radius, scale, center, jitter=0.04, subdivisions=1):
    """不規則多面球，scale 為遊戲座標的 (x, y, z)。"""
    bm = jittered_icosphere(radius, subdivisions, jitter, rng)
    sx, sy, sz = scale
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sz  # 遊戲 z → Blender y
        v.co.z *= sy  # 遊戲 y → Blender z
    bmesh.ops.translate(bm, verts=bm.verts, vec=g(*center))
    return bm


def shell_height(x, z):
    """龜殼表面在 (x, z) 的高度，用來把結晶插在殼上。"""
    k = 1 - (x / SHELL["rx"]) ** 2 - (z / SHELL["rz"]) ** 2
    return SHELL["y"] + SHELL["ry"] * math.sqrt(max(0.0, k))


def build_shell():
    bm = jittered_icosphere(1.0, 2, 0.04, rng)
    for v in bm.verts:
        # 底部切平，龜殼才有「邊緣」，而不是一顆蛋。
        v.co.z = max(v.co.z, -0.15)
        v.co.x *= SHELL["rx"]
        v.co.y *= SHELL["rz"]
        v.co.z *= SHELL["ry"]
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector((0, 0, SHELL["y"])))
    paint(bm, ROCK, SHELL["y"], SHELL["y"] + SHELL["ry"], dark=0.72)
    return bm


def build_crystals():
    parts = []
    spots = [(math.sin(a) * 1.5, math.cos(a) * 1.8) for a in (i / 7 * math.tau for i in range(7))]
    for x, z in spots:
        y = shell_height(x, z)
        # 沿殼面往外斜一點，看起來是從殼裡長出來的。
        normal = Vector((x / SHELL["rx"] ** 2, (y - SHELL["y"]) / SHELL["ry"] ** 2, z / SHELL["rz"] ** 2))
        d = (Vector((0, 1, 0)) * 0.65 + normal.normalized() * 0.35).normalized()
        bm = cone(0.42, 0.0, 1.1, 5, (x, y - 0.35, z), tuple(d))
        paint(bm, LAVA, y - 0.35 + 1.6, y + 1.6, dark=0.75)
        parts.append(bm)
    top = shell_height(0, 0)
    bm = cone(0.55, 0.0, 1.35, 5, (0, top - 0.4, 0))
    paint(bm, LAVA, top + 1.2, top + 2.5, dark=0.75)
    parts.append(bm)
    return parts


def build_body():
    belly = cone(2.3, 2.15, 0.35, 10, (0, 1.2, 0))
    for v in belly.verts:
        v.co.y *= 1.2  # 前後拉長，貼合龜殼
    paint(belly, BELLY, 1.2, 1.55, dark=0.85)

    tail = cone(0.32, 0.0, 0.95, 4, (0, 1.0, -2.75), (0, -0.25, -1))
    paint(tail, LEG, 0.8, 1.3, dark=0.85)

    neck = cone(0.55, 0.5, 0.9, 6, (0, 1.2, 1.9), (0, 0.1, 1))
    paint(neck, SKIN, 0.8, 1.6, dark=0.8)
    head = blob(0.85, (1.0, 0.85, 1.15), (0, 1.3, 3.0))
    paint(head, SKIN, 0.6, 2.0, dark=0.8)

    parts = [(build_shell(), "Body"), (belly, "Body"), (tail, "Body"), (neck, "Head"), (head, "Head")]
    for bone, (x, z) in LEGS.items():
        leg = cone(0.62, 0.55, 1.05, 6, (x, 0, z))
        paint(leg, LEG, 0.0, 1.05, dark=0.75)
        parts.append((leg, bone))
    return parts


def build_lava():
    parts = [(bm, "Body") for bm in build_crystals()]
    for side in (-1, 1):
        eye = blob(0.15, (1, 1, 1), (side * 0.42, 1.52, 3.62), jitter=0.0)
        paint(eye, EYE, 0, 1)
        parts.append((eye, "Head"))
    return parts


def build_armature():
    # 骨架叫 Skeleton：遊戲的 SkeletalAnimator（render/skeletal.ts）從這裡讀 walk_speed。
    arm = bpy.data.objects.new("Skeleton", bpy.data.armatures.new("TurtleRig"))
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    bones = arm.data.edit_bones

    def bone(name, head, parent=None):
        b = bones.new(name)
        b.head = g(*head)
        # 每根骨頭都朝 Blender 的 +Y：靜止姿勢的旋轉因此是單位矩陣，
        # 動畫裡繞 X 轉就是前後俯仰、繞 Y 轉就是左右側傾，不用換算骨頭的座標軸。
        b.tail = b.head + Vector((0, 0.4, 0))
        b.roll = 0
        if parent:
            b.parent = bones[parent]
        return b

    bone("Body", (0, 1.4, 0))
    bone("Head", (0, 1.25, 2.0), parent="Body")
    for name, (x, z) in LEGS.items():
        bone(name, (x, 1.0, z))
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def skin(name, parts, arm):
    bm, groups = combine(parts)
    obj = finish(bm, name)
    for bone, indices in groups.items():
        obj.vertex_groups.new(name=bone).add(indices, 1.0, "REPLACE")
    obj.parent = arm
    obj.modifiers.new("Armature", "ARMATURE").object = arm
    return obj


# ---- 動畫 -------------------------------------------------------------------

BONES = ["Body", "Head", *LEGS]


def clip(arm, name, keys, length):
    """
    keys: {骨頭: [(秒, 旋轉(x, y, z), 位移(x, y, z)), ...]}，Blender 骨頭空間。
    沒列出的骨頭會在頭尾各打一個靜止關鍵影格，切換動畫時才不會殘留上一段的姿勢。
    """
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    arm.animation_data_create()
    arm.animation_data.action = action
    for bone in BONES:
        pb = arm.pose.bones[bone]
        pb.rotation_mode = "XYZ"
        frames = keys.get(bone) or [(0, (0, 0, 0), (0, 0, 0)), (length, (0, 0, 0), (0, 0, 0))]
        for t, rot, loc in frames:
            pb.rotation_euler = rot
            pb.location = loc
            pb.keyframe_insert("rotation_euler", frame=round(t * FPS) + 1)
            pb.keyframe_insert("location", frame=round(t * FPS) + 1)
    return action


Z = (0, 0, 0)


def idle(arm):
    clip(
        arm,
        "Idle",
        {
            # 慢慢呼吸：身體微微起伏。
            "Body": [(0, Z, Z), (1, Z, (0, 0, 0.06)), (2, Z, Z)],
            # 點頭：脖子往上抬一點又放下。
            "Head": [(0, Z, Z), (1, (-0.09, 0, 0), Z), (2, Z, Z)],
        },
        2,
    )


def walk(arm):
    swing = 0.38
    forward = (swing, 0, 0)
    back = (-swing, 0, 0)
    # 對角的兩隻腳同時往同一個方向擺，就是四腳動物爬行的步態。
    pair_a = [(0, forward, Z), (0.5, back, Z), (1, forward, Z)]
    pair_b = [(0, back, Z), (0.5, forward, Z), (1, back, Z)]
    clip(
        arm,
        "Walk",
        {
            "LegFL": pair_a,
            "LegBR": pair_a,
            "LegFR": pair_b,
            "LegBL": pair_b,
            # 每踏一步身體起伏一次、左右晃一下。
            "Body": [
                (0, Z, Z),
                (0.25, (0, 0.045, 0), (0, 0, 0.08)),
                (0.5, Z, Z),
                (0.75, (0, -0.045, 0), (0, 0, 0.08)),
                (1, Z, Z),
            ],
            "Head": [(0, Z, Z), (0.25, (0.05, 0, 0), Z), (0.5, Z, Z), (0.75, (0.05, 0, 0), Z), (1, Z, Z)],
        },
        1,
    )


def attack(arm):
    clip(
        arm,
        "Attack",
        {
            # 前半身抬起（繞 X 負向 = 前端往上），再重重砸下，最後回正。
            "Body": [
                (0, Z, Z),
                (0.3, (-0.24, 0, 0), (0, 0, 0.3)),
                (0.45, (0.08, 0, 0), (0, 0, -0.05)),
                (0.75, Z, Z),
            ],
            "Head": [(0, Z, Z), (0.3, (-0.22, 0, 0), Z), (0.45, (0.28, 0, 0), Z), (0.75, Z, Z)],
            # 前腳跟著抬起，砸下時踩回地面。
            "LegFL": [(0, Z, Z), (0.3, (-0.3, 0, 0), (0, 0, 0.25)), (0.45, Z, Z), (0.75, Z, Z)],
            "LegFR": [(0, Z, Z), (0.3, (-0.3, 0, 0), (0, 0, 0.25)), (0.45, Z, Z), (0.75, Z, Z)],
        },
        0.75,
    )


reset_scene()
bpy.context.scene.render.fps = FPS
rig = build_armature()
body = skin("TurtleBody", build_body(), rig)
lava = skin("TurtleLava", build_lava(), rig)
idle(rig)
walk(rig)
attack(rig)
# 匯出時骨架停在靜止姿勢，模型才不會帶著最後一段動畫的姿勢當作預設。
rig.animation_data.action = None
for pb in rig.pose.bones:
    pb.rotation_euler = Z
    pb.location = Z
# 動畫原速對應的移動速度（公尺／秒）。Walk 是照巨獸的移動速度（core/entities.ts
# 的 boss speed 3）調出來的節奏，所以就填 3：遊戲依實際速度等比例加快或放慢。
rig["walk_speed"] = 3.0
export("turtle", [body, lava])
