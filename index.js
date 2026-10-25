import "dotenv/config";
import {
  Client, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  PermissionFlagsBits, MessageFlags, EmbedBuilder, ChannelType,
  ContextMenuCommandBuilder, ApplicationCommandType,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle
} from "discord.js";
import crypto from "node:crypto";
import { createServer } from "node:http";

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
const DIH_SETTINGS_FILE = "./dih_settings.json";
const DIH_CONTROL_USER_ID = "863446773326151700";

// Put channel names or channel IDs here.
// Example: ["general", "123456789012345678"]
// Only NEW messages in these channels are affected.
const AUTO_DELETE_CHANNELS = ["1546238721194590420"];

// This user is allowed to send messages in the auto-delete channels.
const AUTO_DELETE_ALLOWED_USER_ID = "926417866922811392";

// Role that is not allowed to be given to normal members when it has moderation perks.
const PROTECTED_MOD_ROLE_NAME = "YANDHI 💿🩷";

// This user is allowed to keep the protected role even if it has moderation perks.
const PROTECTED_MOD_ROLE_OWNER_ID = "863446773326151700";
const DEPLOY_COMMANDS = (process.env.DEPLOY_COMMANDS || "true").toLowerCase() !== "false";
if (!TOKEN) throw new Error("Missing DISCORD_TOKEN in .env");
if (!CLIENT_ID) throw new Error("Missing DISCORD_CLIENT_ID in .env");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
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
  new SlashCommandBuilder().setName("fm").setDescription("Connect and manage your Last.fm account")
    .addSubcommand(s=>s.setName("link").setDescription("Connect your Last.fm account"))
    .addSubcommand(s=>s.setName("finish").setDescription("Finish Last.fm authorization after approving it"))
    .addSubcommand(s=>s.setName("unlink").setDescription("Disconnect your Last.fm account"))
    .addSubcommand(s=>s.setName("status").setDescription("Check your Last.fm connection"))
    .addSubcommand(s=>s.setName("localify").setDescription("Generate a private connection key for the Localify player"))
    .addSubcommand(s=>s.setName("help").setDescription("Show Last.fm commands")),
  new SlashCommandBuilder().setName("crowns").setDescription("See who on this server has played an artist the most")
    .addStringOption(o=>o.setName("artist").setDescription("Artist name to check").setRequired(true).setMaxLength(100))
    .addStringOption(o=>o.setName("period").setDescription("Chart period").setRequired(false).addChoices({name:"7 days",value:"7day"},{name:"1 month",value:"1month"},{name:"3 months",value:"3month"},{name:"6 months",value:"6month"},{name:"12 months",value:"12month"},{name:"All time",value:"overall"})),
  new SlashCommandBuilder().setName("import").setDescription("Import Spotify or Apple Music listening history into Last.fm")
    .addSubcommand(s=>s.setName("spotify").setDescription("Import a Spotify Extended Streaming History JSON file")
      .addAttachmentOption(o=>o.setName("file").setDescription("One Spotify streaming history JSON file").setRequired(true)))
    .addSubcommand(s=>s.setName("apple").setDescription("Import an Apple Music play history JSON file")
      .addAttachmentOption(o=>o.setName("file").setDescription("One Apple Music play history JSON file").setRequired(true))),
  new SlashCommandBuilder().setName("nowplaying").setDescription("See what you or a Last.fm user is listening to")
    .addStringOption(o=>o.setName("user").setDescription("Last.fm username (defaults to your linked account)").setRequired(false)),
  new SlashCommandBuilder().setName("recent").setDescription("See recent Last.fm scrobbles")
    .addStringOption(o=>o.setName("user").setDescription("Last.fm username (defaults to your linked account)").setRequired(false))
    .addIntegerOption(o=>o.setName("limit").setDescription("How many tracks to show (1–10)").setMinValue(1).setMaxValue(10).setRequired(false)),
  new SlashCommandBuilder().setName("top").setDescription("Show top Last.fm tracks, albums, or artists")
    .addSubcommand(s=>s.setName("tracks").setDescription("Top tracks")
      .addStringOption(o=>o.setName("period").setDescription("Chart period").setRequired(false).addChoices({name:"7 days",value:"7day"},{name:"1 month",value:"1month"},{name:"3 months",value:"3month"},{name:"6 months",value:"6month"},{name:"12 months",value:"12month"},{name:"All time",value:"overall"}))
      .addStringOption(o=>o.setName("user").setDescription("Last.fm username").setRequired(false))
      .addIntegerOption(o=>o.setName("limit").setDescription("Number of results (1–10)").setMinValue(1).setMaxValue(10).setRequired(false)))
    .addSubcommand(s=>s.setName("albums").setDescription("Top albums")
      .addStringOption(o=>o.setName("period").setDescription("Chart period").setRequired(false).addChoices({name:"7 days",value:"7day"},{name:"1 month",value:"1month"},{name:"3 months",value:"3month"},{name:"6 months",value:"6month"},{name:"12 months",value:"12month"},{name:"All time",value:"overall"}))
      .addStringOption(o=>o.setName("user").setDescription("Last.fm username").setRequired(false))
      .addIntegerOption(o=>o.setName("limit").setDescription("Number of results (1–10)").setMinValue(1).setMaxValue(10).setRequired(false)))
    .addSubcommand(s=>s.setName("artists").setDescription("Top artists")
      .addStringOption(o=>o.setName("period").setDescription("Chart period").setRequired(false).addChoices({name:"7 days",value:"7day"},{name:"1 month",value:"1month"},{name:"3 months",value:"3month"},{name:"6 months",value:"6month"},{name:"12 months",value:"12month"},{name:"All time",value:"overall"}))
      .addStringOption(o=>o.setName("user").setDescription("Last.fm username").setRequired(false))
      .addIntegerOption(o=>o.setName("limit").setDescription("Number of results (1–10)").setMinValue(1).setMaxValue(10).setRequired(false))),
  new SlashCommandBuilder().setName("wk").setDescription("Show your latest Last.fm weekly chart")
    .addSubcommand(s=>s.setName("tracks").setDescription("Weekly tracks")
      .addStringOption(o=>o.setName("user").setDescription("Last.fm username").setRequired(false))
      .addIntegerOption(o=>o.setName("limit").setDescription("Number of results (1–10)").setMinValue(1).setMaxValue(10).setRequired(false)))
    .addSubcommand(s=>s.setName("albums").setDescription("Weekly albums")
      .addStringOption(o=>o.setName("user").setDescription("Last.fm username").setRequired(false))
      .addIntegerOption(o=>o.setName("limit").setDescription("Number of results (1–10)").setMinValue(1).setMaxValue(10).setRequired(false)))
    .addSubcommand(s=>s.setName("artists").setDescription("Weekly artists")
      .addStringOption(o=>o.setName("user").setDescription("Last.fm username").setRequired(false))
      .addIntegerOption(o=>o.setName("limit").setDescription("Number of results (1–10)").setMinValue(1).setMaxValue(10).setRequired(false))),
  new SlashCommandBuilder().setName("chart").setDescription("Show your 7-day Last.fm chart")
    .addSubcommand(s=>s.setName("artists").setDescription("Your top artists this week")
      .addStringOption(o=>o.setName("user").setDescription("Last.fm username").setRequired(false))
      .addIntegerOption(o=>o.setName("limit").setDescription("Number of results (1–10)").setMinValue(1).setMaxValue(10).setRequired(false)))
    .addSubcommand(s=>s.setName("albums").setDescription("Your top albums this week")
      .addStringOption(o=>o.setName("user").setDescription("Last.fm username").setRequired(false))
      .addIntegerOption(o=>o.setName("limit").setDescription("Number of results (1–10)").setMinValue(1).setMaxValue(10).setRequired(false))),
  new SlashCommandBuilder().setName("recap").setDescription("A compact Last.fm listening recap")
    .addStringOption(o=>o.setName("period").setDescription("Recap period").setRequired(false).addChoices({name:"7 days",value:"7day"},{name:"1 month",value:"1month"},{name:"3 months",value:"3month"},{name:"6 months",value:"6month"},{name:"12 months",value:"12month"},{name:"All time",value:"overall"}))
    .addStringOption(o=>o.setName("user").setDescription("Last.fm username").setRequired(false)),
  new SlashCommandBuilder().setName("overview").setDescription("Your Last.fm listening overview")
    .addStringOption(o=>o.setName("user").setDescription("Last.fm username").setRequired(false)),
  new SlashCommandBuilder().setName("profile").setDescription("Show a Last.fm profile card")
    .addStringOption(o=>o.setName("user").setDescription("Last.fm username").setRequired(false)),
  new SlashCommandBuilder().setName("friendsfm").setDescription("List a Last.fm user's friends")
    .addStringOption(o=>o.setName("user").setDescription("Last.fm username").setRequired(false)),
  new SlashCommandBuilder().setName("taste").setDescription("Compare your top artists with another Last.fm user")
    .addStringOption(o=>o.setName("user").setDescription("The other Last.fm username").setRequired(true)),
  new SlashCommandBuilder().setName("loved").setDescription("Show tracks a Last.fm user has loved")
    .addStringOption(o=>o.setName("user").setDescription("Last.fm username").setRequired(false))
    .addIntegerOption(o=>o.setName("limit").setDescription("Number of tracks (1–10)").setMinValue(1).setMaxValue(10).setRequired(false)),
  new SlashCommandBuilder().setName("search").setDescription("Search Last.fm for an artist, album, or track")
    .addStringOption(o=>o.setName("type").setDescription("What to search for").setRequired(true).addChoices({name:"Artist",value:"artist"},{name:"Album",value:"album"},{name:"Track",value:"track"}))
    .addStringOption(o=>o.setName("query").setDescription("Search terms").setRequired(true).setMaxLength(100)),
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
    "!dih \"Gets a completely scientific random rating\"\n" +
    "!sob \"React 😭 to today’s messages in this channel\"\n" +
    "!stopsob \"Stop future 😭 reactions in this channel\"\n" +
    "!unsob \"Stop sob mode and remove ModBot’s 😭 reactions here\"\n" +
    "!say \"Owner-only: make ModBot post text or attached files\"\n" +
    "/help \"this\"\n\n" +
    "\"If u needed other help then ask me! @blib\"",
    true
  );
}

