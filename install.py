#!/usr/bin/env python3
"""Compatibility notice only. Native extensions are loaded by SekaiPOP."""
import sys
if __name__ == "__main__":
    print("Dock Equalizer 3 uses SekaiPOP native extension slots; install.py no longer modifies the shell.")
    print("This preview requires the proposed native-extensions-v1 shell API. See docs/NATIVE-INTEGRATION.md.")
    print("After that API is part of SekaiPOP, install/update/remove through its plugin manager.")
    print("For the older adapter-based release, use the v2.22.0 tag and its documentation.")
    raise SystemExit(2)
