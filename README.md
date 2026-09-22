(() => {
  'use strict';

  const MODULE_NAME = 'SynthetiqAudiusMusicV130';
  const API = 'https://api.audius.co/v1';
  const APP_NAME = 'SynthetiqMusic';

  function log(message) {
    try { console.log('[' + MODULE_NAME + '] ' + String(message || '')); } catch (_) {}
  }

  function ok(data) {
    return { ok: true, data: JSON.stringify(data) };
  }

  function fail(message) {
    return {
      ok: false,
      error: { message: String(message || 'Audius Music module error') }
    };
  }

  function getConfig() {
    try {
      return globalThis.SYNTHETIQ_CONFIG || {};
    } catch (_) {
      return {};
    }
  }

  function getApiKey() {
    const cfg = getConfig();
    const value = cfg.audiusApiKey || cfg.AUDIUS_API_KEY || '';
    return String(value || '').trim();
  }

  function text(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function artwork(track) {
    const a = track && track.artwork;
    if (!a) return '';
    return text(
      a._1000x1000 ||
      a._480x480 ||
      a._150x150 ||
      (typeof a === 'string' ? a : '')
    );
  }

  function artistName(track) {
    const user = track && track.user;
    if (!user) return '';
    return text(user.name || user.handle || '');
  }

  function streamable(track) {
    return track && (
      track.isStreamable === true ||
      track.isStreamable === 'true' ||
      track.is_streamable === true ||
      track.is_streamable === 'true'
    );
  }

  function mapTrack(track) {
    if (!track || !track.id) return null;

    const id = String(track.id);
    const title = text(track.title);
    const artist = artistName(track);
    const duration = Number(track.duration || 0);

    return {
      id: 'audius:' + id,
      title,
      artist,
      album: '',
      artwork: artwork(track),
      durationSeconds: Number.isFinite(duration) ? duration : 0,
      description: text(track.description),
      genre: text(track.genre),
      source: 'audius',
      sourceId: id,
      permalink: text(track.permalink),
      isStreamable: !!streamable(track),
      downloadable: !!track.downloadable,
      playCount: Number(track.playCount || track.play_count || 0)
    };
  }

  async function readJson(response) {
    if (!response) throw new Error('Audius API returned no response');

    let data;
    try {
      if (typeof response.json === 'function') {
        data = await response.json();
      } else if (typeof response.text === 'function') {
        data = JSON.parse(await response.text());
      } else {
        data = JSON.parse(String(response.body || ''));
      }
    } catch (_) {
      throw new Error('Audius API returned invalid JSON');
    }

    if (!data) throw new Error('Audius API returned an empty response');

    if (data.error) {
      const message =
        typeof data.error === 'string'
          ? data.error
          : (data.error.message || 'Audius API request failed');
      throw new Error(message);
    }

    return data;
  }

  async function apiGet(endpoint, params) {
    const q = Object.assign({}, params || {}, { app_name: APP_NAME });

    // Audius supports public read-only API access. An API key is optional
    // and can be supplied through Synthetiq Music configuration for higher limits.
    const apiKey = getApiKey();
    if (apiKey) q.api_key = apiKey;

    const query = Object.keys(q)
      .filter(k => q[k] !== undefined && q[k] !== null && q[k] !== '')
      .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(String(q[k])))
      .join('&');

    const url = API + endpoint + (query ? '?' + query : '');

    let response;
    if (typeof fetchv2 === 'function') {
      response = await fetchv2(url, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });
    } else if (typeof fetch === 'function') {
      response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });
    } else {
      throw new Error('No HTTP fetch function is available');
    }

    return readJson(response);
  }

  async function searchTracks(query, page) {
    const q = text(query);
    if (!q) return [];

    const pageNumber = Math.max(0, Number(page || 0));
    const limit = 25;
    const offset = pageNumber * limit;

    const data = await apiGet('/tracks/search', {
      query: q,
      limit,
      offset
    });

    const rows = Array.isArray(data.data) ? data.data : [];
    return rows.map(mapTrack).filter(Boolean);
  }

  async function getTrack(trackId) {
    const id = text(trackId).replace(/^audius:/i, '');
    if (!id) throw new Error('Invalid Audius track ID');

    const data = await apiGet('/tracks/' + encodeURIComponent(id));
    const track = data && data.data;
    const mapped = mapTrack(track);

    if (!mapped) throw new Error('Audius track not found');
    return mapped;
  }

  function normalizeId(value) {
    if (value && typeof value === 'object') {
      value = value.id || value.sourceId || value.trackId || '';
    }

    const id = text(value).replace(/^audius:/i, '');
    if (!id) return '';

    // Accept an Audius canonical URL.
    try {
      if (/^https?:\/\//i.test(id)) {
        const u = new URL(id);
        const match = u.pathname.match(/\/tracks\/([^/?#]+)/i);
        if (match) return match[1];
      }
    } catch (_) {}

    return id;
  }

  async function searchResults(query, page) {
    try {
      const q = typeof query === 'object'
        ? (query.query || query.q || '')
        : query;

      const p = typeof query === 'object'
        ? (query.page || page || 0)
        : (page || 0);

      const rows = await searchTracks(q, p);
      return ok(rows);
    } catch (e) {
      log('search failed: ' + (e && e.message ? e.message : e));
      return fail(e && e.message ? e.message : e);
    }
  }

  async function homeSections(page) {
    try {
      if (Number(page || 0) > 0) return ok([]);

      const sections = [];

      const sources = [
        ['Trending', '/tracks/trending'],
        ['New Music', '/tracks/latest']
      ];

      for (const [title, endpoint] of sources) {
        try {
          const data = await apiGet(endpoint, { limit: 12 });
          const rows = Array.isArray(data.data)
            ? data.data.map(mapTrack).filter(Boolean)
            : [];

          if (rows.length) {
            sections.push({
              title,
              type: 'track',
              items: rows
            });
          }
        } catch (e) {
          log('home section failed: ' + title + ': ' +
            (e && e.message ? e.message : e));
        }
      }

      return ok(sections);
    } catch (e) {
      return fail(e && e.message ? e.message : e);
    }
  }

  async function extractDetails(id) {
    try {
      const trackId = normalizeId(id);
      if (!trackId) throw new Error('Invalid Audius track ID');

      return ok(await getTrack(trackId));
    } catch (e) {
      return fail(e && e.message ? e.message : e);
    }
  }

  async function extractTracks(id) {
    try {
      const detail = await extractDetails(id);
      if (!detail.ok) return detail;

      return ok([JSON.parse(detail.data)]);
    } catch (e) {
      return fail(e && e.message ? e.message : e);
    }
  }

  async function extractAudioUrl(id) {
    try {
      const trackId = normalizeId(id);
      if (!trackId) throw new Error('Invalid Audius track ID');

      const track = await getTrack(trackId);

      if (!track.isStreamable) {
        throw new Error('This Audius track is not available for streaming');
      }

      const query = new URLSearchParams({ app_name: APP_NAME });
      const apiKey = getApiKey();
      if (apiKey) query.set('api_key', apiKey);

      const url =
        API + '/tracks/' + encodeURIComponent(trackId) +
        '/stream?' + query.toString();

      return ok({
        url,
        headers: { Accept: 'audio/mpeg' },
        mimeType: 'audio/mpeg',
        extension: 'mp3',
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: track.artwork,
        durationSeconds: track.durationSeconds,
        quality: 'Audius stream',
        source: 'audius',
        sourceId: trackId,
        playbackType: 'audio'
      });
    } catch (e) {
      return fail(e && e.message ? e.message : e);
    }
  }

  globalThis.searchResults = searchResults;
  globalThis.homeSections = homeSections;
  globalThis.extractDetails = extractDetails;
  globalThis.extractTracks = extractTracks;
  globalThis.extractAudioUrl = extractAudioUrl;
})();
{
  "contractVersion": 3,
  "releaseTrack": "stable",
  "contentType": "music",
  "moduleVersion": "1.3.0",
  "moduleFamilyId": "synthetiq_music_hub",
  "moduleIdentity": "SP-MUS-3005-MUSIC-HUB",
  "moduleIdentityNumber": 3005,
  "config": {
    "runtime": {
      "entry": "index.js",
      "mode": "local"
    },
    "caps": {
      "homeMaxResults": 50,
      "maxResponseBytes": 10485760,
      "timeoutMs": 30000,
      "maxConcurrentRequests": 3
    }
  },
  "configuration": {
    "fields": [
      {
        "key": "audiusApiKey",
        "type": "secret",
        "title": "Audius API Key (optional)",
        "required": false,
        "description": "Optional Audius API key for higher API limits. Public read-only access works without a key."
      }
    ]
  },
  "source": {
    "provider": "Audius",
    "api": "https://api.audius.co/v1",
    "audioOnly": true
  }
}
