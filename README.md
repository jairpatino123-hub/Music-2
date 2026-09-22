(() => {
  'use strict';

  const MODULE_NAME = 'SynthetiqYouTubeMusicV120';
  const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3';
  const YOUTUBE_WATCH = 'https://www.youtube.com/watch?v=';
  const YOUTUBE_EMBED = 'https://www.youtube.com/embed/';
  const YOUTUBE_THUMB = 'https://i.ytimg.com/vi/';
  const DEFAULT_REGION = 'US';
  const DEFAULT_LANGUAGE = 'en';

  /*
   * API key is intentionally NOT embedded in this package.
   * The runtime expects Synthetiq Music to inject:
   *   globalThis.SYNTHETIQ_CONFIG.youtubeApiKey
   * The module also accepts SYNTHETIQ_CONFIG.YOUTUBE_API_KEY for compatibility.
   */

  function log(message) {
    try { console.log('[' + MODULE_NAME + '] ' + String(message || '')); } catch (_) {}
  }

  function fail(message) {
    return { ok: false, error: { message: String(message || 'YouTube Music module error') } };
  }

  function ok(data) {
    return { ok: true, data: JSON.stringify(data) };
  }

  function getApiKey() {
    try {
      const k = globalThis.SYNTHETIQ_CONFIG &&
        (globalThis.SYNTHETIQ_CONFIG.youtubeApiKey || globalThis.SYNTHETIQ_CONFIG.YOUTUBE_API_KEY);
      if (k && String(k).trim()) return String(k).trim();
    } catch (_) {}

    try {
      if (typeof process !== 'undefined' && process.env && process.env.YOUTUBE_API_KEY) {
        return String(process.env.YOUTUBE_API_KEY).trim();
      }
    } catch (_) {}

    return '';
  }

  function text(v) {
    return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  }

  function pickThumb(snippet) {
    const t = snippet && snippet.thumbnails;
    return text((t && ((t.maxres && t.maxres.url) || (t.high && t.high.url) ||
      (t.medium && t.medium.url) || (t.default && t.default.url))) || '');
  }

  function parseDuration(iso) {
    const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(String(iso || ''));
    if (!m) return 0;
    return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
  }

  async function getJson(endpoint, params) {
    const key = getApiKey();
    if (!key) {
      throw new Error('YouTube Data API key is not configured. Enter it in the Synthetiq Music module configuration as youtubeApiKey.');
    }

    const q = Object.assign({}, params || {}, { key });
    const url = YOUTUBE_API + endpoint + '?' + Object.keys(q)
      .filter(k => q[k] !== undefined && q[k] !== null && q[k] !== '')
      .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(String(q[k])))
      .join('&');

    let response;
    if (typeof fetchv2 === 'function') {
      response = await fetchv2(url, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });
    } else {
      response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
    }

    let data;
    try {
      if (response && typeof response.json === 'function') data = await response.json();
      else if (response && typeof response.text === 'function') data = JSON.parse(await response.text());
      else data = JSON.parse(String(response && response.body || ''));
    } catch (_) {
      throw new Error('YouTube API returned invalid JSON');
    }

    if (!data || data.error) {
      const msg = data && data.error && data.error.message ? data.error.message : 'YouTube API request failed';
      throw new Error(msg);
    }
    return data;
  }

  function mapSearchVideo(item) {
    const id = item && item.id && item.id.videoId;
    const s = item && item.snippet;
    if (!id || !s) return null;
    return {
      id: 'yt:' + id,
      title: text(s.title),
      artist: text(s.channelTitle),
      album: '',
      artwork: pickThumb(s) || (YOUTUBE_THUMB + id + '/hqdefault.jpg'),
      durationSeconds: 0,
      description: text(s.description),
      source: 'youtube',
      videoId: id,
      videoUrl: YOUTUBE_WATCH + encodeURIComponent(id),
      embedUrl: YOUTUBE_EMBED + encodeURIComponent(id)
    };
  }

  function mapVideo(item) {
    const id = item && item.id;
    const s = item && item.snippet;
    const c = item && item.contentDetails;
    if (!id || !s) return null;
    return {
      id: 'yt:' + id,
      title: text(s.title),
      artist: text(s.channelTitle),
      album: '',
      artwork: pickThumb(s) || (YOUTUBE_THUMB + id + '/hqdefault.jpg'),
      durationSeconds: parseDuration(c && c.duration),
      description: text(s.description),
      source: 'youtube',
      videoId: id,
      videoUrl: YOUTUBE_WATCH + encodeURIComponent(id),
      embedUrl: YOUTUBE_EMBED + encodeURIComponent(id)
    };
  }

  async function searchYouTube(query, pageToken) {
    const data = await getJson('/search', {
      part: 'snippet',
      q: text(query),
      type: 'video',
      maxResults: 25,
      pageToken: pageToken || undefined,
      regionCode: DEFAULT_REGION,
      relevanceLanguage: DEFAULT_LANGUAGE,
      videoEmbeddable: 'true',
      videoSyndicated: 'true',
      order: 'relevance'
    });

    const rows = (data.items || []).map(mapSearchVideo).filter(Boolean);
    return { rows, nextPageToken: data.nextPageToken || '' };
  }

  async function getVideos(ids) {
    const list = Array.isArray(ids) ? ids.filter(Boolean) : [ids].filter(Boolean);
    if (!list.length) return [];
    const data = await getJson('/videos', {
      part: 'snippet,contentDetails',
      id: list.slice(0, 50).join(',')
    });
    return (data.items || []).map(mapVideo).filter(Boolean);
  }

  function normalizeId(id) {
    const s = text(id).replace(/^yt:/i, '');
    if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;

    try {
      const u = new URL(s);
      if (u.hostname === 'youtu.be') return u.pathname.replace(/^\/+/, '').slice(0, 11);
      if (u.hostname.includes('youtube.com')) return u.searchParams.get('v') || '';
      if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2] || '';
    } catch (_) {}
    return '';
  }

  async function searchResults(query, page) {
    try {
      const q = typeof query === 'object' ? (query.query || query.q || '') : query;
      const p = Number(page || 0);
      const result = await searchYouTube(q, p > 0 && typeof query === 'object' ? query.pageToken : undefined);
      return ok(result.rows);
    } catch (e) {
      log('search failed: ' + (e && e.message ? e.message : e));
      return fail(e && e.message ? e.message : e);
    }
  }

  async function homeSections(page) {
    try {
      if (Number(page || 0) > 0) return ok([]);
      const queries = [
        ['Music Videos', 'official music video'],
        ['New Music', 'new music official'],
        ['Popular Songs', 'popular songs official music video']
      ];
      const sections = [];

      for (const row of queries) {
        try {
          const r = await searchYouTube(row[1]);
          if (r.rows.length) sections.push({
            title: row[0],
            type: 'track',
            items: r.rows.slice(0, 12)
          });
        } catch (e) {
          log('home section failed: ' + row[0] + ': ' + (e && e.message ? e.message : e));
        }
      }

      return ok(sections);
    } catch (e) {
      return fail(e && e.message ? e.message : e);
    }
  }

  async function extractDetails(id) {
    try {
      const videoId = normalizeId(typeof id === 'object' ? (id.id || id.videoId || '') : id);
      if (!videoId) throw new Error('Invalid YouTube video ID');
      const rows = await getVideos([videoId]);
      if (!rows.length) throw new Error('YouTube video not found');
      return ok(rows[0]);
    } catch (e) {
      return fail(e && e.message ? e.message : e);
    }
  }

  async function extractTracks(id) {
    try {
      const detail = await extractDetails(id);
      if (!detail.ok) return detail;
      const item = JSON.parse(detail.data);
      return ok([item]);
    } catch (e) {
      return fail(e && e.message ? e.message : e);
    }
  }

  async function extractAudioUrl(id) {
    try {
      const videoId = normalizeId(typeof id === 'object' ? (id.id || id.videoId || '') : id);
      if (!videoId) throw new Error('Invalid YouTube video ID');

      const rows = await getVideos([videoId]);
      const item = rows[0];
      if (!item) throw new Error('YouTube video not found');

      /*
       * This intentionally returns the supported YouTube player URL rather than
       * pretending that the Data API supplies a raw audio file URL.
       */
      return ok({
        url: item.embedUrl,
        playbackUrl: item.videoUrl,
        videoId,
        title: item.title,
        artist: item.artist,
        album: item.album,
        artwork: item.artwork,
        durationSeconds: item.durationSeconds,
        source: 'youtube',
        playbackType: 'youtube-embed'
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
