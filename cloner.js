/* Fastool Server Cloner. Runs entirely in the browser.
   Token is only sent to discord.com, never anywhere else.
   Medium-safe pacing: every write pauses ~1.5s, reads ~0.5s,
   with jitter plus auto-stop after repeated rate limits.
   Credit for the original concept: spunKfps/Discord-Server-Cloner-2025 */

class ServerCloner {
    constructor() {
        this.API = 'https://discord.com/api/v9';
        this.stopFlag = false;
        this.running = false;
        this.done = 0;
        this.total = 1;
        // Medium-safe pacing: writes are slow, reads are gentler.
        // Jitter keeps the rhythm from looking robotic.
        this.WRITE_DELAY = 1500;
        this.READ_DELAY = 500;
        this.LIMIT_BUFFER = 1500;
        this.MAX_STRIKES = 5;
        this.rateStrikes = 0;
        this.el = {};
        ['cloneToken', 'toggleCloneToken', 'sourceId', 'destId', 'cloneWipe',
         'startCloneBtn', 'stopCloneBtn', 'cloneProgressWrap', 'cloneProgressFill',
         'cloneProgressLabel', 'cloneLogWrap', 'cloneLogs', 'copyCloneLog', 'clearCloneLog'
        ].forEach(id => { this.el[id] = document.getElementById(id); });
        this.bind();
    }

    bind() {
        if (this.el.toggleCloneToken) {
            this.el.toggleCloneToken.addEventListener('click', () => {
                const i = this.el.cloneToken;
                i.type = i.type === 'password' ? 'text' : 'password';
            });
        }
        if (this.el.startCloneBtn) this.el.startCloneBtn.addEventListener('click', () => this.start());
        if (this.el.stopCloneBtn) this.el.stopCloneBtn.addEventListener('click', () => this.stop());
        if (this.el.clearCloneLog) this.el.clearCloneLog.addEventListener('click', () => {
            if (this.el.cloneLogs) this.el.cloneLogs.innerHTML = '';
        });
        if (this.el.copyCloneLog) this.el.copyCloneLog.addEventListener('click', async () => {
            const txt = this.el.cloneLogs ? this.el.cloneLogs.innerText : '';
            try { await navigator.clipboard.writeText(txt); this.log('Log copied to clipboard.', 'ok'); }
            catch (e) { this.log('Copy failed: ' + e.message, 'err'); }
        });
    }

    log(msg, cls) {
        if (!this.el.cloneLogs || !this.el.cloneLogWrap) return;
        this.el.cloneLogWrap.style.display = '';
        const line = document.createElement('div');
        line.className = 'log-line' + (cls ? ' ' + cls : '');
        const t = new Date().toLocaleTimeString('en-GB', { hour12: false });
        const ts = document.createElement('span');
        ts.className = 't';
        ts.textContent = '[' + t + ']';
        line.appendChild(ts);
        line.appendChild(document.createTextNode(msg));
        this.el.cloneLogs.appendChild(line);
        this.el.cloneLogs.scrollTop = this.el.cloneLogs.scrollHeight;
    }

    tick(phase) {
        this.done++;
        const pct = Math.min(100, Math.round((this.done / Math.max(1, this.total)) * 100));
        if (this.el.cloneProgressFill) this.el.cloneProgressFill.style.width = pct + '%';
        if (this.el.cloneProgressLabel) this.el.cloneProgressLabel.textContent = phase ? (phase + ' ' + pct + '%') : (pct + '%');
    }

    sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    // Paced sleep with jitter so request rhythm looks human.
    async pace(baseMs) {
        const jitter = baseMs * (0.75 + Math.random() * 0.5);
        const steps = Math.max(1, Math.round(jitter / 250));
        for (let i = 0; i < steps; i++) {
            if (this.stopFlag) throw new Error('STOPPED');
            await this.sleep(Math.min(250, jitter - i * 250));
        }
    }

    paceRead() { return this.pace(this.READ_DELAY); }
    paceWrite() { return this.pace(this.WRITE_DELAY); }

