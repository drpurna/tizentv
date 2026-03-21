// ================================================================
// IPTV v1.0.2 — app.js with HLS.js and intelligent caching
// ================================================================

// Version info from HTML
const APP_VERSION = window.APP_VERSION || '1.0.2';
const IS_NEW_VERSION = window.IS_NEW_VERSION || false;

console.log(`🚀 IPTV v${APP_VERSION} starting ${IS_NEW_VERSION ? '(fresh install)' : '(cached mode)'}`);

// DOM Elements
const playlistUrlEl = document.getElementById('playlistUrl');
const loadBtn = document.getElementById('loadBtn');
const defaultBtn = document.getElementById('defaultBtn');
const searchInput = document.getElementById('searchInput');
const channelListEl = document.getElementById('channelList');
const countBadge = document.getElementById('countBadge');
const nowPlayingEl = document.getElementById('nowPlaying');
const nowGroupEl = document.getElementById('nowGroup');
const statusTextEl = document.getElementById('statusText');
const video = document.getElementById('video');
const videoWrap = document.getElementById('videoWrap');

// HLS.js instance
let hls = null;
let currentHlsUrl = null;

// App state
let channels = [];
let filtered = [];
let selectedIndex = 0;
let focusArea = 'list';
let plIdx = 0;
let isFullscreen = false;
let lastTap = 0;

// Cache keys
const STORAGE_KEY = 'iptv:lastPlaylist';
const CACHE_CHANNELS_KEY = 'iptv_channels';
const CACHE_PLAYLIST_KEY = 'iptv_playlist_url';
const CACHE_TIMESTAMP_KEY = 'iptv_channels_timestamp';

// Default playlists
const DEFAULT_PLAYLISTS = [
  { name: 'Telugu', url: 'https://iptv-org.github.io/iptv/languages/tel.m3u' },
  { name: 'Hindi', url: 'https://iptv-org.github.io/iptv/languages/hin.m3u' },
  { name: 'English', url: 'https://iptv-org.github.io/iptv/languages/eng.m3u' },
  { name: 'Kids', url: 'https://iptv-org.github.io/iptv/categories/kids.m3u' },
  { name: 'News', url: 'https://iptv-org.github.io/iptv/categories/news.m3u' },
  { name: 'Sports', url: 'https://iptv-org.github.io/iptv/categories/sports.m3u' },
  { name: 'Movies', url: 'https://iptv-org.github.io/iptv/categories/movies.m3u' },
];

// ================================================================
// Storage Manager
// ================================================================
class StorageManager {
  constructor() {
    this.MAX_STORAGE_MB = 5;
  }
  
  checkStorageUsage() {
    try {
      let total = 0;
      for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          total += (localStorage[key] || '').length * 2;
        }
      }
      const usedMB = (total / (1024 * 1024)).toFixed(2);
      console.log(`💾 Storage usage: ${usedMB} MB / ${this.MAX_STORAGE_MB} MB`);
      return usedMB;
    } catch(e) {
      return 'unknown';
    }
  }
  
  saveChannels(channels, url) {
    try {
      const compressed = JSON.stringify(channels);
      localStorage.setItem(CACHE_CHANNELS_KEY, compressed);
      localStorage.setItem(CACHE_PLAYLIST_KEY, url);
      localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
      console.log('💾 Channels cached');
    } catch(e) {
      console.warn('Failed to cache channels:', e);
    }
  }
  
  loadChannels() {
    try {
      const cached = localStorage.getItem(CACHE_CHANNELS_KEY);
      const url = localStorage.getItem(CACHE_PLAYLIST_KEY);
      const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
      
      if (cached && url) {
        const channels = JSON.parse(cached);
        const cacheAge = timestamp ? Date.now() - parseInt(timestamp) : Infinity;
        return { channels, url, cacheAge };
      }
    } catch(e) {
      console.warn('Failed to load cached channels:', e);
    }
    return null;
  }
  
  cleanOldData() {
    const keysToKeep = ['iptv_version', 'iptv_last_update', STORAGE_KEY];
    for (let key in localStorage) {
      if (!keysToKeep.includes(key) && localStorage.hasOwnProperty(key)) {
        localStorage.removeItem(key);
      }
    }
    console.log('🧹 Cleaned old data');
  }
}

