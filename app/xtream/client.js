// xtream/client.js
// Xtream Codes API client with retry logic and error handling

import XtreamCache from './cache.js';

class XtreamClient {
  /**
   * @param {XtreamConfig} config - Xtream configuration
   */
  constructor(config) {
    this.config = {
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      cacheTTL: 300000,
      ...config
    };
    
    this.serverUrl = this.config.serverUrl.replace(/\/$/, '');
    this.username = this.config.username;
    this.password = this.config.password;
    this.apiPath = '/player_api.php';
    this.cache = new XtreamCache(this.config.cacheTTL);
  }

  /**
   * Build API URL with credentials
   * @param {string} action - API action
   * @param {Object} params - Additional parameters
   * @returns {string}
   */
  buildUrl(action, params = {}) {
    const url = new URL(`${this.serverUrl}${this.apiPath}`);
    url.searchParams.set('username', this.username);
    url.searchParams.set('password', this.password);
    url.searchParams.set('action', action);
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });
    
    return url.toString();
  }

  /**
   * Fetch with timeout and retry logic
   * @param {string} url - URL to fetch
   * @param {number} attempt - Current attempt number
   * @returns {Promise<any>}
   */
  async fetchWithRetry(url, attempt = 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
    
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Check for API error responses
      if (data && data.user_info === undefined && data.auth === 0) {
        throw new Error('Invalid credentials');
      }
      
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (attempt < this.config.retryAttempts) {
        const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
        console.warn(`[Xtream] Retry ${attempt}/${this.config.retryAttempts} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.fetchWithRetry(url, attempt + 1);
      }
      
      throw error;
    }
  }

  /**
   * Generic API call with caching
   * @param {string} action - API action
   * @param {Object} params - Parameters
   * @param {boolean} useCache - Use cache if available
   * @returns {Promise<any>}
   */
  async call(action, params = {}, useCache = true) {
    const cacheKey = `${action}:${JSON.stringify(params)}`;
    
    if (useCache && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    
    const url = this.buildUrl(action, params);
    const data = await this.fetchWithRetry(url);
    
    this.cache.set(cacheKey, data);
    return data;
  }

  /**
   * Get user info and server details
   * @param {boolean} useCache - Use cache
   * @returns {Promise<UserInfo>}
   */
  async getUserInfo(useCache = true) {
    return this.call('get_user_and_server_info', {}, useCache);
  }

  /**
   * Get live TV categories
   * @param {boolean} useCache - Use cache
   * @returns {Promise<LiveCategory[]>}
   */
  async getLiveCategories(useCache = true) {
    return this.call('get_live_categories', {}, useCache);
  }

  /**
   * Get live streams (optionally filtered by category)
   * @param {number|string} [categoryId] - Category ID
   * @param {boolean} useCache - Use cache
   * @returns {Promise<LiveStream[]>}
   */
  async getLiveStreams(categoryId = null, useCache = true) {
    const params = {};
    if (categoryId !== null && categoryId !== undefined) {
      params.category_id = categoryId;
    }
    return this.call('get_live_streams', params, useCache);
  }

  /**
   * Get VOD categories
   * @param {boolean} useCache - Use cache
   * @returns {Promise<VodCategory[]>}
   */
  async getVodCategories(useCache = true) {
    return this.call('get_vod_categories', {}, useCache);
  }

  /**
   * Get VOD streams (optionally filtered by category)
   * @param {number|string} [categoryId] - Category ID
   * @param {boolean} useCache - Use cache
   * @returns {Promise<VodStream[]>}
   */
  async getVodStreams(categoryId = null, useCache = true) {
    const params = {};
    if (categoryId !== null && categoryId !== undefined) {
      params.category_id = categoryId;
    }
    return this.call('get_vod_streams', params, useCache);
  }

  /**
   * Get series categories
   * @param {boolean} useCache - Use cache
   * @returns {Promise<SeriesCategory[]>}
   */
  async getSeriesCategories(useCache = true) {
    return this.call('get_series_categories', {}, useCache);
  }

  /**
   * Get series list (optionally filtered by category)
   * @param {number|string} [categoryId] - Category ID
   * @param {boolean} useCache - Use cache
   * @returns {Promise<Series[]>}
   */
  async getSeries(categoryId = null, useCache = true) {
    const params = {};
    if (categoryId !== null && categoryId !== undefined) {
      params.category_id = categoryId;
    }
    return this.call('get_series', params, useCache);
  }

  /**
   * Get detailed info for a specific series
   * @param {number|string} seriesId - Series ID
   * @param {boolean} useCache - Use cache
   * @returns {Promise<Object>}
   */
  async getSeriesInfo(seriesId, useCache = true) {
    return this.call('get_series_info', { series_id: seriesId }, useCache);
  }

  /**
   * Get short EPG for a live channel
   * @param {number|string} streamId - Channel ID
   * @param {number} limit - Number of programs (default: 5)
   * @param {boolean} useCache - Use cache
   * @returns {Promise<EpgProgram[]>}
   */
  async getShortEpg(streamId, limit = 5, useCache = true) {
    return this.call('get_short_epg', { stream_id: streamId, limit }, useCache);
  }

  /**
   * Build stream URL for live channel
   * @param {number|string} streamId - Channel ID
   * @param {string} extension - File extension (default: ts)
   * @returns {string}
   */
  getLiveStreamUrl(streamId, extension = 'ts') {
    return `${this.serverUrl}/live/${this.username}/${this.password}/${streamId}.${extension}`;
  }

  /**
   * Build stream URL for VOD
   * @param {number|string} vodId - VOD ID
   * @param {string} extension - File extension (default: mp4)
   * @returns {string}
   */
  getVodStreamUrl(vodId, extension = 'mp4') {
    return `${this.serverUrl}/movie/${this.username}/${this.password}/${vodId}.${extension}`;
  }

  /**
   * Build stream URL for series episode
   * @param {number|string} seriesId - Series ID
   * @param {number|string} episodeId - Episode ID
   * @param {string} extension - File extension (default: mp4)
   * @returns {string}
   */
  getSeriesStreamUrl(seriesId, episodeId, extension = 'mp4') {
    return `${this.serverUrl}/series/${this.username}/${this.password}/${seriesId}/${episodeId}.${extension}`;
  }

  /**
   * Get M3U playlist URL
   * @param {string} type - Playlist type (m3u, m3u_plus)
   * @param {string} output - Output format (ts, m3u8)
   * @returns {string}
   */
  getM3uPlaylistUrl(type = 'm3u_plus', output = 'ts') {
    return `${this.serverUrl}/get.php?username=${this.username}&password=${this.password}&type=${type}&output=${output}`;
  }

  /**
   * Get XMLTV EPG URL
   * @returns {string}
   */
  getXmltvUrl() {
    return `${this.serverUrl}/xmltv.php?username=${this.username}&password=${this.password}`;
  }

  /**
   * Clear all cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Invalidate specific cache entry
   * @param {string} action - API action
   * @param {Object} params - Parameters
   */
  invalidateCache(action, params = {}) {
    const cacheKey = `${action}:${JSON.stringify(params)}`;
    this.cache.delete(cacheKey);
  }
}

export default XtreamClient;
