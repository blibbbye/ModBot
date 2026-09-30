import "dotenv/config";
import {
  Client, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  MessageFlags, EmbedBuilder, ChannelType,
  ContextMenuCommandBuilder, ApplicationCommandType,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle
} from "discord.js";
import crypto from "node:crypto";

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID || "";
const SHOW_CONFESS_IDS = new Set([
  "863446773326151700",
  "926417866922811392"
]);
const CONFESSIONS_CHANNEL_NAME = process.env.CONFESSIONS_CHANNEL_NAME || "🤫・confessions";
const CONFESSIONS_FILE = "./confessions.json";
const SOB_FILE = "./sob_channels.json";
const SOB_EMOJI = "😭";
const SOB_TIME_ZONE = process.env.SOB_TIME_ZONE || "Europe/Stockholm";
const ACTIONS_CHANNEL_NAME = "actions";
const INVITE_CACHE_FILE = "./invite_cache.json";

// Put channel names or channel IDs here.
// Example: ["general", "123456789012345678"]
// Only NEW messages in these channels are affected.
const AUTO_DELETE_CHANNELS = ["1546238721194590420"];

// This user is allowed to send messages in the auto-delete channels.
const AUTO_DELETE_ALLOWED_USER_ID = "926417866922811392";
const DEPLOY_COMMANDS = (process.env.DEPLOY_COMMANDS || "true").toLowerCase() !== "false";
if (!TOKEN) throw new Error("Missing DISCORD_TOKEN in .env");
if (!CLIENT_ID) throw new Error("Missing DISCORD_CLIENT_ID in .env");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites
  ]
});

function sleep(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }
function randomPick(arr){ return arr?.length ? arr[Math.floor(Math.random()*arr.length)] : ""; }
function renderText(text, ctx){
  const u=ctx.user,g=ctx.guild,ch=ctx.channel,i=ctx.interaction;
  const built={user:u?.toString?.()??"", "user.name":u?.globalName||u?.username||"", "user.username":u?.username||"", "user.id":u?.id||"", "user.tag":u?.tag||u?.username||"", server:g?.name??"this server", "server.name":g?.name??"this server", "server.id":g?.id||"", "member.count":g?.memberCount??"", channel:ch?.toString?.()??"", "channel.name":ch?.name||"", "channel.id":ch?.id||"", command:i?.commandName||"", date:new Date().toLocaleDateString(), time:new Date().toLocaleTimeString(), "date.iso":new Date().toISOString()};
  return String(text??"").replace(/{random:([^{}]+)}/g,(_,v)=>{const a=v.split("|").map(x=>x.trim()).filter(Boolean);return a.length?a[Math.floor(Math.random()*a.length)]:"";}).replace(/{([^{}]+)}/g,(_,key)=>key in built?String(built[key]):key in (ctx.vars||{})?String(ctx.vars[key]):"{"+key+"}");
}
function createInteractionContext(interaction){
  let replied = false;
  const base = {
    interaction, message:null, user:interaction.user, guild:interaction.guild, channel:interaction.channel, vars:{},
    async send(payload){
      const value = typeof payload === "string" ? {content:renderText(payload,base)} : payload;
      return interaction.channel?.send(value);
    },
    async reply(text, ephemeral=false){
      const payload={content:renderText(text,base)};
      if (ephemeral) payload.flags=MessageFlags.Ephemeral;
      if(!replied && !interaction.replied){ replied=true; return interaction.reply(payload); }
      return interaction.followUp(payload);
    },
    async replyEmbed(embed, ephemeral=false){
      const payload={embeds:[embed]};if(ephemeral)payload.flags=MessageFlags.Ephemeral;
      if(!replied && !interaction.replied){replied=true;return interaction.reply(payload);}
      return interaction.followUp(payload);
    },
    async randomReply(arr){
      const value=renderText(randomPick(arr),base);
      if(!replied && !interaction.replied){replied=true;return interaction.reply({content:value});}
      return interaction.followUp({content:value});
    }
  };
  return base;
}
function createMessageContext(message){
  return {
    interaction:null,message,user:message.author,guild:message.guild,channel:message.channel,vars:{},
    async send(payload){return message.channel.send(typeof payload==="string"?{content:renderText(payload,this)}:payload);},
    async reply(text){return message.reply(renderText(text,this));},
    async replyEmbed(embed){return message.reply({embeds:[embed]});},
    async randomReply(arr){return message.reply(renderText(randomPick(arr),this));}
  };
}
function createMemberContext(member, channel){
  return {interaction:null,message:null,user:member.user,guild:member.guild,channel,vars:{}};
}

