module.exports = {
  async start(ctx) {
    console.log('[IPTV] Starting application...');
    
    try {
      const appUrl = ctx.modulePath + '/app/index.html';
      console.log('[IPTV] Loading from:', appUrl);
      
      ctx.openApp({
        url: appUrl,
        fullscreen: true,
        title: 'IPTV Pro',
        width: 1920,
        height: 1080,
        showIndicator: true
      });
    } catch (error) {
      console.error('[IPTV] Failed to start:', error);
    }
  },
  
  async stop(ctx) {
    console.log('[IPTV] Stopping application');
  },
  
  async error(ctx, error) {
    console.error('[IPTV] Application error:', error);
  }
};