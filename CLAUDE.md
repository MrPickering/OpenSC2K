# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

OpenSC2K is a browser remake of SimCity 2000 built on Phaser 3 (WebGL). Today it can import and render `.sc2` cities; the simulation is not implemented. The README says a refactor is in progress and much existing functionality is broken, so don't assume an unused module works.

## Commands

- `yarn install`: installs dependencies. `bmp-js`, `@vingle/bmp-js` and `dat.gui` come from the `rage8885/*` GitHub forks, so the install needs access to codeload.github.com.
- `yarn dev`: starts webpack-dev-server on http://localhost:3000. This is the only package script. There is no production build script.
- `npx eslint src` (or `npx eslint src/path/to/file.js`): runs lint. ESLint is not wired into the webpack build, so it only runs when called directly.
- There is no test suite. To check a change, run the app and look at it.
- The locked toolchain is webpack 4.29 with babel-loader 8.0.5. Both hash with md4, which Node ≥17 rejects (`ERR_OSSL_EVP_UNSUPPORTED`). On a newer Node, run with `NODE_OPTIONS=--openssl-legacy-provider`.

### Required assets (never commit)

- The game needs `LARGE.DAT` and `PAL_MSTR.BMP` from SimCity 2000 Special Edition (Win95) in `assets/import/`. The directory is gitignored because the files are copyrighted.
- The dev server's `contentBase` is the repo root, so the game fetches assets from `/assets/...` at runtime.
- Only `assets/cities/NEWCITY.SC2` and `TESTCITY.SC2` are tracked.
- To load a different city, edit `this.file` in `loadDefaultCity()` in `src/city/load.js`. Many of the cities listed there (`test/rotation/*`, `test/scenario/*`, etc.) are not in the repo.

## Architecture

### The scene is the global context

- `src/index.js` creates a single Phaser scene, `world` (`src/world.js`).
- Almost every class takes `options.scene` and reaches shared state through it:
  - `scene.palette`
  - `scene.artwork`
  - `scene.tiles`: the tile metadata array
  - `scene.importedData`: the parsed city
  - `scene.city` (with `scene.city.map`)
  - `scene.viewport`
  - `scene.debug`
- Code reads paths like `this.cell.scene.city.map.cells[x][y]` freely, so construction order matters.

### Boot sequence (`src/world.js`)

1. `preload()` loads the two binary SC2K files. On the loader's `postprocess` event it:
   - parses the palette (`src/import/palette.js`)
   - decodes `LARGE.DAT` (`src/import/artwork.js`)
   - constructs `city`
2. `artwork` decodes each image's run-length rows into palette indexes. It then packs every frame into a single 4096×4096 canvas texture atlas, `CONST.TILE_ATLAS`.
   - Frame names are `<imageName>_<frameIndex>`.
   - The image name is the tile id + 1000.
   - Tiles whose pixels use colour-cycling palette indexes get several frames and a Phaser animation, keyed `<imageName>` and `<imageName>_R` (reverse).
3. `create()` calls `city.load.loadDefaultCity()`, which loads the `.sc2` file and parses it into `scene.importedData`. It then calls `city.create()`, which runs `map.create()`.

### SC2 import (`src/import/sc2.js` + `src/import/segmentHandlers/`)

- The file is an IFF-style `FORM` container, split into 4-character segments. Every segment is run-length decompressed except `ALTM`, `CNAM`, `TEXT`, `PICT`, `SCEN` and `TMPL`.
- Each segment is passed to the same-named handler in `segmentHandlers/`.
  - Handlers write per-cell results to `map.cells[i]._segmentData.<SEGMENT>`.
  - Map-wide results go to `map._segmentData.<SEGMENT>`.
  - Cell index `i` maps to `x = floor(i / 128)`, `y = i % 128`.
- After the handlers run, `sc2.js` flattens `_segmentData` into each cell's `tiles._list` (`{ id, type }` entries), `corners`, `zone`, `z`, `water`, and so on.
- **Which tile types get rendered at all is decided here.** Zones, heightmap, subway and pipes are currently commented out.

### Tile metadata (`src/import/tiles.js`)

