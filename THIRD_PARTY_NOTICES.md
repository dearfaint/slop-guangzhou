# 第三方代码与数据

## 地理数据

© OpenStreetMap contributors, Overture Maps Foundation.

- OpenStreetMap：[Copyright and License](https://www.openstreetmap.org/copyright)，ODbL 1.0。
- Overture Maps Buildings 主题：ODbL 1.0；[官方署名及数据许可清单](https://docs.overturemaps.org/attribution/#buildings)。此项目下载的是 `2026-10-21.0` release，访问日期 2026-10-23。
- 本范围的 Overture 记录包含来自 Qian Shi et al. 的 East Asian Buildings 数据：[A First High-quality Vector Data of Buildings in East Asian Countries Based on a Comprehensive Large-scale Mapping Framework](https://doi.org/10.5281/zenodo.8174931)，Zenodo，22 July 2023，CC BY 4.0（依据 Overture 官方署名清单）。原始记录的 dataset、provider、version 等保留在 `data/raw/overture.geojson`；运行时 manifest 通过来源索引保留精简的溯源字段。
- 本地裁剪、简化、投影、高度补充和分块均是本项目的转换。`data/raw/` 和 `public/data/` 中的衍生地理数据库按 ODbL 1.0 提供；[ODbL 正文](https://opendatacommons.org/licenses/odbl/1-0/)。保留这些来源和署名，并在公开分发衍生数据库时遵守相同方式共享要求。
- 建筑缺失高度时统一估算为 18 m，`hs=estimate:18m`；楼层推算为 3.2 m/层，`hs` 保留原始来源类型。估算不表示可靠实际高度。
- 西塔高度：CTBUH [Guangzhou International Finance Center](https://www.skyscrapercenter.com/building/wd/174)，建筑高度 438.6 m。与 OSM 的 440.2 m 字段存在口径差异；本项目使用 CTBUH 建筑高度并单独标记。东塔 530 m 来自 OSM building:part，并与 [CTBUH](https://www.skyscrapercenter.com/building/id/176) 相符。

页面提供持续可见的 OSM / Overture 署名和数据说明入口。未经外部实测，不宣称公开数据的地图位置、建筑高度和道路属性完全准确。

## 代码与依赖

- Three.js，MIT，Copyright © 2010–2026 three.js authors。2026-10-26 固定到官方提交 `3efcf0f0a3d8ae5107742cba2f7de81d811f130e`（上游 package version 仍为 `0.186.0`）；未改动的库文件打包在 `vendor/three-3efcf0f0a3d8.tgz`，来源和组成见 `vendor/README.md`。许可原文在压缩包和 `node_modules/three/LICENSE`，发行构建保留依赖内嵌许可注释。
- Vite：MIT；TypeScript：Apache-2.0；其他开发依赖遵循各自包内许可与锁定版本。
- 直接复用并适配 [mrdoob/slop-newyork](https://github.com/mrdoob/slop-newyork)，MIT，Copyright (c) 2026 Mr.doob。2026-10-25 获取上游 `main`（查询到提交 `09361be1fe6a2efaee6ef62420a664c677e577b9`）。复用车辆、程序人物、树木、天空／光照、草地／建筑材质、街道设施几何、HUD 样式／图标、音频合成／空间混音及预编译流程；本项目适配广州坐标、路网、碰撞及 UI 文案。许可原文在 `src/vendor/slop-newyork/LICENSE` 和发行资源 `public/licenses/slop-newyork.txt`。未引入纽约地理数据。

数据许可与应用代码许可分别适用；本文件不改变第三方原有许可。

## 原人物资产（保留备份，当前场景不再请求）

- 人体网格、变形目标、53 骨骼／权重及皮肤、头发、眉毛、眼睛、衣服、鞋来自 MakeHuman／MPFB 官方 CC0 数据与 `makehuman_system_assets_cc0.zip`；本项目按配方生成并裁减、着色、制作骨骼动画，短裤、拖鞋及钥匙为本轮衍生制作。城市 GLB 不包含 MPFB 程序代码。
- 离线工具 MPFB v2.0.18 的程序代码为 GPLv3，资产为 CC0，二者许可分别适用。本仓库不分发 MPFB 程序或其下载缓存。发布资产的 CC0 说明附于 `public/data/characters/LICENSE.ASSETS.md`。
- BlessXu Studio 标志由用户提供，用于本项目衣服品牌；不将该品牌标志重新许可为 CC0。


## 珠江公园补充资料（2026-10-26）

`data/raw/pearl-park-osm.xml` 与 `src/pearl-park-data.ts` 包含 OSM API 公园范围快照及其衍生数据，继续按 ODbL 署名与分发。北部溪涧为对广州市林业和园林局公开导览图的空间描绘，未声称是 OSM 原始几何；亭廊造型参考其公开实景照片，来源链接及估算说明见 `docs/data.md`。政府原始图片／PDF 未随本仓库或应用分发。

- 2026-10-27：`src/street-details.ts` 的格栅纹样、LED 扫描／扫光与餐车／遮阳伞组合继续参考上述 Slop New York MIT 源码；中文字图集、广州入口／路名绑定、布点和碰撞由本项目实现。未采用纽约广告画面或纽约入口坐标。
