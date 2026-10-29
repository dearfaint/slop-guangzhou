# Three.js reference snapshot

`three-3efcf0f0a3d8.tgz` packages the official Three.js commit
`3efcf0f0a3d8ae5107742cba2f7de81d811f130e` from
https://github.com/mrdoob/three.js/tree/3efcf0f0a3d8ae5107742cba2f7de81d811f130e .

The package contains the unmodified upstream `package.json`, `LICENSE`, `README.md`,
`src/`, `build/`, and `examples/jsm/`. Other repository examples, models and test data
are excluded, as in a normal library distribution. The original MIT license is
inside the archive. pnpm records the archive integrity in its lockfile.

This fixed snapshot includes upstream fixes for sharing instanced shader builds
([#35007](https://github.com/mrdoob/three.js/pull/35007)) and sharing builds across
render call depths ([#35014](https://github.com/mrdoob/three.js/pull/35014)), matching
the rendering behavior needed by Slop New York's tree batches. It avoids a floating
`dev` dependency and does not add a runtime CDN dependency. The upstream package
still reports version `0.186.0`; the commit and lockfile integrity identify it.
