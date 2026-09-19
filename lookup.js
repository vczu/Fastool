/* Fastool Lookup engines. Browser-side only.
   Server Lookup uses Discord's PUBLIC invite API (no token).
   User Lookup uses the public japi.rest API by ID only (no token),
   with offline snowflake decode as fallback. Token Checker validates
   via /users/@me and never stores anything. */

const LK_API = 'https://discord.com/api/v9';

function lkShow(el, show) {
    if (!el) return;
    if (show) el.classList.remove('hidden'), el.style.display = '';
    else el.classList.add('hidden'), el.style.display = 'none';
}

function lkError(el, msg) {
    if (!el) return;
    if (!msg) { el.classList.remove('show'); el.textContent = ''; return; }
    el.textContent = msg;
    el.className = 'status-message error show';
    el.style.display = '';
}

function lkRow(k, v) {
    const d = document.createElement('div');
    d.className = 'detail-row';
    const kk = document.createElement('span');
    kk.className = 'detail-k';
    kk.textContent = k;
    const vv = document.createElement('span');
    vv.className = 'detail-v';
    vv.textContent = v;
    d.appendChild(kk);
    d.appendChild(vv);
    return d;
}

function lkDlButton(label, url, filename) {
    const a = document.createElement('a');
    a.className = 'btn-ghost small-dl';
    a.textContent = label;
    a.href = url;
    a.download = filename;
    a.target = '_blank';
    a.rel = 'noopener';
    return a;
}

function snowflakeDate(id) {
    // Discord epoch: 1420070400000
    return new Date(Number((BigInt(id) >> 22n) + 1420070400000n));
}

function fmtDate(d) {
    return d.toUTCString().replace(' GMT', ' UTC');
}

/* ---------------- SERVER LOOKUP ---------------- */
async function lkServerLookup() {
    const input = document.getElementById('inviteInput');
    const loading = document.getElementById('serverLookupLoading');
    const errBox = document.getElementById('serverLookupError');
    const resBox = document.getElementById('serverLookupResult');
    lkError(errBox, null);
    lkShow(resBox, false);

    let code = (input?.value || '').trim();
    if (!code) return lkError(errBox, 'Paste an invite link or code first.');
    const m = code.match(/(?:discord\.gg\/|discord\.com\/invite\/|discordapp\.com\/invite\/)([A-Za-z0-9-]+)/);
    if (m) code = m[1];
    code = code.split(/[?#\s]/)[0];

    lkShow(loading, true);
    try {
        const res = await fetch(`${LK_API}/invites/${encodeURIComponent(code)}?with_counts=true&with_expiration=true`);
        if (res.status === 404) throw new Error('Invite not found or expired.');
        if (res.status === 429) throw new Error('Rate limited. Wait a bit and retry.');
        if (!res.ok) throw new Error('Lookup failed (HTTP ' + res.status + ').');
        const inv = await res.json();
        const g = inv.guild || {};
        if (!g.id) throw new Error('This invite has no server attached.');

        // Banner
        const banner = document.getElementById('lkBanner');
        if (g.banner) {
            banner.src = `https://cdn.discordapp.com/banners/${g.id}/${g.banner}.png?size=1024`;
            lkShow(banner, true);
        } else lkShow(banner, false);

        // Icon + name + desc
        const icon = document.getElementById('lkIcon');
        icon.src = g.icon
            ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=256`
            : 'images/favicon.png';
        document.getElementById('lkName').textContent = g.name || 'Unknown server';
        document.getElementById('lkDesc').textContent = g.description || 'No description.';

        // Downloads
        const dl = document.getElementById('lkDownloads');
        dl.innerHTML = '';
        if (g.icon) dl.appendChild(lkDlButton('Download Icon', icon.src, `${g.name}-icon.png`));
        if (g.banner) dl.appendChild(lkDlButton('Download Banner', banner.src, `${g.name}-banner.png`));
        if (g.splash) dl.appendChild(lkDlButton('Download Splash', `https://cdn.discordapp.com/splashes/${g.id}/${g.splash}.png?size=1024`, `${g.name}-splash.png`));

        // Stats
        const verifyNames = ['None', 'Low', 'Medium', 'High', 'Very High'];
        document.getElementById('lkMembers').textContent = inv.approximate_member_count ?? '-';
        document.getElementById('lkOnline').textContent = inv.approximate_presence_count ?? '-';
        document.getElementById('lkVerify').textContent = verifyNames[g.verification_level] ?? (g.verification_level ?? '-');
        document.getElementById('lkBoost').textContent = g.premium_subscription_count != null
            ? `Lvl ${g.premium_tier ?? 0} (${g.premium_subscription_count} boosts)` : '-';

        // Details
        const det = document.getElementById('lkDetails');
        det.innerHTML = '';
        det.appendChild(lkRow('Server ID', g.id));
        det.appendChild(lkRow('Vanity URL', g.vanity_url_code || '-'));
        det.appendChild(lkRow('NSFW', g.nsfw ? 'Yes' : 'No'));
        det.appendChild(lkRow('Preferred locale', g.preferred_locale || '-'));
        if (inv.expires_at) det.appendChild(lkRow('Invite expires', fmtDate(new Date(inv.expires_at))));
        if (inv.channel) det.appendChild(lkRow('Invite channel', `#${inv.channel.name || inv.channel.id}`));
        if (inv.inviter) det.appendChild(lkRow('Inviter', `${inv.inviter.username} (${inv.inviter.id})`));

        lkShow(resBox, true);
    } catch (e) {
        lkError(errBox, e.message || 'Lookup failed.');
    } finally {
        lkShow(loading, false);
    }
}

/* ---------------- USER LOOKUP ---------------- */
const FLAG_NAMES = [
    [1 << 0, 'Staff'], [1 << 1, 'Partner'], [1 << 2, 'HypeSquad'], [1 << 3, 'Bug Hunter L1'],
    [1 << 6, 'HypeSquad Bravery'], [1 << 7, 'HypeSquad Brilliance'], [1 << 8, 'HypeSquad Balance'],
    [1 << 9, 'Early Nitro'], [1 << 10, 'Team User'], [1 << 14, 'Bug Hunter L2'],
    [1 << 16, 'Verified Bot'], [1 << 17, 'Verified Developer'], [1 << 18, 'Certified Mod'],
    [1 << 19, 'Bot HTTP Interactions'], [1 << 22, 'Active Developer']
];

function flagList(bits) {
    const n = Number(bits || 0);
    return FLAG_NAMES.filter(([b]) => (n & b) !== 0).map(([, name]) => name);
}

async function lkDownload(url, filename) {
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('fetch ' + res.status);
        const blob = await res.blob();
        const obj = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = obj;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(obj), 5000);
    } catch (e) {
        window.open(url, '_blank', 'noopener');
    }
}