- This is a hand-written array of about 500 entries, indexed by SC2K tile id.
- Common fields:
  - `type` / `subtype`
  - `size`: building footprint, 1–4 cells
  - `rotate[4]`: the tile id to draw for each camera rotation
  - `flip` / `flipMode`
  - `hitbox` / `heightmap`: polygon point sets, or `{ reference: id }` to reuse another tile's set
  - `importOptions.dropColor`: palette indexes made transparent
  - `frameRate` / `reverseAnimation`
  - `traffic`, `baseLayer`, `logic`, `depthAdjustment`
- `artwork.js` **mutates these same objects** at load time. It adds `data`, `frames`, `textures`, `width`/`height`, and replaces `hitbox` with a `Phaser.Geom.Polygon`.

### Cell model (`src/cell/`)

- `map.cells[x][y]` holds a 128×128 grid of `cell` objects (`CONST.MAP_SIZE`), also kept as a flat list in `map.list`.
- Each cell composes:
  - `position`: isometric math.
    - Screen offset is `x = (x - y) * 32` and `y = (x + y) * 16`.
    - Elevation is `LAYER_OFFSET * z`.
    - Draw depth is `(x + y) * 64`.
    - Anchor points: `topLeft`, `center`, `bottom`, and so on.
  - `corners`: which corner of a multi-cell building this cell is. `corners.key` is true only on the corner that matches the city's rotation, and only that cell draws the building sprite.
  - `tiles`: a per-type container.
  - `related`: every cell covered by the same multi-cell building, plus `parent`.

### Tiles (`src/cell/tiles/`)

- `src/cell/tiles.js` builds one instance per `_list` entry and stores it as `cell.tiles[type]`.
  - It skips the subway, pipe, underground and heightmap types.
  - `tiles.set(type, id)` destroys the old sprite and creates a new tile instance. You must call `.create()` on it afterwards to draw it; `src/world/tools/roads.js` shows the pattern.
- Each type in `src/cell/tiles/<type>.js` extends `tile.js`. A subclass:
  - sets `type` and `layerDepth` (`CONST.DEPTH_*`)
  - usually overrides `check()` with a whitelist of valid tile ids
  - may override `get()` (rotation and flip remapping), `position()`, `create()` and `logic()`
- Sprite depth is `cell depth + layer depth + tile + additional`.
- Every sprite is made interactive with the tile's polygon hitbox. Pointer events go to the owning cell's `onPointer*` handlers.

### Layers, viewport, input

- `src/city/layers/<type>.js` are thin subclasses of `layer.js`. Each collects every tile of one type so the layer can be hidden or shown as a whole. They emit `E_MAP_LAYER_HIDE` / `E_MAP_LAYER_SHOW` on `scene.events`.
- `src/world/viewport.js` handles camera input (WASD to pan, Q/E to zoom) and culling.
  - Culling calls `cell.hide()` / `cell.show()` based on whether the cell's centre lies inside the padded camera rectangle. It runs only while the camera moves.
  - Tile `show()` overrides therefore run on every cull. For example, terrain stays hidden under water.
- `src/world/events.js` forwards scene pointer events to the active tool.
  - The tool is set by the hard-coded `selectedTool`.
  - Tools live in `src/world/tools/` and are registered by their export name in `tools/index.js`. That name must equal the matching `CONST.TOOL_*` value.
- `src/debug/debug.js` builds the dat.GUI panel: FPS, cursor and cell coordinates, camera, and layer toggles.

### Stale / unwired code

These files are not imported by the running app, and they still target an older API (`scene.sys.game.common`, `common.tiles`, `city.cameraRotation`, `cell.get*TileId()`):

- `src/simulation/**`
- `src/cell/simulation.js`
- `src/ui/ui.js`
- `src/city/save.js`

`src/ui/gui.js` is imported but its markup is commented out.

## Conventions

- All magic strings and numbers live in `src/constants.js`: tile types, depths, events, paths and sizes. Import them as `import * as CONST from '../constants'`.
- Class names are lowercase (`export default class city`). Directories expose their modules through an `index.js` that re-exports named exports.
- Classes use private `#fields`, public class fields and optional chaining, which Babel compiles via `.babelrc`. Newer syntax needs an extra Babel plugin.
- ESLint enforces 2-space indent, single quotes, required semicolons and `one-var: never`. Code often aligns `=` in assignment blocks and uses `//\n// description\n//` comment headers.
- `webpack.config.js` uses `src/index.html` as the HTML template. The root `index.html` is a leftover.
