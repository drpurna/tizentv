// xtream/auth.js
// Handles authentication, token storage, and session management

import XtreamCache from './cache.js';

class XtreamAuth {
  constructor() {
    this.cache = new XtreamCache(3600000); // 1 hour for auth
    this.currentConfig = null;
    this.userInfo = null;
  }

  /**
   * Store credentials in localStorage
   * @param {XtreamConfig} config - Xtream configuration
   */
  storeCredentials(config) {
    try {
      localStorage.setItem('xtream:server', config.serverUrl);
      localStorage.setItem('xtream:username', config.username);
      localStorage.setItem('xtream:password', config.password);
      this.currentConfig = config;
    } catch (e) {
      console.warn('[XtreamAuth] Failed to store credentials:', e);
    }
  }

  /**
   * Load saved credentials from localStorage
   * @returns {XtreamConfig|null}
   */
  loadCredentials() {
    try {
      const serverUrl = localStorage.getItem('xtream:server');
      const username = localStorage.getItem('xtream:username');
      const password = localStorage.getItem('xtream:password');
      
      if (serverUrl && username && password) {
        this.currentConfig = { serverUrl, username, password };
        return this.currentConfig;
      }
    } catch (e) {
      console.warn('[XtreamAuth] Failed to load credentials:', e);
    }
    return null;
  }

  /**
   * Clear stored credentials
   */
  clearCredentials() {
    try {
      localStorage.removeItem('xtream:server');
      localStorage.removeItem('xtream:username');
      localStorage.removeItem('xtream:password');
      this.currentConfig = null;
      this.userInfo = null;
      this.cache.clear();
    } catch (e) {
      console.warn('[XtreamAuth] Failed to clear credentials:', e);
    }
  }

  /**
   * Check if user is authenticated
   * @returns {boolean}
   */
  isAuthenticated() {
    return this.userInfo !== null && this.userInfo.auth === 1;
  }

  /**
   * Get user info (cached)
   * @returns {UserInfo|null}
   */
  getUserInfo() {
    return this.userInfo;
  }

  /**
   * Set user info after successful login
   * @param {UserInfo} info
   */
  setUserInfo(info) {
    this.userInfo = info;
  }

  /**
   * Get account expiry date as Date object
   * @returns {Date|null}
   */
  getExpiryDate() {
    if (!this.userInfo || !this.userInfo.exp_date) return null;
    return new Date(parseInt(this.userInfo.exp_date, 10) * 1000);
  }

  /**
   * Check if account is expired
   * @returns {boolean}
   */
  isExpired() {
    const expiry = this.getExpiryDate();
    if (!expiry) return false;
    return expiry < new Date();
  }

  /**
   * Get days remaining until expiry
   * @returns {number|null}
   */
  getDaysRemaining() {
    const expiry = this.getExpiryDate();
    if (!expiry) return null;
    const diff = expiry - new Date();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  /**
   * Get formatted expiry message
   * @returns {string}
   */
  getExpiryMessage() {
    if (!this.userInfo) return '';
    if (this.isExpired()) return 'Account expired';
    const days = this.getDaysRemaining();
    return `Valid for ${days} days`;
  }
}

export default XtreamAuth;
