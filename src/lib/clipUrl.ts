// Where the app fetches a pronunciation clip from.
//
// The words file gives each word and sentence an audioUrl relative to the web
// app's site, such as "audio/words/1.mp3?v=f6a11b644f7b". The pipeline writes
// the clips to public/audio, and the web export copies them to the site. The
// web app plays them from its own site; native apps fetch them from the
// production site.

export const DEFAULT_AUDIO_HOST = 'https://littlelexicon.byebrianwong.com';

/**
 * The full URL of a clip, or null when there is no audioUrl. `host` is '' on
 * web, which gives a path from the site's root. An audioUrl that is already a
 * full URL is used as it is.
 */
export function resolveClipUrl(audioUrl: string | null | undefined, host: string): string | null {
  if (!audioUrl) return null;
  if (/^https?:\/\//.test(audioUrl)) return audioUrl;
  return `${host.replace(/\/+$/, '')}/${audioUrl.replace(/^\/+/, '')}`;
}
