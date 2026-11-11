"""
art/ 底下各個模型腳本共用的工具：建網格、寫頂點色明暗、匯出 glTF。

共同的匯出約定（src/render/ 的讀取端依此假設）：

- 1 單位 = 1 公尺；Blender 的 +Z 向上，匯出後為 three.js 的 +Y。
- 平面著色，不帶 UV 與貼圖。
- 顏色不放材質，放在頂點色 COLOR_0 的「明暗」裡（灰階）。真正的色相由
  遊戲決定，調色盤因此集中在程式碼裡。
- 碰撞與擺放由遊戲決定，不從模型尺寸推算。
"""

import os

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(HERE, "..", "src", "assets", "models")


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def game_to_blender(x, y, z):
    """遊戲（three.js）是 +Y 向上；Blender 是 +Z 向上，glTF 匯出會換回來。"""
    return Vector((x, -z, y))


def shade_by_height(bm, low, high, dark, light):
    """依頂點高度寫入灰階明暗：low 處為 dark、high 處為 light。"""
    layer = bm.loops.layers.color.get("Col") or bm.loops.layers.color.new("Col")
    for face in bm.faces:
        for loop in face.loops:
            h = (loop.vert.co.z - low) / max(1e-6, high - low)
            h = min(1.0, max(0.0, h))
            v = dark + (light - dark) * h
            loop[layer] = (v, v, v, 1.0)


def jittered_icosphere(radius, subdivisions, jitter, rng):
    """
    稍微不規則的多面球。

    bmesh 的 subdivisions=1 就是正二十面體（20 面）；每加一級面數乘 4。
    jitter 是頂點往內外推移的最大比例，讓每個面的角度不完全規則。
    """
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=radius)
    for v in bm.verts:
        v.co *= 1.0 + rng.uniform(-jitter, jitter)
    return bm


def finish(bm, name):
    """把 bmesh 變成場景裡的物件，並設定好讓 glTF 匯出帶上頂點色。"""
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


def export(name, objects):
    """存成 art/<name>.blend，並匯出 src/assets/models/<name>.glb。"""
    glb = os.path.normpath(os.path.join(MODELS_DIR, name + ".glb"))
    os.makedirs(MODELS_DIR, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, name + ".blend"))
    bpy.ops.export_scene.gltf(
        filepath=glb,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_normals=True,
        export_texcoords=False,
        export_materials="EXPORT",
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=False,
    )
    # save_as_mainfile 覆寫既有檔案時會留下 .blend1 備份，用不到。
    backup = os.path.join(HERE, name + ".blend1")
    if os.path.exists(backup):
        os.remove(backup)
    for obj in objects:
        tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
        d = obj.dimensions
        print(f"[{name}] {obj.name}: {tris} tris, size {d.x:.2f} x {d.y:.2f} x {d.z:.2f}")
    print(f"[{name}] wrote {glb} ({os.path.getsize(glb)} bytes)")
