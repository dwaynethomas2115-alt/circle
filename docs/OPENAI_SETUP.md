# AI themes with Appwrite

Circle's Appwrite Function includes the AI theme handler. Preset themes need no OpenAI credentials. AI previews require a separately authorized, deployed `circle-api` Function and an OpenAI API project with billing/credits.

1. Complete [Appwrite setup](../appwrite/README.md), including authenticated function execution and database permissions.
2. In the Appwrite Function's variables, set **OPENAI_API_KEY** as a secret. Keep it out of chat, source control, client `.env` files, screenshots and every `EXPO_PUBLIC_*` variable. No key has been created or configured by this repository change.
3. Optionally set `OPENAI_THEME_MODEL` to a model supporting Chat Completions structured JSON output. The retained default is `gpt-4.1-mini`.
4. Redeploy the Function after changing variables. If its environment restricts outbound traffic, allow the official `api.openai.com` endpoint.
5. Sign in as a Circle owner/admin, open theme settings, enter a short design description, generate a preview, then explicitly apply it. Generation alone does not change the Circle theme.

The server verifies Auth and manager membership, commits a one-per-minute/ten-per-day quota reservation before the provider call, sends only the explicit description (up to 300 characters), validates color contrast and motif fields, rechecks current membership, and stores proposal provenance. Applying an AI theme requires an exact recorded proposal. Failed provider calls still consume their quota reservation. No posts, chats, photos or profile details are sent to OpenAI.

Tests mock the provider response. No live OpenAI generation or billing was exercised here. Provider usage may incur charges. Legacy Supabase deployment instructions are not applicable to the active client; the historical handler remains preserved under `supabase/functions/`.

References: [Appwrite Function variables and identity](https://appwrite.io/docs/products/functions/develop), [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
