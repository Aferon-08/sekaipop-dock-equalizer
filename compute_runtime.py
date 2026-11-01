"""Explicit NVIDIA CUDA selection for model workers, independent of Qt/DRI.

Only the worker receives PRIME variables and a CUDA UUID mask. Never select
OpenCL, Vulkan, MPS or an integrated GPU as an implicit fallback.
"""
import gc
import json
import os
from pathlib import Path
import re
import subprocess

ROOT=Path(os.environ.get('XDG_DATA_HOME',Path.home()/'.local/share'))/'sekaipop/dock-equalizer'
_STATE=None
_MODELS={}
_CPU_MODELS=set()
_ACTIVE=None
_NOTIFY=None


def cpu_threads(requested=None):
    available=len(os.sched_getaffinity(0)) if hasattr(os,'sched_getaffinity') else os.cpu_count() or 1
    default=min(8,max(1,available-2))
    try:value=int(requested if requested is not None else os.environ.get('DOCK_COMPUTE_THREADS',default))
    except (ValueError,TypeError):value=default
    return max(1,min(available,value))


def configuration():
    try:
        data=json.loads((ROOT/'compute.json').read_text())
        if not isinstance(data,dict):return {}
        return data
    except (OSError,ValueError):return {}


def nvidia_devices():
    try:
        text=subprocess.check_output(['nvidia-smi','--query-gpu=uuid,name,memory.total','--format=csv,noheader,nounits'],text=True,timeout=5)
        result=[]
        for row in text.splitlines():
            identity,name,memory=[v.strip() for v in row.split(',',2)]
            if re.fullmatch(r'GPU-[0-9a-fA-F-]{36}',identity):
                result.append(dict(uuid=identity,name=name,memoryMiB=int(memory)))
        return result
    except (OSError,ValueError,subprocess.SubprocessError):return []


def selected_python(cpu_python):
    config=configuration();gpu=ROOT/'runtime-cuda/bin/python'
    return gpu if config.get('cudaReady') and gpu.is_file() else cpu_python


def environment():
    env=os.environ.copy();n=str(cpu_threads())
    env.update(OMP_NUM_THREADS=n,MKL_NUM_THREADS=n,OPENBLAS_NUM_THREADS=n,NUMEXPR_NUM_THREADS=n)
    identity=os.environ.get('DOCK_NVIDIA_UUID') or configuration().get('gpuUUID','')
    if re.fullmatch(r'GPU-[0-9a-fA-F-]{36}',identity):
        env.update(CUDA_VISIBLE_DEVICES=identity,CUDA_DEVICE_ORDER='PCI_BUS_ID',
                   __NV_PRIME_RENDER_OFFLOAD='1',__VK_LAYER_NV_optimus='NVIDIA_only',__GLX_VENDOR_LIBRARY_NAME='nvidia')
    return env


