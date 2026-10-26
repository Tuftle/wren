# wren-installer

The installer window for Wren: one small app in Wren's own look. It carries Wren's real setup program (made by the
Wren build) on its end, runs that quietly into the person's own folder (`%LOCALAPPDATA%\Programs\Wren`, no
administrator needed) and shows how far it has got as an egg that hatches. The setup program sets up the Start menu,
the desktop shortcut, the uninstall entry and the "default apps" registration.

    cargo build --release
    python make.py          # writes I:\Documents\code\wren-release\Wren-Setup.exe

`Wren-Setup.exe --install` skips the first screen. To remove Wren, use Windows Settings > Apps, or run
`%LOCALAPPDATA%\Programs\Wren\uninstall\helper.exe`.
