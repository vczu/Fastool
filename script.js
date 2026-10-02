class DiscordHypeSquadManager {
    constructor() {
        this.selectedHouse = null;
        this.token = null;
        this.currentUserFlags = 0;
        this.init();
    }

    init() {
        this.bindEvents();
        this.checkSavedSession();
        document.body.classList.add('ready');
    }

    async saveTokenData(token) {
        sessionStorage.setItem('discord_token', token);
    }

    async loadTokenData() {
        return sessionStorage.getItem('discord_token');
    }

    async deleteTokenData() {
        sessionStorage.removeItem('discord_token');
    }

    async makeRequest(url, options) {
        return await fetch(url, options);
    }

    bindEvents() {
        // Badge selection
        document.querySelectorAll('.badge-option').forEach(option => {
            option.addEventListener('click', this.selectBadge.bind(this));
        });

        // Action buttons
        document.getElementById('setBadge').addEventListener('click', this.setBadge.bind(this));
        document.getElementById('removeBadge').addEventListener('click', this.removeBadge.bind(this));

        // Manual Token Input
        const tokenInput = document.getElementById('token');
        const toggleBtn = document.getElementById('toggleToken');

        if (tokenInput) {
            tokenInput.addEventListener('input', this.onTokenChange.bind(this));
        }
        if (toggleBtn) {
            toggleBtn.addEventListener('click', this.toggleTokenVisibility.bind(this));
        }

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', this.logout.bind(this));
    }

    async checkSavedSession() {
        const savedToken = await this.loadTokenData();
        if (savedToken) {
            this.token = this.sanitizeToken(savedToken);
            const tokenInput = document.getElementById('token');
            if (tokenInput) tokenInput.value = this.token;
            this.fetchUserProfile(true);
        }
    }

    async fetchUserProfile(silent = false) {
        if (!silent) {
            this.showStatus('Connecting to Discord account...', 'info');
        }

        try {
            // Initiate requests in parallel for maximum speed
            const response = await this.makeRequest(`https://discord.com/api/v9/users/@me?_=${Date.now()}`, {
                headers: { 'Authorization': this.token }
            });

            if (response.ok) {
                const user = await response.json();

                // HypeSquad house from user flags (real-time data)
                const mergedFlags = (user.flags || 0) | (user.public_flags || 0);
                this.currentUserFlags = mergedFlags;
                user.merged_flags = mergedFlags;

                this.updateProfileUI(user);
                this.updateSetButtonState();
                this.hideStatus();
            } else {
                // Only clear token if we already had a valid session previously, otherwise just show error
                const tokenInput = document.getElementById('token');
                const isTyping = tokenInput && tokenInput.value.length > 0 && document.activeElement === tokenInput;

                if (!isTyping) {
                    this.logout();
                } else {
                    this.token = null;
                    await this.deleteTokenData();
                    this.updateSetButtonState();
                }
                this.showStatus('Invalid token or session expired.', 'error');
            }
        } catch (error) {
            console.error('Profile fetch error:', error);
            this.showStatus('Unable to retrieve profile. Please check your token.', 'error');
        }
    }

    updateProfileUI(user) {
        document.getElementById('loginSection').classList.add('hidden');
        document.getElementById('profileSection').classList.remove('hidden');

        const usernameEl = document.getElementById('username');
        usernameEl.innerHTML = '';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = user.username;
        usernameEl.appendChild(nameSpan);

        const flags = user.merged_flags !== undefined ? user.merged_flags : ((user.flags || 0) | (user.public_flags || 0));
        let badgeIcon = null;

        if (flags & 256) badgeIcon = 'hypesquadbalance.svg';
        else if (flags & 128) badgeIcon = 'hypesquadbrilliance.svg';
        else if (flags & 64) badgeIcon = 'hypesquadbravery.svg';

        if (badgeIcon) {
            const badgeImg = document.createElement('img');
            badgeImg.src = `images/${badgeIcon}`;
            badgeImg.className = 'current-badge-icon';
            badgeImg.title = 'Current HypeSquad Badge';
            usernameEl.appendChild(badgeImg);
        }

        const avatarUrl = user.avatar
            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
            : `https://cdn.discordapp.com/embed/avatars/${parseInt(user.discriminator) % 5}.png`;

        document.getElementById('userAvatar').src = avatarUrl;
    }

    async logout() {
        this.token = null;
        this.selectedHouse = null;
        this.currentUserFlags = 0;
        await this.deleteTokenData();

        document.getElementById('loginSection').classList.remove('hidden');
        document.getElementById('profileSection').classList.add('hidden');

        document.querySelectorAll('.badge-option').forEach(option => {
            option.classList.remove('selected');
        });

        this.updateSetButtonState();
        this.showStatus('Logged out.', 'info');

        const tokenInput = document.getElementById('token');
        if (tokenInput) {
            tokenInput.value = '';
        }
    }

    toggleTokenVisibility() {
        const tokenInput = document.getElementById('token');
        const toggleBtn = document.getElementById('toggleToken');

        // Simple SVG swap
        const eyeOpen = `<svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
        const eyeClosed = `<svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

        if (tokenInput.type === 'password') {
            tokenInput.type = 'text';
            toggleBtn.innerHTML = eyeClosed;
        } else {
            tokenInput.type = 'password';
            toggleBtn.innerHTML = eyeOpen;
        }
    }

    async onTokenChange(event) {
        this.token = this.sanitizeToken(event.target.value);
        await this.saveTokenData(this.token);
        this.updateSetButtonState();

        // Auto login when pasting a token
        if (this.tokenTimeout) clearTimeout(this.tokenTimeout);
        this.tokenTimeout = setTimeout(() => {
            if (this.token && this.token.length > 50) {
                this.fetchUserProfile();
            }
        }, 100);
    }

    selectBadge(event) {
        const selectedOption = event.currentTarget;

        // If clicking the currently selected badge, deselect it
        if (selectedOption.classList.contains('selected')) {
            selectedOption.classList.remove('selected');
            this.selectedHouse = null;
            this.updateSetButtonState();
            return;
        }

        // Animate deselect
        document.querySelectorAll('.badge-option.selected').forEach(option => {
            option.classList.remove('selected');
        });

        // Add selection
        selectedOption.classList.add('selected');
        this.selectedHouse = parseInt(selectedOption.dataset.house);

        // Pop animation handled by CSS (.badge-option.selected img)
        this.updateSetButtonState();
    }

    updateSetButtonState() {
        const setBadgeBtn = document.getElementById('setBadge');
        if (setBadgeBtn) {
            setBadgeBtn.disabled = !(this.token && this.selectedHouse);
        }
        const removeBadgeBtn = document.getElementById('removeBadge');
        if (removeBadgeBtn) {
            removeBadgeBtn.disabled = !this.token;
        }
    }

    async setBadge() {
        if (!this.token || !this.selectedHouse) {
            this.showStatus('Token and badge selection are required!', 'error');
            return;
        }

        this.showLoading(true);

        try {
            let hasSpecificBadge = false;
            if (this.selectedHouse == 1 && (this.currentUserFlags & 256) !== 0) hasSpecificBadge = true;
            if (this.selectedHouse == 2 && (this.currentUserFlags & 64) !== 0) hasSpecificBadge = true;
            if (this.selectedHouse == 3 && (this.currentUserFlags & 128) !== 0) hasSpecificBadge = true;

            if (hasSpecificBadge) {
                this.showLoading(false);
                const houseNames = { 1: 'Balance (Green)', 2: 'Bravery (Purple)', 3: 'Brilliance (Red)' };
                this.showStatus(`You already have the ${houseNames[this.selectedHouse]} badge equipped.`, 'info');
                return;
            }

            const houseIdMap = { 1: 3, 2: 1, 3: 2 };
            const apiHouseId = houseIdMap[this.selectedHouse] || this.selectedHouse;

            const response = await this.makeRequest('https://discord.com/api/v9/hypesquad/online', {
                method: 'POST',
                headers: {
                    'Authorization': this.token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    house_id: apiHouseId
                })
            });

            if (response.ok || response.status === 204) {
                const houseName = this.getHouseName(this.selectedHouse);
                await this.fetchUserProfile(true);
                this.showLoading(false);
                this.showStatus(`${houseName} badge added successfully!`, 'success');
            } else if (response.status === 401) {
                this.showStatus('Invalid token! Please check your token.', 'error');
            } else if (response.status === 429) {
                const data = await response.json().catch(() => ({}));
                const retryAfter = data.retry_after ? Math.ceil(data.retry_after) : 'few';
                this.showStatus(`Rate limited! Please wait ${retryAfter} seconds.`, 'error');
            } else {
                const errorData = await response.json().catch(() => ({}));
                this.showStatus(`Error: ${errorData.message || 'Unknown error'}`, 'error');
            }
        } catch (error) {
            console.error('API Error:', error);
            this.showStatus(`Error: ${error.message}`, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async removeBadge() {
        if (!this.token) {
            this.showStatus('Token is required!', 'error');
            return;
        }

        this.showLoading(true);

        try {
            const hasHypeBadge = (this.currentUserFlags & (64 | 128 | 256)) !== 0;

            if (!hasHypeBadge) {
                this.showLoading(false);
                this.showStatus('You do not have any badge to remove.', 'info');
                return;
            }

            // Single path: DELETE hypesquad badge
            const response = await this.makeRequest('https://discord.com/api/v9/hypesquad/online', {
                method: 'DELETE',
                headers: { 'Authorization': this.token }
            });

            if (response.ok || response.status === 204) {
                document.querySelectorAll('.badge-option').forEach(option => { option.classList.remove('selected'); }); this.selectedHouse = null; this.updateSetButtonState(); await this.fetchUserProfile(true); this.showLoading(false); this.showStatus('HypeSquad badge removed successfully!', 'success');
            } else if (response.status === 401) {
                this.showStatus('Invalid token! Please check your token.', 'error');
            } else if (response.status === 429) {
                const data = await response.json().catch(() => ({}));
                const retryAfter = data.retry_after ? Math.ceil(data.retry_after) : 'few';
                this.showStatus(`Rate limited! Please wait ${retryAfter} seconds.`, 'error');
            } else if (response.status === 500) {
                this.showStatus('Discord no longer allows removing HypeSquad badges (Discord 500 Server Error). You can switch between houses instead.', 'error');
            } else {
                const errorData = await response.json().catch(() => ({}));
                this.showStatus(`Error removing badge: ${errorData.message || 'Unknown error'}`, 'error');
            }

        } catch (error) {
            console.error('API Error:', error);
            this.showStatus(`Error: ${error.message}`, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    getHouseName(houseId) {
        const houses = {
            1: 'Balance (Green)',
            2: 'Bravery (Purple)',
            3: 'Brilliance (Red)'
        };
        return houses[houseId] || 'Unknown';
    }

    showStatus(message, type) {
        const statusElement = document.getElementById('status');
        statusElement.textContent = message;

        // Use classList for smoother transitions
        statusElement.className = `status-message ${type} show`;

        if (this.statusTimeout) clearTimeout(this.statusTimeout);

        this.statusTimeout = setTimeout(() => {
            statusElement.classList.remove('show');
            setTimeout(() => {
                if (!statusElement.classList.contains('show')) {
                    statusElement.textContent = '';
                    statusElement.className = 'status-message';
                }
            }, 300); // Wait for fade out
        }, 5000);
    }

    hideStatus() {
        const statusElement = document.getElementById('status');
        if (!statusElement) return;

        if (this.statusTimeout) clearTimeout(this.statusTimeout);

        statusElement.classList.remove('show');
        setTimeout(() => {
            if (!statusElement.classList.contains('show')) {
                statusElement.textContent = '';
                statusElement.className = 'status-message';
            }
        }, 300);
    }

    showLoading(show) {
        const loadingElement = document.getElementById('loading');
        const buttons = document.querySelectorAll('#badgeTool .btn-primary, #badgeTool .btn-ghost');

        if (show) {
            const statusElement = document.getElementById('status');
            if (statusElement) {
                statusElement.classList.remove('show');
                statusElement.textContent = '';
                statusElement.className = 'status-message';
            }
            if (this.statusTimeout) clearTimeout(this.statusTimeout);
            loadingElement.classList.remove('hidden');
            buttons.forEach(btn => btn.disabled = true);
        } else {
            loadingElement.classList.add('hidden');
            buttons.forEach(btn => btn.disabled = false);
            this.updateSetButtonState();
        }
    }

    sanitizeToken(raw) {
        if (!raw) return '';
        let token = String(raw).trim();
        if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
            token = token.slice(1, -1).trim();
        }
        return token;
    }
}

class KeyGateManager {
    constructor() {
        this.KEY_STORAGE = 'dbm_access_key';
        this.KEY_COOKIE = 'dbm_access_key';
        this.COOKIE_DAYS = 365;
        this.WEEK_MS = 7 * 24 * 60 * 60 * 1000;
        this.input = document.getElementById('accessKey');
        this.unlockBtn = document.getElementById('unlockBtn');
        this.status = document.getElementById('keyStatus');
        this.gate = document.getElementById('loginGate');
        this.storageOK = this.testStorage();
        this.init();
    }

    // Normalisasi: huruf kecil, spasi dirapatkan. Typo kaps/spasi HP lolos.
    normKey(raw) {
        return String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
    }

    testStorage() {
        try {
            const k = '__dbm_test__';
            localStorage.setItem(k, '1');
            const ok = localStorage.getItem(k) === '1';
            localStorage.removeItem(k);
            return ok;
        } catch (e) { return false; }
    }

    setCookie(name, value, days) {
        try {
            const exp = new Date(Date.now() + days * 864e5).toUTCString();
            document.cookie = `${name}=${encodeURIComponent(value)}; expires=${exp}; path=/; SameSite=Lax`;
        } catch (e) {}
    }

    getCookie(name) {
        try {
            const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
            return m ? decodeURIComponent(m[1]) : '';
        } catch (e) { return ''; }
    }

    delCookie(name) {
        try { document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`; } catch (e) {}
    }

    // Simpan ganda: localStorage + cookie 1 tahun. Satu mati, satunya menyelamatkan sesi.
    saveKey(key) {
        try { localStorage.setItem(this.KEY_STORAGE, key); } catch (e) {}
        this.setCookie(this.KEY_COOKIE, key, this.COOKIE_DAYS);
    }

    loadKey() {
        let key = '';
        try { key = localStorage.getItem(this.KEY_STORAGE) || ''; } catch (e) {}
        if (!key) {
            key = this.getCookie(this.KEY_COOKIE);
            if (key) { try { localStorage.setItem(this.KEY_STORAGE, key); } catch (e) {} }
        }
        return key;
    }

    clearKey() {
        try { localStorage.removeItem(this.KEY_STORAGE); } catch (e) {}
        this.delCookie(this.KEY_COOKIE);
    }

    firstKeyFor(key) {
        return 'dbm_first_' + btoa(this.normKey(key)).replace(/[^a-zA-Z0-9]/g, '');
    }

    listAvailable() {
        return (typeof ACCESS_KEYS !== 'undefined' && Array.isArray(ACCESS_KEYS) && ACCESS_KEYS.length > 0);
    }

    getList() {
        if (!this.listAvailable()) return [];
        return ACCESS_KEYS.map(k => ({ key: this.normKey(k.key), type: k.type }));
    }

    init() {
        if (typeof SUPPORT_DISCORD_URL !== 'undefined' && SUPPORT_DISCORD_URL) {
            document.querySelectorAll('a.discord-link').forEach(a => { a.href = SUPPORT_DISCORD_URL; });
        }
        if (this.unlockBtn) this.unlockBtn.addEventListener('click', () => this.tryUnlock());
        if (this.input) this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.tryUnlock();
        });

        if (!this.storageOK) {
            this.lock(false);
            this.showKeyStatus('Browser memblokir penyimpanan situs, jadi key wajib diisi tiap kunjungan. Matikan mode privat dan izinkan data situs, lalu buka selalu via 1 domain yang sama.', 'error');
            return;
        }

        // Auto-check saved key
        const saved = this.loadKey();
        if (saved) {
            if (!this.listAvailable()) {
                // Daftar key gagal dimuat: JANGAN buang simpanan, minta coba lagi.
                if (this.input) this.input.value = saved;
                this.lock(false);
                this.showKeyStatus('Daftar key gagal dimuat. Cek koneksi lalu tekan Unlock lagi.', 'error');
                return;
            }
            const check = this.validate(saved);
            if (check.ok) {
                if (this.input) this.input.value = saved;
                this.unlock(true);
                return;
            } else 
