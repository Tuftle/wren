#!/usr/bin/env python3
"""Pulls Mozilla's latest Firefox into Wren and re-applies Wren's pictures.

    python tools/wren/update.py origin/FIREFOX_ESR_140_10_X_RELBRANCH

See UPDATING.md. It stops at the first thing that needs a person (a dirty tree, a conflict).
"""
import os
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
HERE = os.path.dirname(os.path.abspath(__file__))

# the few places where Wren edits Mozilla's own files
TOUCHED = [
    "browser/base/content/browser.js",
    "browser/components/urlbar/content/UrlbarInputBase.mjs",
    "browser/components/customizableui/CustomizableUI.sys.mjs",
    "browser/themes/BuiltInThemeConfig.sys.mjs",
    "browser/themes/addons/jar.mn",
    "browser/themes/shared/browser-shared.css",
    "browser/themes/shared/jar.inc.mn",
    "browser/extensions/moz.build",
    "browser/base/content/webext-panels.css",
    "toolkit/components/search/SearchEngineSelector.sys.mjs",
    "toolkit/components/search/moz.build",
    "toolkit/components/search/ConfigSearchEngine.sys.mjs",
    "toolkit/mozapps/extensions/internal/XPIInstall.sys.mjs",
    "browser/base/content/default-bookmarks.html",
    "browser/components/preferences/preferences.js",
    "toolkit/themes/shared/design-system/dist/tokens-brand.css",
    "toolkit/themes/shared/desktop-jar.inc.mn",
]


def git(*args, check=True):
    return subprocess.run(["git", *args], cwd=ROOT, text=True, capture_output=True, check=check)


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    ref = sys.argv[1]
    if git("status", "--porcelain").stdout.strip():
        print("There are uncommitted changes. Commit them on the wren branch first.")
        return 1
    print("fetching ...")
    git("fetch", "origin")
    print(f"merging {ref} ...")
    merged = git("merge", "--no-edit", ref, check=False)
    print(merged.stdout.strip())
    if merged.returncode:
        conflicted = git("diff", "--name-only", "--diff-filter=U").stdout.split()
        print("\nConflicts to fix by hand (keep Mozilla's new code, re-apply the Wren lines):")
        for name in conflicted:
            print("  ", name, "  <- one of Wren's small edits" if name in TOUCHED else "")
        print("\nThen: git add the files, git commit, and run this script's remaining steps with:")
        print("  python tools/wren/make_branding.py && python tools/wren/replace_art.py")
        return 1
    print("re-applying Wren's pictures ...")
    for script in ("make_branding.py", "replace_art.py"):
        subprocess.run([sys.executable, os.path.join(HERE, script)], cwd=ROOT, check=True)
    changed = git("status", "--porcelain").stdout.strip()
    if changed:
        print("\nThe pictures changed after the merge. Review and commit:")
        print(changed[:2000])
    print("\nNow build it and try the browser: ./mach build && ./mach run")
    print("Checklist: welcome, nook search and suggestions, sidebar, a PDF, a download, import.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
