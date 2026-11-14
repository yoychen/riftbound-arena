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

# bpy 要先載入：pip 安裝的 bpy 模組要等它載入後才找得到 bmesh、mathutils。
import bpy  # isort: skip
import bmesh
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


def finish(bm, name, groups=None):
    """
    把 bmesh 變成場景裡的物件，並設定好讓 glTF 匯出帶上頂點色。

    groups：要綁骨架時傳骨頭名稱的清單。bmesh 的 deform 層用的是索引，
    這裡依同樣的順序在物件上建立頂點群組，索引才對得上。
    """
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
    for group in groups or ():
        obj.vertex_groups.new(name=group)
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
        # 有骨架的模型（英雄）一併匯出蒙皮與每個動作；靜態模型不受影響。
        export_skins=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
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


class _Verts(list):
    rings: list


def _as_section(r):
    return (r, r) if isinstance(r, (int, float)) else r


def tube(bm, path, radii, sides=6, ref=(1, 0, 0), phase=0.0, cap=True, loop=False):
    """
    沿著一條路徑「拉」出一段管狀網格：每個路徑點放一圈橢圓截面，再把相鄰
    兩圈連成面。身體、手腳、頭、頭髮、圍巾、劍都是用它一圈一圈拉出來的。

    - path：遊戲座標（+Y 向上、+Z 朝前）的點列。
    - radii：每個點的截面半徑，可以是一個數字或 (a, b) 兩軸。半徑為 0 的
      點收成一個頂點，用來做尖端。
    - ref：截面第一軸 a 的大致方向（遊戲座標），沿路徑以平行移動延續，
      管子轉彎時截面才不會扭轉。扁的截面（圍巾、劍身）靠它決定朝向。
    - phase：截面的起始角度（弧度）。sides=4 時給 pi/4 會得到方形截面。
    - loop：頭尾相接成環（例如圍在脖子上的圍巾），此時不加端蓋。

    回傳這段新建的所有頂點（list）；`.rings` 另外依序列出每一圈的頂點，
    綁骨架時用來決定每一圈跟哪根骨頭走。
    """
    import math

    pts = [game_to_blender(*p) for p in path]
    secs = [_as_section(r) for r in radii]
    n = len(pts)
    tangents = []
    for i in range(n):
        if loop:
            t = pts[(i + 1) % n] - pts[i - 1]
        else:
            t = pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]
        tangents.append(t.normalized())
    a = game_to_blender(*ref)
    rings = []
    new_verts = _Verts()
    new_verts.rings = rings
    for i, (p, t, (ra, rb)) in enumerate(zip(pts, tangents, secs)):
        a = (a - t * a.dot(t)).normalized()
        b = t.cross(a)
        if ra == 0 and rb == 0:
            v = bm.verts.new(p)
            rings.append([v])
            new_verts.append(v)
            continue
        ring = []
        for k in range(sides):
            ang = phase + 2 * math.pi * k / sides
            ring.append(bm.verts.new(p + a * (ra * math.cos(ang)) + b * (rb * math.sin(ang))))
        rings.append(ring)
        new_verts.extend(ring)
    pairs = list(zip(rings, rings[1:]))
    if loop:
        pairs.append((rings[-1], rings[0]))
    for r0, r1 in pairs:
        if len(r0) == 1 and len(r1) == 1:
            continue
        if len(r0) == 1:
            for k in range(sides):
                bm.faces.new((r0[0], r1[k], r1[(k + 1) % sides]))
        elif len(r1) == 1:
            for k in range(sides):
                bm.faces.new((r0[k], r0[(k + 1) % sides], r1[0]))
        else:
            for k in range(sides):
                k1 = (k + 1) % sides
                bm.faces.new((r0[k], r0[k1], r1[k1], r1[k]))
    if cap and not loop:
        if len(rings[0]) > 1:
            bm.faces.new(list(reversed(rings[0])))
        if len(rings[-1]) > 1:
            bm.faces.new(rings[-1])
    return new_verts


def mirror_x(path):
    """把遊戲座標的點列左右鏡像（x 取負），用來做另一邊的手腳。"""
    return [(-x, y, z) for (x, y, z) in path]


