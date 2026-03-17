class IPTVApp {
    constructor() {
        this.channels = [];
        this.currentCategory = 'all';
        this.currentChannel = null;
        this.hls = null;
        this.videoPlayer = document.getElementById('video-player');
        this.playerContainer = document.getElementById('player-container');
        this.channelGrid = document.getElementById('channel-grid');
        this.sidebar = document.getElementById('sidebar');
        this.splashScreen = document.getElementById('splash-screen');
        this.startTime = Date.now();

        this.init();
    }

    async init() {
        await this.loadChannels();
        this.renderSidebar();
        this.renderChannels();
        this.setupEventListeners();
        this.hideSplash();
    }

    hideSplash() {
        const elapsed = Date.now() - this.startTime;
        const minDisplay = 1500;
        const delay = Math.max(0, minDisplay - elapsed);

        setTimeout(() => {
            if (this.splashScreen) {
                this.splashScreen.classList.add('hidden');
                setTimeout(() => {
                    if (this.splashScreen && this.splashScreen.parentNode) {
                        this.splashScreen.parentNode.removeChild(this.splashScreen);
                    }
                }, 500);
            }
        }, delay);
    }

    async loadChannels() {
        try {
            const response = await fetch('https://iptv-org.github.io/iptv/languages/tel.m3u');
            const m3u = await response.text();
            this.channels = this.parseM3U(m3u);
        } catch {
            console.warn('M3U fetch failed, using fallback data');
            this.channels = this.getFallbackChannels();
        }
    }

    parseM3U(m3u) {
        const lines = m3u.split('\n');
        const channels = [];
        let current = {};
        lines.forEach(line => {
            line = line.trim();
            if (line.startsWith('#EXTINF:')) {
                const nameMatch = line.match(/,([^,]+)$/);
                const name = nameMatch ? nameMatch[1] : 'Unknown';
                const groupMatch = line.match(/group-title="([^"]+)"/);
                const category = groupMatch ? groupMatch[1].toLowerCase() : 'general';
                const logoMatch = line.match(/tvg-logo="([^"]+)"/);
                const logo = logoMatch ? logoMatch[1] : '📺';
                current = { name, category, logo, program: 'Live' };
            } else if (line && !line.startsWith('#')) {
                current.streamUrl = line;
                current.id = channels.length + 1;
                channels.push(current);
                current = {};
            }
        });
        return channels;
    }

    getFallbackChannels() {
        return [
            { id:1, name:'BBC News', category:'news', logo:'📰', program:'World News', streamUrl:'' },
            { id:2, name:'Sky Sports', category:'sports', logo:'⚽', program:'Football Live', streamUrl:'' },
            { id:3, name:'HBO', category:'movies', logo:'🎬', program:'Movie', streamUrl:'' },
            { id:4, name:'Comedy Central', category:'entertainment', logo:'😂', program:'Stand-up', streamUrl:'' }
        ];
    }

    renderSidebar() {
        this.sidebar.querySelectorAll('.sidebar-item').forEach(item => {
            item.addEventListener('click', () => {
                this.filterByCategory(item.dataset.category);
            });
        });
    }

    filterByCategory(category) {
        this.currentCategory = category;
        this.sidebar.querySelectorAll('.sidebar-item').forEach(item => {
            item.classList.toggle('active', item.dataset.category === category);
        });
        this.renderChannels();
    }

    renderChannels() {
        const filtered = this.currentCategory === 'all'
            ? this.channels
            : this.channels.filter(c => c.category === this.currentCategory);

        this.channelGrid.innerHTML = filtered.map(ch => `
            <div class="channel-item" data-channel-id="${ch.id}" data-focusable="true">
                <div class="channel-thumb">${ch.logo}</div>
                <div class="channel-info">
                    <div class="channel-name">${ch.name}</div>
                    <div class="channel-program">${ch.program}</div>
                </div>
            </div>
        `).join('');

        document.querySelectorAll('.channel-item').forEach(el => {
            el.addEventListener('click', () => this.playChannel(el.dataset.channelId));
            el.addEventListener('tv-enter', () => this.playChannel(el.dataset.channelId));
        });

        if (window.navigationModule) window.navigationModule.rescan();
    }

    playChannel(channelId) {
        const channel = this.channels.find(c => c.id == channelId);
        if (!channel || !channel.streamUrl) {
            alert('Stream not available');
            return;
        }
        this.currentChannel = channel;
        this.showPlayer();
        this.loadStream(channel.streamUrl);
    }

    showPlayer() {
        this.playerContainer.classList.remove('hidden');
        this.videoPlayer.focus();
    }

    hidePlayer() {
        this.playerContainer.classList.add('hidden');
        if (this.hls) this.hls.destroy();
        this.videoPlayer.pause();
        this.videoPlayer.src = '';
    }

    loadStream(url) {
        if (Hls.isSupported()) {
            this.hls = new Hls({ maxBufferLength: 30 });
            this.hls.loadSource(url);
            this.hls.attachMedia(this.videoPlayer);
            this.hls.on(Hls.Events.MANIFEST_PARSED, () => this.videoPlayer.play());
        } else if (this.videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
            this.videoPlayer.src = url;
            this.videoPlayer.play();
        } else {
            alert('Unsupported stream format');
        }
    }

    setupEventListeners() {
        document.querySelector('.close-player').addEventListener('click', () => this.hidePlayer());
        document.querySelector('.close-player').addEventListener('tv-enter', () => this.hidePlayer());

        window.addEventListener('tv-back', () => {
            if (!this.playerContainer.classList.contains('hidden')) this.hidePlayer();
        });
    }
}

new IPTVApp();
