# CLAUDE.md — MET (Manga Editing Tool)

Architecture guide for future Claude sessions working on this repo. Read this before touching `src/components/studio/`.

## What this is

**MET** is a React 19 + TypeScript + Vite + Konva web app for manga/manhwa cleaning, translation, and typesetting. It is a normal bundled SPA (not the single-file/offline architecture described in the orphaned prototype doc at `src/assets/claude.md` — that file documents a *different*, disconnected reference prototype at `src/assets/mangastudio (1).html`; useful as design reference only, not part of the shipping app).

Entry point: `src/App.tsx`, rendered via `src/main.tsx` into `index.html`. Top-level navigation (`src/config/navTabs.ts`) has 5 tabs: Library, Text Editor, Settings, Teams, Cloud — there is still no dedicated Home/landing screen (Recent/Templates/Tutorials/Plugins/Account), see "Known gaps" below.

## Data model

`src/types.ts` defines the persisted hierarchy:

```
Workspace { mangas: MangaSeries[] }
  MangaSeries { volumes: Volume[] }
    Volume { chapters: Chapter[] }
      Chapter { pages: Page[] }
        Page { original: ProcessedImage, cleaned: ProcessedImage | null }
```

`workspaces: Workspace[]` lives in `App.tsx` state, autosaved to IndexedDB (`idb-keyval`, key `workspaces_library`) debounced 800ms (`App.tsx`). Schema evolution goes through `src/lib/migrate.ts`'s `migrateWorkspace()`, run once on load.

Original/cleaned pairing: `src/lib/pages.ts`'s `suggestPairing()` — three passes: exact normalized-filename match, then numeric-page-number match (extracts the trailing digit run from each filename), then positional fallback for whatever's left. Always returns an editable suggestion (`PairingSuggestion`), never a silent final assignment — `PageManager.tsx` surfaces unmatched images as a manual drag-to-pair pool.

## The Studio (`src/components/studio/`)

`Studio.tsx` is the main shell, wrapped in three context providers (`ColorProvider`, `HistoryProvider`, `DockProvider`). Mounted only when a chapter is opened (`App.tsx`, `chapterView === 'studio'`); fully unmounts when navigating back to the page manager or a different chapter, so per-chapter state doesn't need explicit reset logic — a fresh mount is a fresh chapter.

### Per-page layer stack

`layersByPage: Record<pageId, StudioLayer[]>` in `Studio.tsx` — every page always has a locked `Background` layer. `StudioLayer` (`studioTypes.ts`) covers `background | clean-patch | text | bubble-mask | adjustment` types; `clean-patch` (raster), `text`, and `adjustment` are implemented — `bubble-mask` is still declared in the type union with zero implementation anywhere (no create path, no rendering). This is a real, documented gap, not a stub to build against blindly.

Raster pixel content for `clean-patch` layers lives **only** as live `HTMLCanvasElement`s in `paint/paintCanvasRegistry.ts`, held in a `useRef` inside `StudioCanvas.tsx` — never in React state directly. This registry persists across page switches within a session (keyed by layer id, not page id), which is what lets `StudioCanvas.getExportSnapshot()`/`exportRasterLayers()` capture edits made on any page visited so far, not just the currently active one.

Real, working layer features: opacity, blend mode (`globalCompositeOperation` via `BLEND_TO_COMPOSITE`), visibility, lock, reorder, duplicate, delete. **Adjustment layers** (`AdjustmentPanel.tsx`, `src/lib/adjustments.ts`) are real — Brightness/Contrast, Hue/Saturation, and Levels, applied to the background page image only (not to clean-patch/text layers above it) via Konva's own `cache()`/`filters()` pipeline, baked into export snapshots too. **Not implemented**: layer groups, masks, smart objects, and adjustment layers affecting anything other than the background — each would be a substantial separate feature (groups/masks especially would require moving off a flat `StudioLayer[]` array to a tree; a true "affects everything below in the stack" adjustment compositor would need to flatten the whole layer tree per frame).

### Canvas engine (`StudioCanvas.tsx`)

Konva `Stage`/`Layer` per page. Background image loads into `image` state from `page.original` or `page.cleaned` (via `showCleaned`); when `overlayOpacity > 0` and `showCleaned` is true, `page.original` also loads as a second `overlayImage` rendered on top at that opacity (View Original overlay mode).