const storageManager = new StorageManager();

// ================================================================
// HLS.js Configuration
// ================================================================
const HLS_CONFIG = {
  enableWorker: true,
  lowLatencyMode: true,
  maxBufferLength: 30,
  maxMaxBufferLength: 600,
  backBufferLength: 60,
  liveBackBufferLength: 60,
  maxBufferSize: 60 * 1000 * 1000,
  maxBufferHole: 0.5,
  maxFragLookUpTolerance: 0.25,
  abrEwmaFastLive: 3,
  abrEwmaSlowLive: 9,
  abrEwmaFastVoD: 3,
  abrEwmaSlowVoD: 9,
  abrEwmaDefaultEstimate: 5e5,
  abrBandWidthFactor: 0.95,
  abrBandWidthUpFactor: 0.7,
  capLevelToPlayerSize: true,
  capLevelOnFPSDrop: true,
  stretchShortVideoTrack: true,
  enableSoftwareAES: true,
  progressive: false,
  debug: false
};

// ================================================================
// Utility Functions
// ================================================================
function setStatus(text) {
  if (statusTextEl) statusTextEl.textContent = text;
  console.log(`[STATUS] ${text}`);
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ================================================================
// M3U Parser
// ================================================================
function parseM3U(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let currentMeta = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF')) {
      const namePart = line.includes(',') ? line.split(',').slice(1).join(',').trim() : 'Unknown';
      const groupMatch = line.match(/group-title="([^"]+)"/i);
      currentMeta = {
        name: namePart || 'Unknown',
        group: groupMatch ? groupMatch[1] : 'Other',
      };
      continue;
    }

    if (!line.startsWith('#')) {
      out.push({
        name: currentMeta?.name || line,
        group: currentMeta?.group || 'Other',
        url: line,
      });
      currentMeta = null;
    }
  }
  return out;
}

// ================================================================
// Render Functions
// ================================================================
function renderList() {
  if (!channelListEl) return;
  channelListEl.innerHTML = '';
  if (countBadge) countBadge.textContent = filtered.length;

  if (!filtered.length) {
    const li = document.createElement('li');
    li.textContent = 'No channels';
    channelListEl.appendChild(li);
    return;
  }

  filtered.forEach((ch, idx) => {
    const li = document.createElement('li');
    if (idx === selectedIndex) li.classList.add('active');
    li.innerHTML = `<div class="ch-name">${escHtml(ch.name)}</div><div class="meta">${escHtml(ch.group)}</div>`;
    li.onclick = () => {
      selectedIndex = idx;
      renderList();
      playSelected();
    };
    channelListEl.appendChild(li);
  });

  const active = channelListEl.querySelector('li.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

function applySearch() {
  const q = searchInput ? searchInput.value.trim().toLowerCase() : '';
  filtered = !q ? [...channels] : channels.filter(c => c.name.toLowerCase().includes(q) || c.group.toLowerCase().includes(q));
  if (selectedIndex >= filtered.length) selectedIndex = Math.max(0, filtered.length - 1);
  renderList();
}

function moveSelection(delta) {
  if (!filtered.length) return;
  selectedIndex += delta;
  if (selectedIndex < 0) selectedIndex = 0;
  if (selectedIndex >= filtered.length) selectedIndex = filtered.length - 1;
  renderList();
}

function setFocusArea(area) {
  focusArea = area;
  if (area === 'url' && playlistUrlEl) {
    playlistUrlEl.focus();
  } else if (area === 'search' && searchInput) {
    searchInput.focus();
  } else {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') {
      document.activeElement.blur();
    }
  }
}

// ================================================================
// XHR Fetch
// ================================================================
function xhrFetch(url, timeoutMs, callback) {
  let done = false;
  const xhr = new XMLHttpRequest();
  const tid = setTimeout(() => {
    if (done) return;
    done = true;
    xhr.abort();
    callback(new Error('Timeout'), null);
  }, timeoutMs);

  xhr.onreadystatechange = function() {
    if (xhr.readyState !== 4) return;
    if (done) return;
    done = true;
    clearTimeout(tid);
    if (xhr.status >= 200 && xhr.status < 400) {
      callback(null, xhr.responseText);
    } else {
      callback(new Error('HTTP ' + xhr.status), null);
    }
  };

  xhr.onerror = function() {
    if (done) return;
    done = true;
    clearTimeout(tid);
    callback(new Error('Network error'), null);
  };

  xhr.open('GET', url, true);
  xhr.send();
}

function githubRawToJsdelivr(url) {
  try {
    const u = new URL(url);
    if (u.hostname !== 'raw.githubusercontent.com') return null;
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 4) return null;
    return `https://cdn.jsdelivr.net/gh/${parts[0]}/${parts[1]}@${parts[2]}/${parts.slice(3).join('/')}`;
  } catch (_) { return null; }
}

