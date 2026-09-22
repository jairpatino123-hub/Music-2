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
      if (v !== undefined && v !== null && v !== '') {
        url.searchParams.set(k, String(v));
      }
    }

    if (key) {
      url.searchParams.set('api_key', String(key));
      url.searchParams.set('app_name', 'SynthetiqMusic');
    }

    return url.toString();
  }

  async function get(path, params) {
    const response = await fetch(makeUrl(path, params));

    if (!response.ok) {
      throw new Error(`Audius HTTP ${response.status}`);
    }

    return response.json();
  }

  function artwork(track) {
    const image = track && track.artwork;

    if (!image) return '';

    if (typeof image === 'string') {
      return image;
    }

    return image['1000x1000'] ||
           image['480x480'] ||
           image['150x150'] ||
           '';
  }

  function normalize(track) {
    if (!track) return null;

    return {
      id: String(track.id),
      title: track.title || 'Unknown Title',
      artist:
        track.user?.name ||
        track.user?.handle ||
        'Unknown Artist',
      album: track.album?.name || '',
      artwork: artwork(track),
      durationSeconds: Number(track.duration) || 0,
      quality: 'mp3',
      source: 'Audius'
    };
  }

  async function searchResults(query, page = 1) {
    const q = String(query || '').trim();

    if (!q) return [];

    const limit = 25;
    const offset =
      Math.max(0, Number(page || 1) - 1) * limit;

    const response = await get('/tracks/search', {
      query: q,
      limit,
      offset
    });

    return (response.data || [])
      .map(normalize)
      .filter(Boolean);
  }

  async function homeSections() {
    const [trending, latest] = await Promise.all([
      get('/tracks/trending', { limit: 25 }),
      get('/tracks/latest', { limit: 25 })
    ]);

    return [
      {
        title: 'Trending',
        items: (trending.data || [])
          .map(normalize)
          .filter(Boolean)
      },
      {
        title: 'Latest',
        items: (latest.data || [])
          .map(normalize)
          .filter(Boolean)
      }
    ];
  }

  async function extractDetails(item) {
    const id =
      typeof item === 'object'
        ? item?.id
        : item;

    if (!id) return null;

    const response = await get(
      `/tracks/${encodeURIComponent(id)}`
    );

    return normalize(response.data);
  }

  async function extractTracks(item) {
    if (Array.isArray(item)) {
      return item
        .map(normalize)
        .filter(Boolean);
    }

    if (Array.isArray(item?.tracks)) {
      return item.tracks
        .map(normalize)
        .filter(Boolean);
    }

    const track = normalize(item);

    return track ? [track] : [];
  }

  async function extractAudioUrl(item) {
    const track = normalize(item);

    if (!track?.id) return null;

    return {
      url: makeUrl(
        `/tracks/${encodeURIComponent(track.id)}/stream`
      ),
      headers: {},
      mimeType: 'audio/mpeg',
      extension: 'mp3',
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork: track.artwork,
      durationSeconds: track.durationSeconds,
      quality: track.quality
    };
  }

  const api = {
    searchResults,
    homeSections,
    extractDetails,
    extractTracks,
    extractAudioUrl
  };

  globalThis[MODULE_NAME] = api;

  globalThis.searchResults = searchResults;
  globalThis.homeSections = homeSections;
  globalThis.extractDetails = extractDetails;
  globalThis.extractTracks = extractTracks;
  globalThis.extractAudioUrl = extractAudioUrl;
})();
