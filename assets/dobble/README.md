# Dobble illustrations

The 31 original SVGs in `openmoji/` are from [OpenMoji 17.0.0](https://github.com/hfg-gmuend/openmoji/releases/tag/17.0.0), by the OpenMoji contributors and HfG Schwäbisch Gmünd. Graphics are licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); the complete licence is `openmoji/LICENSE.txt`. This licence applies to these graphics and their adaptations, not to unrelated game code.

`manifest.json` records every source URL and its measured artwork bounds. Originals are preserved. `node tools/build-dobble-art.mjs` embeds normalized adaptations into `public/dobble.html`: centered scale, slightly heavier outlines and selected accent colours. The game makes no external image requests. Attribution and adaptation notice appear in the Dobble menu.