    async api(token, method, path, body, retries = 5) {
        for (let attempt = 0; attempt <= retries; attempt++) {
            if (this.stopFlag) throw new Error('STOPPED');
            let res;
            try {
                res = await fetch(this.API + path, {
                    method,
                    headers: Object.assign(
                        { 'Authorization': token, 'Content-Type': 'application/json' },
                        {}
                    ),
                    body: body !== undefined ? JSON.stringify(body) : undefined
                });
            } catch (e) {
                if (attempt === retries) throw new Error('Network error: ' + e.message);
                await this.sleep(1500);
                continue;
            }
            if (res.status === 429) {
                let wait = 2000;
                try { const d = await res.json(); if (d.retry_after) wait = Math.ceil(d.retry_after * 1000); } catch (e) {}
                wait += this.LIMIT_BUFFER;
                this.rateStrikes++;
                if (this.rateStrikes >= this.MAX_STRIKES) {
                    throw new Error(`Rate limited ${this.MAX_STRIKES}x in a row. Stopped to protect the account. Wait a while before retrying.`);
                }
                this.log(`Rate limited (${this.rateStrikes}/${this.MAX_STRIKES}), waiting ${Math.ceil(wait / 1000)}s...`, 'warn');
                await this.sleep(wait);
                continue;
            }
            if (res.status === 401) throw new Error('Invalid token (401).');
            if (res.status === 403) {
                let m = '';
                try { const d = await res.json(); m = d.message || ''; } catch (e) {}
                throw new Error('Missing permission (403). ' + m);
            }
            if (!res.ok && res.status !== 204) {
                let m = res.status;
                try { const d = await res.json(); m = d.message || JSON.stringify(d); } catch (e) {}
                throw new Error('Discord API ' + res.status + ': ' + m);
            }
            this.rateStrikes = 0;
            if (res.status === 204) return null;
            try { return await res.json(); } catch (e) { return null; }
        }
        throw new Error('Too many rate limits, aborted.');
    }

    stop() {
        if (!this.running) return;
        this.stopFlag = true;
        this.log('Stopping after current request...', 'warn');
    }

    setRunning(on) {
        this.running = on;
        if (this.el.startCloneBtn) this.el.startCloneBtn.style.display = on ? 'none' : '';
        if (this.el.stopCloneBtn) this.el.stopCloneBtn.style.display = on ? '' : 'none';
        if (this.el.cloneProgressWrap) this.el.cloneProgressWrap.style.display = on ? '' : this.el.cloneProgressWrap.style.display;
    }

