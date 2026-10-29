# 地图数据与重建

运行数据随仓库提供，无需地图 API 密钥。范围为 WGS84 `[113.305, 23.103, 113.337, 23.133]`，原点 `[113.322, 23.119]`。来源、许可及建筑高度估算见 `../THIRD_PARTY_NOTICES.md`，地图来源索引还保存在 `public/data/manifest.json`。

`data/raw/` 仅用于预处理和部分测试，不进入网站构建。`public/data/` 是运行时使用的衍生数据库，包含 36 份地图分块及 gzip 副本、七份静态场景数据和地标清单。`data/landmark-overrides.json` 保留人工地标修正。

## 建筑高度来源统计

统计对象：`public/data/manifest.json` 当前引用的全部 36 个地图分块中的 `buildings[]`，数据生成时间为 `2026-10-28T08:34:33.921689+00:00`。按每条记录的 `hs` 字段分类，总数 3,271；不能将部件记录数当作独立楼栋数或屏幕模型数。百分比按该总数计算，四舍五入至两位小数。

| `hs` 分类 | 数量 | 高度计算或依据 |
| --- | ---: | --- |
| `overture:height` | 28 | Overture 高度字段，含使用该标签的地标修正 |
| `osm:height` | 27 | OSM 高度字段，部分用于补充 Overture 轮廓 |
| `CTBUH:architectural-height` | 1 | 西塔采用 438.6 米建筑高度口径 |
| `reference:CTBUH` | 5 | 参考资料高度 |
| `reference:SOM`、`reference:SkyscraperPage`、`reference:issuer-disclosure`、`reference:KPF`、`reference:engineering-paper`、`reference:Nikken`、`reference:Arup` | 各 1，共 7 | 对应资料高度，详见记录的 `heightReference` |
| `osm:building:levels` | 482 | 来源楼层数 × 3.2 米 |
| `overture:num_floors` | 5 | 来源楼层数 × 3.2 米 |
| `estimate:18m` | 2,590 | 缺少高度依据时统一使用 18 米 |
| `estimate:park-pavilion` | 122 | 公园／绿地区域中符合规则的小型轮廓统一使用 4.5 米 |
| `estimate:22-floors-times-4.5m` | 2 | 夏／秋广场各按 22 层 × 4.5 米，得到 99 米 |
| `estimate:reference-massing` | 2 | 大剧院 43 米、第二少年宫 34.5 米，均为参考形体估算 |
| **合计** | **3,271** | **全部来源和估算记录** |

直接高度字段 55 条，加上参考资料高度 13 条，共 68 条（2.08%）。其余 3,203 条（97.92%）为楼层推算或其他估算。未建立逐栋实测对照，因此**无法给出“经过实测验证的准确高度建筑数”**；68 条只是存在来源高度值或参考资料值，不是准确率指标。

`manifest.stats.sourceHeight=555` 的生成逻辑是“`hs` 不以 `estimate` 开头”，所以会把 487 条楼层推算也算进去；`estimatedHeight=2716` 则只统计 `estimate:*`。这两个旧字段是标签分组，不是“真实／模拟”的直接划分。为保持数据和测试一致，本轮只补充说明，不改写数据或重跑生成器。

计算逻辑见 `scripts/prepare-data.py`：楼层推算采用 3.2 米假定层高，普通源高度经过至少 3 米限制与一位小数舍入；地标覆盖表另行设置高度。公园小型建筑的 4.5 米规则基于轮廓面积小于 800 平方米、质心落在绿地等条件，不能证明这些对象实际都是亭子。`data/landmark-overrides.json` 中既有资料高度，也有明确的 `estimate:*`，不能把全部地标视为真实高度。

此外，51 条地图记录被标记为地标替换范围，其中 20 条是主记录，由专用模型表示；公园、海心沙及地下结构还会隐藏、替换或调整部分几何。因此本表统计的是分块数据的 `h` / `hs`，不覆盖所有手工细节模型，也不承诺所有显示高度与记录中的 `h` 完全相同。

可在仓库根目录重新核对原始标签计数：

