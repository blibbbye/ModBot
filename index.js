import "dotenv/config";
import {
  Client, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  PermissionFlagsBits, MessageFlags, EmbedBuilder, ChannelType,
  ContextMenuCommandBuilder, ApplicationCommandType
} from "discord.js";

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID || "";
const CO_OWNER_ID = process.env.CO_OWNER_ID || "";
const BOT_CREATOR_NAME = process.env.BOT_CREATOR_NAME || "blibbbye";
const CONFESSIONS_CHANNEL_NAME = process.env.CONFESSIONS_CHANNEL_NAME || "🤫・confessions";
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
    .setDescription("Send an anonymous confession")
    .addStringOption(option =>
      option.setName("message")
        .setDescription("The confession to send anonymously")
        .setRequired(true)
        .setMaxLength(2000)
    ),
  new SlashCommandBuilder()
    .setName("translate")
    .setDescription("Translate a message")
    .addStringOption(option =>
      option.setName("from")
        .setDescription("Source language, e.g. auto, english, sv, fr")
        .setRequired(true)
        .setMaxLength(30)
    )
    .addStringOption(option =>
      option.setName("to")
        .setDescription("Language to translate to, e.g. english, sv, fr")
        .setRequired(true)
        .setMaxLength(30)
    ),
  new SlashCommandBuilder()
    .setName("co-owner")
    .setDescription("Show ModBot creator and co-owner information"),
  new ContextMenuCommandBuilder()
    .setName("Translate")
    .setType(ApplicationCommandType.Message)
];

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
  const vars = ctx.vars;
  await ctx.reply(`sup ${ctx.user?.toString?.() ?? ""}
/unreleased "Sends a link to our website with all unreleased!"
/socials "Sends links of ModMod's Socials"
/rate "Send a link to rate ModMod's Unreleased"
/facts "Sends a random fact about ModMod"
/help "this"

"If u needed other help then ask me! @blib"`, true);
}


function normaliseLanguage(language) {
  const value = String(language || "").trim().toLowerCase();
  const aliases = {
    auto: "auto",
    english: "en", en: "en",
    swedish: "sv", sv: "sv", svenska: "sv",
    finnish: "fi", fi: "fi", suomi: "fi",
    norwegian: "no", no: "no", norsk: "no",
    danish: "da", da: "da", dansk: "da",
    german: "de", de: "de", deutsch: "de",
    french: "fr", fr: "fr",
    spanish: "es", es: "es", español: "es",
    italian: "it", it: "it",
    portuguese: "pt", pt: "pt",
    dutch: "nl", nl: "nl",
    polish: "pl", pl: "pl",
    russian: "ru", ru: "ru",
    ukrainian: "uk", uk: "uk",
    japanese: "ja", ja: "ja",
    korean: "ko", ko: "ko",
    chinese: "zh", zh: "zh",
    arabic: "ar", ar: "ar",
    turkish: "tr", tr: "tr"
  };
  return aliases[value] || value;
}

async function translateText(text, from, to) {
  const source = normaliseLanguage(from);
  const target = normaliseLanguage(to);

  if (!target || target === "auto") {
    throw new Error("The target language cannot be auto.");
  }
  if (source === target && source !== "auto") return text;

  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", source || "auto");
  url.searchParams.set("tl", target);
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Translation service returned HTTP " + response.status);
  }

  const data = await response.json();
  const translated = Array.isArray(data?.[0])
    ? data[0].map(part => Array.isArray(part) ? part[0] : "").join("")
    : "";

  if (!translated) {
    throw new Error("Translation service returned no translated text.");
  }

  return translated;
}

async function run_confess(ctx) {
  const confession = ctx.interaction.options.getString("message", true).trim();

  if (!confession) {
    return await ctx.reply("Your confession cannot be empty.", true);
  }

  const confessionChannel = ctx.guild?.channels.cache.find(
    channel =>
      channel.type === ChannelType.GuildText &&
      channel.name === CONFESSIONS_CHANNEL_NAME
  );

  if (!confessionChannel) {
    return await ctx.reply(
      "I couldn't find the " + CONFESSIONS_CHANNEL_NAME + " channel in this server.",
      true
    );
  }

  await confessionChannel.send({
    content: "🤫 **Anonymous Confession**\n\n" + confession,
    allowedMentions: { parse: [] }
  });

  await ctx.reply("✅ Your confession was sent anonymously.", true);
}

async function run_translate_context(ctx) {
  const targetMessage = ctx.interaction.targetMessage;

  if (!targetMessage) {
    return await ctx.reply("I couldn't read that message.", true);
  }

  const text = targetMessage.content?.trim();
  if (!text) {
    return await ctx.reply("The selected message doesn't contain translatable text.", true);
  }

  const to = process.env.DEFAULT_TRANSLATE_TO || "en";
  await ctx.interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const translated = await translateText(text, "auto", to);

    await ctx.interaction.editReply({
      content: "🌐 **Translation (auto → " + to + ")**\n" + translated,
      allowedMentions: { parse: [] }
    });
  } catch (error) {
    console.error("Translation error:", error);
    await ctx.interaction.editReply("❌ I couldn't translate that message.");
  }
}

async function run_translate_slash(ctx) {
  return await ctx.reply(
    "Discord does not provide a reply target to slash-command interactions. Use Apps → Translate on the message you want to translate. The Translate app command is the Discord-supported way to select a specific message.",
    true
  );
}

async function run_co_owner(ctx) {
  if (!CO_OWNER_ID || ctx.user?.id !== CO_OWNER_ID) {
    return await ctx.reply("You don't have permission to use this command.", true);
  }

  await ctx.replyEmbed(
    new EmbedBuilder()
      .setTitle("𝘾𝙊-𝙊𝙒𝙉𝙀𝙍")
      .setDescription("ModBot information")
      .addFields(
        { name: "Creator", value: BOT_CREATOR_NAME, inline: true },
        { name: "Co-Owner", value: "<@" + CO_OWNER_ID + ">", inline: true },
        {
          name: "Bot",
          value: client.user
            ? "<@" + client.user.id + "> (" + client.user.tag + ")"
            : "ModBot",
          inline: false
        }
      )
      .setColor("#000000"),
    true
  );
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

client.once(Events.ClientReady, async readyClient => {
  console.log(`✅ Logged in as ${readyClient.user.tag}`);
  readyClient.user.setActivity("/help • ModMod's Unreleased", { type:"Watching" });

  try {
    await deployCommands();
  } catch (error) {
    console.error("❌ Command deployment failed:", error);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isMessageContextMenuCommand() && interaction.commandName === "Translate") {
      return await run_translate_context(createInteractionContext(interaction));
    }

    if (!interaction.isChatInputCommand()) return;

    const ctx = createInteractionContext(interaction);

    if (interaction.commandName === "unreleased") return await run_unreleased(ctx);
    if (interaction.commandName === "socials") return await run_socials(ctx);
    if (interaction.commandName === "rate") return await run_rate(ctx);
    if (interaction.commandName === "facts") return await run_facts(ctx);
    if (interaction.commandName === "help") return await run_help(ctx);
    if (interaction.commandName === "confess") return await run_confess(ctx);
    if (interaction.commandName === "translate") return await run_translate_slash(ctx);
    if (interaction.commandName === "co-owner") return await run_co_owner(ctx);
  } catch (error) {
    console.error("Command error:", error);
    const payload={content:"Something went wrong while running that command.",flags:MessageFlags.Ephemeral};
    if(interaction.replied||interaction.deferred) await interaction.followUp(payload).catch(()=>null);
    else await interaction.reply(payload).catch(()=>null);
  }
});

client.login(TOKEN);
