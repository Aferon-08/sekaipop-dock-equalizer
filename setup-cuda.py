#!/usr/bin/env python3
"""Prepare a separate verified NVIDIA runtime; keep CPU fallback untouched."""
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import compute_runtime as compute

ROOT=compute.ROOT


def emit(phase,fraction):print(json.dumps(dict(type='progress',phase=phase,fraction=fraction)),flush=True)


def stop(_sig,_frame):
    signal.signal(signal.SIGTERM,signal.SIG_IGN)
    if os.getpgrp()==os.getpid():os.killpg(os.getpgrp(),signal.SIGTERM)
    raise InterruptedError()


def main():
    if os.getpgrp()!=os.getpid():os.setsid()
    signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
    try:
        devices=compute.nvidia_devices()
        if not devices:raise ValueError('Дискретная NVIDIA не найдена через nvidia-smi.')
        current=compute.configuration().get('gpuUUID')
        gpu=next((d for d in devices if d['uuid']==current),max(devices,key=lambda d:d['memoryMiB']))
        base=ROOT/'runtime/bin/python';python=ROOT/'runtime-cuda/bin/python'
        if not base.is_file() or not shutil.which('uv'):raise ValueError('Сначала подготовьте основной обработчик и uv.')
        emit('cuda_setup',.05)
        if not python.is_file():subprocess.run(['uv','venv','--python',str(base),str(python.parent.parent)],check=True,stdout=sys.stderr)
        emit('cuda_dependencies',.15)
        subprocess.run(['uv','pip','install','--python',str(python),'--torch-backend','cu128','-r',str(Path(__file__).with_name('wordtime-cuda-requirements.txt'))],check=True,stdout=sys.stderr,stderr=sys.stderr)
        emit('cuda_verifying',.85)
        code='import sys,json;sys.path.insert(0,'+repr(str(Path(__file__).parent))+');import torch,torchaudio,stable_whisper,compute_runtime as c; s=c.configure(); assert s["device"]=="cuda:0", s; print(json.dumps(s))'
        env=compute.environment();env.update(DOCK_NVIDIA_UUID=gpu['uuid'],CUDA_VISIBLE_DEVICES=gpu['uuid'],DOCK_COMPUTE_MODE='nvidia')
        probe=subprocess.run([str(python),'-c',code],env=env,capture_output=True,text=True,check=True,timeout=90)
        result=json.loads(probe.stdout.strip().splitlines()[-1])
        lock=subprocess.check_output(['uv','pip','freeze','--python',str(python)],text=True)
        (ROOT/'runtime-cuda-lock.txt').write_text(lock)
        config={'cudaReady':True,'gpuUUID':gpu['uuid'],'gpuName':result['name'],'torch':'2.11.0+cu128','cuda':result.get('cuda'),'cpuThreads':compute.cpu_threads(),'verified':True}
        descriptor,temporary=tempfile.mkstemp(prefix='.compute-',dir=ROOT)
        try:
            with os.fdopen(descriptor,'w') as file:json.dump(config,file)
            os.replace(temporary,ROOT/'compute.json')
        finally:Path(temporary).unlink(missing_ok=True)
        print(json.dumps(dict(type='result',ok=True,compute=result),ensure_ascii=False),flush=True);return 0
    except InterruptedError:message='Подготовка NVIDIA отменена.'
    except Exception as error:
        print(repr(error),file=sys.stderr)
        if isinstance(error,subprocess.CalledProcessError):print(getattr(error,'stderr',''),file=sys.stderr)
        message=str(error) if isinstance(error,ValueError) else 'Не удалось подготовить CUDA. CPU-обработчик сохранён.'
    print(json.dumps(dict(type='result',ok=False,message=message),ensure_ascii=False),flush=True);return 2

if __name__=='__main__':raise SystemExit(main())
