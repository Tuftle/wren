# Building Wren

Wren is a set of changes on top of Firefox. This repository keeps the changes in `overlay/` and applies them to a
Firefox checkout. The revision they were made against is in [`BASE`](../BASE).

## ◆ Requirements

- Windows 10 or 11, 64-bit
- About 60 GB of free disk space for a full build, and 16 GB of memory or more
- Git, Python 3, and the build tools that `mach bootstrap` installs (Visual Studio Build Tools, clang-cl, Rust, Node.js, NSIS)
- Rust (`rustup`) for the installer

A first full build takes a few hours on a fast machine. Later builds only rebuild what changed.

## ◆ 1. Get Firefox and apply the overlay

```
git clone https://github.com/mozilla-firefox/firefox
cd firefox
git checkout c32abda0190531351e22da36334f18f9e994d474
```

Then, from the folder that holds this repository:

```
# PowerShell
..\wren\scripts\apply-overlay.ps1 .

# or, in a POSIX shell
../wren/scripts/apply-overlay.sh .
```

This copies the files in `overlay/` over the checkout, removes the files listed in `overlay-deleted.txt` and installs
`build/mozconfig.wren-full` as the checkout's `mozconfig`.

## ◆ 2. Build

```
./mach bootstrap
./mach build
./mach run
```

`mozconfig.wren-full` writes the build to `I:/mozilla-obj/wren`. Change `MOZ_OBJDIR` in your `mozconfig` to wherever you
have room. It also names `clang-cl` as the compiler, because Windows ships an empty `cl.exe` in its system folder that the
build would otherwise find first.

For quick work on the interface alone there is an artifact build, which downloads compiled components instead of building
them: use `build/mozconfig.wren-artifact` as the `mozconfig`. It is much faster and good enough for the extension, styles
and settings pages.

After changing only interface files, `./mach build faster` rebuilds in seconds.

## ◆ 3. Package

```
./mach package
```

This writes a zip and Wren's own setup program to `dist/` inside the build folder. The setup program is what the installer
carries inside it.

## ◆ 4. The installer

`installer/` is a small Rust program that shows Wren's installer window, runs the setup program quietly, and writes the
uninstaller.

```
cd installer
cargo build --release
python make.py
```

`make.py` expects the build folder at `I:\mozilla-obj\wren`; change `OBJ` at the top of the file if yours is elsewhere. It
writes `Wren-Setup.exe`.

Useful switches: `--install` skips the first screen, `--update` waits for Wren to close first and starts it again afterwards,
`--uninstall` opens the removal window.

## ◆ 5. Publishing an update

Wren finds new builds through [`latest.json`](https://tuftle.vercel.app/wren/latest.json):

```json
{
  "buildID": "20261025211919",
  "version": "159.0a1",
  "notes": "what changed, in a sentence",
  "url": "https://github.com/Tuftle/wren/releases/download/<tag>/Wren-Setup.exe",
  "sha256": "<sha-256 of Wren-Setup.exe>"
}
```

1. Do a full build, so that the build ID changes (`application.ini` in the build folder shows it).
2. Package it, build the installer, and attach `Wren-Setup.exe` to a release.
3. Put the new `buildID`, the release `url` and the file's `sha256` in `latest.json` on the site and deploy it.

Wren only accepts download addresses on `tuftle.vercel.app`, `github.com/Tuftle` and `objects.githubusercontent.com`, and
refuses a file whose SHA-256 differs from the one announced.

## ◆ Refreshing the overlay

When working in a Firefox checkout, the overlay can be rebuilt from its changes with `git status`: every modified or new
file belongs in `overlay/` at the same path. Text files should use LF line endings.
