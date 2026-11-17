# Maintaining Poster8G

Everything a future operator (human or agent) needs, in the order it is needed.
中文说明见文末。

---

## 1. Repository layout

| Path | What it is | Must ship? |
| --- | --- | --- |
| `lib/` | Tool implementations registered on `apply(ctx)` | yes |
| `python/` | ComfyUI clients (`comfy_client.py`, `moss_client.py`, `flux_i2i.py`) | yes |
| `skill/` | Python helpers + `SKILL.md` bundled for the agent | yes |
| `assets/editor/poster-editor.html` | The 4.2 MB browser workbench (single file, no build step) | yes |
| `assets/fonts/` | 8 font families + previews (all OFL or public domain) | yes |
| `assets/templates/`, `assets/icons/`, `assets/showcase/` | Templates, icons, README screenshots | yes |
| `docs/` | Install + manual, English and Chinese | yes |
| `test/` | `smoke` / `route` / `ver` / `tools` suites | yes |
| `scripts/release.ps1` | The release driver (see §4) | yes |

**Never ship, never commit:** personal working files such as `assets/editor/*_入口*.html`, `PROMPT-*.md`, exported posters, `.env`, tokens, `node_modules/`, build output. `.gitignore` covers git, **`.npmignore` covers the tarball** — both must stay in sync. A personal HTML file once reached `npm pack` output because only `.gitignore` listed it; `.npmignore` exists for exactly that reason.

## 2. Versioning

- Semver. The plugin is at `1.x`; breaking a tool's parameter names is a major.
- Tool names (`poster_*`) are API. Renaming one breaks every script and doc — treat it as a major bump.
- `dsh.compatibility` in `package.json` declares which DSH builds this plugin was tested against. **Add a `dshReleases` entry when you test a new DSH build**, and widen the range only after the contract test passes.

## 3. What the four suites cover

| Suite | Guards |
| --- | --- |
| `test/smoke.mjs` | All 13 tools describe themselves, fonts resolve, templates parse, QR make+verify round-trips |
| `test/route.mjs` | The plugin registers **zero** HTTP routes (the workbench is a local file, `/api/*` is dead by design) |
| `test/ver.mjs` | The version chain: save → snapshot → list / latest / diff → `poster_check` on `latest.json` |
| `test/tools.mjs` | Real fixtures: cutout → detect_slots → compose → QR make / verify / recolor |

Run everything with `npm.cmd test` (on Windows use `npm.cmd`; bare `npm` resolves to `npm.ps1` and is blocked by the ExecutionPolicy).

## 4. Release

```powershell
pwsh -File scripts/release.ps1 -DryRun            # tests + version preview, writes nothing
pwsh -File scripts/release.ps1 -Bump patch -Message "fix: ..."
pwsh -File scripts/release.ps1 -Bump minor -Message "feat: ..."
```

The script refuses to continue if any suite fails. It bumps `package.json`, prepends a `CHANGELOG.md` section, commits, tags `vX.Y.Z`, and pushes branch + tag.

Manual equivalent, if the script is unavailable:

```powershell
npm.cmd test
node -e "..."                      # bump version
# edit CHANGELOG.md
git add -A; git commit -m "chore: release X.Y.Z"
git tag -a vX.Y.Z -m vX.Y.Z
git push origin HEAD; git push origin vX.Y.Z
```

## 5. Credentials

- The push token lives in **Windows Credential Manager** (`git credential`), never in the repository.
- On this machine `git` is configured with `http.sslBackend=schannel`; the OpenSSL backend shipped with Git 2.40 cannot verify current GitHub certificates (`unable to get local issuer certificate`). Do not "fix" that by disabling verification — switch the backend.
- Local DNS may point `github.com` at `127.0.0.1` (an old local proxy). If pushes fail with `Connection was reset`, check `C:\Windows\System32\drivers\etc\hosts` before blaming the token.

## 6. Rollback

- Bad release: `git revert <sha>`, bump patch, release again. Do not force-push `main`.
- Bad tag: `git tag -d vX.Y.Z; git push --delete origin vX.Y.Z`.
- The version chain in the user's poster folder is append-only (`<folder>/.poster8g/versions/`); users can always reopen an older snapshot through `poster_versions`.

## 7. Model files are not in this repo

`FLUX.2-klein` (≈10.3 GB) and `MOSS-Image` (≈12.8 GB) are downloaded separately; see `docs/INSTALL.md`. The filenames the code defaults to (`flux3-image-klein-int8-convrot.safetensors`, `qwen3vl_4b_int8_convrot.safetensors`) are community int8 names — users either rename upstream files or override with `POSTER_UNET` / `POSTER_CLIP` / `POSTER_VAE`.

---

## 中文速查

- **发布**：`pwsh -File scripts/release.ps1 -Bump patch -Message "改了啥"`。测试不过就不提交、不打 tag。
- **绝不入库**：`assets/editor/*_入口*.html`、`PROMPT-*.md`、`.env`、令牌、导出的海报成品。`.gitignore` 管 git，`.npmignore` 管 tarball，两边要同步。
- **工具名是 API**：`poster_*` 改名等于破坏性变更，必须 major。
- **凭据**：令牌在 Windows 凭据管理器里，不写进仓库；git 用 `http.sslBackend=schannel`。
- **回滚**：`git revert` + 补丁版本；删 tag 用 `git push --delete origin vX.Y.Z`。
- **模型**：不在仓库里，10.3 GB / 12.8 GB 单独下，见 `docs/INSTALL.md`。