def preview_setup(tints, size=360):
    """
    預覽渲染的共用準備：依 tints（物件名稱 → 遊戲裡的 0xRRGGBB）替每個物件
    換上「頂點明暗 × 色相」的材質，模擬遊戲裡的上色；再加上世界光與太陽，
    用 Cycles（CPU）渲染，沒有 GPU 也能跑。只在匯出之後呼叫，不會進到 .glb。
    回傳取景用的 (目標點, 畫框大小)。
    """
    import math

    scene = bpy.context.scene
    for obj in list(scene.objects):
        if obj.name not in tints:
            continue
        hexc = tints[obj.name]
        rgb = [((hexc >> s) & 255) / 255 for s in (16, 8, 0)]
        # sRGB → 線性
        lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
        m = bpy.data.materials.new(obj.name + "Preview")
        nodes, links = m.node_tree.nodes, m.node_tree.links
        bsdf = nodes.get("Principled BSDF")
        bsdf.inputs["Roughness"].default_value = 0.88
        vc = nodes.new("ShaderNodeVertexColor")
        vc.layer_name = "Col"
        mix = nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        links.new(vc.outputs["Color"], mix.inputs["A"])
        mix.inputs["B"].default_value = (*lin, 1.0)
        links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
        obj.data.materials.clear()
        obj.data.materials.append(m)

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 24
    scene.cycles.use_denoising = False
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.render.film_transparent = True
    world = bpy.data.worlds.new("PreviewWorld")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.75, 0.82, 0.8, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9
    scene.world = world
    sun = bpy.data.objects.new("PreviewSun", bpy.data.lights.new("PreviewSun", "SUN"))
    sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(40), 0, math.radians(-30))
    scene.collection.objects.link(sun)

    # 依模型實際大小取景（用靜止姿勢的包圍盒）。
    corners = [o.matrix_world @ Vector(c) for o in scene.objects if o.type == "MESH" for c in o.bound_box]
    lo = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    hi = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    target = Vector((0, 0, (lo.z + hi.z) / 2))
    frame = max(hi.z - lo.z, hi.x - lo.x, hi.y - lo.y) * 1.12
    return target, frame


def render_view(target, frame, yaw, pitch, persp=False):
    """
    從指定角度渲染一格，回傳 PIL 圖。角色朝向遊戲的 +Z，也就是 Blender 的 -Y；
    yaw 0 是正面，persp=True 用遠處長焦近似遊戲裡從高處往下看的鏡頭。
    """
    import math

    from PIL import Image

    scene = bpy.context.scene
    cam = bpy.data.objects.new("PreviewCam", bpy.data.cameras.new("PreviewCam"))
    scene.collection.objects.link(cam)
    dist = 40.0 if persp else 10.0
    y, p = math.radians(yaw), math.radians(pitch)
    offset = Vector((math.sin(y) * math.cos(p), -math.cos(y) * math.cos(p), math.sin(p))) * dist
    cam.location = target + offset
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    if persp:
        cam.data.lens = 420 * 3.4 / frame
    else:
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = frame
    scene.camera = cam
    import tempfile

    tmp = os.path.join(tempfile.gettempdir(), "lowpoly_preview_tile.png")
    scene.render.filepath = tmp
    bpy.ops.render.render(write_still=True)
    tile = Image.open(tmp).convert("RGBA")
    os.remove(tmp)
    bpy.data.objects.remove(cam)
    bg = Image.new("RGBA", tile.size, (96, 116, 104, 255))
    return Image.alpha_composite(bg, tile)


def save_sheet(path, tiles, columns=None):
    from PIL import Image

    columns = columns or len(tiles)
    w, h = tiles[0].size
    rows = (len(tiles) + columns - 1) // columns
    sheet = Image.new("RGBA", (w * columns, h * rows), (0, 0, 0, 255))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % columns) * w, (i // columns) * h))
    sheet.convert("RGB").save(path)
    print(f"[preview] {path}")


def render_preview(path, tints, size=360):
    """多視角預覽圖：前、斜前、側、背，以及遊戲鏡頭角度。"""
    target, frame = preview_setup(tints, size)
    views = [(0, 8, False), (40, 12, False), (90, 0, False), (180, 8, False), (0, 50, True)]
    save_sheet(path, [render_view(target, frame, *view) for view in views])
