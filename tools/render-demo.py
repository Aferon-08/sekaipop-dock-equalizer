#!/usr/bin/env python3
"""Render actual QML components to PNG frames, without touching the running shell."""
import argparse, os, shutil, subprocess, tempfile
from pathlib import Path
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument("scene",choices=["dock","wallpaper","voices"])
parser.add_argument("output",type=Path)
args=parser.parse_args();root=Path(__file__).resolve().parent.parent
args.output.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix="sekaipop-demo-") as d:
 stage=Path(d)
 for p in root.iterdir():
  if p.suffix in (".qml",".js",".mjs",".qsb") or p.name=="assets":
   if p.is_dir():shutil.copytree(p,stage/p.name)
   else:shutil.copy2(p,stage/p.name)
 text=(root/"tools"/("demo-"+args.scene+".qml")).read_text().replace('import ".." as Plugin','import "." as Plugin').replace('import "../WallpaperPet.js"','import "WallpaperPet.js"')
 (stage/"shell.qml").write_text(text)
 subprocess.run(["qs","-p",str(stage),"-n"],env=dict(os.environ,DEMO_OUT=str(args.output.resolve())),check=True,start_new_session=True,timeout=65)
