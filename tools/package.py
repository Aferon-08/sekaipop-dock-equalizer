#!/usr/bin/env python3
"""Package tracked sources, documentation and media; never include local runtime data."""
import hashlib,json,subprocess,zipfile
from pathlib import Path
root=Path(__file__).resolve().parent.parent
version=json.loads((root/"plugin.json").read_text())["version"]
files=subprocess.check_output(["git","-C",str(root),"ls-files","-z"]).decode().split("\0")
out=root/"dist";out.mkdir(exist_ok=True)
archive=out/("dock-equalizer-"+version+".zip")
with zipfile.ZipFile(archive,"w",zipfile.ZIP_DEFLATED) as z:
 for name in sorted(n for n in files if n):z.write(root/name,"dock-equalizer-"+version+"/"+name)
digest=hashlib.sha256(archive.read_bytes()).hexdigest()
(out/"SHA256SUMS").write_text(digest+"  "+archive.name+"\n")
print(archive)
