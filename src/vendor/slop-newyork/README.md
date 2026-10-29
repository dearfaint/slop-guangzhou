# Slop New York source snapshot

Source: https://github.com/mrdoob/slop-newyork (MIT, Copyright (c) 2026 Mr.doob).
Fetched 2026-10-25 from main; the upstream commit lookup returned 09361be1fe6a2efaee6ef62420a664c677e577b9.

- actor-models.js: source geometry/materials; plate texture has a DOM-free fallback for geometry tests.
- pedestrians.js: source procedural body, skinning and gait; optional world-space grip targets adapt the existing Guangzhou bicycle; pose buffers enable the renderer's PBO texture fallback for indexed WebGL bone reads.
- trees.js: source atlas, geometry, wind and LOD; immutable geometry/atlas resources shared across fields; DOM-free atlas dimensions for geometry tests.
- tsl-materials.js: source shared shader helpers, curtain wall, tree and grass materials; Manhattan park AO coordinates replaced by a local ambient blend.
- lighting.js: source sky, environment map and cascaded sunlight; starts at midday.
- audio-synthesis.js, audio-events.js, audio-acoustics.js: source audio implementation.
- audio-system.js: source spatial mixer with injected Guangzhou sources; local preference key, default mute, and player horn hook.

HUD styles/icons and compile scheduling are adapted in the project files. Geographic data, collision data and source asset libraries retain their existing separate licenses. See LICENSE and ../../../THIRD_PARTY_NOTICES.md.
