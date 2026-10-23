"""Speak text with Kokoro and save each clip as an MP3 (pipeline stage 04).

Stage 04 runs this once per run, with a JSON file of jobs:

    [{"text": "Her fear began to [abate](/əbˈAt/).", "out": "/abs/path/<key>.mp3"}, ...]

A job's text can pin a word's pronunciation with Kokoro's markup, as above:
the word in brackets, then its phonemes between slashes. A job whose output
file already exists is skipped, so a run that stops partway continues where it
left off. Progress goes to stderr.

Kokoro-82M is an open text-to-speech model (Apache 2.0 license), so its clips
can ship in the app. It runs on this computer's CPU and needs no account or
key. The model files are pinned to one commit, so clips do not change when the
model's repository does.

Setup (once): see "Audio" in pipeline/README.md.

Usage, from `pipeline/`:

    ~/.cache/little-lexicon-tts/.venv/bin/python tools/kokoro-tts.py \\
        --voice af_heart --kbps 32 jobs.json
"""

import argparse
import json
import os
import sys
import warnings

REPO = 'hexgrad/Kokoro-82M'
REVISION = 'f3ff3571791e39611d31c381e3a41a3af07b4987'  # 2025-04-10
SAMPLE_RATE = 24000
# Words missing from Kokoro's dictionary are spelled out by espeak-ng, which
# keeps the path of its data folder in a 160-byte buffer. A longer path is cut
# short, and espeak then fails to find its files ("Error processing file
# .../phontab").
ESPEAK_PATH_LIMIT = 160


def log(message: str) -> None:
    print(f'kokoro-tts: {message}', file=sys.stderr, flush=True)


def check_espeak_path() -> None:
    import espeakng_loader

    path = espeakng_loader.get_data_path()
    if len(path.encode()) >= ESPEAK_PATH_LIMIT:
        sys.exit(
            f'kokoro-tts: espeak-ng cannot read its data from a path of {len(path)} characters '
            f'(limit {ESPEAK_PATH_LIMIT - 1}): {path}\n'
            'Make the env in a shorter folder, such as ~/.cache/little-lexicon-tts (pipeline/README.md > Audio).'
        )


def write_mp3(audio, path: str, kbps: int) -> None:
    import lameenc
    import numpy as np

    encoder = lameenc.Encoder()
    encoder.set_bit_rate(kbps)
    encoder.set_in_sample_rate(SAMPLE_RATE)
    encoder.set_channels(1)
    encoder.set_quality(2)  # 2 is LAME's high-quality setting
    pcm = (np.clip(audio, -1, 1) * 32767).astype(np.int16).tobytes()
    data = encoder.encode(pcm) + encoder.flush()
    # Write to a side file first, so a stopped run never leaves half a clip
    # under the real name.
    part = f'{path}.part'
    with open(part, 'wb') as f:
        f.write(data)
    os.replace(part, path)


def main() -> None:
    parser = argparse.ArgumentParser(description='Speak text with Kokoro and save MP3s.')
    parser.add_argument('--voice', required=True, help='Kokoro voice name, such as af_heart')
    parser.add_argument('--kbps', type=int, required=True, help='MP3 bit rate')
    parser.add_argument('jobs', help='JSON file: [{"text": ..., "out": ...}]')
    args = parser.parse_args()

    with open(args.jobs, encoding='utf-8') as f:
        jobs = json.load(f)
    todo = [job for job in jobs if not os.path.exists(job['out'])]
    log(f'{len(jobs)} clips asked for, {len(jobs) - len(todo)} already made.')
    if not todo:
        return

    # torch and transformers print deprecation warnings that say nothing
    # about this run; kokoro logs every chunk at debug level.
    warnings.filterwarnings('ignore')
    from loguru import logger

    logger.remove()
    logger.add(sys.stderr, level='WARNING')

    check_espeak_path()
    import numpy as np
    from huggingface_hub import hf_hub_download
    from kokoro import KModel, KPipeline

    def model_file(name: str) -> str:
        return hf_hub_download(repo_id=REPO, filename=name, revision=REVISION)

    log('Loading the model (the first run downloads about 330 MB).')
    model = KModel(
        repo_id=REPO,
        config=model_file('config.json'),
        model=model_file('kokoro-v1_0.pth'),
    ).eval()
    pipeline = KPipeline(lang_code='a', repo_id=REPO, model=model)
    voice = model_file(f'voices/{args.voice}.pt')

    for done, job in enumerate(todo, start=1):
        os.makedirs(os.path.dirname(job['out']), exist_ok=True)
        chunks = [r.audio.numpy() for r in pipeline(job['text'], voice=voice) if r.audio is not None]
        if not chunks:
            sys.exit(f'kokoro-tts: no audio came back for {job["text"]!r}')
        write_mp3(np.concatenate(chunks), job['out'], args.kbps)
        if done % 100 == 0 or done == len(todo):
            log(f'{done} of {len(todo)} made.')


if __name__ == '__main__':
    main()
