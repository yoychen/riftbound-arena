"""
防禦塔與核心 → art/tower.blend、art/core.blend、src/assets/models/{tower,core}.glb

    blender --background --factory-startup --python art/build_structures.py

共同的匯出約定見 lowpoly.py。這兩個模型的約定（src/render/structures.ts 依此讀取）：

- 每個模型三個物件：
  - `TowerBody` / `CoreBody`：石造的本體，真正的顏色畫在頂點色裡。
  - `TowerCrystal` / `CoreCrystal`：頂端的水晶，頂點色只帶明暗（白色），
    隊伍色由遊戲的材質決定。原點在水晶中心，遊戲會讓它繞自己的 Y 軸轉、
    上下浮動。核心的水晶旁有兩顆小碎晶，跟著主水晶一起轉，看起來像在繞行。
  - `TowerGlow` / `CoreGlow`：不會動、但也發隊伍色光的部分（塔身的窗縫、
    核心石柱上的光環與底座的碎晶），同樣只帶明暗。
- 原點在地面中心。佔地與高度和原本程式拼的版本相近（塔半徑 1.8、高約 5.2；
  核心半徑 2.7、高約 5.8），所以血條高度與碰撞都不用改。
- 碰撞由遊戲決定，不從模型推算。
"""

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lowpoly import box, colored, combine, cone, export, finish, g, paint, bounds_z, reset_scene  # noqa: E402

# 原本的石材配色，深淺分層：越下面越暗、越上面越亮。
BASE = 0x65796F
STONE = 0x879A8B
TRIM = 0x9CAB94
LIGHT = 0xB9C5AA
BAND = 0x56675F
BRONZE = 0xB59A5C


def merged(name, parts):
    """把零件合成一個物件（不分骨頭）。"""
    bm, _ = combine([(p, "all") for p in parts])
    return finish(bm, name)


def crystal(name, parts, center):
    """發光的水晶：零件以水晶中心為原點建好，再把物件放到 center。"""
    bm, _ = combine([(p, "all") for p in parts])
    low, high = bounds_z(bm)
    paint(bm, 0xFFFFFF, low, high, 0.62)
    obj = finish(bm, name)
    obj.location = g(*center)
    return obj


def white(bm, dark=0.72):
    """發光零件只帶明暗。"""
    return colored(bm, 0xFFFFFF, dark)


def bipyramid(radius, up, down, sides, center=(0, 0, 0)):
    """上下兩個尖錐對接成的水晶。"""
    x, y, z = center
    return [cone(radius, 0, up, sides, (x, y, z)), cone(radius, 0, down, sides, (x, y, z), (0, -1, 0))]


def hex_point(radius, angle_deg, y):
    """六角柱的頂點方向：Blender 的 create_cone 第一個頂點在 +X，逆時針排列。"""
    a = math.radians(angle_deg)
    return (radius * math.cos(a), y, -radius * math.sin(a))


# ---- 防禦塔 -----------------------------------------------------------------


