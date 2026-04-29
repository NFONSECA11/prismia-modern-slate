---
name: API Connection
description: Conexão com backend Django via túnel Cloudflare e resiliência Axios.
type: reference
---
Conexão com backend Django via túnel Cloudflare (URL atual: https://metres-decisions-lectures-basically.trycloudflare.com). Axios com auto-retry/fallback, persistência da baseURL em localStorage (`api_base_url_v2`), normalização `.trycloudflare.co` → `.trycloudflare.com`, e sanitização de respostas HTML em endpoints `/api/`.