const commands = [
  new SlashCommandBuilder().setName("unreleased").setDescription("Check the bot latency"),
  new SlashCommandBuilder().setName("socials").setDescription("Sends links of ModMod's Unreleased"),
  new SlashCommandBuilder().setName("rate").setDescription("Sends a link to rate ModMod's unreleased!"),
  new SlashCommandBuilder().setName("facts").setDescription("Sends a random ModMod chance"),
  new SlashCommandBuilder().setName("help").setDescription("Shows bot commands"),
  new SlashCommandBuilder()
    .setName("confess")
    .setDescription("Submit an anonymous confession")
    .addStringOption(option =>
      option.setName("message")
        .setDescription("Optional confession text; leave empty for the form")
        .setRequired(false)
        .setMaxLength(2000)
    )
    .addAttachmentOption(option =>
      option.setName("file")
        .setDescription("Optional image or file to attach to the confession")
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("sob")
    .setDescription("React 😭 to every message sent today in this channel"),
  new SlashCommandBuilder()
    .setName("stopsob")
    .setDescription("Stop future 😭 reactions in this channel"),
  new SlashCommandBuilder()
    .setName("unsob")
    .setDescription("Stop sob mode and remove ModBot's 😭 reactions in this channel"),
  new ContextMenuCommandBuilder()
    .setName("warnconfessionsender")
    .setType(ApplicationCommandType.Message)
]

async function run_unreleased(ctx) {
  const vars = ctx.vars;
  await ctx.send({ embeds: [new EmbedBuilder().setTitle(`https://sites.google.com/view/modmodsunreleased/home`).setDescription(`Here u can find all of ModMod's unreleased albums, mixtapes and more!`).setColor("#000000").setAuthor({ name: `ModMod's Unreleased` })] });
}

async function run_socials(ctx) {
  const vars = ctx.vars;
  await ctx.send({ embeds: [new EmbedBuilder().setTitle(`LINKS:`).setDescription(`X: 
https://x.com/badbtchplaybook
Discord: 
https://discord.com/invite/29qAnXxWdM
Reddit:
https://www.reddit.com/user/ModModRoots/
Youtube:
https://www.youtube.com/@ModModUploads
TikTok: 
https://www.tiktok.com/@modmodroots?_r=1
Instagram: 
https://www.instagram.com/modmodroots`).setColor("#ff0000").setAuthor({ name: `ModMod's Socials` }).setFooter({ text: `Bot Maker` })] });
}

async function run_rate(ctx) {
  const vars = ctx.vars;
  await ctx.send({ embeds: [new EmbedBuilder().setTitle(`https://sites.google.com/view/modmodsunreleased/others/rate-the-albums`).setDescription(`Here u can rate all ye's albums and ModMod's unreleased!`).setColor("#000000").setAuthor({ name: `Rate The Albums` })] });
}

async function run_facts(ctx) {
  const vars = ctx.vars;
  await ctx.randomReply(["My name is ModMod!","I made my first unreleased on the 18th of July, one day after making my server!","I make perler bead art!!","I still don’t have my own pc😢","I don’t have a set up, only a wooden stand and my bed...","I use two phones, one for normal shit, and the other for unreleased.","I have burned custom CDs before..","I have 3 cats :)","I got the idea of making a server after meeting someone on TikTok live","I only use real sources for my unreleased","I have a biggg crush on blib /j"]);
}

async function run_help(ctx) {
  await ctx.reply(
    "sup " + (ctx.user?.toString?.() ?? "") + "\n" +
    "/unreleased \"Sends a link to our website with all unreleased!\"\n" +
    "/socials \"Sends links of ModMod's Socials\"\n" +
    "/rate \"Send a link to rate ModMod's Unreleased\"\n" +
    "/facts \"Sends a random fact about ModMod\"\n" +
    "/confess \"Submit an anonymous confession\"\n" +
    "/help \"this\"\n\n" +
    "\"If u needed other help then ask me! @blib\"",
    true
  );
}

async function loadConfessions() {
  try {
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(CONFESSIONS_FILE, "utf8");
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

async function saveConfessions(data) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(CONFESSIONS_FILE, JSON.stringify(data, null, 2), "utf8");
}

function findConfessionsChannel(guild) {
  return guild?.channels.cache.find(
    channel =>
      channel.type === ChannelType.GuildText &&
      channel.name === CONFESSIONS_CHANNEL_NAME
  );
}

function createConfessionEmbed(confession) {
  return new EmbedBuilder()
    .setTitle("🤫 Anonymous Confession")
    .setDescription(confession)
    .setColor("#000000")
    .setFooter({ text: "Want to submit one? Use the button below." });
}

function getConfessionCryptoKey() {
  return crypto.createHash("sha256").update(TOKEN).digest();
}

function encodeConfessionSender(userId) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getConfessionCryptoKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(String(userId), "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

function decodeConfessionSender(value) {
  try {
    const raw = Buffer.from(value, "base64url");
    if (raw.length < 29) return null;

    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);

    const decipher = crypto.createDecipheriv("aes-256-gcm", getConfessionCryptoKey(), iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]).toString("utf8");
  } catch {
    return null;
  }
}

function createConfessionButtonRow(authorId) {
  const senderToken = encodeConfessionSender(authorId);

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("submit_confession:" + senderToken)
      .setLabel("Submit a Confession")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("secret_reply")
      .setLabel("Secret Reply")
      .setStyle(ButtonStyle.Secondary)
  );
}