// ================================================================
// HLS.js Functions
// ================================================================
function setupHlsEvents() {
  if (!hls || !window.Hls) return;
  
  hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
    console.log('HLS manifest parsed');
    setStatus('Playing');
    if (video) video.play().catch(err => console.error('Play error:', err));
  });
  
  hls.on(window.Hls.Events.MANIFEST_LOADING, () => setStatus('Loading manifest...'));
  hls.on(window.Hls.Events.BUFFER_APPENDING, () => setStatus('Buffering...'));
  hls.on(window.Hls.Events.BUFFER_APPENDED, () => { if (video && video.paused && video.readyState >= 2) setStatus('Ready'); });
  
  hls.on(window.Hls.Events.ERROR, (event, data) => {
    console.error('HLS Error:', data);
    if (data.fatal) {
      switch (data.type) {
        case window.Hls.ErrorTypes.NETWORK_ERROR:
          setStatus('Network error, retrying...');
          hls.startLoad();
          break;
        case window.Hls.ErrorTypes.MEDIA_ERROR:
          setStatus('Media error, recovering...');
          hls.recoverMediaError();
          break;
        default:
          setStatus(`Fatal error: ${data.type}`);
          destroyHls();
          break;
      }
    } else {
      setStatus(`Stream issue: ${data.details || 'unknown'}`);
    }
  });
}

function initHls() {
  if (hls) {
    try { hls.destroy(); } catch(e) {}
    hls = null;
  }
  
  if (window.Hls && window.Hls.isSupported()) {
    hls = new window.Hls(HLS_CONFIG);
    setupHlsEvents();
    return true;
  } else if (video && video.canPlayType('application/vnd.apple.mpegurl')) {
    return 'native';
  }
  return false;
}

function destroyHls() {
  if (hls) {
    try { hls.destroy(); } catch(e) {}
    hls = null;
  }
  currentHlsUrl = null;
}

function playHlsStream(url) {
  destroyHls();
  const hlsSupported = initHls();
  
  if (hlsSupported === true && hls) {
    hls.loadSource(url);
    hls.attachMedia(video);
    currentHlsUrl = url;
    setStatus('Loading HLS stream...');
  } else if (hlsSupported === 'native' && video) {
    video.src = url;
    video.play().catch(err => setStatus(`Play error: ${err.message}`));
    setStatus('Playing (native HLS)');
  } else {
    setStatus('HLS not supported on this device');
  }
}

// ================================================================
// Playback Functions
// ================================================================
function playSelected() {
  if (!filtered.length) return;
  const ch = filtered[selectedIndex];
  if (!ch) return;

  if (nowPlayingEl) nowPlayingEl.textContent = ch.name;
  if (nowGroupEl) nowGroupEl.textContent = ch.group || '';
  setStatus(`Loading: ${ch.name}`);

  try {
    const url = ch.url;
    const isHls = /\.m3u8($|\?)/i.test(url) || url.toLowerCase().includes('m3u8');

    if (isHls) {
      playHlsStream(url);
    } else if (video) {
      destroyHls();
      video.src = url;
      video.play().catch(err => setStatus(`Play error: ${err.message}`));
      setStatus('Playing direct stream');
    }
  } catch (err) {
    setStatus(`Play error: ${err.message}`);
  }
}

