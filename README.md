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
