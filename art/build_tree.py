"""
低多邊形樹木：在 Blender 裡生成、存成 tree.blend，並匯出成遊戲用的 tree.glb。

    blender --background --factory-startup --python art/build_tree.py

整棵樹由腳本決定，不靠手動擺點，所以要調形狀時改這裡的參數重跑即可，
.blend 與 .glb 都是產物。

匯出約定（src/render/trees.ts 依此讀取）：

- 三個物件：`Trunk`、`Canopy`（主樹冠）、`CanopyTop`（副樹冠）。遊戲會各自
  做成一個 InstancedMesh —— 樹幹不隨樹的大小縮放，樹冠才縮放，與原本程式
  生成的樹一致。副樹冠獨立出來，是因為它和原本一樣用固定色，不跟著每棵樹變。
- 原點在地面（y = 0），1 單位 = 1 公尺，Blender 的 +Z 向上（匯出後為 +Y）。
- 顏色不放材質，放在頂點色 COLOR_0 的「明暗」裡：底部偏暗、頂部偏亮。
  真正的色相由遊戲決定（樹幹與副樹冠用固定色，主樹冠用每棵樹的 instanceColor），
  調色盤因此仍集中在程式碼裡。
- 碰撞圓（r = 0.65）由 terrain.ts 決定，不從模型尺寸推算。
"""

import os
import random

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
GLB_OUT = os.path.join(HERE, "..", "src", "assets", "models", "tree.glb")
BLEND_OUT = os.path.join(HERE, "tree.blend")

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
SUBDIVISIONS = 1  # bmesh 的 1 就是正二十面體；2 是 80 面，作為背景太搶戲
JITTER = 0.05  # 頂點隨機起伏，佔半徑的比例
SHADE_LOW = 0.95  # 每團樹冠底部的明暗；1.0 為完全不做漸層
ROOT_FLARE = 1.1  # 樹幹底部外擴的倍率


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def game_to_blender(x, y, z):
    """遊戲（three.js）是 +Y 向上；Blender 是 +Z 向上，glTF 匯出會換回來。"""
    return Vector((x, -z, y))


def shade_by_height(bm, layer, low, high, dark, light):
    """依頂點高度寫入灰階明暗。低多邊形的立體感主要靠這一層。"""
    for face in bm.faces:
        for loop in face.loops:
            h = (loop.vert.co.z - low) / max(1e-6, high - low)
            h = min(1.0, max(0.0, h))
            v = dark + (light - dark) * h
            loop[layer] = (v, v, v, 1.0)


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
    layer = bm.loops.layers.color.new("Col")
    shade_by_height(bm, layer, 0.0, TRUNK["height"], 0.85, 1.0)
    return finish(bm, "Trunk")


def build_blob(name, cx, cy, cz, r):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=SUBDIVISIONS, radius=r)
    for v in bm.verts:
        # 往外或往內推一點，讓每個面的角度不完全規則。
        v.co *= 1.0 + rng.uniform(-JITTER, JITTER)
    layer = bm.loops.layers.color.new("Col")
    shade_by_height(bm, layer, -r, r, SHADE_LOW, 1.0)
    bmesh.ops.translate(bm, verts=bm.verts, vec=game_to_blender(cx, cy, cz))
    return finish(bm, name)


def finish(bm, name):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    # bmesh 建出的顏色層不會自動成為「作用中」，而 glTF 匯出只帶作用中的那一層。
    colors = mesh.color_attributes["Col"]
    mesh.color_attributes.active_color = colors
    mesh.color_attributes.render_color_index = mesh.color_attributes.find("Col")
    for poly in mesh.polygons:
        poly.use_smooth = False  # 平面著色：低多邊形風格
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    # 頂點色要被材質用到，glTF 匯出才會帶上 COLOR_0。
    material = bpy.data.materials.new(name + "Mat")
    nodes = material.node_tree.nodes
    attr = nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    bsdf = nodes.get("Principled BSDF")
    material.node_tree.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    mesh.materials.append(material)
    return obj


def export():
    os.makedirs(os.path.dirname(GLB_OUT), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)
    bpy.ops.export_scene.gltf(
        filepath=GLB_OUT,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_normals=True,
        export_texcoords=False,
        export_materials="EXPORT",
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=False,
    )


def report(objects):
    for obj in objects:
        tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
        dims = obj.dimensions
        print(f"[tree] {obj.name}: {tris} tris, size {dims.x:.2f} x {dims.y:.2f} x {dims.z:.2f}")
    print(f"[tree] wrote {os.path.normpath(GLB_OUT)} ({os.path.getsize(GLB_OUT)} bytes)")


def render_preview(path):
    """選用：渲染一張預覽圖。相機與燈光在匯出之後才加，不會進到 .glb。"""
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "VERTEX"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.film_transparent = True
    cam = bpy.data.objects.new("PreviewCam", bpy.data.cameras.new("PreviewCam"))
    scene.collection.objects.link(cam)
    cam.location = (7.5, -7.5, 5.2)
    direction = Vector((0, 0, 2.6)) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"[tree] preview {path}")


reset_scene()
objs = [build_trunk(), *(build_blob(*blob) for blob in BLOBS)]
export()
report(objs)
if os.environ.get("TREE_PREVIEW"):
    render_preview(os.environ["TREE_PREVIEW"])