async function loadDihSettings() {
  try {
    const { readFile } = await import("node:fs/promises");
    const settings = JSON.parse(await readFile(DIH_SETTINGS_FILE, "utf8"));
    return { enabled: settings?.enabled !== false };
  } catch {
    return { enabled: true };
  }
}

async function saveDihSettings(settings) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(DIH_SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf8");
}

async function handleDihMessage(message) {
  if (message.author?.bot) return;

  const content = message.content.trim().toLowerCase();

  // Only the configured controller can switch this feature on or off.
  if (message.author.id === DIH_CONTROL_USER_ID && (content === "disable!dih" || content === "enable!dih")) {
    const enabled = content === "enable!dih";
    await saveDihSettings({
      enabled,
      updatedBy: message.author.id,
      updatedAt: new Date().toISOString()
    });

    await message.reply({
      content: enabled
        ? "🟣 The !dih command is enabled again."
        : "🔒 The !dih command has been disabled.",
      allowedMentions: { repliedUser: false }
    });
    return;
  }

  if (content !== "!dih") return;

  const settings = await loadDihSettings();
  if (!settings.enabled) return;

  let size;
  let unit = "inches";

  if (message.author.id === DIH_CONTROL_USER_ID) {
    // The controller gets the special owner-only range.
    size = Math.floor(Math.random() * 51) + 50; // 50–100 inches
  } else if (message.author.id === "926417866922811392") {
    // Special tiny rating for this user.
    size = Math.floor(Math.random() * 10) + 1; // 1–10 millimeters
    unit = "millimeters";
  } else if (Math.random() < 0.25) {
    size = Math.floor(Math.random() * 11) + 10; // 10–20 inches, 25% chance
  } else {
    size = Math.floor(Math.random() * 10) + 1; // 1–10 inches, 75% chance
  }

  const avatar = message.author.displayAvatarURL({ extension: "png", size: 512 });
  const displayName = message.member?.displayName ||
    message.author.globalName ||
    message.author.username;
  const ruler = "8" + "=".repeat(size) + "D";

  const embed = new EmbedBuilder()
    .setColor("#7c3aed")
    .setTitle(displayName + "'s dih size")
    .setThumbnail(avatar)
    .setDescription("**" + size + " " + unit + "**" + String.fromCharCode(10) + ruler);

  await message.reply({
    embeds: [embed],
    allowedMentions: { repliedUser: false }
  });
}

