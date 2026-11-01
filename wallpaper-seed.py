#!/usr/bin/env python3
"""A private session seed; survives shell restarts, rotates on login/reinstall."""
import fcntl
import json
import os
from pathlib import Path
import secrets
import tempfile

def seed(new=False):
    data=Path(os.environ.get("XDG_DATA_HOME",Path.home()/".local/share"))/"sekaipop/dock-equalizer"
    runtime=Path(os.environ.get("XDG_RUNTIME_DIR",f"/run/user/{os.getuid()}"))/"sekaipop"
    runtime.mkdir(mode=0o700,parents=True,exist_ok=True)
    boot=Path('/proc/sys/kernel/random/boot_id').read_text().strip()
    session=os.environ.get('XDG_SESSION_ID') or os.environ.get('WAYLAND_DISPLAY','')
    install=(data/'wallpaper-install-id').read_text().strip() if (data/'wallpaper-install-id').exists() else 'initial'
    key=boot+':'+session+':'+install
    with (runtime/'procedural-wallpaper.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        target=runtime/'procedural-wallpaper.json'
        try: result=json.loads(target.read_text())
        except (OSError,ValueError): result={}
        if new or result.get('session')!=key:
            result={'session':key,'seed':secrets.token_hex(12)}
            fd,tmp=tempfile.mkstemp(prefix='.wallpaper-',dir=runtime)
            try:
                with os.fdopen(fd,'w') as f: json.dump(result,f)
                os.replace(tmp,target)
            finally:
                if os.path.exists(tmp): os.unlink(tmp)
        return result['seed']
if __name__=='__main__':
    import sys
    print(json.dumps({'seed':seed('--new' in sys.argv)}))
