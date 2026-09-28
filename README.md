bot for my friends discord server


- **Secret Reply** creates a public thread on the confession. Anyone can enter/read the thread, but the reply itself is posted by ModBot so the responder's identity is not exposed.

## Member Join Tracking
- New member joins are logged as an embed in the `actions` channel.
- The log includes the member, username, User ID, bot status, account creation time, server join time, nickname, pending verification state, roles, join method, invite code, inviter, invite channel, and invite metadata when Discord provides it.
- Invite tracking is best-effort because Discord's member-join event does not directly include the invite that was used; ModBot compares invite-use counts to determine the likely invite. citeturn774084search2turn558767search2
- Vanity URL joins and joins that cannot be attributed are labeled accordingly instead of guessing.
- The bot stores its invite-use snapshot in `invite_cache.json`.
- Enable **Server Members Intent** in the Discord Developer Portal and give ModBot permission to read/fetch invites. Server Members is a privileged intent used for member join events. citeturn774084search0
