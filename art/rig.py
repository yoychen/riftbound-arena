"""
英雄的骨架、蒙皮權重與動作。

骨架是固定的 16 根骨頭（BONES），四位英雄共用同一套名稱，遊戲端才能用同一套
邏輯播放動作。每位英雄只決定關節的位置（humanoid()）與自己的動作。

權重不用 Blender 的自動權重：模型是一段一段 tube 拉出來的，每一段屬於哪根骨頭
很清楚，直接指定。四肢的關節那一圈由上下兩段各帶一半，彎曲時才不會折出裂縫；
身體依高度在 Hips → Spine → Chest 之間漸變。

動作用「遊戲座標的軸 + 角度」描述每根骨頭相對於靜止姿勢的旋轉（rot()）：
- 繞 X（角色的左右軸）：負值讓往下的手腳往前擺，正值讓脊椎往前傾、小腿往後彎。
- 繞 Y（垂直軸）：正值讓正面轉向角色的左手邊（+X）。
- 繞 Z（前後軸）：負值讓右手（-X）往外張開，正值讓左手往外張開。
子骨頭的旋轉疊在父骨頭之上（手臂跟著胸口轉）。

動作名稱（Idle、Walk、Attack）會原樣成為 .glb 裡的動畫名稱，src/render/models.ts
依名稱播放。Walk 另外在骨架上留下 `walk_speed`（公尺／秒），遊戲用它讓腳步
跟上實際的移動速度。
"""

import math

import bpy  # isort: skip
from mathutils import Quaternion, Vector

from lowpoly import game_to_blender

FPS = 30

BONES = [
    "Hips",
    "Spine",
    "Chest",
    "Head",
    "UpperArm.R",
    "Forearm.R",
    "Hand.R",
    "UpperArm.L",
    "Forearm.L",
    "Hand.L",
    "Thigh.R",
    "Shin.R",
    "Foot.R",
    "Thigh.L",
    "Shin.L",
    "Foot.L",
]
PARENTS = {
    "Spine": "Hips",
    "Chest": "Spine",
    "Head": "Chest",
    "UpperArm.R": "Chest",
    "Forearm.R": "UpperArm.R",
    "Hand.R": "Forearm.R",
    "UpperArm.L": "Chest",
    "Forearm.L": "UpperArm.L",
    "Hand.L": "Forearm.L",
    "Thigh.R": "Hips",
    "Shin.R": "Thigh.R",
    "Foot.R": "Shin.R",
    "Thigh.L": "Hips",
    "Shin.L": "Thigh.L",
    "Foot.L": "Shin.L",
}

X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)

# 只有呼叫過 enable() 的英雄腳本才會寫入權重；還沒綁骨架的模型輸出不受影響。
_enabled = False


def enable():
    global _enabled
    _enabled = True


def enabled():
    return _enabled


def side_of(x):
    """角色的右手在 -X。"""
    return "R" if x < 0 else "L"


# ── 權重 ─────────────────────────────────────────────────


def bind(bm, verts, weights):
    """verts 全部綁到 weights（骨頭名稱，或 {骨頭: 權重}）。"""
    if not _enabled:
        return
    if isinstance(weights, str):
        weights = {weights: 1.0}
    layer = bm.verts.layers.deform.verify()
    for vert in verts:
        dv = vert[layer]
        dv.clear()
        for name, w in weights.items():
            dv[BONES.index(name)] = w


def bind_rings(bm, verts, per_ring):
    """tube 的每一圈各自指定權重。"""
    for ring, weights in zip(verts.rings, per_ring):
        bind(bm, ring, weights)


def bind_limb(bm, verts, upper, lower):
    """三個路徑點的手腳：第一圈跟上段、關節那圈各半、最後一圈跟下段。"""
    assert len(verts.rings) == 3, "bind_limb 只處理三個路徑點的 tube"
    bind_rings(bm, verts, [upper, {upper: 0.5, lower: 0.5}, lower])


