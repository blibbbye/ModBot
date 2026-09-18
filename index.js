import "dotenv/config";
import {
  Client, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  PermissionFlagsBits, MessageFlags, EmbedBuilder, ChannelType
} from "discord.js";

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID || "";
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
  new SlashCommandBuilder().setName("help").setDescription("Shows bot commands")
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

client.once(Events.ClientReady, async readyClient => {
  console.log(`✅ Logged in as ${readyClient.user.tag}`);
  readyClient.user.setActivity("/help • ModMod's Unreleased", { type:"Watching" });
    console.log('ℹ️ Automatic command deployment is disabled.');
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  try {
    if (interaction.commandName === "unreleased") return await run_unreleased(createInteractionContext(interaction));
    if (interaction.commandName === "socials") return await run_socials(createInteractionContext(interaction));
    if (interaction.commandName === "rate") return await run_rate(createInteractionContext(interaction));
    if (interaction.commandName === "facts") return await run_facts(createInteractionContext(interaction));
    if (interaction.commandName === "help") return await run_help(createInteractionContext(interaction));
  } catch (error) {
    console.error("Command error:", error);
    const payload={content:"Something went wrong while running that command.",flags:MessageFlags.Ephemeral};
    if(interaction.replied||interaction.deferred) await interaction.followUp(payload).catch(()=>null);
    else await interaction.reply(payload).catch(()=>null);
  }
});



client.login(TOKEN);