```sh
python3 - <<'PYTHON'
from collections import Counter
from pathlib import Path
import json
root = Path('public/data')
manifest = json.loads((root / 'manifest.json').read_text())
counts = Counter()
for tile in manifest['tiles']:
    data = json.loads((root / (tile['id'] + '.json')).read_text())
    counts.update(building['hs'] for building in data['buildings'])
print('建筑／部件记录总数:', sum(counts.values()))
for source, count in sorted(counts.items()):
    print(source, count)
PYTHON
```

## 参照实际地图制作的近似模型

“直接读取数据”“参照地图建模”“缺数据时估算”需要分开理解，不能只划分为真实和虚构两类。例如：

- 花城广场北段树冠范围、草坪保留区域和南段树带依据卫星影像对照布置；单棵树的位置、间距和高度仍为推断。
- 海心沙二号桥及桥北 Y 形接线参考地图与卫星图核对平面、铺装和草坪关系，桥面高程、栏杆等细节仍有估算。
- 南广场连续铺装、下沉车道、洞口和庭院参照源地图及影像建立空间关系；地下深度、坡度、净空和附属构筑物高度不是施工图或高程测绘值。
- 广州大剧院位置及水池边界沿用地图，建筑外皮、屋顶折线和周边场地参照航拍照片近似建模；尺寸、高差与玻璃划分含估算。
- 珠江公园的分区、部分溪涧及亭廊参考公开导览图和实景资料，但不因此成为 OSM 实测几何。

这些是有现实参考的近似表达。没有对全部手工模型建立统一的逐对象来源标签，因此不能可靠给出“多少栋属于参照地图模拟”的独立数量；不将其与上面的高度标签计数混算。一个对象既可能有真实轮廓，又可能有资料高度、估算细节和规则生成材质。高度推算／估算的 97.92% 不代表 97.92% 的对象位置或轮廓是凭空生成的。

## 三维外观与交通的模拟范围

真实数据主要约束建筑轮廓、道路中心线和部分用地／水域。普通建筑由轮廓挤出，外墙、窗格、灯光与材质并非逐栋采集；地标比例、退台和立面细节有参考资料下的近似处理。桥隧坡度、地形、绿化设施、部分公园水系和亭廊也包含人工推断。

车道宽度及数量、信号相位、路口标线和停车位置包含由道路类别、宽度及拓扑推导的规则；交通模拟不等于实测路况或完整驾驶规则。当前几何／通行测试只证明程序规则下的行为，不证明与实地一致。地图快照也不保证反映最新城市建设情况。

## 重建步骤

重建会修改 `public/data/` 及生成的 `src/*-data.ts`，操作前保存现有数据：

```sh
python3 -m venv .venv
.venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python scripts/prepare-data.py
node scripts/prepare-bridge-joints.mjs
.venv/bin/python scripts/prepare-forecourts.py
.venv/bin/python scripts/prepare-street-paving.py
.venv/bin/python scripts/prepare-street-details.py
pnpm test
pnpm build
```

`prepare-data.py` 会调用南中轴及隧道生成器。`prepare-pearl-park.py` 当前与已提供数据不一致，不纳入上面的重建命令。更新后应另行验证地形、道路净空和场景表现；自动化通过不能代替实景核对。

重新下载数据需要网络；使用 `scripts/fetch-data.py` 和 README 中锁定依赖，不随意替换 Overture release。现有原始建筑快照来自 `2026-10-21.0` release。完整数据重建不是公开目录整理的默认验证步骤。

公园部分水系与亭廊参考广州市林业和园林局公开导览及实景资料，形状为近似推断；原始参考图片和 PDF 未随仓库公开。人物实验资源的源制作项目不在此仓库，现有 GLB 可用于测试，但本仓库不提供其完整制作管线。

公园参考资料：[广州市林业和园林局珠江公园介绍](https://lyylj.gz.gov.cn/kpyd/zhzy/content/post_10366783.html)、[官方景区简介](https://lyylj.gz.gov.cn/stly/gyjq/zjgy/jqjj/index.html)。参考资料用于外形和分区核对，不等于实测坐标或可再分发图片许可。