async function lkUserLookup() {
    const idEl = document.getElementById('lookupUserId');
    const loading = document.getElementById('userLookupLoading');
    const errBox = document.getElementById('userLookupError');
    const resBox = document.getElementById('userLookupResult');
    lkError(errBox, null);
    lkShow(resBox, false);

    const id = (idEl?.value || '').trim();
    if (!/^\d{10,25}$/.test(id)) return lkError(errBox, 'Enter a valid numeric User ID.');

    const det = document.getElementById('luDetails');
    const dl = document.getElementById('luDownloads');
    det.innerHTML = '';
    if (dl) dl.innerHTML = '';

    lkShow(loading, true);
    try {
        // Public no-key API (japi.rest). No token needed at all.
        const res = await fetch(`https://japi.rest/discord/v1/user/${encodeURIComponent(id)}`);
        if (res.status === 404) throw new Error('User not found.');
        if (res.status === 429) throw new Error('Rate limited. Wait a bit and retry.');
        if (!res.ok) throw new Error('Lookup failed (HTTP ' + res.status + ').');
        const body = await res.json();
        const u = body.data || body;
        if (!u || !u.id) throw new Error('User not found.');

        const avatarURL = u.avatarURL || u.avatar
            ? (u.avatarURL || `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=512`)
            : (u.defaultAvatarURL || 'images/favicon.png');
        const bannerURL = u.bannerURL || (u.banner
            ? `https://cdn.discordapp.com/banners/${u.id}/${u.banner}.${String(u.banner).startsWith('a_') ? 'gif' : 'png'}?size=1024`
            : null);

        document.getElementById('luAvatar').src = avatarURL;
        document.getElementById('luName').textContent = u.global_name
            ? `${u.global_name} (@${u.username})` : `@${u.username || id}`;
        const flags = flagList(u.public_flags ?? u.flags);
        document.getElementById('luSub').textContent = flags.length ? flags.join(', ') : 'No badges';

        if (dl) {
            const avBtn = document.createElement('button');
            avBtn.type = 'button';
            avBtn.className = 'btn-ghost small-dl';
            avBtn.textContent = 'Download Avatar';
            avBtn.addEventListener('click', () => lkDownload(avatarURL, `${u.username || id}-avatar.png`));
            dl.appendChild(avBtn);
            if (bannerURL) {
                const bnBtn = document.createElement('button');
                bnBtn.type = 'button';
                bnBtn.className = 'btn-ghost small-dl';
                bnBtn.textContent = 'Download Banner';
                bnBtn.addEventListener('click', () => lkDownload(bannerURL, `${u.username || id}-banner.png`));
                dl.appendChild(bnBtn);
            }
        }

        det.appendChild(lkRow('User ID', String(u.id)));
        det.appendChild(lkRow('Username', u.tag || u.username || '-'));
        det.appendChild(lkRow('Created', u.createdAt ? fmtDate(new Date(u.createdAt)) : fmtDate(snowflakeDate(String(u.id)))));
        det.appendChild(lkRow('Badges', flags.length ? flags.join(', ') : 'None'));
        if (u.accent_color != null) det.appendChild(lkRow('Accent color', '#' + Number(u.accent_color).toString(16).padStart(6, '0')));
        if (u.banner_color) det.appendChild(lkRow('Banner color', u.banner_color));
        if (bannerURL) det.appendChild(lkRow('Banner', 'Available, use Download Banner above.'));

        lkShow(resBox, true);
    } catch (e) {
        // Fallback: offline snowflake decode so the tool never looks dead
        try {
            const created = snowflakeDate(id);
            document.getElementById('luAvatar').src = 'images/favicon.png';
            document.getElementById('luName').textContent = 'ID ' + id;
            document.getElementById('luSub').textContent = 'Offline decode (lookup API unreachable).';
            det.appendChild(lkRow('User ID', id));
            det.appendChild(lkRow('Created', fmtDate(created)));
            det.appendChild(lkRow('Unix timestamp', String(Math.floor(created.getTime() / 1000))));
            det.appendChild(lkRow('Note', 'Full data failed: ' + (e.message || 'error')));
            lkShow(resBox, true);
        } catch (err) {
            lkError(errBox, e.message || 'Lookup failed.');
        }
    } finally {
        lkShow(loading, false);
    }
}

