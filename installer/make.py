#!/usr/bin/env python3
"""Builds Wren-Setup.exe: the installer window (target/release/wren-setup.exe) with Wren's own setup program stuck on
its end, followed by [expected installed size: u64][payload length: u64]["WRENSETP"].

    cargo build --release
    python make.py
"""
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OBJ = r"I:\mozilla-obj\wren\dist"
STUB = os.path.join(HERE, "target", "release", "wren-setup.exe")
PAYLOAD = os.path.join(OBJ, "wren-159.0a1.en-US.win64.installer.exe")
INSTALLED = os.path.join(OBJ, "wren")
OUT = sys.argv[1] if len(sys.argv) > 1 else r"I:\Documents\code\wren-release\Wren-Setup.exe"


def folder_size(path):
    total = 0
    for root, _, files in os.walk(path):
        for name in files:
            try:
                total += os.path.getsize(os.path.join(root, name))
            except OSError:
                pass
    return total


def main():
    expected = folder_size(INSTALLED)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "wb") as out:
        with open(STUB, "rb") as f:
            out.write(f.read())
        size = 0
        with open(PAYLOAD, "rb") as f:
            while True:
                chunk = f.read(1 << 20)
                if not chunk:
                    break
                out.write(chunk)
                size += len(chunk)
        out.write(struct.pack("<QQ", expected, size))
        out.write(b"WRENSETP")
    print("wrote", OUT, round(os.path.getsize(OUT) / 1e6, 1), "MB; installed size about", round(expected / 1e6), "MB")


if __name__ == "__main__":
    main()
