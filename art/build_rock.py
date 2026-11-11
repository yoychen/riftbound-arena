"""
低多邊形石頭 → art/rock.blend、src/assets/models/rock.glb

    blender --background --factory-startup --python art/build_rock.py

共同的匯出約定見 lowpoly.py。這個模型的約定（src/render/props.ts 依此讀取）：

- 一個物件：`Rock`，半徑約 1 的不規則正二十面體，原點在中心。
- 擺放、大小、壓扁比例（1.5 × 0.9 × 1）與朝向都由 terrain.ts 決定，和原本
  程式生成的石頭一樣，所以石頭會落在原本的位置、有原本的大小。
- 石頭沒有碰撞，純裝飾。
"""

import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lowpoly import export, finish, jittered_icosphere, reset_scene, shade_by_height  # noqa: E402

rng = random.Random(115)

# 和樹一樣維持原本的面數（20 面）。石頭比樹冠更該有稜角，起伏可以大一點，
# 但仍然是背景，不要做出裂縫或層理這類細節。
SUBDIVISIONS = 1
JITTER = 0.12
# 石頭大半埋在地面下（中心在 y = 0.6 s、垂直半徑 0.9 s），露出的是上半部，
# 底部壓暗一點讓它看起來「坐」在地上。
SHADE_LOW = 0.88

reset_scene()
bm = jittered_icosphere(1.0, SUBDIVISIONS, JITTER, rng)
shade_by_height(bm, -1.0, 1.0, SHADE_LOW, 1.0)
export("rock", [finish(bm, "Rock")])