function getEncodedSenderFromMessage(message) {
  const customId = message?.components
    ?.flatMap(row => row.components || [])
    ?.find(component =>
      typeof component.customId === "string" &&
      component.customId.startsWith("submit_confession:")
    )?.customId;

  return customId ? decodeConfessionSender(customId.slice("submit_confession:".length)) : null;
}

async function sendConfession(guild, confession, authorId, attachment = null) {
  const confessionChannel = findConfessionsChannel(guild);

  if (!confessionChannel) {
    throw new Error("Missing confessions channel");
  }

  const embed = createConfessionEmbed(
    confession || (attachment ? "📎 Anonymous confession" : "")
  );

  const payload = {
    embeds: [embed],
    components: [createConfessionButtonRow(authorId)]
  };

  if (attachment) {
    const attachmentName = attachment.name || "confession-file";

    payload.files = [{
      attachment: attachment.url,
      name: attachmentName
    }];

    if (attachment.contentType?.startsWith("image/")) {
      // Reference the uploaded attachment from the embed so Discord
      // renders the image once instead of showing a duplicate image preview.
      embed.setImage("attachment://" + attachmentName);
    } else {
      embed.addFields({
        name: "Attachment",
        value: attachment.url
      });
    }
  }

  const sentMessage = await confessionChannel.send(payload);

  const confessions = await loadConfessions();
  confessions[sentMessage.id] = {
    userId: authorId,
    createdAt: new Date().toISOString()
  };
  await saveConfessions(confessions);

  return sentMessage;
}

async function showConfessionModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId("confession_modal")
    .setTitle("Submit a Confession");

  const input = new TextInputBuilder()
    .setCustomId("confession_text")
    .setLabel("Your confession")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Write your confession...")
    .setRequired(true)
    .setMaxLength(2000);

  modal.addComponents(
    new ActionRowBuilder().addComponents(input)
  );

  await interaction.showModal(modal);
}

async function run_confess(ctx) {
  const directMessage = ctx.interaction.options.getString("message");
  const attachment = ctx.interaction.options.getAttachment("file");

  if (!directMessage && !attachment) {
    return await showConfessionModal(ctx.interaction);
  }

  const confession = directMessage?.trim() || "";

  try {
    await sendConfession(ctx.guild, confession, ctx.user.id, attachment);
    await ctx.reply("✅ Your confession was sent anonymously.", true);
  } catch (error) {
    console.error("Confession error:", error);
    await ctx.reply(
      "❌ I couldn't send the confession. Make sure the " + CONFESSIONS_CHANNEL_NAME + " channel exists and the bot can send messages there.",
      true
    );
  }
}

