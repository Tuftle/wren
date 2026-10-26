# Keeping Wren up to date

Wren is Firefox with a small set of changes on top. Mozilla fixes security problems in Firefox all the
time, so Wren has to keep pulling those fixes in. This is the routine.

## What Wren changes

Almost all of Wren is new files, so updates rarely conflict:

| Where | What |
| --- | --- |
| `browser/branding/wren/` | name, icons, installer pictures, default settings (`pref/firefox-branding.js`) |
| `browser/extensions/wren/` | the start page, welcome, sidebar and tools (a built-in add-on) |
| `browser/themes/addons/wren/` | the cream and brown theme |
| `browser/themes/shared/wren.css` | the quiet window styling |
| `toolkit/components/search/WrenSearch.sys.mjs` | puts nook in the search engine list, as the default |
| `tools/wren/` | the scripts and this guide |

And a few small edits to Mozilla's own files (each is one or a few lines; they are what can conflict):

`browser/base/content/browser.js`, `browser/components/urlbar/content/UrlbarInputBase.mjs`,
`browser/components/customizableui/CustomizableUI.sys.mjs`, `browser/themes/BuiltInThemeConfig.sys.mjs`,
`browser/themes/addons/jar.mn`, `browser/themes/shared/browser-shared.css`,
`browser/themes/shared/jar.inc.mn`, `browser/extensions/moz.build`, `browser/base/content/webext-panels.css`,
`toolkit/components/search/SearchEngineSelector.sys.mjs`, `toolkit/components/search/moz.build`, `toolkit/components/search/ConfigSearchEngine.sys.mjs` (nook's icon),
`toolkit/mozapps/extensions/internal/XPIInstall.sys.mjs` (makes the Wren theme the first-run theme),
`browser/base/content/default-bookmarks.html` (no default bookmarks),
`browser/components/preferences/preferences.js` (Settings opens on Home and startup), `toolkit/themes/shared/design-system/dist/tokens-brand.css` and `toolkit/themes/shared/desktop-jar.inc.mn` (one line each, loading `wren-tokens.css`, which gives every built-in page Wren's colours and type).

Plus the pictures that `tools/wren/replace_art.py` overwrites (Mozilla's fox art).

## Which Firefox to follow

For something you give to other people, follow an **ESR** branch (for example `FIREFOX_ESR_140_*`): it only
gets security and stability fixes, so each update is small. Following `main` means a new, large
Firefox every few weeks.

## The routine

1. Work on a branch called `wren`, with everything committed.
2. Run `python tools/wren/update.py <upstream-ref>` (for example `origin/FIREFOX_ESR_140_10_X_RELBRANCH`).
   It checks the tree is clean, fetches, merges, and tells you which of the small edits above conflicted.
3. Fix any conflicts by hand: keep Mozilla's new code and re-apply the Wren lines.
4. The script then re-runs `make_branding.py` and `replace_art.py`, so new fox art is caught.
   If `replace_art.py` finds new files that look like mascot art, add them to its lists.
5. Build (`./mach build`) and try the browser: the welcome, search with nook, the sidebar, a PDF, a download.
6. Commit, and note which Firefox version you are now based on.

## Before you release it to other people

- Build from source with the full config (`mozconfig.full`), not the artifact build.
- Check what Mozilla's own update service would do: Wren turns it off, so **you** are the update channel.
  Publish new builds quickly after Mozilla publishes security fixes.
