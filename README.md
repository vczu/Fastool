# FASTOOL

Free Discord tools — badges, cloning, lookups.

## Features

- **HypeSquad Badge Manager** — Join any HypeSquad house from your browser
- **Server Cloner** — Copy roles, channels, categories, emojis, icon & name with safe pacing
- **Server Lookup** — Get server info, icon, banner, splash
- **User Lookup** — Get user profile, avatar, banner
- **Token Checker** — Validate Discord tokens and check account info

## Tech

- 100% client-side — no server, no backend
- All Discord API calls go directly from your browser to `discord.com`
- Access key gate (permanent & weekly keys)
- Hardened with CSP, HSTS, X-Frame-Options, and more
- Hosted on Cloudflare Pages

## Local Development

Just open `index.html` in a browser, or use a local server:

```bash
npx serve .
```

## How to Use

1. Open [fastool.my.id](https://fastool.my.id)
2. Enter your access key (join [Discord](https://discord.gg/HbbnwFrgTf) to get one)
3. Select a tool and follow the instructions

## Security

- Tokens are never stored — they stay in memory only
- No `eval()`, no server, no external scripts
- CSP, HSTS, X-Frame-Options, Referrer-Policy enabled

## License

MIT
