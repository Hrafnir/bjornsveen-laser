# Native xTool Studio XS format and processing order

Verified locally on 2026-10-28 with xTool Studio **1.7.30**, canvas serializer **2.16.2**. No machine was connected or operated.

## Evidence and compatibility

`fixtures/studio-1.7.30-native.xs` is a synthetic regression fixture created for this test: three 30 mm rectangles (cut, filled engraving, score), a 40 mm black/white checker bitmap, and a group. It was exported using `buildXsProject`, opened in Studio, and saved locally by Studio. It contains no user artwork. Studio reopened all geometry, retained dimensions/parameters and `isProcessByLayer: true`, and did not show the legacy-file banner. F2 Ultra UV export was also opened with an engraving and a three-stage puzzle; its layer panel showed engraving, horizontal, vertical, outline, in that order.

Official layer-order behavior: https://support.xtool.com/article/1902 (top to bottom with By layer enabled). Studio's installed renderer sorts layerData by `b.order - a.order`. The previous tests encoded the opposite convention. Execution rank must therefore be mapped to descending wire-format `order`; `zOrder` continues to represent visual stacking.

## Container

The XS file is a ZIP, not JSON renamed from XCS. Export writes standard stored ZIP entries with UTF-8 names and CRC32; import also reads Studio's deflated entries. No ZIP library or network service is required. Reader limits declared/actual expansion, rejects damaged CRCs, duplicate names, parent paths, encryption and unsupported compression. Archives are read in memory, never extracted onto disk.

- `.format`: `v2`
- `meta/persistence-meta.json`: schema `2.0.0`, protocol `xcs-workspace-v2`
- `project.json`: `__v2__`, version, active canvas/device, module references
- `canvases/<id>.json`: layerData, groupData, current canvas version, chunkLayout
- `canvases/<id>/displays-0.json`: display geometry, bitmap data and paint fields
- `profiles.json`: processing type and values, deduplicated by equivalent parameters
- `devices/device-<id>.json`: canvas/mode processing data, profiles, material patches and display bindings
- `laserstudio/project.json`: optional editable LaserStudio source document; Studio may discard this on save

Inline bitmap data is accepted by Studio. On save Studio externalizes it to `resources/<hash>.png` and sets `resourcePath`; our native import reads that form as well. P3 uses device code ZY015, extension P3, LIFTING_PLATFORM_PROCESS. F2 Ultra UV uses GS009-CLASS-4 and LASER_PLANE.

Geometric conversion and laser parameters reuse the existing XCS builder so that path dimensions, masks, groups and per-machine processing values have a single implementation. The serialized XS project itself contains native workspace-v2 modules and bindings, not a legacy wrapper.

## Scope and tests

`npm test` covers descending processing order, nested groups, unchanged visual stacking, custom orders, selected exports, both machine profiles, native ZIP integrity, exact editable source roundtrip and the independently saved Studio fixture. `tests/processing-export.html` covers actual import/export UI, default XS, optional legacy XCS, order arrows/reset, material changes, persistence/reload and 320 px layout. `tests/layout.html` checks advanced controls at all supported widths. `tests/browser.html` covers SVG roundtrips and bitmap export preparation.

Native third-party XS import supports a single canvas of paths/bitmaps. Unsupported native objects or missing image resources fail explicitly. It is not a general importer for all Studio extensions, multi-canvas documents or editable native text. LaserStudio's own XS retains the original editable source; `.laserprosjekt` remains the full editing/documentation format.

By layer controls processing categories; Studio still plans paths within each category. SVG carries ordered color groups but cannot force a machine's processing settings. Old files need re-exporting. This validation does not replace a physical cut test.
