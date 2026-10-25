bot for my friends discord server


- **Secret Reply** creates a public thread on the confession. Anyone can enter/read the thread, but the reply itself is posted by ModBot so the responder's identity is not exposed.

## Member Join Tracking
- New member joins are logged as an embed in the `actions` channel.
- The log includes the member, username, User ID, bot status, account creation time, server join time, nickname, pending verification state, roles, join method, invite code, inviter, invite channel, and invite metadata when Discord provides it.
- Invite tracking is best-effort because Discord's member-join event does not directly include the invite that was used; ModBot compares invite-use counts to determine the likely invite. citeturn774084search2turn558767search2
- Vanity URL joins and joins that cannot be attributed are labeled accordingly instead of guessing.
- The bot stores its invite-use snapshot in `invite_cache.json`.
- Enable **Server Members Intent** in the Discord Developer Portal and give ModBot permission to read/fetch invites. Server Members is a privileged intent used for member join events. citeturn774084search0

## Automatic Message Deletion
Set `AUTO_DELETE_CHANNELS` near the top of `index.js` to an array of channel names or channel IDs, for example:

```js
const AUTO_DELETE_CHANNELS = ["channel-name", "123456789012345678"];
```

Only new messages are deleted. Existing/previous messages are never touched by this feature.

All users are deleted from those channels except Discord user ID `926417866922811392`. ModBot also never deletes its own messages.

The bot needs **Manage Messages** permission in each configured channel.

## Protected Moderation Role
The role `YANDHI 💿🩷` is checked whenever a member's roles change. If that role has moderation/admin permissions (Administrator, Manage Server, Manage Roles, Manage Channels, Manage Messages, Manage Webhooks, Kick Members, Ban Members, or Timeout Members), ModBot removes it when it is newly assigned to anyone except user ID `863446773326151700`.

The bot needs **Manage Roles**, and the protected role must be below ModBot's highest role in the server role list.


## Funny `!dih` Command
- Sending `!dih` produces a screenshot-style purple embed titled with the sender's name and “dih size”.
- It shows the random inch rating in bold, an `8===D` line with one equals sign per inch, and the sender's profile picture on the right.
- Most users get 1–10 inches; there is a 25% chance of rolling 10–20 instead.
- User ID `863446773326151700` gets the special 50–100 range and is the only person allowed to toggle the command.
- User ID `926417866922811392` gets a random 1–10 millimeter result instead of inches.
- That user can type `disable!dih` to turn it off for everyone and `enable!dih` to turn it back on. Its enabled state is saved in `dih_settings.json`.

- To use the `!dih` text command, enable **Message Content Intent** under Discord Developer Portal → your app → **Bot** → **Privileged Gateway Intents**. The code also requests `GatewayIntentBits.MessageContent`.


## Prefix commands
- `!sob`: turn on sob mode in the current channel for messages from today.
- `!stopsob`: stop future sob reactions in the current channel, leaving existing reactions.
- `!unsob`: stop sob mode and remove ModBot's 😭 reactions from the current channel.
- The sob controls only work for Discord user ID `863446773326151700`. User ID `926417866922811392` receives the existing joke denial.

## Owner-only `!say`
Only Discord user ID `863446773326151700` can use this.
- Send `!say "your message"` and ModBot posts the text as itself.
- Attach one or more files to the same Discord message as `!say`; ModBot will send the text and files as its own message.
- To send file(s) without text, send `!say` and attach the files to that same message.
- ModBot deletes the original `!say` command message after posting, so it does not remain visible with your name. For this to work, give ModBot **Manage Messages** in the channel, plus **Send Messages** and **Attach Files**.
- Mentions in `!say` output are not pinged.

## Confessions
The `/confess` slash command and confession-submit button/modal are disabled. The existing secret-reply and authorized sender-lookup tools remain available on older confession posts.


## Last.fm music commands

ModBot now includes Last.fm account linking and listening commands.

### Setup

1. Create an API application at [Last.fm API accounts](https://www.last.fm/api/account) and copy its API key and shared secret.
2. Add `LASTFM_API_KEY` and `LASTFM_API_SECRET` to the bot's private `.env` file. Do not put the shared secret in a website, publish it, or commit it to GitHub. You can leave `LASTFM_BRIDGE_PORT=4220` as-is unless that port is already in use.
3. Restart ModBot and run `/fm link`. Press **Authorize Last.fm**, approve the app, then return to Discord and press **I've authorized**. If needed, run `/fm finish`.
4. Use `/fm status` to confirm the link. `/fm unlink` disconnects the account from ModBot; it does not delete listening history on Last.fm.

### Commands added

- `/fm link`, `/fm finish`, `/fm status`, `/fm unlink`, `/fm help`
- `/nowplaying`, `/recent`
- `/top tracks`, `/top albums`, `/top artists` with time periods
- `/wk tracks`, `/wk albums`, `/wk artists`
- `/chart artists`, `/chart albums`
- `/recap`, `/overview`, `/profile`, `/friendsfm`, `/taste`, `/loved`, `/search`

### Where listening data comes from

These commands read the user's Last.fm profile. ModBot cannot silently detect every app by itself: Spotify must be connected in Last.fm's **Settings → Applications → Spotify Scrobbling**, and browser music sites need a compatible scrobbler such as [Web Scrobbler](https://webscrobbler.com/). See [Last.fm's Track My Music guide](https://www.last.fm/about/trackmymusic).

**Localify scrobbling:** after linking Last.fm, run `/fm localify` in Discord and copy the private key it gives you. Open Localify → Profile → Account settings → Last.fm scrobbling, paste the key, and select **Save & test connection**. The ModBot bridge listens only on `127.0.0.1:4220`; therefore ModBot must be running on the same computer as the browser running Localify. This sends Now Playing updates and scrobbles after Last.fm's minimum-listen threshold. The bridge keeps the API secret and Last.fm session key on the bot side; Localify only holds a revocable pairing key. Run `/fm localify` again to replace the pairing key, or `/fm unlink` to revoke the Last.fm connection.

Spotify and other websites still need to scrobble to Last.fm independently. For Spotify, enable Spotify Scrobbling under Last.fm Settings → Applications. For browser players, use a compatible scrobbler such as [Web Scrobbler](https://webscrobbler.com/).

### Storage and safety

Account links are stored in `lastfm_links.json` beside `index.js` on the machine running ModBot. It contains Last.fm session keys, so keep it private, back it up securely, and do not share or commit it. If your host has an ephemeral filesystem, links may need to be reconnected after a restart or redeploy.
