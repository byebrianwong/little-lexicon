// The offline audio pack: every clip, downloaded once and kept on the phone,
// so words, sentences, definitions and memory hooks play without a
// connection.
//
// On each launch, syncAudioPack compares the clips the words file uses with
// the files on the phone. It deletes the ones no longer used and, on Wi-Fi,
// downloads the missing ones: about 93 MB the first time, then only new or
// remade clips. Until a clip is on the phone, src/lib/audio plays it from the
// site.
//
// The files live in the cache folder. Apple asks apps not to keep files they
// can download again in the backed-up documents folder. The system may clear
// the cache when the phone is short of space; the next sync fetches the clips
// again.
//
// Web has no pack (index.web.ts): the browser plays clips from the site.

import { Directory, File, Paths } from 'expo-file-system';
import * as Network from 'expo-network';
import { AUDIO_HOST } from '@/lib/audioHost';
import { resolveClipUrl } from '@/lib/clipUrl';
import { loadContent } from '@/lib/content';
import { clipHash, forEachLimited, looksLikeMp3, planSync, wantedClips } from './plan';

const dir = new Directory(Paths.cache, 'audio-pack');
const PARALLEL = 4;
// After this many failed downloads the sync stops until the next launch,
// rather than trying every clip on a connection that is not working.
const MAX_FAILURES = 10;

/** Hashes of the clips on the phone; null until the first sync has looked. */
let present: Set<string> | null = null;
let running: Promise<void> | null = null;

/** The clip's file on the phone, or null when it is not downloaded yet. */
export function localClip(audioUrl: string | null | undefined): { uri: string } | null {
  const hash = clipHash(audioUrl);
  if (!hash || !present?.has(hash)) return null;
  return { uri: new File(dir, `${hash}.mp3`).uri };
}

/** Bring the pack in line with the words file. Safe to call more than once. */
export function syncAudioPack(): Promise<void> {
  running ??= sync()
    .catch((e: unknown) => console.warn('audio pack: sync failed; the next launch tries again', e))
    .finally(() => {
      running = null;
    });
  return running;
}

async function sync(): Promise<void> {
  if (!dir.exists) dir.create({ intermediates: true });
  const onPhone = new Set<string>();
  for (const entry of dir.list()) {
    const hash = entry instanceof File && entry.name.endsWith('.mp3') ? entry.name.slice(0, -4) : null;
    // Anything else is a half-written download from a run that stopped.
    if (hash) onPhone.add(hash);
    else entry.delete();
  }
  present = onPhone;

  const { words } = await loadContent();
  const plan = planSync(wantedClips(words), onPhone);
  for (const hash of plan.remove) {
    onPhone.delete(hash);
    new File(dir, `${hash}.mp3`).delete();
  }
  if (plan.download.length === 0) return;

  // Off Wi-Fi the clips keep playing from the site, and a later launch on
  // Wi-Fi downloads them.
  const network = await Network.getNetworkStateAsync();
  if (network.type !== Network.NetworkStateType.WIFI && network.type !== Network.NetworkStateType.ETHERNET) {
    return;
  }

  let failures = 0;
  let firstError: unknown = null;
  await forEachLimited(plan.download, PARALLEL, async ({ hash, audioUrl }) => {
    if (failures >= MAX_FAILURES) return;
    const url = resolveClipUrl(audioUrl, AUDIO_HOST);
    if (!url) return;
    const part = new File(dir, `${hash}.part`);
    try {
      await File.downloadFileAsync(url, part, { idempotent: true });
      if (!looksLikeMp3(part.bytesSync().subarray(0, 4))) throw new Error(`${url} is not an MP3`);
      part.move(new File(dir, `${hash}.mp3`));
      onPhone.add(hash);
    } catch (e) {
      failures += 1;
      firstError ??= e;
      if (part.exists) part.delete();
    }
  });
  if (failures > 0) {
    console.warn(
      `audio pack: ${failures} of ${plan.download.length} downloads failed; the next launch tries again`,
      firstError,
    );
  }
}