async function handleSayMessage(message) {
  if (!message.guild || message.author?.bot) return false;

  const match = message.content.match(/^!say(?:\s+([\s\S]*))?$/i);
  if (!match) return false;

  // Ignore other users' !say attempts; this feature belongs only to Blib.
  if (message.author.id !== "863446773326151700") return false;

  let sayText = (match[1] || "").trim();
  if (sayText.length >= 2 && sayText.startsWith('"') && sayText.endsWith('"')) {
    sayText = sayText.slice(1, -1);
  }

  const files = [...message.attachments.values()].map(attachment => ({
    attachment: attachment.url,
    name: attachment.name || "upload"
  }));

  if (!sayText && files.length === 0) {
    await message.reply('Usage: `!say "message"` — you can also attach one or more files to the same message.')
      .catch(() => null);
    return true;
  }

  const botMember = message.guild.members.me ||
    await message.guild.members.fetchMe().catch(() => null);

  if (!botMember?.permissionsIn(message.channel).has(PermissionFlagsBits.ManageMessages)) {
    await message.reply("For anonymous !say posts, give ModBot **Manage Messages** in this channel so it can remove the command message.")
      .catch(() => null);
    return true;
  }

  try {
    const payload = {
      allowedMentions: { parse: [] }
    };
    if (sayText) payload.content = sayText;
    if (files.length) payload.files = files;

    const sent = await message.channel.send(payload);

    try {
      await message.delete();
    } catch (deleteError) {
      // Avoid leaving a bot post that appears anonymous if the source command could not be removed.
      await sent.delete().catch(() => null);
      console.error("!say sent message was rolled back because its source message could not be deleted:", deleteError.message);
      await message.author.send("I couldn't complete that !say post because ModBot couldn't delete your command message. Make sure it has Manage Messages in that channel.").catch(() => null);
    }
  } catch (error) {
    console.error("!say failed:", error);
    await message.reply("I couldn't send that !say message or its attachments. Check the bot's channel permissions and the file size.")
      .catch(() => null);
  }

  return true;
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

function isMainCoOwner(subject) {
  const userId = subject?.user?.id || subject?.interaction?.user?.id;
  return userId === "863446773326151700";
}

async function rejectSecondCoOwnerSobCommand(ctx) {
  const userId = ctx.user?.id || ctx.interaction?.user?.id;
  if (userId === "926417866922811392") {
    return await ctx.reply("Hahaha you thought Moo Moo lil bro :sob:", true);
  }
  return false;
}

async function handleSobPrefixCommand(message) {
  if (!message.guild || message.author?.bot) return false;
  const command = message.content.trim().toLowerCase();
  if (!["!sob", "!stopsob", "!unsob"].includes(command)) return false;

  // Preserve the second co-owner's special denial; only the main co-owner can activate these.
  if (message.author.id === "926417866922811392") {
    await message.reply("Hahaha you thought Moo Moo lil bro :sob:").catch(() => null);
    return true;
  }
  if (message.author.id !== "863446773326151700") return false;

  const ctx = createMessageContext(message);
  if (command === "!sob") await run_sob(ctx);
  else if (command === "!stopsob") await run_stopsob(ctx);
  else if (command === "!unsob") await run_unsob(ctx);
  return true;
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
  if (!isMainCoOwner(ctx)) {
    return await ctx.reply("You don't have permission to use this.", true);
  }

  if (!ctx.guild || !ctx.channel?.isTextBased?.()) {
    return await ctx.reply("Use !sob inside a server text channel.", true);
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
  if (!isMainCoOwner(ctx)) {
    return await ctx.reply("You don't have permission to use this.", true);
  }

  if (!ctx.guild || !ctx.channel?.isTextBased?.()) {
    return await ctx.reply("Use !stopsob inside a server text channel.", true);
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
  if (!isMainCoOwner(ctx)) {
    return await ctx.reply("You don't have permission to use this.", true);
  }

  if (!ctx.guild || !ctx.channel?.isTextBased?.()) {
    return await ctx.reply("Use !unsob inside a server text channel.", true);
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


function hasModerationPerks(role) {
  if (!role?.permissions) return false;

  return role.permissions.has(PermissionFlagsBits.Administrator) ||
    role.permissions.has(PermissionFlagsBits.ManageGuild) ||
    role.permissions.has(PermissionFlagsBits.ManageRoles) ||
    role.permissions.has(PermissionFlagsBits.ManageChannels) ||
    role.permissions.has(PermissionFlagsBits.ManageMessages) ||
    role.permissions.has(PermissionFlagsBits.ManageWebhooks) ||
    role.permissions.has(PermissionFlagsBits.KickMembers) ||
    role.permissions.has(PermissionFlagsBits.BanMembers) ||
    role.permissions.has(PermissionFlagsBits.ModerateMembers);
}

async function enforceProtectedModRole(newMember, oldMember) {
  if (!newMember?.guild) return;
  if (newMember.user?.id === PROTECTED_MOD_ROLE_OWNER_ID) return;

  const protectedRole = newMember.guild.roles.cache.find(
    role => role.name === PROTECTED_MOD_ROLE_NAME
  );

  if (!protectedRole || !hasModerationPerks(protectedRole)) return;

  const hadRole = oldMember?.roles?.cache?.has(protectedRole.id) ?? false;
  const hasRoleNow = newMember.roles.cache.has(protectedRole.id);

  // Only act when the role was newly added. Existing assignments are left alone.
  if (hadRole || !hasRoleNow) return;

  if (!protectedRole.editable) {
    console.error(
      "❌ ModBot cannot remove " + PROTECTED_MOD_ROLE_NAME +
      " because that role is above the bot's highest role."
    );
    return;
  }

  try {
    await newMember.roles.remove(
      protectedRole.id,
      "Protected moderation role cannot be assigned to this member"
    );
    console.log(
      "🛡️ Removed " + PROTECTED_MOD_ROLE_NAME +
      " from " + newMember.user.tag + "."
    );
  } catch (error) {
    console.error(
      "❌ Could not remove " + PROTECTED_MOD_ROLE_NAME +
      " from " + newMember.user.tag + ":",
      error.message
    );
  }
}


const LASTFM_FILE = "./lastfm_links.json";
const LASTFM_API_KEY = process.env.LASTFM_API_KEY || "";
const LASTFM_API_SECRET = process.env.LASTFM_API_SECRET || "";
const LASTFM_API_URL = "https://ws.audioscrobbler.com/2.0/";
const LASTFM_COLOR = 0xd51007;
const LASTFM_BRIDGE_PORT = Math.max(1024, Math.min(65535, Number(process.env.LASTFM_BRIDGE_PORT || 4220)));
const LOCALIFY_ORIGINS = (process.env.LOCALIFY_ORIGINS || "").split(",").map(s=>s.trim()).filter(Boolean);
const lastFmBridgeRequests = new Map();

async function loadLastFmStore() {
  try {
    const { readFile } = await import("node:fs/promises");
    const data = JSON.parse(await readFile(LASTFM_FILE, "utf8"));
    return { links: data?.links && typeof data.links === "object" ? data.links : {},
      pending: data?.pending && typeof data.pending === "object" ? data.pending : {} };
  } catch { return { links: {}, pending: {} }; }
}
async function saveLastFmStore(data) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(LASTFM_FILE, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
}
function lastFmSignature(params) {
  const input = Object.keys(params)
    .filter(key => key !== "api_sig" && key !== "format" && key !== "callback")
    .sort()
    .map(key => key + String(params[key]))
    .join("") + LASTFM_API_SECRET;
  return crypto.createHash("md5").update(input, "utf8").digest("hex");
}
function requireLastFmConfig() {
  const missingKey = !LASTFM_API_KEY || /^(GET_FROM_|PUT_YOUR_|CHANGE_ME)/i.test(LASTFM_API_KEY);
  const missingSecret = !LASTFM_API_SECRET || /^(GET_FROM_|PUT_YOUR_|CHANGE_ME)/i.test(LASTFM_API_SECRET);
  if (missingKey || missingSecret) {
    throw new Error("Last.fm is not configured. Create an API application at https://www.last.fm/api/account, put its real LASTFM_API_KEY and LASTFM_API_SECRET in the bot's private .env file, then restart ModBot.");
  }
}
async function lastFmCall(method, params = {}, signed = false) {
  requireLastFmConfig();
  const values = { method, api_key: LASTFM_API_KEY, ...params };
  if (signed) values.api_sig = lastFmSignature(values);
  values.format = "json";
  const isWrite = signed && !["auth.getToken", "auth.getSession"].includes(method);
  const response = await fetch(LASTFM_API_URL + (isWrite ? "" : "?" + new URLSearchParams(values)), {
    method: isWrite ? "POST" : "GET",
    headers: { "user-agent": "ModBot Last.fm integration/1.0", ...(isWrite ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
    ...(isWrite ? { body: new URLSearchParams(values) } : {})
  });
  let data;
  try { data = await response.json(); }
  catch { throw new Error("Last.fm returned an unreadable response. Try again shortly."); }
  if (!response.ok || data?.error) {
    const code = data?.error ? " (Last.fm error " + data.error + ")" : "";
    throw new Error((data?.message || "Last.fm request failed") + code);
  }
  return data;
}
function fmList(value) { return Array.isArray(value) ? value : value ? [value] : []; }
function fmText(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return String(value.name || value["#text"] || value.text || "");
}
function fmTrackArtist(track) { return fmText(track?.artist?.name || track?.artist || track?.artistName) || "Unknown artist"; }
function fmTrackTitle(track) { return fmText(track?.name || track?.title) || "Unknown track"; }
function fmSafeUrl(value) {
  const s = String(value || "");
  return /^https:\/\/[^\s<>]+$/i.test(s) ? s : null;
}
function fmImage(entity) {
  const images = fmList(entity?.image);
  for (const image of images.reverse()) {
    const url = fmText(image);
    if (fmSafeUrl(url) && !/\/noimage\//i.test(url)) return url;
  }
  return null;
}
function fmDate(track) {
  const stamp = Number(track?.date?.uts);
  return Number.isFinite(stamp) && stamp > 0 ? new Date(stamp * 1000).toLocaleString() : "Now playing";
}
function fmTrackLine(track, index = null, showDate = false) {
  const title = fmTrackTitle(track), artist = fmTrackArtist(track), url = fmSafeUrl(track?.url);
  const label = url ? "[" + title.replace(/[[\]]/g, "") + "](" + url + ")" : "**" + title + "**";
  const rank = index == null ? "" : (index + 1) + ". ";
  const plays = track?.playcount != null ? " · " + Number(track.playcount).toLocaleString() + " plays" : "";
  const album = fmText(track?.album?.["#text"] || track?.album?.name);
  const extra = showDate ? " · " + fmDate(track) : "";
  return rank + label + " — " + artist + (album ? " · *" + album + "*" : "") + plays + extra;
}
function fmPeriodLabel(period) {
  return ({ "7day": "Last 7 days", "1month": "Last month", "3month": "Last 3 months", "6month": "Last 6 months", "12month": "Last 12 months", overall: "All time" })[period] || "All time";
}
function fmUserFrom(interaction, optionName = "user") { return interaction.options.getString(optionName)?.trim() || null; }
async function fmLinkedAccount(discordUserId) {
  const store = await loadLastFmStore();
  return { store, account: store.links[discordUserId] || null };
}
async function fmResolveUser(interaction, provided, store) {
  if (provided) return provided.replace(/^@/, "").trim();
  const account = store.links[interaction.user.id];
  if (account?.username) return account.username;
  throw new Error("You haven't connected Last.fm yet. Run /fm link, approve the connection, then press I've authorized. You can also supply a public Last.fm username to commands that have a user option.");
}
function fmMakeEmbed(title, description = "") {
  return new EmbedBuilder().setColor(LASTFM_COLOR).setTitle(title).setDescription(description || "No data returned.");
}
function fmProfileLink(username) { return "https://www.last.fm/user/" + encodeURIComponent(username); }
function fmShortList(values, formatter, limit = 10) {
  return fmList(values).slice(0, limit).map((value, index) => formatter(value, index)).join("\n") || "No results yet.";
}
async function fmFinishAuthorization(interaction) {
  const store = await loadLastFmStore(), pending = store.pending[interaction.user.id];
  if (!pending?.token) return interaction.editReply("No pending Last.fm link found. Run /fm link first and approve access on Last.fm.");
  if (Date.now() - Number(pending.createdAt || 0) > 60 * 60 * 1000) {
    delete store.pending[interaction.user.id]; await saveLastFmStore(store);
    return interaction.editReply("That Last.fm authorization expired. Run /fm link and try again.");
  }
  const data = await lastFmCall("auth.getSession", { token: pending.token }, true);
  const session = data?.session;
  if (!session?.key || !session?.name) throw new Error("Last.fm didn't return an authorized session. Approve the app on Last.fm, then retry. If this keeps happening, run /fm link again.");
  store.links[interaction.user.id] = { username: String(session.name), sessionKey: String(session.key), linkedAt: new Date().toISOString() };
  delete store.pending[interaction.user.id];
  await saveLastFmStore(store);
  const embed = fmMakeEmbed("Last.fm connected", "✅ Connected **" + session.name + "** to your Discord account.\n\nTry /nowplaying, /recent, /top, /wk, /recap, /overview, /friendsfm, /taste, and /loved.");
  embed.setURL(fmProfileLink(session.name));
  return interaction.editReply({ content: "", embeds: [embed], components: [] });
}
async function handleFmCommand(interaction) {
  const parent = interaction.commandName;
  const sub = parent === "fm" ? interaction.options.getSubcommand() : parent;
  const privateCommands = parent === "fm" && ["link", "finish", "unlink", "status", "localify", "help"].includes(sub);
  if (privateCommands) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  else await interaction.deferReply();
  try {
    const configNotRequired = parent === "fm" && ["unlink", "status", "help"].includes(sub);
    if (!configNotRequired) requireLastFmConfig();
    const { store } = await fmLinkedAccount(interaction.user.id);
    if (parent === "fm" && sub === "link") {
      const data = await lastFmCall("auth.getToken", {}, true), token = String(data?.token || "");
      if (!token) throw new Error("Last.fm didn't provide an authorization token. Please try again.");
      store.pending[interaction.user.id] = { token, createdAt: Date.now() };
      await saveLastFmStore(store);
      const authorizeUrl = "https://www.last.fm/api/auth/?" + new URLSearchParams({ api_key: LASTFM_API_KEY, token });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel("Authorize Last.fm").setStyle(ButtonStyle.Link).setURL(authorizeUrl),
        new ButtonBuilder().setCustomId("fm_finish").setLabel("I've authorized").setStyle(ButtonStyle.Success)
      );
      const embed = fmMakeEmbed("Connect Last.fm", "1. Press Authorize Last.fm and approve ModBot.\n2. Return to Discord and press I've authorized.\n\nYour session is stored in lastfm_links.json on the bot host. Never share that file or your .env.");
      return await interaction.editReply({ embeds: [embed], components: [row] });
    }
    if (parent === "fm" && sub === "finish") return await fmFinishAuthorization(interaction);
    if (parent === "fm" && sub === "unlink") {
      delete store.links[interaction.user.id]; delete store.pending[interaction.user.id]; await saveLastFmStore(store);
      return await interaction.editReply("Disconnected your Last.fm account from ModBot. Your Last.fm listening history is unchanged.");
    }
    if (parent === "fm" && sub === "status") {
      const linked = store.links[interaction.user.id];
      const embed = fmMakeEmbed("Last.fm connection", linked ? "✅ Linked as **" + linked.username + "**\n[Open profile](" + fmProfileLink(linked.username) + ")" : "Not connected yet. Run /fm link and approve access.");
      embed.addFields({ name: "Localify", value: linked?.localifyToken ? "✅ Connection key generated. You can regenerate it with /fm localify." : "Not connected yet. Run /fm localify after linking Last.fm.", inline: false });
      embed.addFields({ name: "Listening sources", value: "Spotify and supported websites appear when configured to scrobble to Last.fm. Localify playback is sent through the optional local bridge when ModBot is running on the same computer.", inline: false });
      return await interaction.editReply({ embeds: [embed] });
    }
    if (parent === "fm" && sub === "localify") {
      const linked = store.links[interaction.user.id];
      if (!linked?.sessionKey) throw new Error("Connect your Last.fm account first with /fm link.");
      linked.localifyToken = crypto.randomBytes(24).toString("base64url");
      linked.localifyTokenCreatedAt = new Date().toISOString();
      await saveLastFmStore(store);
      const embed = fmMakeEmbed("Connect Localify", "Copy this key into Localify → Account settings → Last.fm scrobbling. It grants Localify permission to scrobble to **" + linked.username + "**.\n\n" + linked.localifyToken + "\n\nKeep ModBot running on the same computer as Localify. Run /fm localify again to revoke this key and make a new one.");
      return await interaction.editReply({ embeds: [embed] });
    }
    if (parent === "fm" && sub === "help") {
      const embed = fmMakeEmbed("Last.fm commands", [
        "/fm link — connect your account",
        "/fm finish — finish authorization if the button failed",
        "/fm status / /fm unlink — manage the connection",
        "/fm localify — connect Localify playback to Last.fm",
        "/nowplaying — current track",
        "/recent — recent scrobbles",
        "/top tracks|albums|artists — charts by period",
        "/wk tracks|albums|artists — Last.fm weekly charts",
        "/chart artists|albums — last 7 days",
        "/recap — listening summary",
        "/overview / /profile — profile and scrobble counts",
        "/friendsfm — Last.fm friends",
        "/taste user:<name> — shared top artists",
        "/loved — loved tracks",
        "/search — Last.fm artist/album/track search",
        "/crowns — server artist play-count ranking",
        "/import spotify|apple — import listening-history JSON"
      ].join("\n"));
      return await interaction.editReply({ embeds: [embed] });
    }

    let user = null;
    if (sub !== "search" && sub !== "crowns") {
      user = fmUserFrom(interaction);
      user = await fmResolveUser(interaction, user, store);
    }
    if (sub === "nowplaying") {
      const data = await lastFmCall("user.getRecentTracks", { user, limit: 1, extended: 1 });
      const track = fmList(data?.recenttracks?.track)[0];
      if (!track) return await interaction.editReply("No recent tracks were found for " + user + ".");
      const now = track?.["@attr"]?.nowplaying === "true" || track?.["@attr"]?.nowplaying === true;
      const embed = fmMakeEmbed(now ? "🎧 Now playing" : "Last scrobble", fmTrackLine(track, null, !now));
      embed.setAuthor({ name: user + (now ? " is listening" : " last listened"), url: fmProfileLink(user) });
      embed.setURL(fmSafeUrl(track.url) || fmProfileLink(user));
      const image = fmImage(track?.album) || fmImage(track);
      if (image) embed.setThumbnail(image);
      return await interaction.editReply({ embeds: [embed] });
    }
    if (sub === "recent") {
      const limit = interaction.options.getInteger("limit") || 10;
      const data = await lastFmCall("user.getRecentTracks", { user, limit, extended: 1 });
      const tracks = fmList(data?.recenttracks?.track);
      const embed = fmMakeEmbed(user + " · Recent listens", fmShortList(tracks, (track, i) => fmTrackLine(track, i, true), limit));
      embed.setURL(fmProfileLink(user));
      const image = fmImage(tracks[0]?.album); if (image) embed.setThumbnail(image);
      return await interaction.editReply({ embeds: [embed] });
    }
    if (sub === "top") {
      const type = interaction.options.getSubcommand(), period = interaction.options.getString("period") || "overall";
      const limit = interaction.options.getInteger("limit") || 10;
      const method = ({ tracks: "user.getTopTracks", albums: "user.getTopAlbums", artists: "user.getTopArtists" })[type];
      const root = ({ tracks: "toptracks", albums: "topalbums", artists: "topartists" })[type];
      const item = ({ tracks: "track", albums: "album", artists: "artist" })[type];
      const data = await lastFmCall(method, { user, period, limit }), values = fmList(data?.[root]?.[item]);
      const embed = fmMakeEmbed(user + " · Top " + type, "**Period:** " + fmPeriodLabel(period) + "\n\n" + fmShortList(values, (v, i) => {
        const name = fmText(v.name) || "Unknown", artist = type === "artists" ? "" : " — " + fmText(v.artist?.name || v.artist || "Unknown artist");
        const url = fmSafeUrl(v.url), label = url ? "[" + name.replace(/[[\]]/g, "") + "](" + url + ")" : "**" + name + "**";
        return (i + 1) + ". " + label + artist + " · " + Number(v.playcount || 0).toLocaleString() + " plays";
      }, limit));
      embed.setURL(fmProfileLink(user)); const image = fmImage(values[0]); if (image) embed.setThumbnail(image);
      return await interaction.editReply({ embeds: [embed] });
    }
    if (sub === "wk" || sub === "chart") {
      const type = interaction.options.getSubcommand(), limit = interaction.options.getInteger("limit") || 10;
      const methods = sub === "wk"
        ? { tracks: ["user.getWeeklyTrackChart", "weeklytrackchart", "track"], albums: ["user.getWeeklyAlbumChart", "weeklyalbumchart", "album"], artists: ["user.getWeeklyArtistChart", "weeklyartistchart", "artist"] }
        : { albums: ["user.getTopAlbums", "topalbums", "album"], artists: ["user.getTopArtists", "topartists", "artist"] };
      const details = methods[type], params = sub === "chart" ? { user, period: "7day", limit } : { user, limit };
      const data = await lastFmCall(details[0], params), values = fmList(data?.[details[1]]?.[details[2]]);
      const embed = fmMakeEmbed(user + " · " + (sub === "wk" ? "Weekly " : "7-day ") + type, fmShortList(values, (v, i) => {
        const name = fmText(v.name) || "Unknown", artist = type === "artists" ? "" : " — " + fmText(v.artist?.name || v.artist || "Unknown artist");
        const url = fmSafeUrl(v.url);
        return (i + 1) + ". " + (url ? "[" + name.replace(/[[\]]/g, "") + "](" + url + ")" : "**" + name + "**") + artist + " · " + Number(v.playcount || 0).toLocaleString() + " plays";
      }, limit));
      embed.setURL(fmProfileLink(user)); return await interaction.editReply({ embeds: [embed] });
    }
    if (sub === "recap") {
      const period = interaction.options.getString("period") || "7day";
      const [ad, td, ald] = await Promise.all([
        lastFmCall("user.getTopArtists", { user, period, limit: 5 }),
        lastFmCall("user.getTopTracks", { user, period, limit: 5 }),
        lastFmCall("user.getTopAlbums", { user, period, limit: 5 })
      ]);
      const artists = fmList(ad?.topartists?.artist), tracks = fmList(td?.toptracks?.track), albums = fmList(ald?.topalbums?.album);
      const embed = fmMakeEmbed("📊 " + user + " · Listening recap", "**Period:** " + fmPeriodLabel(period));
      embed.setURL(fmProfileLink(user));
      embed.addFields(
        { name: "Top artists", value: fmShortList(artists, (a, i) => (i+1) + ". " + fmText(a.name) + " · " + Number(a.playcount||0).toLocaleString(), 5), inline: true },
        { name: "Top tracks", value: fmShortList(tracks, (t, i) => (i+1) + ". " + fmText(t.name) + " — " + fmText(t.artist?.name||t.artist), 5), inline: true },
        { name: "Top albums", value: fmShortList(albums, (a, i) => (i+1) + ". " + fmText(a.name) + " — " + fmText(a.artist?.name||a.artist), 5), inline: true }
      );
      return await interaction.editReply({ embeds: [embed] });
    }
    if (sub === "overview" || sub === "profile") {
      const [infoData, recentData, topData] = await Promise.all([
        lastFmCall("user.getInfo", { user }),
        lastFmCall("user.getRecentTracks", { user, limit: 1 }),
        lastFmCall("user.getTopArtists", { user, period: "overall", limit: 1 })
      ]);
      const info = infoData?.user;
      if (!info?.name) throw new Error("Last.fm could not find user " + user + ".");
      const recent = fmList(recentData?.recenttracks?.track)[0], top = fmList(topData?.topartists?.artist)[0];
      const embed = fmMakeEmbed((sub === "profile" ? "🎵 " : "📈 ") + info.name, "Listening profile on Last.fm");
      embed.setURL(fmSafeUrl(info.url) || fmProfileLink(info.name));
      embed.addFields(
        { name: "Total scrobbles", value: Number(info.playcount||0).toLocaleString(), inline: true },
        { name: "Registered", value: info.registered?.unixtime ? new Date(Number(info.registered.unixtime)*1000).toLocaleDateString() : "Unknown", inline: true },
        { name: "Country", value: fmText(info.country) || "Not set", inline: true },
        { name: "Top artist", value: top ? fmText(top.name) + " · " + Number(top.playcount||0).toLocaleString() + " plays" : "No data yet", inline: true },
        { name: "Last listen", value: recent ? fmTrackLine(recent, null, true).slice(0, 1000) : "No recent tracks", inline: false }
      );
      const img = fmImage(info) || fmImage(recent?.album); if (img) embed.setThumbnail(img);
      embed.setFooter({ text: "Powered by Last.fm · listening must be scrobbled to Last.fm first" });
      return await interaction.editReply({ embeds: [embed] });
    }
    if (sub === "friendsfm") {
      const data = await lastFmCall("user.getFriends", { user, limit: 10 }), friends = fmList(data?.friends?.user);
      const embed = fmMakeEmbed(user + " · Last.fm friends", friends.map((f,i) => (i+1) + ". [" + fmText(f.name) + "](" + fmProfileLink(f.name) + ") · " + Number(f.playcount||0).toLocaleString() + " scrobbles").join("\n") || "This user has no public Last.fm friends.");
      embed.setURL(fmProfileLink(user)); return await interaction.editReply({ embeds: [embed] });
    }
    if (sub === "taste") {
      const other = interaction.options.getString("user", true).trim().replace(/^@/, ""), own = store.links[interaction.user.id]?.username;
      if (!own) throw new Error("Connect your account first with /fm link so I can compare your taste.");
      const [aData,bData] = await Promise.all([
        lastFmCall("user.getTopArtists", { user: own, period: "overall", limit: 100 }),
        lastFmCall("user.getTopArtists", { user: other, period: "overall", limit: 100 })
      ]);
      const a = fmList(aData?.topartists?.artist), b = fmList(bData?.topartists?.artist);
      const bNames = new Map(b.map(x => [fmText(x.name).toLowerCase(), x]));
      const shared = a.filter(x => bNames.has(fmText(x.name).toLowerCase())).slice(0, 10);
      const lines = shared.map((x,i)=> (i+1) + ". **" + fmText(x.name) + "** — you: " + Number(x.playcount||0).toLocaleString() + " · " + other + ": " + Number(bNames.get(fmText(x.name).toLowerCase()).playcount||0).toLocaleString());
      const embed = fmMakeEmbed("🎧 Taste match · " + own + " × " + other, lines.join("\n") || "No shared top artists were found in the sampled all-time top 100.");
      embed.addFields({ name: "Shared artists", value: String(shared.length), inline: true });
      return await interaction.editReply({ embeds: [embed] });
    }
    if (sub === "loved") {
      const limit = interaction.options.getInteger("limit") || 10, data = await lastFmCall("user.getLovedTracks", { user, limit });
      const tracks = fmList(data?.lovedtracks?.track), embed = fmMakeEmbed(user + " · Loved tracks", fmShortList(tracks, (t,i)=>fmTrackLine(t,i), limit));
      embed.setURL(fmProfileLink(user)); const img=fmImage(tracks[0]?.album); if(img) embed.setThumbnail(img);
      return await interaction.editReply({ embeds: [embed] });
    }
    if (sub === "crowns") {
      if (!interaction.guild) throw new Error("Use /crowns in a server so I can compare linked members.");
      const artistQuery = interaction.options.getString("artist", true).trim().toLocaleLowerCase();
      const period = interaction.options.getString("period") || "overall";
      await interaction.guild.members.fetch().catch(()=>null);
      const members = [...interaction.guild.members.cache.values()];
      const connected = Object.entries(store.links).filter(([id, value]) =>
        value?.username && members.some(member => member.id === id)
      ).slice(0, 40);
      if (!connected.length) throw new Error("No server members have linked Last.fm yet. Members can use /fm link.");
      const winners = [];
      for (let offset=0; offset<connected.length; offset+=3) {
        const batch = connected.slice(offset, offset+3);
        const results = await Promise.all(batch.map(async ([id, value]) => {
          try {
            const data = await lastFmCall("user.getTopArtists", { user:value.username, period, limit:100 });
            const artists = fmList(data?.topartists?.artist);
            const found = artists.find(item => fmText(item.name).toLocaleLowerCase() === artistQuery);
            return found ? { id, username:value.username, count:Number(found.playcount||0) } : null;
          } catch { return null; }
        }));
        winners.push(...results.filter(Boolean));
        if(offset+3<connected.length) await sleep(180);
      }
      winners.sort((a,b)=>b.count-a.count);
      const embed = fmMakeEmbed("👑 Artist crowns · " + interaction.guild.name, "**Artist:** " + interaction.options.getString("artist", true) + "\n**Period:** " + fmPeriodLabel(period));
      embed.setDescription(winners.length
        ? winners.slice(0,10).map((entry,i)=>(i===0?"👑 ":"")+(i+1)+". <@"+entry.id+"> — "+entry.count.toLocaleString()+" plays").join("\n")
        : "No linked member had this artist in their top 100 for this period. Members may need to listen more or link Last.fm.");
      embed.setFooter({ text:"Checked up to 40 connected server members. Results use each member's Last.fm top-artist chart." });
      return await interaction.editReply({ embeds:[embed] });
    }
    if (sub === "import") {
      const source = interaction.options.getSubcommand();
      return await fmImportHistory(interaction, source, store);
    }
    if (sub === "search") {
      const type = interaction.options.getString("type", true), query = interaction.options.getString("query", true).trim();
      const method = ({ artist:"artist.search", album:"album.search", track:"track.search" })[type];
      const root = ({ artist:"results.artistmatches.artist", album:"results.albummatches.album", track:"results.trackmatches.track" })[type];
      const data = await lastFmCall(method, { [type]: query, limit: 8 });
      const values = root.split(".").reduce((value, key)=>value?.[key], data), results = fmList(values);
      const embed = fmMakeEmbed("Last.fm search · " + type, results.map((v,i)=>{
        const name=fmText(v.name)||"Unknown", artist=type==="artist"?"":" — "+fmText(v.artist?.name||v.artist||"Unknown artist"), url=fmSafeUrl(v.url);
        return (i+1)+". "+(url?"["+name.replace(/[[\]]/g,"")+"]("+url+")":"**"+name+"**")+artist;
      }).join("\n")||"No matches found.");
      const img=fmImage(results[0]); if(img) embed.setThumbnail(img);
      return await interaction.editReply({ embeds: [embed] });
    }
    throw new Error("Unknown Last.fm command. Run /fm help for the command list.");
  } catch (error) {
    console.error("Last.fm command failed:", error);
    return await interaction.editReply("⚠️ " + String(error?.message || "Something went wrong with Last.fm.").slice(0, 1800)).catch(()=>null);
  }
}


function localifyOriginAllowed(origin) {
  if (!origin) return true;
  if (LOCALIFY_ORIGINS.includes(origin)) return true;
  return /^https:\/\/blibbbye\.github\.io$/i.test(origin) ||
    /^https:\/\/sites\.google\.com$/i.test(origin) ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}
function bridgeJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "content-type":"application/json; charset=utf-8", "cache-control":"no-store", "content-length":Buffer.byteLength(body) });
  res.end(body);
}

function fmHistoryArray(data) {
  if (Array.isArray(data)) return data;
  const keys = ["streamingHistory", "streaming_history", "playActivity", "plays", "items", "tracks", "history", "data"];
  for (const key of keys) if (Array.isArray(data?.[key])) return data[key];
  for (const value of Object.values(data || {})) {
    if (Array.isArray(value) && value.some(item => item && typeof item === "object")) return value;
    if (value && typeof value === "object") {
      for (const nested of Object.values(value)) if (Array.isArray(nested) && nested.some(item => item && typeof item === "object")) return nested;
    }
  }
  return [];
}
function fmTimestampSeconds(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number" || /^\d{9,13}$/.test(String(value))) {
    const n = Number(value);
    return Math.floor(n > 100000000000 ? n / 1000 : n);
  }
  const n = Date.parse(String(value));
  return Number.isFinite(n) ? Math.floor(n / 1000) : 0;
}
function fmField(record, candidates) {
  if (!record || typeof record !== "object") return undefined;
  const normalize = value => String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
  const keys = new Map(Object.keys(record).map(key => [normalize(key), key]));
  for (const candidate of candidates) {
    const originalKey = keys.get(normalize(candidate));
    if (originalKey !== undefined && record[originalKey] !== null && record[originalKey] !== "") return record[originalKey];
  }
  return undefined;
}
function fmNormalizeImportedRecord(record, source) {
  const track = String(fmField(record, ["master_metadata_track_name","trackName","track_name","track","songTitle","name"]) || "").trim();
  const artist = String(fmField(record, ["master_metadata_album_artist_name","artistName","artist_name","artist","albumArtist"]) || "").trim();
  const album = String(fmField(record, ["master_metadata_album_album_name","albumName","album_name","album"]) || "").trim();
  const playedMs = Number(fmField(record, ["ms_played","msPlayed","playDurationMillis","play_duration_ms","playedMs","durationInMillis","Play Duration Milliseconds"]) || 0);
  const endValue = fmField(record, ["ts","endTime","eventEndTimestamp","Event End Timestamp","playedAt","playDate","timestamp","Date"]);
  let timestamp = fmTimestampSeconds(endValue);
  if (source === "spotify" || endValue === record?.ts || /end/i.test(String(endValue||""))) {
    timestamp = Math.max(0, timestamp - Math.floor(Math.max(0, playedMs) / 1000));
  }
  return { track, artist, album, playedMs, timestamp };
}
async function fmImportHistory(interaction, source, store) {
  const account = store.links[interaction.user.id];
  if (!account?.sessionKey) throw new Error("Connect Last.fm first with /fm link.");
  const file = interaction.options.getAttachment("file", true);
  if (!file.name?.toLowerCase().endsWith(".json")) throw new Error("Please attach a JSON history export.");
  if (Number(file.size || 0) > 20 * 1024 * 1024) throw new Error("This JSON file is over the 20 MB limit. Split your listening-history export into smaller files and import them separately.");
  const response = await fetch(file.url, { headers: { "user-agent": "ModBot Last.fm integration/1.0" } });
  if (!response.ok) throw new Error("I couldn't download that attachment from Discord.");
  const raw = await response.text();
  if (raw.length > 20 * 1024 * 1024) throw new Error("This JSON file is over the 20 MB processing limit.");
  let json;
  try { json = JSON.parse(raw); } catch { throw new Error("That file isn't valid JSON. Attach a Spotify Extended Streaming History or Apple Music JSON export."); }
  const sourceRecords = fmHistoryArray(json);
  if (!sourceRecords.length) throw new Error("I couldn't find a supported list of listening events in that file.");
  const records = sourceRecords.map(item => fmNormalizeImportedRecord(item, source))
    .filter(item => item.track && item.artist && item.playedMs >= 30000 && item.timestamp > 0)
    .sort((a,b) => a.timestamp-b.timestamp);
  if (!records.length) throw new Error("No eligible plays were found. The import expects track title, artist, play timestamp, and at least 30 seconds played.");
  if (records.length > 1000) throw new Error("This file contains " + records.length.toLocaleString() + " eligible plays. The safe limit is 1,000 per import; use smaller export files so you can track progress and avoid duplicate imports.");
  let accepted = 0, ignored = 0, batches = 0;
  for (let offset = 0; offset < records.length; offset += 50) {
    const batch = records.slice(offset, offset + 50), params = { sk: account.sessionKey };
    batch.forEach((item, index) => {
      params["artist[" + index + "]"] = item.artist;
      params["track[" + index + "]"] = item.track;
      params["timestamp[" + index + "]"] = item.timestamp;
      params["duration[" + index + "]"] = Math.max(30, Math.floor(item.playedMs / 1000));
      params["chosenByUser[" + index + "]"] = 1;
      if (item.album) params["album[" + index + "]"] = item.album;
    });
    const result = await lastFmCall("track.scrobble", params, true);
    accepted += Number(result?.scrobbles?.["@attr"]?.accepted || 0);
    ignored += Number(result?.scrobbles?.["@attr"]?.ignored || 0);
    batches++;
    if (offset + 50 < records.length) await sleep(350);
  }
  const embed = fmMakeEmbed("Listening history imported", "Processed " + records.length.toLocaleString() + " eligible " + source + " plays in " + batches + " Last.fm batch(es).");
  embed.addFields(
    { name: "Accepted", value: accepted.toLocaleString(), inline: true },
    { name: "Ignored by Last.fm", value: ignored.toLocaleString(), inline: true },
    { name: "Account", value: account.username, inline: true }
  );
  embed.setFooter({ text: "Check your Last.fm profile before re-importing the same file; duplicate plays may be added." });
  return interaction.editReply({ embeds: [embed] });
}

function startLastFmBridge() {
  if (!LASTFM_API_KEY || !LASTFM_API_SECRET) {
    console.log("ℹ️ Localify Last.fm bridge is off until LASTFM_API_KEY and LASTFM_API_SECRET are configured.");
    return;
  }
  const server = createServer(async (req, res) => {
    const origin = String(req.headers.origin || "");
    res.setHeader("Vary", "Origin");
    if (localifyOriginAllowed(origin) && origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "content-type");
      res.setHeader("Access-Control-Allow-Private-Network", "true");
    }
    if (!localifyOriginAllowed(origin)) return bridgeJson(res, 403, { ok:false, error:"Origin is not allowed by the Localify bridge." });
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/health") {
      return bridgeJson(res, 200, { ok:true, service:"ModBot Last.fm bridge", port:LASTFM_BRIDGE_PORT });
    }
    if (req.method !== "POST" || !["/verify","/now-playing","/scrobble"].includes(url.pathname)) {
      return bridgeJson(res, 404, { ok:false, error:"Not found." });
    }
    try {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk.toString("utf8");
        if (raw.length > 20000) return bridgeJson(res, 413, { ok:false, error:"Request is too large." });
      }
      let body;
      try { body = JSON.parse(raw || "{}"); } catch { return bridgeJson(res, 400, { ok:false, error:"Invalid JSON." }); }
      const token = String(body.token || "");
      if (token.length < 24 || token.length > 160) return bridgeJson(res, 401, { ok:false, error:"Localify key is missing or invalid. Generate a new one with /fm localify." });
      const store = await loadLastFmStore();
      const account = Object.values(store.links).find(item => item?.localifyToken === token && item?.sessionKey);
      if (!account) return bridgeJson(res, 401, { ok:false, error:"Localify key is invalid or revoked. Generate a new one with /fm localify." });
      if (url.pathname === "/verify") return bridgeJson(res, 200, { ok:true, username:account.username });
      const now = Date.now();
      const hits = (lastFmBridgeRequests.get(token) || []).filter(ts => now-ts < 60000);
      if (hits.length >= 20) return bridgeJson(res, 429, { ok:false, error:"Too many requests. Please wait a minute." });
      hits.push(now); lastFmBridgeRequests.set(token, hits);
      const track = String(body.track || "").trim().slice(0, 250);
      const artist = String(body.artist || "").trim().slice(0, 250);
      const album = String(body.album || "").trim().slice(0, 250);
      const duration = Math.floor(Number(body.duration) || 0);
      if (!track || !artist) return bridgeJson(res, 400, { ok:false, error:"Track title and artist are required." });
      if (url.pathname === "/now-playing") {
        const params = { sk:account.sessionKey, track, artist };
        if (album) params.album = album;
        if (duration > 0) params.duration = duration;
        await lastFmCall("track.updateNowPlaying", params, true);
        return bridgeJson(res, 200, { ok:true, username:account.username });
      }
      const timestamp = Math.floor(Number(body.timestamp) || 0);
      if (duration <= 30 || timestamp <= 0) return bridgeJson(res, 400, { ok:false, error:"Track does not meet the scrobble requirements." });
      const params = { sk:account.sessionKey, track, artist, timestamp, duration, chosenByUser:1 };
      if (album) params.album = album;
      await lastFmCall("track.scrobble", params, true);
      return bridgeJson(res, 200, { ok:true, username:account.username });
    } catch (error) {
      console.error("Localify Last.fm bridge request failed:", error?.message || error);
      return bridgeJson(res, 502, { ok:false, error:String(error?.message || "Last.fm request failed").slice(0, 300) });
    }
  });
  server.on("error", error => console.error("⚠️ Localify Last.fm bridge couldn't start:", error.message));
  server.listen(LASTFM_BRIDGE_PORT, "127.0.0.1", () => console.log("🎧 Localify Last.fm bridge listening on 127.0.0.1:" + LASTFM_BRIDGE_PORT));
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
  startLastFmBridge();
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

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  await enforceProtectedModRole(newMember, oldMember);
});

