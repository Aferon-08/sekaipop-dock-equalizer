"""The v3 plugin must not perform hidden shell installation or erase user data."""
from pathlib import Path
import json,subprocess,sys,tempfile,os
root=Path(__file__).resolve().parent.parent
manifest=json.loads((root/'plugin.json').read_text())
assert manifest['extensions']==['dock','wallpaper','settings']
for filename in ['Dock.qml','Wallpaper.qml','Settings.qml']:assert (root/filename).is_file()
with tempfile.TemporaryDirectory() as folder:
 p=Path(folder);marker=p/'keep';marker.write_text('existing audio and settings')
 env=dict(os.environ,XDG_CONFIG_HOME=folder,XDG_DATA_HOME=folder,XDG_STATE_HOME=folder)
 r=subprocess.run([sys.executable,str(root/'install.py')],capture_output=True,text=True,env=env)
 assert r.returncode==2 and marker.read_text()=='existing audio and settings'
 assert list(p.iterdir())==[marker]
for n in ['Service.qml','Dock.qml','Wallpaper.qml','Settings.qml']:
 text=(root/n).read_text();assert 'install.py' not in text and 'atomic_write' not in text
print('PASS native entry points; compatibility command has no filesystem side effects')
