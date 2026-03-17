class IPTVApp {
    constructor() {
        this.channels = [];
        this.currentCategory = 'all';
        this.currentChannel = null;
        this.hls = null;
        this.videoPlayer = document.getElementById('video-player');
        this.playerContainer = document.getElementById('player-container');
        this.content = document.getElementById('content');
        this.sidePanel = document.getElementById('side-panel');
        this.menuToggle = document.getElementById('menu-toggle');
        this.splashScreen = document.getElementById('splash-screen');
        this.startTime = Date.now();

        this.init();
    }

    async init() {
        await this.loadChannels();
        this.renderSidePanel();
        this.renderRows();
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
            { id:3, name:'HBO', category:'movies', logo:'🎬', program:'Movie: Inception', streamUrl:'' },
            { id:4, name:'Comedy Central', category:'entertainment', logo:'😂', program:'Stand-up', streamUrl:'' },
            { id:5, name:'CNN', category:'news', logo:'📡', program:'Breaking News', streamUrl:'' },
            { id:6, name:'ESPN', category:'sports', logo:'🏀', program:'NBA Tonight', streamUrl:'' },
            { id:7, name:'Fox News', category:'news', logo:'🦊', program:'The Story', streamUrl:'' },
            { id:8, name:'Nat Geo', category:'entertainment', logo:'🌍', program:'Wildlife', streamUrl:'' }
        ];
    }

    renderSidePanel() {
        const items = this.sidePanel.querySelectorAll('.panel-item[data-category]');
        items.forEach(item => {
            item.addEventListener('click', () => {
                const category = item.dataset.category;
                this.filterByCategory(category);
                this.closePanel();
            });
        });
    }

    filterByCategory(category) {
        this.currentCategory = category;
        // Update active state in panel
        this.sidePanel.querySelectorAll('.panel-item').forEach(item => {
            item.classList.toggle('active', item.dataset.category === category);
        });
        // Scroll to the selected category row
        const targetRow = document.getElementById(`row-${category}`);
        if (targetRow) {
            targetRow.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    renderRows() {
        // Group channels by category
        const categories = {
            all: this.channels,
            news: this.channels.filter(c => c.category === 'news'),
            sports: this.channels.filter(c => c.category === 'sports'),
            movies: this.channels.filter(c => c.category === 'movies'),
            entertainment: this.channels.filter(c => c.category === 'entertainment')
        };

        const categoryNames = {
            all: 'Recommended',
            news: 'News',
            sports: 'Sports',
            movies: 'Movies',
            entertainment: 'Entertainment'
        };

        let html = '';
        for (let [cat, channels] of Object.entries(categories)) {
            if (channels.length === 0) continue;
            html += `
                <div class="category-row" id="row-${cat}">
                    <div class="row-header">
                        <h2 class="row-title">${categoryNames[cat]}</h2>
                        <span class="row-link" data-focusable="true">More ›</span>
                    </div>
                    <div class="channel-strip" id="strip-${cat}">
                        ${channels.map(ch => `
                            <div class="channel-item" data-channel-id="${ch.id}" data-focusable="true">
                                <div class="channel-thumb">${ch.logo}</div>
                                <div class="channel-info">
                                    <div class="channel-name">${ch.name}</div>
                                    <div class="channel-program">${ch.program}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        this.content.innerHTML = html;

        // Attach event listeners to all channel items
        document.querySelectorAll('.channel-item').forEach(el => {
            el.addEventListener('click', () => this.playChannel(el.dataset.channelId));
            el.addEventListener('tv-enter', () => this.playChannel(el.dataset.channelId));
        });

        // Attach listeners to "More" links (optional, could show full category)
        document.querySelectorAll('.row-link').forEach(el => {
            el.addEventListener('click', (e) => {
                // For now, just scroll to that row's header (already visible)
                e.stopPropagation();
            });
        });

        // Notify navigation module to rescan
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
        // Menu toggle
        this.menuToggle.addEventListener('click', () => this.togglePanel());
        this.menuToggle.addEventListener('tv-enter', () => this.togglePanel());

        // Close panel when clicking outside (if open)
        document.addEventListener('click', (e) => {
            if (this.sidePanel.classList.contains('open') &&
                !this.sidePanel.contains(e.target) &&
                !this.menuToggle.contains(e.target)) {
                this.closePanel();
            }
        });

        // Close player
        document.querySelector('.close-player').addEventListener('click', () => this.hidePlayer());
        document.querySelector('.close-player').addEventListener('tv-enter', () => this.hidePlayer());

        // Global back button (from remote)
        window.addEventListener('tv-back', () => {
            if (!this.playerContainer.classList.contains('hidden')) {
                this.hidePlayer();
            } else if (this.sidePanel.classList.contains('open')) {
                this.closePanel();
            }
        });
    }

    togglePanel() {
        this.sidePanel.classList.toggle('open');
        if (this.sidePanel.classList.contains('open')) {
            // Focus first panel item for remote navigation
            const firstItem = this.sidePanel.querySelector('.panel-item');
            if (firstItem) firstItem.focus();
        }
    }

    closePanel() {
        this.sidePanel.classList.remove('open');
    }
}

new IPTVApp();