Pan: Pan/Select tools drag the Stage natively; **any other tool** pans via Space-hold or middle-mouse-drag, handled manually through `panRef` + window-level `mousemove`/`mouseup` listeners (not Konva's built-in drag, to avoid fighting per-tool pointer handlers).

Tool routing in `handlePaintPointerDown/Move/Up` dispatches by `activeTool` string against several disjoint sets: `MARQUEE_TOOLS`, `LASSO_TOOLS` (drag-based freehand only — `lasso-polygon` is click-accumulate, handled separately via `handleStageClick`/`lassoPolyPoints`, mirroring the Pen tool's `penPoints` pattern), `PAINT_TOOLS` (from `paint/usePaintLayer.ts`). Marquee Shift constrains to a perfect square/circle.

All of the above dispatch through **Pointer Events** (`onPointerDown/Move/Up`), not separate mouse/touch handlers — mouse, touch, and pen input share one code path. Real stylus pressure (`PointerEvent.pressure`) scales brush/pencil/eraser size (only for `pointerType === 'pen'`; mouse/touch report a flat, meaningless 0.5 per spec). A `touchCount >= 2` guard skips tool dispatch for pointer events fired mid-two-finger-gesture, deferring to the separate pinch/pan `onTouchMove` handler. Two-finger touch pans *and* pinch-zooms simultaneously (`handleTouchMove` anchors on the *previous* frame's pinch center, not the current one — a plain two-finger drag with no distance change still pans correctly).

Selection model: `paint/selection.ts`'s `Selection` union (`rect | ellipse | polygon | mask`) — vector shapes clip via `Path2D`, magic-wand masks approximate live via bounding box during a stroke and get pixel-perfect refinement on commit (`refineMaskedRegion`, now wired into every paint-stroke commit path, not just magic-wand). **Feather/expand/contract/add-subtract are real**: Shift(add)/Alt(subtract)/intersect combine the in-progress marquee/lasso/wand shape with the prior selection by rasterizing both to a mask and compositing (`combineSelections`); a **Select** menu (Deselect, Feather…, Expand…, Contract…) applies one-shot pixel-amount ops (`featherSelection`, `growSelection`) via a `swal` numeric prompt. Still not implemented: magnetic lasso, patch tool, curvature pen/path selection/direct selection, brush mirror/symmetry modes — declared in `toolGroups.ts`/SPEC but not built.

**Liquify** (`paintEngine.ts`'s `liquify()`) is real — `push`/`swirl`/`pinch`/`bloat`/`crystalize`/`reconstruct` modes. The first five each compute a per-pixel *source sample offset* (a true warp, not a blend) with radial falloff, same getImageData/putImageData-over-a-bounding-box pattern as the filter brushes. `reconstruct` blends back toward a pristine pre-liquify snapshot instead — `StudioCanvas.tsx`'s `liquifySnapshots` registry captures one lazily per layer, on that layer's first-ever liquify edit (mirrors `paintCanvasRegistry`'s per-layer-id-not-page-id pattern), and it's cleared when the layer is deleted.

**Gradient** tool now goes foreground→background (`settings.bgColor`), matching Photoshop's default convention, instead of the old hardcoded foreground→transparent-white.

Grid (`showGrid`) and rulers (`showRulers`) are real, toggled from the View menu — grid is a Konva overlay layer at a fixed 100px page-space spacing; rulers are HTML overlays tracking `pos`/`scale` with tick labels every 100px.

### Persistence

Two separate IndexedDB stores, deliberately kept apart so painting never triggers a full-library rewrite:

- `workspaces_library` (existing, `App.tsx`) — chapter/page structure + image data URLs.
- `studio_<chapterId>` (`src/lib/studioProjectStore.ts`) — layers (with raster pixels as data URLs), TypeR script/styles. Autosaved 1.2s after the last layer/TypeR change *or* committed paint stroke (`Studio.tsx`'s `scheduleAutosave`/`flushAutosave`). Loaded on mount; raster layers hydrate lazily as each page is visited (`loadRasterLayer` polls briefly for the background image to finish loading — see `waitForImage` in `StudioCanvas.tsx`).
- `studio_versions_<chapterId>` — capped (10) full-copy version snapshots pushed on every autosave. No diffing/compaction; fine at this scale, revisit only if real usage shows storage bloat.

Native project format: `.msp` (zipped JSON containing the full workspace tree + every chapter's studio data), `src/lib/mspFile.ts`. Export/import UI lives in `App.tsx`'s workspace list (not inside Studio, since it operates on a whole workspace).

### Export (`src/lib/exportImage.ts`, `src/lib/exportPsd.ts`)

- PNG/JPG/WEBP: `StudioCanvasHandle.getExportSnapshot()` captures background + full layer stack (raster layers as data URLs, text layers as structured data) for the active page; `compositeFlattenedImage()` flattens onto a canvas respecting opacity/blend/visibility, rendering text layers via canvas 2D (`fillText`/`strokeText`, with manual greedy word-wrap to approximate Konva's auto-wrap). JPG flattens onto white first (no alpha channel).
- PSD: `exportPsd()` builds an `ag-psd` `Psd` object — one layer per `StudioLayer`, raster layers get a canvas, text layers get `LayerTextData` (editable in Photoshop; font family names pass through as-is, Photoshop substitutes if not installed — can't resolve that from a browser). `ag-psd` is **dynamically imported** (`await import('ag-psd')`) so it code-splits into its own chunk instead of bloating the main bundle (it's ~300KB alone).
- `ExportDialog.tsx` wires both into the Project menu / `Ctrl/Cmd+E`.

Text export (TXT/DOCX/PDF) lives in `src/lib/textEditorExport.ts` — see the Text Editor section below.

### TypeR (scripted lettering)

`studioTypes.ts`'s `parseTyperScript()` + `TyperPanel.tsx`. Paste a script, arm it, click bubbles to stamp lines in order with per-line styles matched by prefix (longest prefix wins; empty-prefix style is the catch-all).

Ported from the real TypeR 2.5 extension's documented behavior (see `src/assets/claude.md` for the original algorithm description, and `src/assets/mangastudio (1).html` for a working reference implementation):
- `##`-prefixed lines are ignored (notes).
- `//`-prefixed lines continue (append to) the previously placed line rather than starting a new one.
- `Page N` control lines (English or Arabic, incl. Arabic-Indic digits) tag the next real line with a page hint; `Studio.tsx` auto-switches pages as the armed script advances onto a hinted line (matches by number extracted from the target page's filename, falling back to 1-based position).
- A line fully wrapped in `**bold**`/`<b>...</b>` or `*italic*`/`<i>...</i>` overrides that style's weight for just that placement.
- Styles have an optional `folder` field for organizing the panel into collapsible groups — **folder does not affect prefix-matching priority** (simplified from the original "focused folder" UI concept, which doesn't exist here); matching is purely longest-prefix-first across all styles.

**Not implemented**: Multi-Bubble mode (accumulating several marquee selections and filling them in sequence from consecutive script lines) and true per-character rich text (bold/italic overrides apply to the whole placed layer, since `TextLayerData` has no per-run styling — would need either rich HTML content or a run-based text model, a bigger change than this pass covers).

### Translation Preview panel

`TranslationPreviewPanel.tsx` — lists every text layer across every page in the chapter (reads `layersByPage` directly, no extra loading needed since it's already all in memory), with jump-to-bubble, cross-page search/replace, and per-dialogue status (`draft/translated/reviewed`) + comment fields on `TextLayerData`. Cross-page edits go through `Studio.tsx`'s `updateLayersOnPage()` (a generalization of the original active-page-only `updateLayers()`).

### Dock/panel system (`dock/`)

`DockContext.tsx` manages which tab is active in the `top`/`bottom` regions and which tabs are floating (`FloatingPanel.tsx`, drag + resize). Layout (active tabs + floating rects) persists to `localStorage` under `dock_layout_<chapterId>`, debounced — scoped per chapter so switching projects doesn't bleed one chapter's panel arrangement into another's. `homeRegion` (which region a tab defaults to) is static (`dockLayout.ts`'s `DEFAULT_DOCK_REGION`) and never mutated at runtime, so it isn't persisted.

Responsive breakpoints (`Studio.tsx`'s `layoutMode`): `desktop` (≥1024px, side dock), `tablet` (768–1024px, dock collapses to a tap-to-open icon strip overlay), `phone` (<768px, dock opens as a near-full-height slide-in sheet — `animate-slide-up-sheet` in `index.css` — with a drag-handle/close affordance, not a fixed-height strip). Tool rail is already icon-only/horizontal on phone via existing `lg:hidden` breakpoint classes; StudioToolbar serves as the top mini-bar on every breakpoint.

Fullscreen: native Fullscreen API on the Studio root, synced to `fullscreenchange` (not just button state, so Esc/browser UI stays in sync). Not bound to literal F11 — browsers intercept that key at the chrome level before JS reliably sees it — bound to `Ctrl/Cmd+Shift+F` instead. `Tab` hides all panels (menu bar, tool options, tool rail, dock, floating panels), guarded against firing while any input/textarea/contenteditable has focus.

Window menu items render real checkmarks (`Menu.tsx`'s `checked` field) reflecting actual panel/fullscreen/hidden state — not decorative.

### Workflow bar

`WorkflowBar.tsx` — a slim stage-pill strip (Chapter → Page → Detection → Cleaning → Drawing → Typesetting → Review → Export) mounted between the toolbar and tool options bar. Every "active" pill reflects a real, checkable condition (has a cleaned page, has a `clean-patch` layer, has a non-empty text layer); Detection/Review/Export are shown dim/untracked since nothing in the app tracks those stages yet — deliberately not faked.

## Text Editor (`src/components/textEditor/TextEditorPage.tsx`)

A standalone top-level page (`src/config/navTabs.ts`'s `'text-editor'` nav tab), **not** embedded in Studio — reached via the sidebar/bottom nav, matching the "own page, own switcher" requirement. TypeR itself is Studio-only; the editor connects to it one-way via a "Send to TypeR" pipeline (see below).

- **Multi-document tabs**: `TextEditorDoc[]` (`src/lib/textEditorStore.ts`), each with its own pages, persisted to IndexedDB (`text_editor_docs` key, separate from both Studio stores).
- **Pagination**: each doc's pages are A4-sized (`794×1123px`) `contentEditable` divs. `reflow()` does direct DOM manipulation on refs — pushes overflowing trailing block-children to the next page, pulls blocks back up from the next page to fill gaps — and only touches React state to change *page count* (splice the array, keep every untouched page's string reference identical). This is deliberate: re-rendering a page's `dangerouslySetInnerHTML` on every keystroke would reset that page's DOM and kill the caret mid-typing, so normal content edits never flow back through state — only autosave (on a debounce timer, captured fresh from refs) and explicit bulk actions (spell-check apply, find/replace, doc switch) do, and those intentionally force a full page re-render via `renderKey`.
- **Formatting**: `document.execCommand`-based toolbar (bold/italic/underline/headings/lists/align) — the same pragmatic approach the reference prototype used; no custom rich-text model.
- **Spell-check**: `src/lib/spellCheck.ts` — a small starter EN+AR misspelling dictionary (not a full language dictionary — there's no server to back a real one), flags exact-word matches as clickable `.spell-miss` spans, click-to-fix. `stripSpellMarks()` always runs before export/send, matching the reference prototype's "export strips spell marks" convention.
- **Export**: TXT (real, `pageToPlainText`), DOCX (real, via the `docx` npm package — dynamically imported so it doesn't bloat the main bundle, block-level HTML→paragraph/run mapping with bold/italic/underline/heading levels preserved), PDF (`printDocAsPdf` opens a print-formatted window with `@media print` A4 page breaks exactly matching the on-screen pages, then calls `window.print()` — deliberately avoids a heavy client-side PDF-rendering library since the browser's native print-to-PDF already produces print-quality, pixel-accurate output).
- **Send to TypeR**: strips spell marks, joins all pages' plain text, and calls `onSendToTyper` → `App.tsx`'s `pendingTyperScript` state → `Studio.tsx` consumes it into `typerScript` on mount and clears it. This means the text is "waiting" in whichever chapter's Studio the user opens next, without either page needing to be mounted simultaneously.
- **Not implemented this pass**: tables, images, comments, track changes, and the *optional* in-editor floating panels (Translation Preview and a live read-only page thumbnail) that SPEC describes as opt-in helpers while writing — real, separate scope beyond a first working editor. No dedicated "switch Studio ↔ Editor" keyboard shortcut either; switching is one click via the existing nav rail/tab bar.

## Color system (`color/ColorPanel.tsx`)

RGB/Hex/HSV wheel + recent colors were already real; HSL and CMYK rows now use `colord` (+ its `cmyk` plugin, `extend([cmykPlugin])`) for the conversions rather than hand-rolled math — small, well-tested library, not bundled-heavy (a few KB, stays in the main chunk). **Not implemented**: saved palettes, a dedicated multi-stop gradient editor UI (the Gradient *tool* itself is real and now goes foreground→background, see Canvas engine above — there's just no UI for arbitrary custom gradient stops beyond that one pair).

## Fonts (`FontsPanel.tsx`, `src/lib/fontLoader.ts`, `src/lib/fontsStore.ts`)

Real font installation: upload TTF/OTF/WOFF/WOFF2 → `opentype.js` (dynamically imported) parses the embedded family name → registered via the `FontFace` API (`document.fonts.add`) → persisted to IndexedDB (`custom_fonts` key) and re-registered on every load. Installed families flow into `Studio.tsx`'s `allFontFamilies` (built-ins + custom) and are passed to `TextPanel` as a prop (`fontFamilies`, defaults to the built-in list if omitted). **Not wired into TyperPanel's style editor** — TypeR styles have always had a `fontFamily` field but no UI control for it (pre-existing gap, not introduced or fixed here). **Google Fonts integration is intentionally not implemented** — SPEC lists it as optional, and pulling from Google's CDN would require network access, conflicting with this app's offline-capable design intent.

## Known gaps (honest, not silently dropped)

- **No Home/landing page.** Top nav is 5 flat tabs (Library/Text Editor/Settings/Teams/Cloud); Recent/Templates/Tutorials/Plugins/Account don't exist. Building nav destinations with no real content behind them would violate the no-placeholder rule — needs real features first.
- **Interactive control sizing** on mobile/tablet breakpoints hasn't had a systematic ≥44px touch-target pass — many buttons/sliders are still 24–32px (a few new additions, like the tablet dock icon strip, were sized to 44px; the sweep across every existing control wasn't done).
- **Layer groups/masks/smart objects** (adjustment layers *are* implemented, background-only — see Per-page layer stack above), **magnetic lasso**, **patch tool**, **curvature pen / path selection / direct selection**, **brush mirror/symmetry modes**, **Multi-Bubble mode** (TypeR) — declared as intended features (in tool lists, type unions, or SPEC) but not implemented. Each is a genuinely separate chunk of work. (Selection feather/expand/contract/add-subtract and liquify's `reconstruct` mode *are* implemented — see Canvas engine above.)
- **Color**: no saved palettes, no multi-stop gradient editor UI. **Fonts**: no TypeR style font-family control, no Google Fonts (by design, offline-first). **Music player, navigator/minimap, safe-area overlay** — not implemented (Grid and Rulers *are* implemented, see Canvas engine above).
- **Text editor**: no tables/images/comments/track-changes, no in-editor floating Translation-Preview/page-thumbnail panels, no dedicated Studio↔Editor shortcut.

## Conventions

- Keep the two IndexedDB stores (`workspaces_library` vs `studio_<chapterId>`) separate — don't fold raster/layer data into the main library object; that was a deliberate autosave-cost decision.
- New persisted shapes should include a `schemaVersion` field and a real migration path (see `migrate.ts` for the pattern), not just hope old data happens to still parse.
- Large/optional dependencies (`ag-psd`, `docx`, `opentype.js`) are dynamically imported (`await import(...)`), not top-level, to keep the main bundle lean — check `npm run build`'s chunk output after adding a new one; it should show up as its own chunk, not inflate the main one. Small libraries (`colord`, a few KB) are fine as regular top-level imports.
- `npm run lint` is actually `tsc --noEmit` (no separate linter configured) — run it after any change; `npm run build` is the stronger check since Vite/Rollup catch a few things `tsc --noEmit` alone doesn't.
- This session ported algorithms/behavior from two references: `src/assets/mangastudio (1).html` (a disconnected single-file prototype — TypeR parsing model, Tab-hide-panels, teReflow pagination) and the documentation in `src/assets/claude.md` (Arabic, describes that prototype's contracts). Both are read-only reference material, not part of the shipping app — don't wire them in or assume their code paths exist here.
