# ModBot

Generated with Discord Bot HTML Maker V4.

## Install
1. Install Node.js 18 or newer.
2. Run npm install.
3. Copy `.env.example` to `.env`.
4. Put your bot token into `DISCORD_TOKEN`.
5. Put your application/client ID into `DISCORD_CLIENT_ID`.
6. Optionally put a test guild ID into `DISCORD_GUILD_ID`.
7. Run npm start.

## Features
- Anonymous `/confess` with an optional text argument.
- Running `/confess` without text opens a private confession form instead of starting a typing/deferred response.
- Confessions are posted as embeds in `🤫・confessions` with a **Submit a Confession** button.
- The button opens the same private confession form.
- Each confession stores its sender privately in `confessions.json`.
- The message context command **showconfess** is restricted to Discord user ID `863446773326151700` and reveals the sender of a selected confession only to that user.
- `showconfess` is used by right-clicking a confession → **Apps → showconfess** because Discord message-targeted actions are provided as message context commands.
- Commands are deployed automatically on startup by default.
- `DEPLOY_COMMANDS=false` disables automatic deployment.

## Environment
`DISCORD_TOKEN` = your bot token.

`DISCORD_CLIENT_ID` = your Discord application/client ID.

`DISCORD_GUILD_ID` = optional server ID for faster guild command updates.

`CONFESSIONS_CHANNEL_NAME` = channel name for anonymous confessions. Defaults to `🤫・confessions`.

`DEPLOY_COMMANDS` = `true` or `false`.

Never publish `.env` or your bot token.
