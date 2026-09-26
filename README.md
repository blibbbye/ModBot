# ModBot

Generated with Discord Bot HTML Maker V4.

## Install
1. Install Node.js 18 or newer.
2. Run npm install.
3. Copy `.env.example` to `.env`.
4. Put your bot token into `DISCORD_TOKEN`.
5. Put your application/client ID into `DISCORD_CLIENT_ID`.
6. Put your test/server ID into `DISCORD_GUILD_ID` for fast command updates (optional).
7. Put the Discord user ID of the co-owner into `CO_OWNER_ID`.
8. Run npm start.

## Features
- 9 slash/context commands
- Anonymous `/confess` posts to `🤫・confessions` without revealing the command user's identity.
- `/translate from to` saves the language pair for 10 minutes.
- Because Discord chat-input slash interactions do not include a reply target, use **Apps → Translate** on the message you want translated after setting the languages with `/translate`.
- `/co-owner` is restricted to the configured `CO_OWNER_ID`.
- Commands are deployed automatically on startup by default.
- `DEPLOY_COMMANDS=false` disables automatic deployment.

## Environment
`CO_OWNER_ID` = the Discord user ID allowed to use `/co-owner`.

`BOT_CREATOR_NAME` = creator name shown by `/co-owner`.

`CONFESSIONS_CHANNEL_NAME` = channel name for anonymous confessions. Defaults to `🤫・confessions`.

`DEFAULT_TRANSLATE_TO` = fallback target language for the Translate message command. Defaults to `en`.

`DEPLOY_COMMANDS` = `true` or `false`.

Never publish `.env` or your bot token.
