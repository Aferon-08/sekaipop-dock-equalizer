from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
import tempfile,importlib.util,subprocess,os
s=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('installer',s/'install.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
import argparse
parser=argparse.ArgumentParser();parser.add_argument('--shell-dir',type=Path,default=Path.home()/'.config/quickshell/sekaipop');args=parser.parse_args()
live=args.shell_dir
dock=m.without_adapter((live/'modules/sekai/dock/Dock.qml').read_text())
chrome=m.widget_registry_text((live/'modules/sekai/editMode/EditChrome.qml').read_text(),s,True)
wall=m.wallpaper_text((live/'modules/sekai/background/WallpaperLayer.qml').read_text(),s,True)
with tempfile.TemporaryDirectory() as d:
 t=Path(d);shell=t/'shell'
 for rel,text in [('modules/sekai/dock/Dock.qml',dock),('modules/sekai/background/WallpaperLayer.qml',wall),('services/PluginService.qml',''),('modules/sekai/editMode/EditChrome.qml',chrome)]:
  p=shell/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
 extra_original={}
 for relative in ['settings/PluginEditor.qml','quickPanel/QuickPanel.qml']:
  from settings_adapter import transform
  dest=shell/'modules/sekai'/relative;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(transform((live/'modules/sekai'/relative).read_text(),relative,True));extra_original[relative]=dest.read_text()
 env=dict(os.environ,XDG_DATA_HOME=str(t/'data'),XDG_STATE_HOME=str(t/'state'),SEKAIPOP_PLUGINS_DIR=str(t/'plugins'))
 data=t/'data/sekaipop/dock-equalizer';data.mkdir(parents=True)
 for name in ['wordtimes','recordings','recording-seen','audio-tmp']:(data/name).mkdir();(data/name/'fixture').write_text('old')
 def run(*args):subprocess.run(['python3',str(s/'install.py'),'--shell-dir',str(shell),'--no-restart',*args],env=env,capture_output=True,text=True,check=True)
 run();assert all(not (data/n).exists() for n in ['wordtimes','recordings','recording-seen','audio-tmp'])
 a=(data/'wallpaper-install-id').read_text()
 # Simulate a shell update replacing all three native integration files.
 for rel,text in [('dock/Dock.qml',dock),('background/WallpaperLayer.qml',wall),('editMode/EditChrome.qml',chrome)]:
  (shell/'modules/sekai'/rel).write_text(text)
 for name in ['wordtimes','recordings','recording-seen','audio-tmp']:
  (data/name).mkdir();(data/name/'fixture').write_text('keep')
 def snapshot():return {str(p.relative_to(data)):p.read_bytes() for p in data.rglob('*') if p.is_file()}
 before=snapshot();run('--repair');assert snapshot()==before
 patched={rel:(shell/'modules/sekai'/rel).read_text() for rel in ['dock/Dock.qml','background/WallpaperLayer.qml','editMode/EditChrome.qml']}
 assert 'id: dockEqualizerAdapter' in patched['dock/Dock.qml']
 run('--repair');assert snapshot()==before
 assert all((shell/'modules/sekai'/rel).read_text()==text for rel,text in patched.items())
 run();assert a!=(data/'wallpaper-install-id').read_text()
 assert (shell/'modules/sekai/background/WallpaperLayer.qml').read_text().count('BEGIN dock-equalizer wallpaper loader')==1
 run('--uninstall')
 assert (shell/'modules/sekai/dock/Dock.qml').read_text()==dock
 assert (shell/'modules/sekai/background/WallpaperLayer.qml').read_text()==wall
 assert (shell/'modules/sekai/editMode/EditChrome.qml').read_text()==chrome
 for relative,text in extra_original.items():assert (shell/'modules/sekai'/relative).read_text()==text,relative
 print('PASS shell update recovery, idempotent repair preserving data, install/reinstall/uninstall, byte-for-byte restore')
