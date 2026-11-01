#!/usr/bin/env python3
"""Install optional CPU evidence models without changing the timing runtime."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from urllib.request import urlopen

ROOT = Path(os.environ.get('XDG_DATA_HOME', str(Path.home() / '.local/share'))) / 'sekaipop/dock-equalizer'
REVISION = '8e750521b5942f4717656cac86a23cf0bd90dea5'
HASHES = {
    'look2hear/models/layers/activations.py': 'bc3707fd81e8783007b1dfe7fd23f9cdde5fc5c087028a62e7c1415e70d3cfc1',
    'look2hear/models/layers/normalizations.py': '5d8305d3b45afde0ff635fd7ebd3fa31a92ff6047ed610a19b9090896cba73b9',
    'ckpt/best.ckpt': 'edd8bd0782f85ebb8a6b26bec47808b3130d15c2ccd49c741d2ff5983cb6c359',
    'look2hear/models/unmixx_model.py': '225c7a9e2ebb63cfe42be9737fa32fe86426bf0455f04aeb7cfb947281b9403b',
}
EMBED_HASH = 'aa3cfc16963a10586a9393f5035d6d6b57e98d358b347f80c2a30bf4f00ceba2'
STEM_HASH = '8726e21a993978c7ba086d3872e7608d7d5bfca646ca4aca459ffda844faa8b4'
STEM_DEPS = ['demucs==4.0.1', 'dora-search==0.1.12', 'julius==0.2.7', 'lameenc==1.8.1', 'openunmix==1.3.0', 'einops==0.8.1', 'omegaconf==2.3.0', 'PyYAML==6.0.3', 'submitit==1.5.4', 'treetable==0.2.6', 'retrying==1.4.2', 'antlr4-python3-runtime==4.9.3', 'cloudpickle==3.1.2', 'hydra-core==1.3.2', 'packaging==26.3', 'tqdm==4.67.1']
DEPS = ['sherpa-onnx==1.12.32', 'sherpa-onnx-core==1.12.32', 'numpy==2.5.4', 'scipy==1.18.1']

def sha(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()

def main():
    base_python = ROOT / 'runtime/bin/python'
    if not base_python.is_file():
        raise SystemExit('Prepare the word-timing runtime before optional multivoice models.')
    uv = shutil.which('uv')
    if not uv:
        raise SystemExit('The uv package manager is required for isolated optional dependencies.')
    ROOT.mkdir(parents=True, exist_ok=True)
    runtime = ROOT / 'multivoice-runtime'
    if not (runtime / 'bin/python').is_file():
        subprocess.run([uv, 'venv', '--python', str(base_python), str(runtime)], check=True)
    subprocess.run([uv, 'pip', 'install', '--python', str(runtime / 'bin/python'), *DEPS], check=True)
    subprocess.run([uv, 'pip', 'install', '--python', str(runtime / 'bin/python'), '--no-deps', *STEM_DEPS], check=True)
    source = ROOT / ('unmixx-' + REVISION[:8])
    if not source.exists():
        subprocess.run(['git', 'clone', '--quiet', '--no-checkout', 'https://github.com/jihoojung0106/unmixx', str(source)], check=True)
        subprocess.run(['git', '-C', str(source), 'checkout', '--quiet', REVISION], check=True)
    actual = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
    if actual != REVISION:
        raise SystemExit('Existing UNMIXX checkout differs from the pinned revision; kept it intact.')
    for relative, expected in HASHES.items():
        if sha(source / relative) != expected:
            raise SystemExit('UNMIXX checksum mismatch: ' + relative)
    embedding = ROOT / 'models/campplus-zh-en.onnx'
    embedding.parent.mkdir(parents=True, exist_ok=True)
    if not embedding.is_file():
        url = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx'
        descriptor, temporary = tempfile.mkstemp(prefix='campplus-', suffix='.onnx', dir=embedding.parent)
        os.close(descriptor)
        temporary = Path(temporary)
        try:
            with urlopen(url, timeout=60) as remote, temporary.open('wb') as output:
                shutil.copyfileobj(remote, output)
            if sha(temporary) != EMBED_HASH:
                raise ValueError('CAM++ checksum mismatch.')
            temporary.replace(embedding)
        finally:
            temporary.unlink(missing_ok=True)
    if sha(embedding) != EMBED_HASH:
        raise SystemExit('Existing CAM++ model checksum mismatch; kept it intact.')
    stem = ROOT / 'models/955717e8-8726e21a.th'
    if not stem.is_file():
        descriptor, temporary = tempfile.mkstemp(prefix='demucs-', suffix='.th', dir=stem.parent)
        os.close(descriptor)
        temporary = Path(temporary)
        try:
            with urlopen('https://dl.fbaipublicfiles.com/demucs/hybrid_transformer/955717e8-8726e21a.th', timeout=60) as remote, temporary.open('wb') as output:
                shutil.copyfileobj(remote, output)
            if sha(temporary) != STEM_HASH:
                raise ValueError('Demucs checksum mismatch.')
            temporary.replace(stem)
        finally:
            temporary.unlink(missing_ok=True)
    if sha(stem) != STEM_HASH:
        raise SystemExit('Existing Demucs checksum mismatch; kept it intact.')
    singer = ROOT / 'models/singer-byol.ts'
    singer_hash = 'e658943ca6ec063cbdafda0b7a8be5ff7b78b66cf9e4aaaddead41edc4d937a0'
    if not singer.is_file():
        descriptor, temporary = tempfile.mkstemp(prefix='singer-', suffix='.ts', dir=singer.parent)
        os.close(descriptor); temporary=Path(temporary)
        try:
            url='https://huggingface.co/BernardoTorres/singer-identity/resolve/55e09cdfcd733b1c01f2b94f316a0280995a909e/byol/model.ts'
            with urlopen(url,timeout=60) as remote, temporary.open('wb') as output:shutil.copyfileobj(remote,output)
            if sha(temporary)!=singer_hash:raise ValueError('Singer encoder checksum mismatch.')
            temporary.replace(singer)
        finally:temporary.unlink(missing_ok=True)
    if sha(singer)!=singer_hash:raise SystemExit('Existing singer encoder checksum mismatch; kept intact.')
    manifest = {'ready': True, 'revision': REVISION, 'checksums': HASHES,
                'embeddingChecksum': EMBED_HASH, 'dependencies': DEPS,
                'stemDependencies': STEM_DEPS, 'stemChecksum': STEM_HASH,
                'device': 'cpu', 'maxSimultaneousVoices': 2, 'totalVoicesLimit': 16,
                'identityDomain': 'speech+singing', 'singerChecksum': singer_hash, 'requiresVocalStemForReliableSeparation': True}
    (ROOT / 'multivoice-runtime.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(manifest))

if __name__ == '__main__':
    main()
