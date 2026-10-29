# 架构

Vite + TypeScript + Three.js WebGPURenderer / TSL。`src/main.ts` 负责启动、渲染循环、相机和交互；`ReferenceEnvironment` 负责当前天空与昼夜光照。

`public/data/manifest.json` 描述 36 个 600 m 地图分块，`Tiles` 在启动时加载完整地图。道路、建筑和水域共用 WGS84 转换后的本地米制坐标；X 东、Y 上、Z 南。`WalkWorld` 统一处理通行与高程，`WalkControls` 负责玩家输入。

`UrbanLife` 处理车辆和行人路径，`traffic-model.ts` 处理交通纯逻辑。主场景的车辆、程序人物、树木、天空、材质及音效复用已适配的 Slop New York 模块。原 MakeHuman 路径保留供回归测试，不是当前主场景的人物加载路径。

专用地标、公园、桥隧和楼前景观由独立模块绘制，共用相关布局查询。七份 `public/data/static/` 数据通过 `src/static-data.ts` 加载，Node 测试读磁盘，浏览器通过 Vite base 请求。

Three.js 固定到 `vendor/` 内官方提交快照，原因与来源见 `vendor/README.md`。当前不改换引擎依赖或添加后端。

公开目录不包含私有研究资料、宣传片源文件、依赖环境或原仓库历史；地图与人物测试需要的数据仍随仓库保留。