async function run_show_confess(interaction) {
  if (!SHOW_CONFESS_IDS.has(interaction.user.id)) {
    return await interaction.reply({
      content: "You don't have permission to use this.",
      flags: MessageFlags.Ephemeral
    });
  }

  const targetMessage = interaction.targetMessage;

  if (!targetMessage) {
    return await interaction.reply({
      content: "I couldn't read that confession.",
      flags: MessageFlags.Ephemeral
    });
  }

  if (targetMessage.channel?.name !== CONFESSIONS_CHANNEL_NAME) {
    return await interaction.reply({
      content: "This can only be used on a message in " + CONFESSIONS_CHANNEL_NAME + ".",
      flags: MessageFlags.Ephemeral
    });
  }

  const confessions = await loadConfessions();
  const record = confessions[targetMessage.id];
  const recoveredUserId =
    record?.userId ||
    getEncodedSenderFromMessage(targetMessage);

  if (!recoveredUserId) {
    return await interaction.reply({
      content: "I couldn't find who sent this confession. This confession was probably created before sender tracking was added.",
      flags: MessageFlags.Ephemeral
    });
  }

  if (!record?.userId && recoveredUserId) {
    confessions[targetMessage.id] = {
      ...(record || {}),
      userId: recoveredUserId,
      recoveredAt: new Date().toISOString()
    };
    await saveConfessions(confessions).catch(() => null);
  }

  const confessionText =
    targetMessage.embeds?.[0]?.description ||
    targetMessage.content ||
    "(No confession text found.)";

  const sender = await client.users.fetch(recoveredUserId).catch(() => null);
  const senderDisplay = sender
    ? sender.toString() + " (" + sender.username + ")"
    : "Unknown user";

  const detailsEmbed = new EmbedBuilder()
    .setTitle("🔎 Confession Details")
    .setDescription(confessionText)
    .addFields(
      {
        name: "Used by",
        value: interaction.user.toString(),
        inline: true
      },
      {
        name: "Confession sent by",
        value: senderDisplay,
        inline: true
      },
      {
        name: "Sender User ID",
        value: recoveredUserId,
        inline: false
      },
      {
        name: "Confession Message ID",
        value: targetMessage.id,
        inline: false
      }
    )
    .setColor("#000000");

  const dmResults = await Promise.all(
    [...SHOW_CONFESS_IDS].map(async userId => {
      const user = await client.users.fetch(userId).catch(() => null);
      if (!user) return false;

      try {
        await user.send({
          content: interaction.user.toString() + " used /showconfess",
          allowedMentions: { users: [interaction.user.id] },
          embeds: [detailsEmbed]
        });
        return true;
      } catch (error) {
        console.error("❌ Could not DM showconfess details to " + userId + ":", error.message);
        return false;
      }
    })
  );

  if (!dmResults.some(Boolean)) {
    return await interaction.reply({
      content: "❌ I couldn't DM the showconfess details to either authorized user.",
      flags: MessageFlags.Ephemeral
    });
  }

  await interaction.reply({
    content: "✅ Confession details were privately sent by DM to the authorized showconfess users.",
    flags: MessageFlags.Ephemeral
  });
}

async function handleConfessionModal(interaction) {
  const confession = interaction.fields.getTextInputValue("confession_text")?.trim();

  if (!confession) {
    return await interaction.reply({
      content: "Your confession cannot be empty.",
      flags: MessageFlags.Ephemeral
    });
  }

  try {
    await sendConfession(interaction.guild, confession, interaction.user.id);
    await interaction.reply({
      content: "✅ Your confession was sent anonymously.",
      flags: MessageFlags.Ephemeral
    });
  } catch (error) {
    console.error("Confession modal error:", error);
    await interaction.reply({
      content: "❌ I couldn't send the confession. Make sure the " + CONFESSIONS_CHANNEL_NAME + " channel exists and the bot can send messages there.",
      flags: MessageFlags.Ephemeral
    });
  }
}

async function showSecretReplyModal(interaction) {
  const targetMessageId = interaction.message?.id || "";

  if (!targetMessageId) {
    return await interaction.reply({
      content: "I couldn't identify the confession.",
      flags: MessageFlags.Ephemeral
    });
  }

  const modal = new ModalBuilder()
    .setCustomId("secret_reply_modal:" + targetMessageId)
    .setTitle("Secret Reply");

  const input = new TextInputBuilder()
    .setCustomId("secret_reply_text")
    .setLabel("Your secret reply")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Write your reply...")
    .setRequired(true)
    .setMaxLength(2000);

  modal.addComponents(
    new ActionRowBuilder().addComponents(input)
  );

  await interaction.showModal(modal);
}

async function handleSecretReplyModal(interaction) {
  const prefix = "secret_reply_modal:";

  if (!interaction.customId.startsWith(prefix)) {
    return await interaction.reply({
      content: "This reply request is invalid.",
      flags: MessageFlags.Ephemeral
    });
  }

  const confessionMessageId = interaction.customId.slice(prefix.length);

  const replyText = interaction.fields.getTextInputValue("secret_reply_text")?.trim();

  if (!replyText) {
    return await interaction.reply({
      content: "Your secret reply cannot be empty.",
      flags: MessageFlags.Ephemeral
    });
  }

  const confessionChannel = findConfessionsChannel(interaction.guild);

  if (!confessionChannel) {
    return await interaction.reply({
      content: "I couldn't find the confessions channel.",
      flags: MessageFlags.Ephemeral
    });
  }

  const confessionMessage = await confessionChannel.messages.fetch(confessionMessageId).catch(() => null);

  if (!confessionMessage) {
    return await interaction.reply({
      content: "I couldn't find the original confession.",
      flags: MessageFlags.Ephemeral
    });
  }

  const confessions = await loadConfessions();
  const record = confessions[confessionMessageId];
  const senderId = record?.userId || getEncodedSenderFromMessage(confessionMessage);

  if (!senderId) {
    return await interaction.reply({
      content: "I couldn't identify the confession sender.",
      flags: MessageFlags.Ephemeral
    });
  }

  try {
    let thread = confessionMessage.thread;

    if (thread?.archived) {
      await thread.setArchived(false).catch(() => null);
    }

    if (!thread) {
      thread = await confessionMessage.startThread({
        name: "Secret Reply",
        autoArchiveDuration: 1440,
        reason: "Anonymous secret reply to a confession"
      });
    }

    await thread.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("💬 Anonymous Secret Reply")
          .setDescription(replyText)
          .setFooter({ text: "Reply sent anonymously by ModBot" })
          .setColor("#000000")
      ],
      allowedMentions: { parse: [] }
    });

    if (confessions[confessionMessageId]) {
      confessions[confessionMessageId] = {
        ...confessions[confessionMessageId],
        secretReplyThreadId: thread.id,
        lastSecretReplyAt: new Date().toISOString()
      };
      await saveConfessions(confessions);
    }

    // The thread is public: anyone can enter/read it. The responder's identity
    // is not exposed because ModBot is the only account posting the reply.
    await interaction.reply({
      content: "✅ The anonymous reply was posted in the public confession thread.",
      flags: MessageFlags.Ephemeral
    });
  } catch (error) {
    console.error("Secret reply thread error:", error);

    await interaction.reply({
      content: "❌ I couldn't create or use the confession thread. Make sure ModBot can create and send messages in threads here.",
      flags: MessageFlags.Ephemeral
    });
  }
}