// ================================================================
// Playlist Loading
// ================================================================
function onLoaded(text, url) {
  channels = parseM3U(text);
  filtered = [...channels];
  selectedIndex = 0;
  renderList();
  
  storageManager.saveChannels(channels, url);
  
  try { localStorage.setItem(STORAGE_KEY, url); } catch (_) {}
  setStatus(`Loaded ${channels.length} channels`);
  setFocusArea('list');
}

function loadPlaylist(urlOverride) {
  const url = (urlOverride || (playlistUrlEl ? playlistUrlEl.value : '')).trim();
  if (!url) { setStatus('Enter a playlist URL'); return; }

  if (playlistUrlEl) playlistUrlEl.value = url;
  setStatus('Loading playlist...');
  if (loadBtn) loadBtn.disabled = true;

  if (!IS_NEW_VERSION) {
    const cached = storageManager.loadChannels();
    if (cached && cached.url === url && cached.cacheAge < 3600000) {
      channels = cached.channels;
      filtered = [...channels];
      selectedIndex = 0;
      renderList();
      setStatus(`Loaded ${channels.length} channels (cached)`);
      if (loadBtn) loadBtn.disabled = false;
      setFocusArea('list');
      return;
    }
  }

  xhrFetch(url, 20000, (err, text) => {
    if (err) {
      const mirror = githubRawToJsdelivr(url);
      if (mirror) {
        setStatus('Trying mirror...');
        xhrFetch(mirror, 20000, (err2, text2) => {
          if (loadBtn) loadBtn.disabled = false;
          if (err2) { setStatus(`Load failed: ${err2.message}`); return; }
          onLoaded(text2, url);
        });
      } else {
        if (loadBtn) loadBtn.disabled = false;
        setStatus(`Load failed: ${err.message}`);
      }
      return;
    }
    if (loadBtn) loadBtn.disabled = false;
    onLoaded(text, url);
  });
}

// ================================================================
// Fullscreen Functions
// ================================================================
function enterFullscreen() {
  const el = videoWrap;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
  if (fn) { fn.call(el); return; }
  document.body.classList.add('fullscreen');
  isFullscreen = true;
}

function exitFullscreen() {
  const fn = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
  if (fn) { fn.call(document); return; }
  document.body.classList.remove('fullscreen');
  isFullscreen = false;
}

function toggleFullscreen() {
  isFullscreen ? exitFullscreen() : enterFullscreen();
}

// ================================================================
// Event Listeners
// ================================================================
if (loadBtn) loadBtn.addEventListener('click', () => loadPlaylist());
if (defaultBtn) {
  defaultBtn.addEventListener('click', () => {
    plIdx = (plIdx + 1) % DEFAULT_PLAYLISTS.length;
    const pl = DEFAULT_PLAYLISTS[plIdx];
    defaultBtn.textContent = pl.name;
    if (playlistUrlEl) playlistUrlEl.value = pl.url;
    loadPlaylist(pl.url);
  });
}
if (searchInput) searchInput.addEventListener('input', applySearch);
if (video) {
  video.addEventListener('dblclick', toggleFullscreen);
  video.addEventListener('click', () => {
    const now = Date.now();
    if (now - lastTap < 400) toggleFullscreen();
    lastTap = now;
  });
  video.addEventListener('playing', () => setStatus('Playing'));
  video.addEventListener('pause', () => setStatus('Paused'));
  video.addEventListener('waiting', () => setStatus('Buffering...'));
  video.addEventListener('stalled', () => setStatus('Buffering...'));
  video.addEventListener('error', () => setStatus('Playback error'));
}

document.addEventListener('fullscreenchange', () => {
  isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
  if (!isFullscreen) document.body.classList.remove('fullscreen');
});
document.addEventListener('webkitfullscreenchange', () => {
  isFullscreen = !!(document.webkitFullscreenElement || document.fullscreenElement);
  if (!isFullscreen) document.body.classList.remove('fullscreen');
});

// ================================================================
// Key Handling
// ================================================================
(function registerKeys() {
  try {
    if (window.tizen && tizen.tvinputdevice) {
      [
        'MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaStop',
        'MediaFastForward', 'MediaRewind',
        'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
        'ChannelUp', 'ChannelDown', 'Back',
      ].forEach(k => { try { tizen.tvinputdevice.registerKey(k); } catch (_) {} });
    }
  } catch (_) {}
})();

