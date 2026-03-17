class IPTVApp {
    constructor() {
        this.channels = [];
        this.currentChannel = null;
        this.hls = null;
        this.videoPlayer = document.getElementById('video-player');
        this.playerContainer = document.getElementById('player-container');
        this.content = document.getElementById('content');
        this.splashScreen = document.getElementById('splash-screen');
        this.startTime = Date.now();

        this.init();
    }

    async init() {
        await this.loadChannels();
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
                // Extract metadata
                const nameMatch = line.match(/,([^,]+)$/);
                const name = nameMatch ? nameMatch[1] : 'Unknown';
                
                // Group / category
                const groupMatch = line.match(/group-title="([^"]+)"/);
                const category = groupMatch ? groupMatch[1].toLowerCase() : 'general';
                
                // Logo URL
                const logoMatch = line.match(/tvg-logo="([^"]+)"/);
                const logoUrl = logoMatch ? logoMatch[1] : null;
                
                // Channel number (if present, otherwise generate later)
                const chnoMatch = line.match(/tvg-chno="([^"]+)"/);
                const chno = chnoMatch ? chnoMatch[1] : null;

                current = {
                    name,
                    category,
                    logoUrl,
                    chno,
                    program: 'Live' // placeholder, could be extended with EPG
                };
            } else if (line && !line.startsWith('#')) {
                current.streamUrl = line;
                current.id = channels.length + 1;
                // If no channel number provided, generate one
                if (!current.chno) {
                    current.chno = String(100 + channels.length);
                }
                channels.push(current);
                current = {};
            }
        });
        return channels;
    }

    getFallbackChannels() {
        // Fallback channels with placeholder data
        return [
            { id:1, name:'BBC News', category:'news', logoUrl:null, chno:'101', program:'World News', streamUrl:'' },
            { id:2, name:'Sky Sports', category:'sports', logoUrl:null, chno:'202', program:'Football Live', streamUrl:'' },
            { id:3, name:'HBO', category:'movies', logoUrl:null, chno:'305', program:'Movie: Inception', streamUrl:'' },
            { id:4, name:'Comedy Central', category:'entertainment', logoUrl:null, chno:'410', program:'Stand-up', streamUrl:'' },
            { id:5, name:'CNN', category:'news', logoUrl:null, chno:'102', program:'Breaking News', streamUrl:'' },
            { id:6, name:'ESPN', category:'sports', logoUrl:null, chno:'203', program:'NBA Tonight', streamUrl:'' },
            { id:7, name:'Fox News', category:'news', logoUrl:null, chno:'103', program:'The Story', streamUrl:'' },
            { id:8, name:'Nat Geo', category:'entertainment', logoUrl:null, chno:'411', program:'Wildlife', streamUrl:'' }
        ];
    }

    renderRows() {
        // Group channels by category
        const categories = {
            recommended: this.channels.slice(0, 10), // first 10 as recommended
            news: this.channels.filter(c => c.category === 'news'),
            sports: this.channels.filter(c => c.category === 'sports'),
            movies: this.channels.filter(c => c.category === 'movies'),
            entertainment: this.channels.filter(c => c.category === 'entertainment')
        };

        const categoryNames = {
            recommended: 'Recommended',
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
                        <h2 class="row-title">${categoryNames[cat] || cat}</h2>
                        <span class="row-link" data-focusable="true">More ›</span>
                    </div>
                    <div class="channel-strip" id="strip-${cat}">
                        ${channels.map(ch => {
                            // Use logo if available, else fallback emoji
                            const thumbnail = ch.logoUrl 
                                ? `<img class="channel-logo" src="${ch.logoUrl}" alt="${ch.name}" loading="lazy" onerror="this.style.display='none'; this.parentElement.innerHTML='📺';">` 
                                : `<span class="channel-emoji">📺</span>`;
                            return `
                            <div class="channel-item" data-channel-id="${ch.id}" data-focusable="true">
                                <div class="channel-thumb">
                                    ${thumbnail}
                                    <span class="channel-number">${ch.chno}</span>
                                </div>
                                <div class="channel-info">
                                    <div class="channel-name">${ch.name}</div>
                                    <div class="channel-program">${ch.program}</div>
                                </div>
                            </div>
                        `}).join('')}
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

        // "More" links – could be implemented later
        document.querySelectorAll('.row-link').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                // Optional: navigate to full category view
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
        document.querySelector('.close-player').addEventListener('click', () => this.hidePlayer());
        document.querySelector('.close-player').addEventListener('tv-enter', () => this.hidePlayer());

        window.addEventListener('tv-back', () => {
            if (!this.playerContainer.classList.contains('hidden')) {
                this.hidePlayer();
            }
        });
    }
}

new IPTVApp();