def bind_by_height(bm, verts, chain):
    """
    依頂點高度在一串骨頭之間漸變，例如 [(0.8, "Hips"), (1.1, "Spine"), (1.42, "Chest")]：
    在 0.8 以下全跟 Hips，0.8 到 1.1 之間由 Hips 漸變到 Spine，依此類推。
    """
    if not _enabled:
        return
    layer = bm.verts.layers.deform.verify()
    for vert in verts:
        y = vert.co.z  # Blender 的 Z 是遊戲的 Y
        dv = vert[layer]
        dv.clear()
        if y <= chain[0][0]:
            dv[BONES.index(chain[0][1])] = 1.0
            continue
        if y >= chain[-1][0]:
            dv[BONES.index(chain[-1][1])] = 1.0
            continue
        for (y0, b0), (y1, b1) in zip(chain, chain[1:]):
            if y0 <= y <= y1:
                t = (y - y0) / (y1 - y0)
                dv[BONES.index(b0)] = 1 - t
                dv[BONES.index(b1)] = t
                break


def check_bound(name, bm):
    """每個頂點都要有權重，漏綁的頂點會在動畫裡留在原地。"""
    layer = bm.verts.layers.deform.verify()
    missing = sum(1 for vert in bm.verts if len(vert[layer]) == 0)
    if missing:
        raise RuntimeError(f"{name} 有 {missing} 個頂點沒有綁到骨頭")


# ── 骨架 ─────────────────────────────────────────────────


def humanoid(arms, legs, hips_y=0.80, chest_y=1.30, neck_y=1.62, head_top=2.30):
    """
    依關節位置算出每根骨頭的頭尾（遊戲座標）。
    arms：{"R": 肩、肘、腕, "L": ...}；legs：{"R": 髖、膝、踝, "L": ...}。
    """
    j = {
        "Hips": ((0, hips_y, 0), (0, hips_y + 0.18, 0)),
        "Spine": ((0, hips_y + 0.18, 0), (0, chest_y, 0)),
        "Chest": ((0, chest_y, 0), (0, neck_y, 0)),
        "Head": ((0, neck_y, 0.02), (0, head_top, 0)),
    }
    for s, (shoulder, elbow, wrist) in arms.items():
        d = (Vector(wrist) - Vector(elbow)).normalized()
        j[f"UpperArm.{s}"] = (shoulder, elbow)
        j[f"Forearm.{s}"] = (elbow, wrist)
        j[f"Hand.{s}"] = (wrist, tuple(Vector(wrist) + d * 0.18))
    for s, (hip, knee, ankle) in legs.items():
        j[f"Thigh.{s}"] = (hip, knee)
        j[f"Shin.{s}"] = (knee, ankle)
        j[f"Foot.{s}"] = (ankle, (ankle[0], ankle[1] - 0.14, ankle[2] + 0.26))
    return j