window.addEventListener('keydown', (e) => {
  const key = e.key;
  const code = e.keyCode;

  if (key === 'Escape' || key === 'Back' || code === 10009 || code === 27) {
    if (focusArea === 'url' || focusArea === 'search') {
      setFocusArea('list');
      e.preventDefault();
      return;
    }
    if (isFullscreen) {
      exitFullscreen();
      e.preventDefault();
      return;
    }
    try { if (window.tizen) tizen.application.getCurrentApplication().exit(); } catch (_) {}
    e.preventDefault();
    return;
  }

  if (focusArea === 'url' || focusArea === 'search') {
    if (key === 'Enter' || code === 13) {
      if (focusArea === 'url') loadPlaylist();
      setFocusArea('list');
      e.preventDefault();
    }
    return;
  }

  if (key === 'ArrowUp' || code === 38) { if (focusArea === 'list') moveSelection(-1); e.preventDefault(); return; }
  if (key === 'ArrowDown' || code === 40) { if (focusArea === 'list') moveSelection(1); e.preventDefault(); return; }
  if (key === 'ArrowLeft' || code === 37) { if (isFullscreen) exitFullscreen(); else setFocusArea('list'); e.preventDefault(); return; }
  if (key === 'ArrowRight' || code === 39) { focusArea = 'player'; e.preventDefault(); return; }

  if (key === 'Enter' || code === 13) {
    if (focusArea === 'list') playSelected();
    if (focusArea === 'player') toggleFullscreen();
    e.preventDefault(); return;
  }

  if (key === 'PageUp') { moveSelection(-10); e.preventDefault(); return; }
  if (key === 'PageDown') { moveSelection(10); e.preventDefault(); return; }

  if (key === 'MediaPlayPause' || code === 10252) {
    if (video) video.paused ? video.play().catch(() => {}) : video.pause();
    e.preventDefault(); return;
  }
  if (key === 'MediaPlay' || code === 415) { if (video) video.play().catch(() => {}); e.preventDefault(); return; }
  if (key === 'MediaPause' || code === 19) { if (video) video.pause(); e.preventDefault(); return; }
  if (key === 'MediaStop' || code === 413) { destroyHls(); if (video) { video.pause(); video.removeAttribute('src'); video.load(); } setStatus('Stopped'); e.preventDefault(); return; }
  if (key === 'MediaFastForward' || code === 417) { moveSelection(1); playSelected(); e.preventDefault(); return; }
  if (key === 'MediaRewind' || code === 412) { moveSelection(-1); playSelected(); e.preventDefault(); return; }
  if (key === 'ChannelUp' || code === 427) { moveSelection(1); playSelected(); e.preventDefault(); return; }
  if (key === 'ChannelDown' || code === 428) { moveSelection(-1); playSelected(); e.preventDefault(); return; }

  if (key === 'ColorF0Red' || code === 403) { setFocusArea('url'); e.preventDefault(); return; }
  if (key === 'ColorF1Green' || code === 404) { loadPlaylist(); e.preventDefault(); return; }
  if (key === 'ColorF2Yellow' || code === 405) { setFocusArea('search'); e.preventDefault(); return; }
  if (key === 'ColorF3Blue' || code === 406) { if (defaultBtn) defaultBtn.click(); e.preventDefault(); return; }
});

// ================================================================
// Restore last playlist and initialize
// ================================================================
const savedUrl = (() => { try { return localStorage.getItem(STORAGE_KEY) || ''; } catch(e) { return ''; } })();
if (playlistUrlEl) playlistUrlEl.value = savedUrl || DEFAULT_PLAYLISTS[0].url;

// Check HLS.js availability
if (typeof window.Hls === 'undefined') {
  console.error('HLS.js not loaded!');
  setStatus('HLS.js not available');
} else {
  console.log('HLS.js version:', window.Hls.version);
}

// Start the app
loadPlaylist(playlistUrlEl ? playlistUrlEl.value : DEFAULT_PLAYLISTS[0].url);