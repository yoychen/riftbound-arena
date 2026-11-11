"""
低多邊形樹木 → art/tree.blend、src/assets/models/tree.glb

    blender --background --factory-startup --python art/build_tree.py

整棵樹由腳本決定，不靠手動擺點，所以要調形狀時改這裡的參數重跑即可，
.blend 與 .glb 都是產物。共同的匯出約定見 lowpoly.py。

這個模型的約定（src/render/trees.ts 依此讀取）：

- 三個物件：`Trunk`、`Canopy`（主樹冠）、`CanopyTop`（副樹冠）。遊戲會各自
  做成一個 InstancedMesh —— 樹幹不隨樹的大小縮放，樹冠才縮放，與原本程式
  生成的樹一致。副樹冠獨立出來，是因為它和原本一樣用固定色，不跟著每棵樹變。
- 原點在地面（y = 0）。
- 碰撞圓（r = 0.65）由 terrain.ts 決定。
"""

import os
import random
import sys

import bmesh
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lowpoly import export, finish, game_to_blender, jittered_icosphere, reset_scene, shade_by_height  # noqa: E402

# 固定亂數：每次重跑得到同一棵樹。
rng = random.Random(171)

# 尺寸對齊原本 terrain.ts 在 s = 1 時的樹：
# 樹幹 cyl(0.23, 0.4, 2) 置於 y = 1；主樹冠半徑 1.9 置於 y = 2.8；
# 副樹冠半徑 1.4 置於 (0.6, 4, 0.2)。
TRUNK = dict(r_bottom=0.4, r_top=0.23, height=2.0, sides=5)
#
# 風格刻意貼近原本：樹是背景，細節太多會搶走角色與技能的注意力。
# 所以樹冠維持兩團正二十面體（各 20 面），只加一點點起伏打破完全對稱。
# (物件名稱, 中心 x, y(高), z, 半徑) —— 遊戲座標，寫入時轉成 Blender 座標
BLOBS = [
    ("Canopy", 0.0, 2.8, 0.0, 1.9),
    ("CanopyTop", 0.6, 4.0, 0.2, 1.4),
]
SUBDIVISIONS = 1  # 正二十面體；2 是 80 面，作為背景太搶戲
JITTER = 0.05  # 頂點隨機起伏，佔半徑的比例
SHADE_LOW = 0.95  # 每團樹冠底部的明暗；1.0 為完全不做漸層
ROOT_FLARE = 1.1  # 樹幹底部外擴的倍率


def build_trunk():
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        segments=TRUNK["sides"],
        radius1=TRUNK["r_bottom"],
        radius2=TRUNK["r_top"],
        depth=TRUNK["height"],
    )
    # create_cone 以中心為原點，往上移讓底部貼地。
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector((0, 0, TRUNK["height"] / 2)))
    # 底部稍微外擴成樹根，打破完美的錐形。
    for v in bm.verts:
        if v.co.z < 0.01:
            v.co.x *= ROOT_FLARE
            v.co.y *= ROOT_FLARE
    shade_by_height(bm, 0.0, TRUNK["height"], 0.85, 1.0)
    return finish(bm, "Trunk")


def build_blob(name, cx, cy, cz, r):
    bm = jittered_icosphere(r, SUBDIVISIONS, JITTER, rng)
    shade_by_height(bm, -r, r, SHADE_LOW, 1.0)
    bmesh.ops.translate(bm, verts=bm.verts, vec=game_to_blender(cx, cy, cz))
    return finish(bm, name)


reset_scene()
export("tree", [build_trunk(), *(build_blob(*blob) for blob in BLOBS)])