def tower():
    body = []
    # 兩層台座
    body.append(colored(cone(1.8, 1.65, 0.3, 8, (0, 0, 0)), BASE, 0.8))
    body.append(colored(cone(1.45, 1.35, 0.25, 8, (0, 0.3, 0)), 0x72857A, 0.85))
    # 往上收窄的六角塔身，中段一圈深色石箍
    body.append(colored(cone(1.05, 0.78, 2.5, 6, (0, 0.55, 0)), STONE, 0.74))
    body.append(colored(cone(0.97, 0.95, 0.16, 6, (0, 1.72, 0)), BAND, 0.9))
    # 三根斜靠在塔腳的扶壁，對準六角柱的稜
    for angle in (0, 120, 240):
        x, _, z = hex_point(1.0, angle, 0)
        body.append(colored(box((0.34, 1.0, 0.55), (x, 1.0, z), (x, -0.55, z)), TRIM, 0.78))
    # 塔頂外擴的托座與平台，六個城垛
    body.append(colored(cone(0.8, 1.2, 0.42, 6, (0, 3.05, 0)), LIGHT, 0.8))
    body.append(colored(cone(1.2, 1.2, 0.12, 6, (0, 3.47, 0)), TRIM, 0.9))
    for angle in range(0, 360, 60):
        x, _, z = hex_point(1.02, angle, 0)
        body.append(colored(box((0.34, 0.34, 0.3), (x, 3.76, z), (x, 0, z)), LIGHT, 0.85))
    # 三根青銅爪托著水晶
    for angle in (30, 150, 270):
        x, _, z = hex_point(0.36, angle, 0)
        body.append(colored(cone(0.12, 0, 0.78, 4, (x, 3.55, z), (x * 1.4, 1, z * 1.4)), BRONZE, 0.75))

    # 塔身三道朝外的窗縫，透出隊伍色的光
    glow = []
    for angle in (90, 210, 330):
        x, _, z = hex_point(0.76, angle, 0)
        glow.append(white(box((0.24, 0.62, 0.16), (x, 2.3, z), (x, 0, z)), 0.85))

    objects = [
        merged("TowerBody", body),
        merged("TowerGlow", glow),
        crystal("TowerCrystal", bipyramid(0.55, 0.85, 0.62, 6), (0, 4.4, 0)),
    ]
    export("tower", objects)


# ---- 核心 -------------------------------------------------------------------


def core():
    body, glow = [], []
    # 兩層十角形的祭壇台座
    body.append(colored(cone(2.7, 2.55, 0.4, 10, (0, 0, 0)), 0x627970, 0.8))
    body.append(colored(cone(2.3, 2.15, 0.35, 10, (0, 0.4, 0)), 0x71877C, 0.85))
    # 五根微微往內傾的方尖石柱，頂上一塊蓋石，中段一圈發光的符文環
    for i in range(5):
        a = i / 5 * math.tau
        x, z = math.sin(a) * 1.8, math.cos(a) * 1.8
        d = (-x * 0.06, 1, -z * 0.06)
        base = (x, 0.75, z)
        body.append(colored(cone(0.34, 0.2, 2.6, 4, base, d), TRIM, 0.72))
        length = math.sqrt(sum(c * c for c in d))
        top = tuple(b + c / length * 2.6 for b, c in zip(base, d))
        body.append(colored(box((0.44, 0.14, 0.44), top), LIGHT, 0.85))
        ring = tuple(b + c / length * 1.15 for b, c in zip(base, d))
        glow.append(white(cone(0.315, 0.305, 0.13, 4, ring, d), 0.9))
    # 中央的六角基座與青銅邊
    body.append(colored(cone(1.05, 0.75, 0.55, 6, (0, 0.75, 0)), STONE, 0.75))
    body.append(colored(cone(0.82, 0.82, 0.1, 6, (0, 1.3, 0)), BRONZE, 0.85))
    # 基座邊緣冒出的六根小碎晶
    for angle in range(0, 360, 60):
        x, _, z = hex_point(0.62, angle + 30, 0)
        glow.append(white(cone(0.15, 0, 0.6, 4, (x, 1.3, z), (x, 1, z)), 0.7))

    # 浮在基座上的主水晶，加兩顆繞著它轉的小碎晶
    # 主水晶的腰比石柱頂高，碎晶繞行的高度也在石柱之上，轉起來不會穿過石柱。
    shards = bipyramid(1.3, 2.4, 1.7, 6)
    shards += bipyramid(0.3, 0.52, 0.4, 4, (1.95, 0.6, 0.2))
    shards += bipyramid(0.24, 0.42, 0.32, 4, (-1.4, 1.1, 1.05))

    objects = [
        merged("CoreBody", body),
        merged("CoreGlow", glow),
        crystal("CoreCrystal", shards, (0, 3.4, 0)),
    ]
    export("core", objects)


random.seed(7)
reset_scene()
tower()
reset_scene()
core()