async function loadSobChannels() {
  try {
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(SOB_FILE, "utf8");
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

async function saveSobChannels(data) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(SOB_FILE, JSON.stringify(data, null, 2), "utf8");
}

function getSobDayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SOB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function isMainCoOwner(interaction) {
  return interaction.user?.id === "863446773326151700";
}

async function rejectSecondCoOwnerSobCommand(ctx) {
  if (ctx.interaction?.user?.id === "926417866922811392") {
    return await ctx.reply("Hahaha you thought Moo Moo lil bro :sob:", true);
  }
  return false;
}

async function addSobReaction(message) {
  if (!message?.guild) return;

  try {
    await message.react(SOB_EMOJI);
  } catch (error) {
    console.error(
      "❌ Could not add sob reaction to message " + message.id + ":",
      error.message
    );
  }
}

async function reactToTodaysMessages(channel) {
  if (!channel?.messages?.fetch) return 0;

  const today = getSobDayKey();
  let before;
  let reacted = 0;

  while (true) {
    const batch = await channel.messages.fetch({
      limit: 100,
      ...(before ? { before } : {})
    });

    if (!batch.size) break;

    let reachedYesterday = false;

    for (const message of batch.values()) {
      if (getSobDayKey(message.createdAt) !== today) {
        reachedYesterday = true;
        break;
      }

      await addSobReaction(message);
      reacted++;
    }

    if (reachedYesterday) break;

    const oldest = batch.last();
    if (!oldest) break;
    before = oldest.id;
  }

  return reacted;
}

async function run_sob(ctx) {
  if (await rejectSecondCoOwnerSobCommand(ctx)) return;
  if (!isMainCoOwner(ctx.interaction)) {
    return await ctx.reply("You don't have permission to use this.", true);
  }

  if (!ctx.guild || !ctx.channel?.isTextBased?.()) {
    return await ctx.reply("Use /sob inside a server text channel.", true);
  }

  const today = getSobDayKey();
  const sobChannels = await loadSobChannels();

  sobChannels[ctx.guild.id] = {
    channelId: ctx.channel.id,
    day: today,
    enabledAt: new Date().toISOString()
  };

  await saveSobChannels(sobChannels);

  const reacted = await reactToTodaysMessages(ctx.channel);

  await ctx.reply(
    "😭 Sob mode is on in #" + ctx.channel.name +
    " for today. I reacted to " + reacted +
    " message(s) already sent today and will react to every new message here for the rest of today.",
    true
  );
}

async function run_stopsob(ctx) {
  if (await rejectSecondCoOwnerSobCommand(ctx)) return;
  if (!isMainCoOwner(ctx.interaction)) {
    return await ctx.reply("You don't have permission to use this.", true);
  }

  if (!ctx.guild || !ctx.channel?.isTextBased?.()) {
    return await ctx.reply("Use /stopsob inside a server text channel.", true);
  }

  const sobChannels = await loadSobChannels();
  const state = sobChannels[ctx.guild.id];

  if (!state || state.channelId !== ctx.channel.id || state.day !== getSobDayKey()) {
    return await ctx.reply("😭 Sob mode isn't active in this channel.", true);
  }

  delete sobChannels[ctx.guild.id];
  await saveSobChannels(sobChannels);

  await ctx.reply(
    "✅ Sob mode stopped in #" + ctx.channel.name + ". Existing 😭 reactions were left in place.",
    true
  );
}

async function run_unsob(ctx) {
  if (await rejectSecondCoOwnerSobCommand(ctx)) return;
  if (!isMainCoOwner(ctx.interaction)) {
    return await ctx.reply("You don't have permission to use this.", true);
  }

  if (!ctx.guild || !ctx.channel?.isTextBased?.()) {
    return await ctx.reply("Use /unsob inside a server text channel.", true);
  }

  const sobChannels = await loadSobChannels();
  if (sobChannels[ctx.guild.id]?.channelId === ctx.channel.id) {
    delete sobChannels[ctx.guild.id];
    await saveSobChannels(sobChannels);
  }

  let before;
  let removed = 0;

  while (true) {
    const batch = await ctx.channel.messages.fetch({
      limit: 100,
      ...(before ? { before } : {})
    });

    if (!batch.size) break;

    for (const message of batch.values()) {
      const reaction = message.reactions.cache.get(SOB_EMOJI);
      if (!reaction) continue;

      try {
        if (client.user) {
          await reaction.users.remove(client.user.id);
          removed++;
        }
      } catch (error) {
        console.error("❌ Could not clear sob reaction on " + message.id + ":", error.message);
      }
    }

    const oldest = batch.last();
    if (!oldest) break;
    before = oldest.id;
  }

  await ctx.reply(
    "✅ Sob mode is off in #" + ctx.channel.name + ". Cleared ModBot's 😭 reactions from " + removed + " message(s).",
    true
  );
}


async function loadInviteCache() {
  try {
    const { readFile } = await import("node:fs/promises");
    return JSON.parse(await readFile(INVITE_CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function saveInviteCache(data) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(INVITE_CACHE_FILE, JSON.stringify(data, null, 2), "utf8");
}

async function getInviteSnapshot(guild) {
  try {
    const invites = await guild.invites.fetch();
    const result = {};

    for (const invite of invites.values()) {
      result[invite.code] = {
        uses: Number(invite.uses || 0),
        inviterId: invite.inviterId || null,
        channelId: invite.channelId || null,
        createdAt: invite.createdAt?.toISOString?.() || null,
        maxUses: invite.maxUses ?? null,
        maxAge: invite.maxAge ?? null,
        temporary: invite.temporary ?? null,
        type: invite.type ?? null,
        targetType: invite.targetType ?? null
      };
    }

    let vanityUses = null;
    try {
      const vanity = await guild.fetchVanityData();
      vanityUses = Number(vanity?.uses || 0);
    } catch {}

    return { invites: result, vanityUses };
  } catch (error) {
    console.error("Could not fetch invites for " + guild.name + ":", error.message);
    return null;
  }
}

async function cacheInvites(guild) {
  const snapshot = await getInviteSnapshot(guild);
  if (!snapshot) return;

  const cache = await loadInviteCache();
  cache[guild.id] = { ...snapshot, updatedAt: new Date().toISOString() };
  await saveInviteCache(cache);
}

async function detectJoinMethod(guild) {
  const cache = await loadInviteCache();
  const before = cache[guild.id] || { invites: {}, vanityUses: null };
  const after = await getInviteSnapshot(guild);

  if (!after) {
    return { method: "Unknown", reason: "Invite list could not be read." };
  }

  const increased = [];

  for (const [code, invite] of Object.entries(after.invites)) {
    const oldUses = before.invites?.[code]?.uses ?? 0;
    if ((invite.uses ?? 0) > oldUses) {
      increased.push({ code, invite });
    }
  }

  cache[guild.id] = { ...after, updatedAt: new Date().toISOString() };
  await saveInviteCache(cache);

  if (increased.length === 1) {
    return {
      method: "Discord invite",
      code: increased[0].code,
      invite: increased[0].invite
    };
  }

  if (increased.length > 1) {
    return {
      method: "Invite - could not determine exactly",
      candidates: increased
    };
  }

  if (
    typeof before.vanityUses === "number" &&
    typeof after.vanityUses === "number" &&
    after.vanityUses > before.vanityUses
  ) {
    return {
      method: "Server vanity invite",
      vanityDelta: after.vanityUses - before.vanityUses
    };
  }

  return {
    method: "Unknown / not attributable",
    reason: "No invite-use increase was detected."
  };
}


async function getActionsChannel(guild) {
  const channels = await guild.channels.fetch();
  return channels.find(channel =>
    channel &&
    channel.type === ChannelType.GuildText &&
    channel.name === ACTIONS_CHANNEL_NAME
  ) || null;
}

function formatAccountCreated(user) {
  if (!user || !user.createdAt) return "Unknown";
  return user.createdAt.toISOString();
}


async function logMemberJoin(member) {
  try {
    const guild = member.guild;
    const actions = await getActionsChannel(guild);

    if (!actions) {
      console.error("Could not find #" + ACTIONS_CHANNEL_NAME + " in " + guild.name);
      return;
    }

    const join = await detectJoinMethod(guild);

    let inviter = "Unknown";
    let inviteCode = "Unknown";
    let inviteChannel = "Unknown";
    let details = join.reason || "Unknown";

    if (join.method === "Discord invite" && join.invite) {
      inviter = join.invite.inviterId ? "<@" + join.invite.inviterId + ">" : "Unknown";
      inviteCode = join.code;
      inviteChannel = join.invite.channelId ? "<#" + join.invite.channelId + ">" : "Unknown";
      details =
        "Uses after join: " + (join.invite.uses ?? "Unknown") +
        "\\nInvite created: " + (join.invite.createdAt || "Unknown") +
        "\\nMax uses: " + (join.invite.maxUses ?? "Unlimited") +
        "\\nMax age: " + (join.invite.maxAge ?? 0) + "s" +
        "\\nTemporary: " + (join.invite.temporary ? "Yes" : "No");
    } else if (join.method === "Server vanity invite") {
      inviter = "No individual inviter is provided";
      inviteCode = "Vanity URL";
      details = "Vanity invite uses increased by +" + join.vanityDelta;
    } else if (join.method === "Invite - could not determine exactly") {
      inviter = "Multiple possible inviters";
      inviteCode = join.candidates.map(item => item.code).join(", ");
      details = join.candidates.map(item =>
        item.invite.inviterId
          ? item.code + " -> <@" + item.invite.inviterId + ">"
          : item.code + " -> Unknown"
      ).join("\\n");
    }

    const roles = member.roles.cache
      .filter(role => role.id !== guild.id)
      .map(role => role.toString())
      .join(", ") || "None";

    const embed = new EmbedBuilder()
      .setTitle("📥 Member Joined")
      .setDescription(member.user.toString() + " joined " + guild.name + ".")
      .setThumbnail(member.user.displayAvatarURL({ extension: "png", size: 256 }))
      .addFields(
        { name: "Member", value: member.user.toString(), inline: true },
        { name: "Username", value: member.user.username, inline: true },
        { name: "User ID", value: member.id, inline: true },
        { name: "Bot", value: member.user.bot ? "Yes" : "No", inline: true },
        { name: "Account created", value: formatAccountCreated(member.user), inline: false },
        { name: "Joined server", value: member.joinedAt ? member.joinedAt.toISOString() : "Unknown", inline: false },
        { name: "Nickname", value: member.nickname || "None", inline: true },
        { name: "Pending verification", value: member.pending ? "Yes" : "No", inline: true },
        { name: "Roles on join", value: roles.length > 1024 ? roles.slice(0, 1020) + "..." : roles, inline: false },
        { name: "How they joined", value: join.method, inline: true },
        { name: "Invited by", value: inviter, inline: true },
        { name: "Invite", value: inviteCode, inline: true },
        { name: "Invite channel", value: inviteChannel, inline: true },
        { name: "Join details", value: details.length > 1024 ? details.slice(0, 1020) + "..." : details, inline: false }
      )
      .setColor("#000000")
      .setFooter({ text: "ModBot join tracking" })
      .setTimestamp();

    await actions.send({
      embeds: [embed],
      allowedMentions: {
        users:
          join.method === "Discord invite" && join.invite && join.invite.inviterId
            ? [join.invite.inviterId]
            : []
      }
    });
  } catch (error) {
    console.error("Member join logging failed:", error);
  }
}


function isAutoDeleteChannel(channel) {
  if (!channel) return false;

  return AUTO_DELETE_CHANNELS.some(value =>
    String(value).trim() === channel.id ||
    String(value).trim() === channel.name
  );
}

async function handleAutoDeleteMessage(message) {
  if (!message.guild) return false;

  // Never let the bot delete its own messages.
  if (client.user && message.author?.id === client.user.id) return false;

  if (message.author?.id === AUTO_DELETE_ALLOWED_USER_ID) return false;
  if (!isAutoDeleteChannel(message.channel)) return false;

  try {
    await message.delete();
    return true;
  } catch (error) {
    console.error(
      "❌ Could not auto-delete message " + message.id + ":",
      error.message
    );
    return false;
  }
}

async function deployCommands() {
  if (!DEPLOY_COMMANDS) {
    console.log("ℹ️ Automatic command deployment is disabled.");
    return;
  }

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  const commandData = commands.map(command => command.toJSON());

  if (GUILD_ID) {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commandData }
    );

    try {
      const guildCommands = await rest.get(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
      );
      const showConfessCommand = Array.isArray(guildCommands)
        ? guildCommands.find(command => command.name === "showconfess")
        : null;

      if (showConfessCommand?.id) {
        await rest.put(
          Routes.applicationCommandPermissions(
            CLIENT_ID,
            GUILD_ID,
            showConfessCommand.id
          ),
          {
            body: {
              permissions: [...SHOW_CONFESS_IDS].map(id => ({
                id,
                type: 2,
                permission: true
              }))
            }
          }
        );
        console.log("✅ showconfess restricted to the configured users.");
      }
    } catch (permissionError) {
      console.error("⚠️ Could not apply showconfess user permissions:", permissionError.message);
    }

    console.log("✅ Deployed " + commandData.length + " commands to guild " + GUILD_ID + ".");
  } else {
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commandData }
    );
    console.log("✅ Deployed " + commandData.length + " global commands.");
  }
}