def configure(request=None,notify=None):
    global _STATE,_NOTIFY
    if _STATE is not None:return _STATE
    request=request or {};_NOTIFY=notify
    config=configuration();threads=cpu_threads(request.get('threads'))
    os.environ['DOCK_COMPUTE_THREADS']=str(threads)
    for key in ('OMP_NUM_THREADS','MKL_NUM_THREADS','OPENBLAS_NUM_THREADS','NUMEXPR_NUM_THREADS'):os.environ[key]=str(threads)
    identity=os.environ.get('DOCK_NVIDIA_UUID') or config.get('gpuUUID','');mode=request.get('computeMode',os.environ.get('DOCK_COMPUTE_MODE','nvidia'))
    if mode=='cpu':os.environ['CUDA_VISIBLE_DEVICES']=''
    elif re.fullmatch(r'GPU-[0-9a-fA-F-]{36}',identity):os.environ.update(environment())
    import torch
    torch.set_num_threads(threads)
    try:torch.set_num_interop_threads(min(2,threads))
    except RuntimeError:pass
    state=dict(device='cpu',name='CPU',threads=threads,gpuUUID=None,fallbackReason='',stageFallbacks={})
    if mode!='cpu' and identity:
        try:
            if not torch.version.cuda or not torch.cuda.is_available():raise RuntimeError('CUDA-среда или NVIDIA недоступна')
            if os.environ.get('CUDA_VISIBLE_DEVICES')!=identity:raise RuntimeError('Не подтверждена привязка NVIDIA UUID')
            props=torch.cuda.get_device_properties(0)
            if not any(word in props.name.lower() for word in ('nvidia','geforce','quadro','tesla','rtx')):
                raise RuntimeError('CUDA-устройство не распознано как NVIDIA')
            actual=getattr(props,'uuid',None)
            if actual is not None:
                clean=lambda text:re.sub('[^0-9a-f]','',str(text).lower().removeprefix('gpu-'))
                if clean(actual)!=clean(identity):raise RuntimeError('UUID вычислительного GPU не совпадает с выбранной NVIDIA')
            torch.cuda.set_device(0)
            free,total=torch.cuda.mem_get_info(0)
            if free<1024**3:raise RuntimeError('На NVIDIA свободно меньше 1 ГБ видеопамяти')
            fraction=min(.70,(free-512*1024**2)/total)
            torch.cuda.set_per_process_memory_fraction(fraction,0)
            # Check a real CUDA kernel, not only driver/library discovery.
            sample=torch.ones((32,32),device='cuda:0');assert float((sample@sample).sum().item())==32768.
            del sample
            state.update(device='cuda:0',name=props.name,gpuUUID=identity,cuda=torch.version.cuda,
                         memoryBudgetMiB=int(total*fraction/1024**2))
        except (RuntimeError,AssertionError) as error:
            state['fallbackReason']=str(error)[:300]
    elif mode!='cpu':state['fallbackReason']='Дискретная NVIDIA ещё не подготовлена'
    _STATE=state
    if _NOTIFY:_NOTIFY(status())
    return state


def status():
    if _STATE is not None:return dict(_STATE)
    config=configuration()
    return dict(device='cuda:0' if config.get('cudaReady') else 'cpu',name=config.get('gpuName','CPU'),
                gpuUUID=config.get('gpuUUID'),threads=cpu_threads(),configured=True)


def activate(name,model):
    global _ACTIVE
    state=configure();device=state['device'] if name not in _CPU_MODELS else 'cpu'
    if _ACTIVE==(name,id(model),device):
        try:
            if str(next(model.parameters()).device)==device:return device
        except StopIteration:return device
    _ACTIVE=None
    # Keep only one heavy model resident on this 4-GB GPU. Context, renderer and
    # other apps keep their reserved memory; switching never selects Intel.
    for key,other in list(_MODELS.items()):
        if other is not model:
            try:other.to('cpu')
            except (RuntimeError,NotImplementedError):pass
    old=_MODELS.get(name)
    if old is not None and old is not model:old.to('cpu')
    _MODELS[name]=model
    if state['device'].startswith('cuda'):
        import torch
        torch.cuda.empty_cache()
    model.to(device)
    _ACTIVE=(name,id(model),device)
    return device


def use_cpu(name,model,error):
    global _ACTIVE
    _CPU_MODELS.add(name);_ACTIVE=None
    _STATE['stageFallbacks'][name]=str(error)[:250]
    if model is not None:model.to('cpu')
    gc.collect()
    import torch
    if _STATE['device'].startswith('cuda'):torch.cuda.empty_cache()
    if _NOTIFY:_NOTIFY(status())


def gpu_error(error):
    return any(s in str(error).lower() for s in ('cuda','device','memory','cudnn','cublas'))


def run(name,model,operation):
    try:
        device=activate(name,model)
        return operation(device)
    except RuntimeError as error:
        if configure()['device']=='cpu' or name in _CPU_MODELS or not gpu_error(error):raise
        use_cpu(name,model,error)
        return operation('cpu')