def build_armature(joints, meshes):
    """建立骨架物件，並把 meshes 綁上去（parent + Armature modifier）。"""
    data = bpy.data.armatures.new("Skeleton")
    arm = bpy.data.objects.new("Skeleton", data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for name in BONES:
        head, tail = joints[name]
        eb = data.edit_bones.new(name)
        eb.head = game_to_blender(*head)
        eb.tail = game_to_blender(*tail)
        eb.roll = 0.0
    for name, parent in PARENTS.items():
        data.edit_bones[name].parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    for obj in meshes:
        obj.parent = arm
        mod = obj.modifiers.new("Armature", "ARMATURE")
        mod.object = arm
    return arm


# ── 動作 ─────────────────────────────────────────────────


def rot(*steps):
    """
    rot((X, -30), (Y, 10))：先繞 X 轉 -30°，再繞 Y 轉 10°（遊戲座標的軸）。
    回傳骨架空間（Blender 座標）的四元數。
    """
    q = Quaternion()
    for axis, deg in steps:
        q = Quaternion(game_to_blender(*axis).normalized(), math.radians(deg)) @ q
    return q


class Action:
    """
    一個動作。key(frame, pose) 打一格關鍵影格：pose 是 {骨頭: rot(...)}，
    沒列到的骨頭回到靜止姿勢；"loc" 是 Hips 相對靜止位置的位移（遊戲座標）。
    每一格都替所有骨頭打鍵，每個姿勢都是完整、明確的。
    """

    def __init__(self, arm, name):
        self.arm, self.name = arm, name
        self.action = bpy.data.actions.new(name)
        arm.animation_data_create()
        arm.animation_data.action = self.action
        self.prev = {}

    def key(self, frame, pose):
        for name in BONES:
            pb = self.arm.pose.bones[name]
            pb.rotation_mode = "QUATERNION"
            rest = pb.bone.matrix_local.to_quaternion()
            q = rest.inverted() @ pose.get(name, Quaternion()) @ rest
            # 四元數 q 與 -q 是同一個旋轉；選和上一格同號的，內插才不會繞遠路。
            if name in self.prev and self.prev[name].dot(q) < 0:
                q.negate()
            self.prev[name] = q.copy()
            pb.rotation_quaternion = q
            pb.keyframe_insert("rotation_quaternion", frame=frame)
        hips = self.arm.pose.bones["Hips"]
        loc = game_to_blender(*pose.get("loc", (0, 0, 0)))
        hips.location = hips.bone.matrix_local.to_quaternion().inverted() @ loc
        hips.keyframe_insert("location", frame=frame)

    def done(self):
        """推進 NLA，讓 glTF 匯出把它當成獨立的動畫。"""
        ad = self.arm.animation_data
        track = ad.nla_tracks.new()
        track.name = self.name
        track.strips.new(self.name, 0, self.action)
        ad.action = None
        return self.action


def loop(arm, name, frames, pose_at, step=2):
    """循環動作：pose_at(相位 0..1) 回傳姿勢，最後一格等於第一格。"""
    act = Action(arm, name)
    for f in range(0, frames + 1, step):
        act.key(f, pose_at((f % frames) / frames))
    return act.done()


def idle(arm, frames=60):
    """站著呼吸：身體微微起伏，手臂跟著擺一點。"""

    def pose(t):
        s = math.sin(t * math.tau)
        return {
            "loc": (0, -0.015 + 0.015 * s, 0),
            "Spine": rot((X, 1.5 * s)),
            "Head": rot((X, -1.5 * s)),
            "UpperArm.R": rot((Z, -2 - 2 * s)),
            "UpperArm.L": rot((Z, 2 + 2 * s)),
        }

    return loop(arm, "Idle", frames, pose)


def _smooth(t):
    return t * t * (3 - 2 * t)


def walk(arm, joints, frames=16, stride=38, duty=0.17, arm_swing=(0.5, 0.9), lean=12):
    """
    有騰空期的跑步循環。

    腿短的角色要跑得快，如果整個循環都有一隻腳貼地，只能靠很高的步頻（看起來像
    碎步）。真實的跑步每隻腳只有一小段時間踩地，其餘時間雙腳騰空，一步可以跨得
    比腿的擺幅遠。這裡照這個節奏做：

    - 每隻腳在一個循環裡踩地 duty 的時間。踩地時腳從大腿往前張 stride 度的位置
      等速掃到往後張 stride 度的位置：這段速度就是身體的速度，腳不會打滑。
      腳步跨多遠由騰空期決定，所以 stride 不必很大，臀部也不會因為腿張太開而
      掉得太低。
    - 其餘時間腳離地往前收：膝蓋先往後彎、往上帶，落地前再伸直。
    - 每一格依大腿、小腿長度（取自 joints）解出髖與膝的角度，讓踩地的腳底剛好
      碰到地面；臀部高度跟著變，騰空時走一道小拋物線。
    - 腳掌保持平貼地面。

    腳往後掃的速度（掃動距離 / 踩地時間）存在骨架的 `walk_speed`（匯出成 glTF
    extras），遊戲依角色實際的移動速度調整播放速度。arm_swing 是 (右手, 左手)
    相對腿的擺幅比例，拿著武器的手可以擺小一點。
    """
    duration = frames / FPS
    hip, knee = Vector(joints["Thigh.L"][0]), Vector(joints["Thigh.L"][1])
    ankle = Vector(joints["Shin.L"][1])
    thigh_len, shin_len = (knee - hip).length, (ankle - knee).length
    sole = ankle.y  # 腳踝離腳底的高度
    rest_hip_y = hip.y
    stance_bend = 12
    reach0 = math.sqrt(thigh_len**2 + shin_len**2 + 2 * thigh_len * shin_len * math.cos(math.radians(stance_bend)))
    sweep = 2 * reach0 * math.sin(math.radians(stride))
    arm["walk_speed"] = sweep / (duty * duration)

    def leg_angles(z, bend):
        """腳踝相對髖關節往前 z 公尺、膝蓋彎 bend 度時，大腿要往前擺幾度，以及髖關節的高度。"""
        b = math.radians(bend)
        reach = math.sqrt(thigh_len**2 + shin_len**2 + 2 * thigh_len * shin_len * math.cos(b))
        line = math.asin(max(-1.0, min(1.0, z / reach)))  # 髖→踝連線偏離垂直的角度
        thigh = line + math.atan2(shin_len * math.sin(b), thigh_len + shin_len * math.cos(b))
        return math.degrees(thigh), reach * math.cos(line) + sole

    def leg(u):
        """
        一隻腳在相位 u（0..1）的狀態：(大腿往前角度, 膝蓋彎曲角度, 踩地時需要的髖高或 None)。
        u 在 [0, duty) 踩地，其餘騰空往前收。
        """
        if u < duty:
            t = u / duty
            z = sweep / 2 - sweep * t
            bend = stance_bend + 14 * math.sin(math.pi * t)  # 踩地中段膝蓋微彎吸收衝擊
            thigh, hip_y = leg_angles(z, bend)
            return thigh, bend, hip_y
        t = (u - duty) / (1 - duty)
        back, _ = leg_angles(-sweep / 2, stance_bend)
        front, _ = leg_angles(sweep / 2, stance_bend)
        thigh = back + (front - back) * _smooth(t) + 22 * math.sin(math.pi * t) ** 2  # 膝蓋往上帶
        bend = stance_bend + 95 * math.sin(math.pi * min(1.0, t * 1.15)) ** 1.5  # 先往後彎、落地前伸直
        return thigh, bend, None

    # 先算一輪臀部高度：踩地時由踩地的腳決定，騰空時在起跳與落地之間走拋物線。
    samples = 240
    heights = []
    for i in range(samples):
        u = i / samples
        hl = leg(u)[2]
        hr = leg((u + 0.5) % 1)[2]
        heights.append(hl if hl is not None else hr)
    for i in range(samples):
        if heights[i] is not None:
            continue
        j0 = i
        while heights[j0 % samples] is None:
            j0 -= 1
        j1 = i
        while heights[j1 % samples] is None:
            j1 += 1
        y0, y1 = heights[j0 % samples], heights[j1 % samples]
        t = (i - j0) / (j1 - j0)
        heights[i] = y0 + (y1 - y0) * t + 0.03 * math.sin(math.pi * t)

    def pose(t):
        p = t * math.tau
        tl, bl, _ = leg(t)
        tr, br, _ = leg((t + 0.5) % 1)
        hip_y = heights[int(t * samples) % samples]
        return {
            "loc": (0, hip_y - rest_hip_y, 0),
            "Hips": rot((Y, 8 * math.sin(p))),
            "Spine": rot((X, lean), (Y, -12 * math.sin(p))),
            "Head": rot((X, -lean * 0.7), (Y, 4 * math.sin(p))),
            "Thigh.L": rot((X, -tl)),
            "Thigh.R": rot((X, -tr)),
            "Shin.L": rot((X, bl)),
            "Shin.R": rot((X, br)),
            # 腳掌平貼地面：抵銷大腿與小腿的轉動
            "Foot.L": rot((X, tl - bl)),
            "Foot.R": rot((X, tr - br)),
            # 手和對側的腳同向擺
            "UpperArm.L": rot((X, -tr * arm_swing[1])),
            "UpperArm.R": rot((X, -tl * arm_swing[0])),
            "Forearm.L": rot((X, -40)),
            "Forearm.R": rot((X, -20)),
        }

    return loop(arm, "Walk", frames, pose, step=1)


def one_shot(arm, name, keys):
    """單次動作：keys 是 [(影格, 姿勢)]，頭尾都應該是靜止姿勢。"""
    act = Action(arm, name)
    for frame, pose in keys:
        act.key(frame, pose)
    return act.done()


def render_action_sheet(path, tints, actions, size=300):
    """
    把每個動作的幾個影格從斜前方渲染成一張圖，用來檢查動作。
    actions：[(動作, [影格...]), ...]，每個動作一列。
    """
    from lowpoly import preview_setup, render_view, save_sheet

    arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
    target, frame = preview_setup(tints, size)
    frame *= 1.15  # 動作會伸出靜止姿勢的包圍盒
    tracks = list(arm.animation_data.nla_tracks)
    for track in tracks:
        track.mute = True
    tiles, columns = [], max(len(frames) for _, frames in actions)
    for action, frames in actions:
        arm.animation_data.action = action
        for f in frames:
            bpy.context.scene.frame_set(f)
            tiles.append(render_view(target, frame, 35, 12))
        while len(tiles) % columns:
            from PIL import Image

            tiles.append(Image.new("RGBA", tiles[0].size, (60, 70, 64, 255)))
    arm.animation_data.action = None
    for track in tracks:
        track.mute = False
    save_sheet(path, tiles, columns)