async function updateMemberCountChannels() {
  for (const guild of client.guilds.cache.values()) {
    try {
      const freshGuild = await client.guilds.fetch(guild.id);
      const memberCount = Math.max(0, (freshGuild.memberCount || 0) - 2);

      const channels = await freshGuild.channels.fetch();
      const memberChannel = channels.find(
        channel =>
          channel.type === ChannelType.GuildVoice &&
          /^Members:\s*\d+$/i.test(channel.name)
      );

      if (!memberChannel) continue;

      const newName = "Members: " + memberCount;
      if (memberChannel.name !== newName) {
        await memberChannel.setName(newName, "Update server member count").catch(error => {
          console.error("❌ Could not rename member count channel in " + freshGuild.name + ":", error.message);
        });
      }
    } catch (error) {
      console.error("❌ Member count update failed for guild " + guild.id + ":", error.message);
    }
  }
}

client.once(Events.ClientReady, async readyClient => {
  console.log(`✅ Logged in as ${readyClient.user.tag}`);
  readyClient.user.setPresence({
    activities: [{ name: "/help | modmodsunreleased" }],
    status: "online"
  });

  try {
    await deployCommands();
  } catch (error) {
    console.error("❌ Command deployment failed:", error);
  }

  for (const guild of readyClient.guilds.cache.values()) {
    await cacheInvites(guild);
  }

  await updateMemberCountChannels();
  setInterval(updateMemberCountChannels, 60 * 1000);
});