    async blobToDataURL(blob) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = () => reject(new Error('Failed to read image'));
            r.readAsDataURL(blob);
        });
    }

    async fetchImageDataURL(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Image fetch ' + res.status);
        return this.blobToDataURL(await res.blob());
    }

    remapOverwrites(overwrites, roleMap, srcId, dstId) {
        const out = [];
        (overwrites || []).forEach(o => {
            let id = String(o.id);
            if (id === String(srcId)) id = String(dstId);
            else if (roleMap.has(id)) id = roleMap.get(id);
            else if (String(o.type) === '1' || o.type === 1) return; // member overwrite, user not in target
            out.push({ id, type: o.type, allow: String(o.allow), deny: String(o.deny) });
        });
        return out;
    }

    async start() {
        if (this.running) return;
        const token = (this.el.cloneToken?.value || '').trim();
        const src = (this.el.sourceId?.value || '').trim();
        const dst = (this.el.destId?.value || '').trim();
        if (!token) return this.log('Enter your Discord token first.', 'err');
        if (!/^\d{10,25}$/.test(src)) return this.log('Source Server ID looks invalid.', 'err');
        if (!/^\d{10,25}$/.test(dst)) return this.log('Target Server ID looks invalid.', 'err');
        if (src === dst) return this.log('Source and target must be different servers.', 'err');

        this.stopFlag = false;
        this.rateStrikes = 0;
        this.done = 0;
        this.setRunning(true);
        if (this.el.cloneLogs) this.el.cloneLogs.innerHTML = '';
        if (this.el.cloneLogWrap) this.el.cloneLogWrap.style.display = '';
        if (this.el.cloneProgressWrap) this.el.cloneProgressWrap.style.display = '';
        if (this.el.cloneProgressFill) this.el.cloneProgressFill.style.width = '0%';
        if (this.el.cloneProgressLabel) this.el.cloneProgressLabel.textContent = '0%';

        try {
            this.log('Verifying token...');
            const me = await this.api(token, 'GET', '/users/@me');
            this.log('Logged in as ' + me.username, 'ok');
            this.tick('Verifying');

            this.log('Fetching source server (paced to stay safe)...');
            const srcGuild = await this.api(token, 'GET', '/guilds/' + src);
            await this.paceRead();
            const srcRoles = await this.api(token, 'GET', '/guilds/' + src + '/roles');
            await this.paceRead();
            const srcChannels = await this.api(token, 'GET', '/guilds/' + src + '/channels');
            await this.paceRead();
            const srcEmojis = await this.api(token, 'GET', '/guilds/' + src + '/emojis').catch(() => []);
            this.log('Source: ' + srcGuild.name + ' (' + srcRoles.length + ' roles, ' + srcChannels.length + ' channels, ' + (srcEmojis || []).length + ' emojis)', 'ok');

            await this.api(token, 'GET', '/guilds/' + dst).catch(() => { throw new Error('Target server not found or no access.'); });

            const cats = srcChannels.filter(c => c.type === 4).sort((a, b) => a.position - b.position);
            const chans = srcChannels.filter(c => c.type !== 4).sort((a, b) => a.position - b.position);
            this.total = 2 + srcRoles.length + srcChannels.length + (srcEmojis || []).length;

            // 1) Wipe target (sequential with pauses, never bursty)
            if (this.el.cloneWipe?.checked) {
                this.log('Deleting existing target data (paced)...');
                const dstRoles = await this.api(token, 'GET', '/guilds/' + dst + '/roles').catch(() => []);
                await this.paceRead();
                const dstChannels = await this.api(token, 'GET', '/guilds/' + dst + '/channels').catch(() => []);
                await this.paceRead();
                const dstEmojis = await this.api(token, 'GET', '/guilds/' + dst + '/emojis').catch(() => []);
                for (const r of dstRoles) {
                    if (this.stopFlag) throw new Error('STOPPED');
                    if (r.managed || r.name === '@everyone') continue;
                    try { await this.api(token, 'DELETE', '/guilds/' + dst + '/roles/' + r.id); this.log('Deleted role: ' + r.name); }
                    catch (e) { this.log('Skip role ' + r.name + ': ' + e.message, 'warn'); }
                    await this.paceWrite();
                }
                for (const c of dstChannels) {
                    if (this.stopFlag) throw new Error('STOPPED');
                    try { await this.api(token, 'DELETE', '/channels/' + c.id); this.log('Deleted channel: ' + c.name); }
                    catch (e) { this.log('Skip channel ' + c.name + ': ' + e.message, 'warn'); }
                    await this.paceWrite();
                }
                for (const e of (dstEmojis || [])) {
                    if (this.stopFlag) throw new Error('STOPPED');
                    try { await this.api(token, 'DELETE', '/guilds/' + dst + '/emojis/' + e.id); } catch (err) {}
                    await this.paceWrite();
                }
            }
            this.tick('Cleaning');

            // 2) Server name + icon
            try {
                await this.api(token, 'PATCH', '/guilds/' + dst, { name: srcGuild.name });
                await this.paceWrite();
                this.log('Copied server name: ' + srcGuild.name, 'ok');
            } catch (e) { this.log('Skip name: ' + e.message, 'warn'); }
            if (srcGuild.icon) {
                try {
                    const data = await this.fetchImageDataURL('https://cdn.discordapp.com/icons/' + src + '/' + srcGuild.icon + '.png?size=256');
                    await this.api(token, 'PATCH', '/guilds/' + dst, { icon: data });
                    await this.paceWrite();
                    this.log('Copied server icon.', 'ok');
                } catch (e) { this.log('Skip icon: ' + e.message, 'warn'); }
            }
            this.tick('Setup');

            // 3) Roles (strip Administrator bit)
            const roleMap = new Map();
            const orderedRoles = [...srcRoles].sort((a, b) => a.position - b.position);
            for (const r of orderedRoles) {
                if (this.stopFlag) throw new Error('STOPPED');
                if (r.name === '@everyone') continue;
                try {
                    const perms = (BigInt(r.permissions) & ~8n).toString();
                    const created = await this.api(token, 'POST', '/guilds/' + dst + '/roles', {
                        name: r.name, color: r.color, hoist: r.hoist,
                        mentionable: r.mentionable, permissions: perms
                    });
                    roleMap.set(String(r.id), String(created.id));
                    this.log('Cloned role: ' + r.name, 'ok');
                } catch (e) { this.log('Role failed ' + r.name + ': ' + e.message, 'err'); }
                await this.paceWrite();
                this.tick('Roles');
            }

            // 4) Categories then channels
            const catMap = new Map();
            for (const c of cats) {
                if (this.stopFlag) throw new Error('STOPPED');
                try {
                    const created = await this.api(token, 'POST', '/guilds/' + dst + '/channels', {
                        name: c.name, type: 4,
                        permission_overwrites: this.remapOverwrites(c.permission_overwrites, roleMap, src, dst)
                    });
                    catMap.set(String(c.id), String(created.id));
                    this.log('Cloned category: ' + c.name, 'ok');
                } catch (e) { this.log('Category failed ' + c.name + ': ' + e.message, 'err'); }
                await this.paceWrite();
                this.tick('Categories');
            }
            for (const c of chans) {
                if (this.stopFlag) throw new Error('STOPPED');
                if (![0, 2, 5, 13, 15, 16].includes(c.type)) { this.tick('Channels'); continue; }
                try {
                    const payload = {
                        name: String(c.name).toLowerCase(), type: c.type,
                        permission_overwrites: this.remapOverwrites(c.permission_overwrites, roleMap, src, dst)
                    };
                    if (c.parent_id && catMap.has(String(c.parent_id))) payload.parent_id = catMap.get(String(c.parent_id));
                    if (c.topic) payload.topic = c.topic.slice(0, 1024);
                    if (c.nsfw) payload.nsfw = true;
                    if (c.bitrate) payload.bitrate = c.bitrate;
                    if (c.user_limit) payload.user_limit = c.user_limit;
                    if (c.rate_limit_per_user) payload.rate_limit_per_user = c.rate_limit_per_user;
                    await this.api(token, 'POST', '/guilds/' + dst + '/channels', payload);
                    this.log('Cloned channel: ' + c.name, 'ok');
                } catch (e) { this.log('Channel failed ' + c.name + ': ' + e.message, 'err'); }
                await this.paceWrite();
                this.tick('Channels');
            }

            // 5) Emojis
            for (const e of (srcEmojis || [])) {
                if (this.stopFlag) throw new Error('STOPPED');
                try {
                    const ext = e.animated ? 'gif' : 'png';
                    const data = await this.fetchImageDataURL('https://cdn.discordapp.com/emojis/' + e.id + '.' + ext + '?size=128');
                    await this.api(token, 'POST', '/guilds/' + dst + '/emojis', { name: e.name, image: data });
                    this.log('Cloned emoji: ' + e.name, 'ok');
                } catch (err) { this.log('Emoji failed ' + e.name + ': ' + err.message, 'err'); }
                await this.paceWrite();
                this.tick('Emojis');
            }

            if (this.el.cloneProgressFill) this.el.cloneProgressFill.style.width = '100%';
            if (this.el.cloneProgressLabel) this.el.cloneProgressLabel.textContent = '100%';
            this.log('Cloning completed successfully.', 'ok');
            try {
                const n = parseInt(localStorage.getItem('dbm_cloned_count') || '0', 10) + 1;
                localStorage.setItem('dbm_cloned_count', String(n));
                const statEl = document.getElementById('statServers');
                if (statEl) statEl.textContent = String(n);
            } catch (e) {}
        } catch (e) {
            if (e.message === 'STOPPED') this.log('Process stopped by user.', 'warn');
            else this.log('Error: ' + e.message, 'err');
        } finally {
            this.setRunning(false);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    try { new ServerCloner(); } catch (e) { console.error('Cloner init failed:', e); }
});
