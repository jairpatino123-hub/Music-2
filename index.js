(() => {
  'use strict';

  const MODULE_NAME = 'SynthetiqAudiusMusicV130';
  const API_BASE = 'https://api.audius.co/v1';

  const config = () => globalThis.SYNTHETIQ_CONFIG || {};

  function makeUrl(path, params = {}) {
    const url = new URL(API_BASE + path);
    const c = config();
    const key = c.audiusApiKey || c.AUDIUS_API_KEY;

    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    if (key) {
      url.searchParams.set('api_key', String(key));
      url.searchParams.set('app_name', 'SynthetiqMusic');
    }
    return url.toString();
  }

  async function get(path, params) {
    const r = await fetch(makeUrl(path, params));
    if (!r.ok) throw new Error(`Audius HTTP ${r.status}`);
    return r.json();
  }

  function artwork(t) {
    const a = t && t.artwork;
    if (!a) return '';
    if (typeof a === 'string') return a;
    return a['1000x1000'] || a['480x480'] || a['150x150'] || '';
  }

  function normalize(t) {
    if (!t) return null;
    return {
      id: String(t.id),
      title: t.title || 'Unknown Title',
      artist: t.user?.name || t.user?.handle || 'Unknown Artist',
      album: t.album?.name || '',
      artwork: artwork(t),
      durationSeconds: Number(t.duration) || 0,
      quality: 'mp3',
      source: 'Audius'
    };
  }

  async function searchResults(query, page = 1) {
    const q = String(query || '').trim();
    if (!q) return [];
    const limit = 25;
    const offset = Math.max(0, Number(page || 1) - 1) * limit;
    const r = await get('/tracks/search', { query: q, limit, offset });
    return (r.data || []).map(normalize).filter(Boolean);
  }

  async function homeSections() {
    const [a, b] = await Promise.all([
      get('/tracks/trending', { limit: 25 }),
      get('/tracks/latest', { limit: 25 })
    ]);
    return [
      { title: 'Trending', items: (a.data || []).map(normalize).filter(Boolean) },
      { title: 'Latest', items: (b.data || []).map(normalize).filter(Boolean) }
    ];
  }

  async function extractDetails(item) {
    const id = typeof item === 'object' ? item?.id : item;
    if (!id) return null;
    const r = await get(`/tracks/${encodeURIComponent(id)}`);
    return normalize(r.data);
  }

  async function extractTracks(item) {
    if (Array.isArray(item)) return item.map(normalize).filter(Boolean);
    if (Array.isArray(item?.tracks)) return item.tracks.map(normalize).filter(Boolean);
    const t = normalize(item);
    return t ? [t] : [];
  }

  async function extractAudioUrl(item) {
    const t = normalize(item);
    if (!t?.id) return null;

    return {
      url: makeUrl(`/tracks/${encodeURIComponent(t.id)}/stream`),
      headers: {},
      mimeType: 'audio/mpeg',
      extension: 'mp3',
      title: t.title,
      artist: t.artist,
      album: t.album,
      artwork: t.artwork,
      durationSeconds: t.durationSeconds,
      quality: t.quality
    };
  }

  const api = { searchResults, homeSections, extractDetails, extractTracks, extractAudioUrl };
  globalThis[MODULE_NAME] = api;
  globalThis.searchResults = searchResults;
  globalThis.homeSections = homeSections;
  globalThis.extractDetails = extractDetails;
  globalThis.extractTracks = extractTracks;
  globalThis.extractAudioUrl = extractAudioUrl;
})();
