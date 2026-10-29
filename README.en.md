# Slop Guangzhou · Zhujiang New Town

[简体中文](README.md) | **English**

A 3D city exploration of Guangzhou’s Zhujiang New Town, built with Three.js, WebGPU / WebGL 2 and real geographic data. Adapted from [Slop New York](https://github.com/mrdoob/slop-newyork).

**[Live demo](https://blessxu.cn/project/zhujiang-city/)** · [GitHub](https://github.com/dearfaint/slop-guangzhou)

## Features

- Huacheng Square, the Pearl River, Haixinsha, Canton Tower, the East and West Towers, Guangzhou Opera House, Zhujiang Park and surrounding city scenery.
- Walking, driving, cycling and helicopter travel, with first-person, third-person and overview cameras.
- Moving traffic and pedestrians, a continuous day/night cycle, synthesized spatial audio and an interactive map.
- OSM / Overture building footprints, roads and water areas. All 36 map tiles are included; running the application requires no online map API or API key.

This city simulation is intended for exploration and creative work. Landmark shapes, missing building heights, facility locations and traffic rules include estimates. It is not a surveyed reconstruction and is unsuitable for navigation or engineering use. Desktop browsers offer the better experience; mobile performance and controls still need testing on physical devices.

## Data accuracy and known limitations

**Real map footprints do not imply an accurate 3D reconstruction. Most building heights are inferred or assigned defaults, so the scene does not reliably reproduce the actual skyline.**

Scene content has three kinds of basis. A single object may combine more than one:

| Basis | Examples in this project | How to interpret it |
| --- | --- | --- |
| Direct use of public data | OSM / Overture building footprints, road centerlines, water boundaries and available attributes | Based on geographic data, which may still contain source, clipping or conversion errors |
| Approximate modeling guided by real maps and imagery | Huacheng Square, Haixinsha bridge approaches, landmark shapes and landscape layouts refined against maps, satellite imagery and photographs | Grounded in real layouts, with inferred dimensions, elevations and details; not survey-grade reconstruction |
| Rule-based estimates where data is missing | Default 18 m buildings, floor counts multiplied by an assumed floor height, generated facilities and traffic behavior | Used to complete the scene; not evidence of actual conditions on site |

“Simulation” does not mean everything is invented. A building can use a mapped footprint while being assigned a default height of 18 m. A bridge approach can follow a real plan layout while its elevation is estimated.

The following counts come from the included **2026-10-28 data snapshot**. They cover **3,271 building / building-part records**, not 3,271 distinct buildings:

| Height basis | Records | Share | Limitation |
| --- | ---: | ---: | --- |
| OSM / Overture height fields | 55 | 1.68% | Source height values; not individually verified by field measurement |
| Heights from architects, CTBUH and other references | 13 | 0.40% | Manually selected reference values; sources and height definitions may differ |
| Source floor count × 3.2 m | 487 | 14.89% | Assumes a uniform floor height; not a measured building height |
| Missing height data, assigned a uniform 18 m | 2,590 | 79.18% | Illustrative only; may substantially understate or overstate actual height |
| Small park buildings assigned 4.5 m by rule | 122 | 3.73% | Inferred from location and footprint size; actual use and height have not been confirmed |
| Landmark-specific estimates | 4 | 0.12% | GT Land Summer and Autumn Plazas at 99 m each, the Opera House at 43 m, and the Second Children’s Palace at 34.5 m are estimates |

Only **68 records (2.08%) use source height values or reference heights**. This does not mean 68 buildings have survey-verified accurate heights. The other **3,203 records (97.92%) use floor-count inference, uniform defaults or other estimates**. The manifest’s `sourceHeight=555` includes 487 records inferred from floor counts: **it does not mean 555 records have real measured heights**. Record counts also differ from the number of distinct rendered models, because dedicated landmarks and other models replace some source records. **The 97.92% figure describes height inference / estimation only; it does not mean those buildings’ mapped positions or footprints are fictional.**

Other known limitations:

- Ordinary buildings are mostly footprint extrusions with procedurally generated facades, windows and materials. Dedicated landmarks also use proportions and details inferred from photographs; they are not scans or BIM models.
- Lanes, traffic lights, crosswalks and stop lines include rule-based inference. Vehicle and pedestrian behavior is simplified and does not reproduce actual traffic rules.
- Bridge and tunnel elevations, terrain, landscape facilities and some park waterways include estimates. Traversal tests do not establish agreement with real-world conditions.
- The Zhujiang Park generator currently differs from the supplied snapshot. Physical mobile-device performance, extended operation and synchronization with the live site have not been verified in this release-preparation work.

See [Data notes (Chinese)](docs/data.md) for fields, counting methods and scope. These figures apply only to the included snapshot and must be recalculated when data changes.

## Scene images

These are existing project renders. The Pearl River night scene is a promotional poster; the cycling and daytime views are frames from the project’s promotional video. Video frames include added captions and color grading. They are not real-world photographs or evidence of a new browser verification run. The estimation and modeling limitations above still apply.

**Pearl River and Canton Tower at night**

![Simulation render: Pearl River and Canton Tower at night](docs/screenshots/night-river.jpg)

**Cycling along the Huacheng Square central axis**

![Promotional video frame: cycling along the Huacheng Square central axis](docs/screenshots/axis-cycling.jpg)

**Daytime view of Zhujiang New Town**

![Promotional video frame: daytime view of Zhujiang New Town](docs/screenshots/city-day.jpg)

## Run locally

Recommended: Node.js 24 and pnpm 11. Data-source checks in the test suite also require Python 3.11 or newer, available as `python3`.

```sh
git clone https://github.com/dearfaint/slop-guangzhou.git
cd slop-guangzhou
pnpm install --frozen-lockfile
pnpm dev --port 5173
```

Open the local URL printed in the terminal. Do not open the application through `file://`. WebGPU requires HTTPS or localhost; the application attempts WebGL 2 when WebGPU is unavailable. Use `?webgl=1` to force WebGL 2.

```sh
pnpm test
pnpm build
pnpm preview --port 4173
```

`pnpm build` includes TypeScript checking. Deploy the entire contents of `dist/`. The relative base supports subdirectories such as `/project/zhujiang-city/`. The demo link points to the deployed site; checks on this source tree do not establish that the deployed site is synchronized with it.

## Controls

- `1 / 2 / 3 / 4`: walk, car, bicycle, helicopter.
- `WASD` / arrow keys: move; `Shift`: accelerate; `Space`: jump while walking; `E / Q`: ascend / descend in the helicopter.
- Drag to look around. `C`: switch first / third person; `V`: cycle city cameras; `M`: expand the map; `H`: hide / restore the interface.
- `N`: toggle audio; `B`: horn. Audio is off by default. The interface provides time-of-day, landmark and travel-mode controls; touch devices show a joystick.

## Project structure

| Directory | Contents |
| --- | --- |
| `src/` | Scene, models, traffic, collisions, interaction and UI; `src/vendor/` retains adapted upstream code and licenses |
| `public/` | Runtime data, brand assets and third-party licenses |
| `data/` | Raw map snapshots and landmark overrides used by preprocessing and some tests |
| `scripts/` | Automated tests and map-processing tools |
| `vendor/` | Distribution archive of the pinned official Three.js commit |
| `docs/` | Architecture, data notes, known issues and proposed work |
| `work/` | Locally generated audit results; ignored by default |

Legacy MakeHuman character assets and modules are retained for existing regression tests. The main scene uses Slop New York’s procedural characters. The character-production laboratory and Blender export script are not included in this repository.

## Data rebuilding and limitations

Rebuilding data is usually unnecessary; run the included snapshot directly. Before changing map data, read the [Data notes (Chinese)](docs/data.md). `prepare-pearl-park.py` currently produces results that differ from the supplied park snapshot; do not overwrite that snapshot until the discrepancy is resolved.

## License and credits

Code is provided under the [MIT License](LICENSE). Reused portions retain the copyright and license of Mr.doob / Slop New York. Three.js and other dependencies retain their respective licenses.

Map data, character assets and brand marks have separate terms; the entire repository must not be treated as MIT-licensed content. Derived OSM / Overture geographic databases are provided under ODbL 1.0. See [Third-party notices (Chinese)](THIRD_PARTY_NOTICES.md) for other attributions and brand restrictions. The code license does not grant trademark rights to the BlessXu Studio name or logo.
