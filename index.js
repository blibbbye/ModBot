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
const DEPLOY_COMMANDS = (process.env.DEPLOY_COMMANDS || "true").toLowerCase() !== "false";
if (!TOKEN) throw new Error("Missing DISCORD_TOKEN in .env");
if (!CLIENT_ID) throw new Error("Missing DISCORD_CLIENT_ID in .env");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

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
        .setDescription("Optional confession text; leave empty to open the form")
        .setRequired(false)
        .setMaxLength(2000)
    ),
  new ContextMenuCommandBuilder()
    .setName("showconfess")
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

async function sendConfession(guild, confession, authorId) {
  const confessionChannel = findConfessionsChannel(guild);

  if (!confessionChannel) {
    throw new Error("Missing confessions channel");
  }

  const sentMessage = await confessionChannel.send({
    embeds: [createConfessionEmbed(confession)],
    components: [createConfessionButtonRow(authorId)]
  });

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

  if (!directMessage) {
    return await showConfessionModal(ctx.interaction);
  }

  const confession = directMessage.trim();
  if (!confession) {
    return await ctx.reply("Your confession cannot be empty.", true);
  }

  try {
    await sendConfession(ctx.guild, confession, ctx.user.id);
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
  const recoveredUserId = record?.userId || getEncodedSenderFromMessage(targetMessage);

  if (!recoveredUserId) {
    return await interaction.reply({
      content: "I couldn't find who sent this confession. This confession was probably created before sender tracking was added.",
      flags: MessageFlags.Ephemeral
    });
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

  await updateMemberCountChannels();
  setInterval(updateMemberCountChannels, 60 * 1000);
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isMessageContextMenuCommand() && interaction.commandName === "showconfess") {
      return await run_show_confess(interaction);
    }

    if (interaction.isButton() && interaction.customId === "submit_confession") {
      return await showConfessionModal(interaction);
    }

    if (interaction.isModalSubmit() && interaction.customId === "confession_modal") {
      return await handleConfessionModal(interaction);
    }

    if (!interaction.isChatInputCommand()) return;

    const ctx = createInteractionContext(interaction);

    if (interaction.commandName === "unreleased") return await run_unreleased(ctx);
    if (interaction.commandName === "socials") return await run_socials(ctx);
    if (interaction.commandName === "rate") return await run_rate(ctx);
    if (interaction.commandName === "facts") return await run_facts(ctx);
    if (interaction.commandName === "help") return await run_help(ctx);
    if (interaction.commandName === "confess") return await run_confess(ctx);
  } catch (error) {
    console.error("Command error:", error);
    const payload={content:"Something went wrong while running that command.",flags:MessageFlags.Ephemeral};
    if(interaction.replied||interaction.deferred) await interaction.followUp(payload).catch(()=>null);
    else await interaction.reply(payload).catch(()=>null);
  }
});

client.login(TOKEN);