client.on(Events.InviteCreate, async invite => {
  if (invite.guild) await cacheInvites(invite.guild);
});

client.on(Events.InviteDelete, async invite => {
  if (invite.guild) await cacheInvites(invite.guild);
});

client.on(Events.GuildMemberAdd, async member => {
  await logMemberJoin(member);
});

client.on(Events.MessageCreate, async message => {
  if (!message.guild) return;

  try {
    const wasDeleted = await handleAutoDeleteMessage(message);
    if (wasDeleted) return;

    const sobChannels = await loadSobChannels();
    const state = sobChannels[message.guild.id];

    if (!state) return;

    const today = getSobDayKey();

    if (state.day !== today) {
      delete sobChannels[message.guild.id];
      await saveSobChannels(sobChannels);
      return;
    }

    if (state.channelId !== message.channel.id) return;

    await addSobReaction(message);
  } catch (error) {
    console.error("❌ Message handler error:", error);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isMessageContextMenuCommand() && interaction.commandName === "warnconfessionsender") {
      return await run_show_confess(interaction);
    }

    if (interaction.isButton() && interaction.customId.startsWith("submit_confession:")) {
      return await showConfessionModal(interaction);
    }

    if (interaction.isButton() && interaction.customId === "secret_reply") {
      return await showSecretReplyModal(interaction);
    }

    if (interaction.isModalSubmit() && interaction.customId === "confession_modal") {
      return await handleConfessionModal(interaction);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith("secret_reply_modal:")) {
      return await handleSecretReplyModal(interaction);
    }

    if (!interaction.isChatInputCommand()) return;

    const ctx = createInteractionContext(interaction);

    if (interaction.commandName === "unreleased") return await run_unreleased(ctx);
    if (interaction.commandName === "socials") return await run_socials(ctx);
    if (interaction.commandName === "rate") return await run_rate(ctx);
    if (interaction.commandName === "facts") return await run_facts(ctx);
    if (interaction.commandName === "help") return await run_help(ctx);
    if (interaction.commandName === "confess") return await run_confess(ctx);
    if (interaction.commandName === "sob") return await run_sob(ctx);
    if (interaction.commandName === "stopsob") return await run_stopsob(ctx);
    if (interaction.commandName === "unsob") return await run_unsob(ctx);
  } catch (error) {
    console.error("Command error:", error);
    const payload={content:"Something went wrong while running that command.",flags:MessageFlags.Ephemeral};
    if(interaction.replied||interaction.deferred) await interaction.followUp(payload).catch(()=>null);
    else await interaction.reply(payload).catch(()=>null);
  }
});

client.login(TOKEN);
