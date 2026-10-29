# Slop Guangzhou — Agent Instructions

- 默认使用中文沟通；先阅读 README、相关代码和文档，再修改。
- 使用 pnpm 和现有锁文件；不复制 node_modules、虚拟环境或外部仓库历史。
- 修改前检查 git status / git diff，保留用户未提交的改动。
- 仅修改任务所需内容；未经要求不 commit、push、创建分支或发布。
- 验证行为改动时运行相关测试；交付前执行 pnpm test 和 pnpm build，区分自动化、本地浏览器和生产验证。
- 不将密钥、Cookie、个人信息、开发者绝对路径或下载的研究资料加入仓库。
- 地图坐标使用现有本地米制坐标和共享碰撞查询；前端尺寸与高程估算需如实说明。
- 保留第三方署名及许可；代码、地图数据库、模型与品牌标志分别适用各自许可。
- src/*-data.ts 和 public/data/static/ 为生成数据，按对应脚本更新，不手改加载模块。
- prepare-pearl-park.py 与已提供公园快照存在差异，未经排查不要覆盖。
- 仅在相关内容实质变化时更新 README、CHANGELOG、docs/architecture.md、docs/issues.md 或 docs/roadmap.md。