client.on(Events.MessageCreate, async message => {
  if (!message.guild) return;

  try {
    await handleDihMessage(message);

    const handledSay = await handleSayMessage(message);
    if (handledSay) return;

    const handledSobCommand = await handleSobPrefixCommand(message);
    if (handledSobCommand) return;

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
      return await interaction.reply({
        content: "Anonymous confession submissions are currently disabled.",
        flags: MessageFlags.Ephemeral
      });
    }

    if (interaction.isButton() && interaction.customId === "secret_reply") {
      return await showSecretReplyModal(interaction);
    }

    if (interaction.isModalSubmit() && interaction.customId === "confession_modal") {
      return await interaction.reply({
        content: "Anonymous confession submissions are currently disabled.",
        flags: MessageFlags.Ephemeral
      });
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith("secret_reply_modal:")) {
      return await handleSecretReplyModal(interaction);
    }

    if (interaction.isButton() && interaction.customId === "fm_finish") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        requireLastFmConfig();
        return await fmFinishAuthorization(interaction);
      } catch (error) {
        console.error("Last.fm authorization finish failed:", error);
        return await interaction.editReply("⚠️ " + String(error?.message || "Could not finish Last.fm authorization.").slice(0, 1800)).catch(()=>null);
      }
    }

    if (!interaction.isChatInputCommand()) return;

    if (["fm","nowplaying","recent","top","wk","chart","recap","overview","profile","friendsfm","taste","loved","search","crowns","import"].includes(interaction.commandName)) {
      return await handleFmCommand(interaction);
    }

    const ctx = createInteractionContext(interaction);

    if (interaction.commandName === "unreleased") return await run_unreleased(ctx);
    if (interaction.commandName === "socials") return await run_socials(ctx);
    if (interaction.commandName === "rate") return await run_rate(ctx);
    if (interaction.commandName === "facts") return await run_facts(ctx);
    if (interaction.commandName === "help") return await run_help(ctx);
  } catch (error) {
    console.error("Command error:", error);
    const payload={content:"Something went wrong while running that command.",flags:MessageFlags.Ephemeral};
    if(interaction.replied||interaction.deferred) await interaction.followUp(payload).catch(()=>null);
    else await interaction.reply(payload).catch(()=>null);
  }
});

client.login(TOKEN);
