# Manual

The short version: **ask the guide, set the workspace folder once, generate backgrounds → pick one → load it
into the workbench and set type → pre-flight check → export print files.**
The 13 tools are not 13 buttons. They are 13 stations on one assembly line, and most of the time you just
describe what you want.

---

## 1. The pipeline

```
① poster_guide ─ decide which route
② poster_workspace ─ set the workspace folder (once)
③ poster_generate ─ 3 text-free backgrounds (flux / moss)
④ pick one → ⑤ poster_editor ─ load it into the workbench, user double-clicks
                     ↘ poster_cutout / poster_detect_slots / poster_compose (for batches)
⑥ poster_check ─ pre-flight (overlap / bleed / QR size / min font size)
⑦ poster_qr verify ─ decode every code if there is one
⑧ export PNG 2048 / 4096 / PDF
```

Two entry points, one implementation: a DSH plugin (`lib/index.js`) and an MCP stdio server
(`server/index.js`), both calling `lib/core.js`.

---

## 2. The tools

### `poster_guide`
Returns the full workflow and a flux-vs-moss comparison. **Call it first** after install, and whenever you are
unsure what step comes next.

### `poster_workspace`
Every project, version and export lives in one folder. Actions: `status` (is it configured?), `set` + `dir`
(write it — ask the user for an absolute path, do not pick one for them), `list`, and
`save` + `file` + `name` (store the project **and** write a snapshot to
`<folder>/.posterwright/versions/`, updating `latest.json`).

### `poster_generate`
| Param | Notes |
|---|---|
| `model` | `flux` (default — best texture/lighting) or `moss` (reads Chinese prompts more literally, supports layout-box control) |
| `w` `h` | 1024² ≈ 45 s, 1536² ≈ 78 s on 8 GB |
| `variants` | how many at once; 3 is a good default |
| `refs` | reference-image fusion, up to 10 (flux only) |
| `host` | defaults to `http://127.0.0.1:8189`; **the scheme is required** |

> Two things to know:
> 1. **Never ask the model to render Chinese text.** 「掼蛋」becomes plausible nonsense every time. Leave a
>    blank plate where text belongs and set real type in the workbench.
> 2. On failure the tool may still print "generated N variants". **Trust the `SAVED` lines.**

### `poster_editor`
Pass `project` (path to a project JSON) and it is pre-loaded into the workbench — the user double-clicks one
file and lands on the finished canvas. `list` exposes recent projects in the workbench's project library.

The workbench is a **local single-file HTML page**: open it with `file://`. Never hand the user an `/api/*`
URL — the host only accepts its own signed tokens, so a browser tab gets 401 every time.

### `poster_open`
Starts the browser from the host process (no HTTP, therefore no 401). Use it when the user says
"open the workbench".

### `poster_fonts`
8 families, each tagged with **use case / mood / size range / license**. Filter with `scene`
("标题", "正文", "庄重"…). The bundled Smiley Sans is SIL OFL 1.1 and safe commercially; system fonts are
referenced, never redistributed — **check licensing before delivering to a client**.

### `poster_templates`
Four hard rules (minimum QR size, per-code decode verification, compliance wording, font licensing) plus two
structural starting points (dense-with-many-codes / airy-with-one-hero). Structure only, **no coordinates** —
for exact placement use `poster_compose` or the workbench.

### `poster_cutout`
`input` (white/light background) → `output` transparent PNG. `up=2` upscales before cutting for cleaner edges
(slower). Output is feathered, de-fringed against the background colour, and cropped to content.

### `poster_detect_slots`
Finds rectangular placeholders (QR slots, image slots) in a base image → `slots.json`. `color` is
`gray` / `white` / `#RRGGBB`. The gray test is "channels close together, lightness 150–245"; for a pure white
base use `white`.

### `poster_compose`
One `job.json` describes upscale-and-sharpen → region repaint → paste assets → place codes → PNG / preview /
print PDF → optional decode verification. All coordinates are **source-image pixels**; scaling is internal, so
you never convert by hand. Start from `skill/examples/job.example.json`.

### `poster_check`
Reads a project JSON (defaults to the version chain's `latest.json`) and reports overlapping elements,
out-of-canvas / bleed problems, undersized QR codes and too-small type.

- Thresholds: QR ≥ **11.5%** of the canvas short edge; type ≥ **1.1%** (≈30 px at A4 300 dpi).
- It will report "panel × text on top of it" as an overlap — **text over a solid panel is intentional, let it
  pass**; **two text blocks overlapping must be fixed**.

### `poster_versions`
`list` for history, `latest` for current state (`full=true` for complete fields), `diff` between two versions.
Each version records which elements and which fields changed.

### `poster_qr`
`make` (URL/text, `size` defaults to 1200), `verify` + `dir` (**decode every code — mandatory before print**),
`recolor` (changes colours, **never the payload**), `batch`.

> A code smaller than 11.5% of the canvas short edge will not scan on paper. `verify` is the only proof that it
> will.

---

## 3. The workbench (`assets/editor/poster-editor.html`)

Double-click to open. Offline. Everything happens locally.

| Goal | How |
|---|---|
| Select something hidden under something else | **Alt + click** the canvas to click through one layer; keep Alt-clicking to go deeper, wrapping at the bottom |
| Select precisely from many layers | Click the name in the **layers panel** on the right (Shift / Ctrl to add) |
| Hide / lock / rename | 👁 and 🔒 in the panel; double-click the name |
| Change type size | `A-` / `A+`, or drag a handle (hold Ctrl to avoid re-wrapping) |
| Group | Multi-select → Group; it then drags as one |
| Align / distribute | Toolbar; red guides snap when edges approach |
| Zoom view | `Ctrl + wheel`, or the canvas − / 100% / + controls |
| Export | `PNG 2048` / `PNG 4096` / `Export PDF` (page size follows the canvas mm) |
| Save state | "Save project" → downloads JSON → drag it back into the chat; the agent picks it up with `poster_versions` |

The UI ships in Chinese; §3 of the Chinese manual carries a full Chinese↔English label table.

---

## 4. Pre-flight checklist

1. `poster_check` run once: nothing out of canvas, no undersized type, no text-on-text collisions.
2. QR codes: `poster_qr verify` **PASS on every code**, each ≥ 11.5% of the short edge.
3. Bleed: if the printer wants 3 mm, size the canvas as trim + bleed (A4 210×297 → 216×303 mm).
4. Font licensing: bundled Smiley Sans is fine; **do not embed system fonts** (Microsoft YaHei, SimSun…) in
   files you deliver externally.
5. Compliance: prices, certifications, efficacy claims and rankings need scope and date. The sample posters
   reserve a small line at the bottom for exactly this.
6. Colour: exports are RGB PDF. For CMYK, have the printer convert and return a proof.
7. Resolution: A4 at 300 dpi is 2480×3508. Do not print A4 from a 2048 image.

---

## 5. FAQ

**The workbench opens empty.** Use `poster_open`, or `poster_editor` with `project` to generate an entry page.
Opening `poster-editor.html` bare gives you a blank canvas by design.

**I edited the text but the export is old.** Export writes the current canvas; "Save project" persists the JSON
you continue from.

**The AI wrote gibberish inside the image.** Expected — see the two notes under `poster_generate`.

**Can I batch 50 copies of one layout, swapping only the title and QR code?** Yes. That is what
`poster_compose`'s job.json is for: `patches` rewrite text, `slots` place codes, `labels` annotate. Loop over
different JSON files.