/* ---------------- TOKEN CHECKER ---------------- */
async function lkTokenCheck() {
    const input = document.getElementById('checkToken');
    const loading = document.getElementById('tokenCheckLoading');
    const errBox = document.getElementById('tokenCheckError');
    const resBox = document.getElementById('tokenCheckResult');
    lkError(errBox, null);
    lkShow(resBox, false);

    const token = (input?.value || '').trim().replace(/^["']|["']$/g, '');
    if (!token) return lkError(errBox, 'Paste a token first.');

    lkShow(loading, true);
    try {
        const res = await fetch(`${LK_API}/users/@me`, { headers: { 'Authorization': token } });
        if (res.status === 401) throw new Error('Invalid token.');
        if (res.status === 429) throw new Error('Rate limited. Wait a bit and retry.');
        if (!res.ok) throw new Error('Check failed (HTTP ' + res.status + ').');
        const u = await res.json();

        document.getElementById('tcAvatar').src = u.avatar
            ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=256`
            : `https://cdn.discordapp.com/embed/avatars/${Number(u.discriminator || 0) % 5}.png`;
        document.getElementById('tcName').textContent = 'Valid token';
        document.getElementById('tcSub').textContent = `@${u.username} (${u.id})`;

        const det = document.getElementById('tcDetails');
        det.innerHTML = '';
        det.appendChild(lkRow('Username', u.username));
        det.appendChild(lkRow('User ID', u.id));
        det.appendChild(lkRow('Bot', u.bot ? 'Yes' : 'No'));
        det.appendChild(lkRow('MFA enabled', u.mfa_enabled ? 'Yes' : 'No'));
        det.appendChild(lkRow('Locale', u.locale || '-'));
        det.appendChild(lkRow('Nitro', u.premium_type === 2 ? 'Full' : u.premium_type === 1 ? 'Classic' : 'None'));
        det.appendChild(lkRow('Warning', 'Never share this token with anyone.'));

        lkShow(resBox, true);
    } catch (e) {
        lkError(errBox, e.message || 'Check failed.');
    } finally {
        lkShow(loading, false);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('serverLookupBtn')?.addEventListener('click', lkServerLookup);
    document.getElementById('inviteInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') lkServerLookup(); });
    document.getElementById('userLookupBtn')?.addEventListener('click', lkUserLookup);
    document.getElementById('lookupUserId')?.addEventListener('keydown', e => { if (e.key === 'Enter') lkUserLookup(); });
    document.getElementById('tokenCheckBtn')?.addEventListener('click', lkTokenCheck);
    document.getElementById('checkToken')?.addEventListener('keydown', e => { if (e.key === 'Enter') lkTokenCheck(); });
});
