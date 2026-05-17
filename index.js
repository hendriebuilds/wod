import {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  REST,
  Routes,
  PermissionFlagsBits,
} from "discord.js";
import * as dotenv from "dotenv";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
 
dotenv.config();
 
const __dirname = dirname(fileURLToPath(import.meta.url));
const VRAGEN_PAD = join(__dirname, "vragen.json");
 
// ─── Vragen laden & opslaan ────────────────────────────────────────────────────
 
let waarheidVragen = [];
let doenOpdrachten = [];
const gebruikteWaarheid = new Set();
const gebruikteDoen = new Set();
 
function laadVragen() {
  try {
    const data = JSON.parse(readFileSync(VRAGEN_PAD, "utf-8"));
    if (!Array.isArray(data.waarheid) || !Array.isArray(data.doen)) {
      throw new Error('vragen.json moet een "waarheid" en "doen" array bevatten.');
    }
    waarheidVragen = data.waarheid;
    doenOpdrachten = data.doen;
    gebruikteWaarheid.clear();
    gebruikteDoen.clear();
    console.log(`✅ Vragen geladen: ${waarheidVragen.length} waarheid, ${doenOpdrachten.length} doen.`);
    return true;
  } catch (err) {
    console.error("❌ Fout bij laden van vragen.json:", err.message);
    return false;
  }
}
 
function slaVragenOp() {
  try {
    writeFileSync(VRAGEN_PAD, JSON.stringify({ waarheid: waarheidVragen, doen: doenOpdrachten }, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error("❌ Fout bij opslaan van vragen.json:", err.message);
    return false;
  }
}
 
laadVragen();
 
// ─── Statistieken ──────────────────────────────────────────────────────────────
 
const sessieStart = new Date();
let aantalWaarheid = 0;
let aantalDoen = 0;
const rerollTeller = new Map(); // userId -> { naam, teller }
 
function registreerReroll(user) {
  const huidig = rerollTeller.get(user.id) ?? { naam: user.displayName, teller: 0 };
  rerollTeller.set(user.id, { naam: user.displayName, teller: huidig.teller + 1 });
}
 
function resetStatistieken() {
  aantalWaarheid = 0;
  aantalDoen = 0;
  rerollTeller.clear();
}
 
// ─── Vraag helpers ─────────────────────────────────────────────────────────────
 
function getVraag(lijst, gebruikte) {
  if (gebruikte.size >= lijst.length) {
    gebruikte.clear();
    console.log("🔄 Alle vragen geweest, lijst gereset.");
  }
  const beschikbaar = lijst.map((_, i) => i).filter(i => !gebruikte.has(i));
  const index = beschikbaar[Math.floor(Math.random() * beschikbaar.length)];
  gebruikte.add(index);
  return lijst[index];
}
 
// ─── Cooldown ──────────────────────────────────────────────────────────────────
 
const cooldowns = new Set();
 
function inCooldown(userId) {
  if (cooldowns.has(userId)) return true;
  cooldowns.add(userId);
  setTimeout(() => cooldowns.delete(userId), 1500);
  return false;
}
 
// ─── Bot Setup ─────────────────────────────────────────────────────────────────
 
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
 
const commands = [
  new SlashCommandBuilder()
    .setName("wod")
    .setDescription("Start een ronde Waarheid of Doen!")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("waarheid")
    .setDescription("Krijg direct een waarheidsvraag.")
    .addIntegerOption(opt =>
      opt.setName("nummer")
        .setDescription("Optioneel: vraag een specifieke vraag op via nummer (zie /lijst).")
        .setRequired(false)
        .setMinValue(1)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("doen")
    .setDescription("Krijg direct een doe-opdracht.")
    .addIntegerOption(opt =>
      opt.setName("nummer")
        .setDescription("Optioneel: vraag een specifieke opdracht op via nummer (zie /lijst).")
        .setRequired(false)
        .setMinValue(1)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("reload")
    .setDescription("Herlaad de vragen uit vragen.json. (Alleen voor admins)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
  new SlashCommandBuilder()
    .setName("reset")
    .setDescription("Reset de gebruikte vragen en statistieken voor een nieuwe avond. (Alleen voor admins)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
  new SlashCommandBuilder()
    .setName("statistieken")
    .setDescription("Bekijk de statistieken van deze sessie.")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("voeg-toe")
    .setDescription("Voeg een nieuwe vraag of opdracht toe. (Alleen voor admins)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(opt =>
      opt.setName("type")
        .setDescription("Waarheid of doen?")
        .setRequired(true)
        .addChoices(
          { name: "Waarheid", value: "waarheid" },
          { name: "Doen", value: "doen" }
        )
    )
    .addStringOption(opt =>
      opt.setName("tekst")
        .setDescription("De tekst van de vraag of opdracht.")
        .setRequired(true)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("verwijder")
    .setDescription("Verwijder een vraag of opdracht. (Alleen voor admins)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(opt =>
      opt.setName("type")
        .setDescription("Waarheid of doen?")
        .setRequired(true)
        .addChoices(
          { name: "Waarheid", value: "waarheid" },
          { name: "Doen", value: "doen" }
        )
    )
    .addIntegerOption(opt =>
      opt.setName("nummer")
        .setDescription("Het nummer van de vraag (gebruik /lijst om nummers te zien).")
        .setRequired(true)
        .setMinValue(1)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("lijst")
    .setDescription("Bekijk alle huidige vragen en opdrachten. (Alleen voor admins)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(opt =>
      opt.setName("type")
        .setDescription("Waarheid, doen, of allebei?")
        .setRequired(false)
        .addChoices(
          { name: "Waarheid", value: "waarheid" },
          { name: "Doen", value: "doen" }
        )
    )
    .toJSON(),
];
 
client.once("ready", async () => {
  console.log(`✅ Ingelogd als ${client.user.tag}`);
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ Slash commands geregistreerd!");
  } catch (err) {
    console.error("❌ Fout bij registreren van commands:", err);
  }
});
 
// ─── Embed Helpers ─────────────────────────────────────────────────────────────
 
function buildKiesEmbed(user) {
  return new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle("🎮 Waarheid of Doen")
    .setDescription(`**${user.displayName}**, wat kies jij?\n\nKlik op een knop hieronder om te beginnen!`)
    .setFooter({ text: "Waarheid of Doen • Durf jij het aan?" });
}
 
function buildWaarheidEmbed(vraag, user, isReroll = false) {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(isReroll ? "🔵 Waarheid — Reroll" : "🔵 Waarheid")
    .setDescription(`**${user.displayName}**, beantwoord eerlijk:\n\n> ${vraag}`)
    .setFooter({ text: `Waarheid of Doen • ${gebruikteWaarheid.size}/${waarheidVragen.length} vragen gehad` })
    .setTimestamp();
}
 
function buildDoenEmbed(opdracht, user, isReroll = false) {
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle(isReroll ? "🔴 Doen — Reroll" : "🔴 Doen")
    .setDescription(`**${user.displayName}**, jouw opdracht:\n\n> ${opdracht}`)
    .setFooter({ text: `Waarheid of Doen • ${gebruikteDoen.size}/${doenOpdrachten.length} opdrachten gehad` })
    .setTimestamp();
}
 
function buildKiesButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("kies_waarheid").setLabel("🔵 Waarheid").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("kies_doen").setLabel("🔴 Doen").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("kies_random").setLabel("🎲 Verrassing!").setStyle(ButtonStyle.Secondary)
  );
}
 
function buildDisabledKiesButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("kies_waarheid").setLabel("🔵 Waarheid").setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId("kies_doen").setLabel("🔴 Doen").setStyle(ButtonStyle.Danger).setDisabled(true),
    new ButtonBuilder().setCustomId("kies_random").setLabel("🎲 Verrassing!").setStyle(ButtonStyle.Secondary).setDisabled(true)
  );
}
 
function buildActieButtons(type) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`reroll_${type}`).setLabel("🎲 Reroll").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("nieuwe_ronde").setLabel("🔄 Nieuwe ronde").setStyle(ButtonStyle.Success)
  );
}
 
function buildStatistiekenEmbed() {
  const totaal = aantalWaarheid + aantalDoen;
  const duur = Math.floor((new Date() - sessieStart) / 60000);
  const uren = Math.floor(duur / 60);
  const minuten = duur % 60;
  const duurTekst = uren > 0 ? `${uren}u ${minuten}m` : `${minuten}m`;
 
  // Reroll ranglijst sorteren
  const rerollLijst = [...rerollTeller.entries()]
    .sort((a, b) => b[1].teller - a[1].teller)
    .map(([, data], i) => `**${i + 1}.** ${data.naam} — ${data.teller}x reroll`)
    .join("\n");
 
  return new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle("📊 Statistieken")
    .addFields(
      { name: "⏱️ Sessieduur", value: duurTekst, inline: true },
      { name: "🎮 Totaal gespeeld", value: `${totaal} rondes`, inline: true },
      { name: "\u200B", value: "\u200B", inline: true },
      { name: "🔵 Waarheid", value: `${aantalWaarheid}x`, inline: true },
      { name: "🔴 Doen", value: `${aantalDoen}x`, inline: true },
      { name: "\u200B", value: "\u200B", inline: true },
      {
        name: "🎲 Reroll ranglijst",
        value: rerollLijst || "Nog niemand gererolld!",
        inline: false,
      }
    )
    .setFooter({ text: `Sessie gestart om ${sessieStart.toLocaleTimeString("nl-NL")}` })
    .setTimestamp();
}
 
function buildLijstEmbeds(type) {
  const lijst = type === "waarheid" ? waarheidVragen : doenOpdrachten;
  const kleur = type === "waarheid" ? 0x5865f2 : 0xed4245;
  const emoji = type === "waarheid" ? "🔵" : "🔴";
  const label = type === "waarheid" ? "Waarheidsvragen" : "Doe-opdrachten";
 
  if (lijst.length === 0) {
    return [new EmbedBuilder().setColor(kleur).setTitle(`${emoji} ${label}`).setDescription("Geen vragen gevonden.")];
  }
 
  const embeds = [];
  let huidigeTekst = "";
  let startNummer = 1;
 
  for (let i = 0; i < lijst.length; i++) {
    const regel = `**${i + 1}.** ${lijst[i]}\n`;
    if (huidigeTekst.length + regel.length > 3800) {
      embeds.push(
        new EmbedBuilder()
          .setColor(kleur)
          .setTitle(`${emoji} ${label} (${startNummer}–${i})`)
          .setDescription(huidigeTekst.trim())
      );
      huidigeTekst = regel;
      startNummer = i + 1;
    } else {
      huidigeTekst += regel;
    }
  }
 
  embeds.push(
    new EmbedBuilder()
      .setColor(kleur)
      .setTitle(embeds.length === 0 ? `${emoji} ${label}` : `${emoji} ${label} (${startNummer}–${lijst.length})`)
      .setDescription(huidigeTekst.trim())
      .setFooter({ text: `Totaal: ${lijst.length}` })
  );
 
  return embeds;
}
 
// ─── Interaction Handler ───────────────────────────────────────────────────────
 
client.on("interactionCreate", async (interaction) => {
  const user = interaction.member ?? interaction.user;
 
  // ── Slash Commands ──
  if (interaction.isChatInputCommand()) {
 
    if (interaction.commandName === "wod") {
      await interaction.reply({ embeds: [buildKiesEmbed(user)], components: [buildKiesButtons()] });
      return;
    }
 
    if (interaction.commandName === "waarheid") {
      const nummer = interaction.options.getInteger("nummer");
      if (nummer !== null) {
        if (nummer > waarheidVragen.length) {
          await interaction.reply({ content: `❌ Er is geen waarheidsvraag met nummer ${nummer}. Gebruik \`/lijst\` om de nummers te zien.`, ephemeral: true });
          return;
        }
        const vraag = waarheidVragen[nummer - 1];
        gebruikteWaarheid.add(nummer - 1);
        aantalWaarheid++;
        await interaction.reply({ embeds: [buildWaarheidEmbed(vraag, user)], components: [buildActieButtons("waarheid")] });
      } else {
        const vraag = getVraag(waarheidVragen, gebruikteWaarheid);
        aantalWaarheid++;
        await interaction.reply({ embeds: [buildWaarheidEmbed(vraag, user)], components: [buildActieButtons("waarheid")] });
      }
      return;
    }
 
    if (interaction.commandName === "doen") {
      const nummer = interaction.options.getInteger("nummer");
      if (nummer !== null) {
        if (nummer > doenOpdrachten.length) {
          await interaction.reply({ content: `❌ Er is geen doe-opdracht met nummer ${nummer}. Gebruik \`/lijst\` om de nummers te zien.`, ephemeral: true });
          return;
        }
        const opdracht = doenOpdrachten[nummer - 1];
        gebruikteDoen.add(nummer - 1);
        aantalDoen++;
        await interaction.reply({ embeds: [buildDoenEmbed(opdracht, user)], components: [buildActieButtons("doen")] });
      } else {
        const opdracht = getVraag(doenOpdrachten, gebruikteDoen);
        aantalDoen++;
        await interaction.reply({ embeds: [buildDoenEmbed(opdracht, user)], components: [buildActieButtons("doen")] });
      }
      return;
    }
 
    if (interaction.commandName === "statistieken") {
      await interaction.reply({ embeds: [buildStatistiekenEmbed()] });
      return;
    }
 
    if (interaction.commandName === "reset") {
      gebruikteWaarheid.clear();
      gebruikteDoen.clear();
      resetStatistieken();
 
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("✅ Reset voltooid")
            .setDescription("Alle gebruikte vragen en statistieken zijn gereset. Veel speelplezier! 🎉")
            .setTimestamp(),
        ],
      });
      return;
    }
 
    if (interaction.commandName === "reload") {
      const succes = laadVragen();
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(succes ? 0x57f287 : 0xed4245)
            .setTitle(succes ? "✅ Vragen herladen" : "❌ Herladen mislukt")
            .setDescription(
              succes
                ? `Vragen succesvol geladen.\n\n📋 **${waarheidVragen.length}** waarheidsvragen\n🎯 **${doenOpdrachten.length}** doe-opdrachten`
                : "Controleer of `vragen.json` geldig JSON is met een `waarheid` en `doen` array."
            )
            .setTimestamp(),
        ],
        ephemeral: true,
      });
      return;
    }
 
    if (interaction.commandName === "voeg-toe") {
      const type = interaction.options.getString("type");
      const tekst = interaction.options.getString("tekst").trim();
 
      if (type === "waarheid") {
        waarheidVragen.push(tekst);
      } else {
        doenOpdrachten.push(tekst);
      }
 
      const succes = slaVragenOp();
      const lijst = type === "waarheid" ? waarheidVragen : doenOpdrachten;
      const label = type === "waarheid" ? "waarheidsvraag" : "doe-opdracht";
 
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(succes ? 0x57f287 : 0xed4245)
            .setTitle(succes ? "✅ Toegevoegd" : "❌ Opslaan mislukt")
            .setDescription(
              succes
                ? `Nieuwe ${label} toegevoegd als #${lijst.length}:\n\n> ${tekst}`
                : "De vraag is toegevoegd maar kon niet worden opgeslagen naar `vragen.json`."
            )
            .setTimestamp(),
        ],
        ephemeral: true,
      });
      return;
    }
 
    if (interaction.commandName === "verwijder") {
      const type = interaction.options.getString("type");
      const nummer = interaction.options.getInteger("nummer");
      const lijst = type === "waarheid" ? waarheidVragen : doenOpdrachten;
      const label = type === "waarheid" ? "waarheidsvraag" : "doe-opdracht";
 
      if (nummer > lijst.length) {
        await interaction.reply({
          content: `❌ Er is geen ${label} met nummer ${nummer}. Gebruik \`/lijst\` om de nummers te zien.`,
          ephemeral: true,
        });
        return;
      }
 
      const verwijderd = lijst.splice(nummer - 1, 1)[0];
      gebruikteWaarheid.clear();
      gebruikteDoen.clear();
 
      const succes = slaVragenOp();
 
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(succes ? 0x57f287 : 0xed4245)
            .setTitle(succes ? "🗑️ Verwijderd" : "❌ Opslaan mislukt")
            .setDescription(
              succes
                ? `${label.charAt(0).toUpperCase() + label.slice(1)} #${nummer} verwijderd:\n\n> ${verwijderd}\n\n*(De nummers zijn opnieuw ingedeeld)*`
                : "De vraag is verwijderd maar kon niet worden opgeslagen naar `vragen.json`."
            )
            .setTimestamp(),
        ],
        ephemeral: true,
      });
      return;
    }
 
    if (interaction.commandName === "lijst") {
      const type = interaction.options.getString("type");
      if (!type) {
        const alleEmbeds = [...buildLijstEmbeds("waarheid"), ...buildLijstEmbeds("doen")].slice(0, 10);
        await interaction.reply({ embeds: alleEmbeds, ephemeral: true });
      } else {
        await interaction.reply({ embeds: buildLijstEmbeds(type), ephemeral: true });
      }
      return;
    }
  }
 
  // ── Buttons ──
  if (interaction.isButton()) {
    if (inCooldown(user.id)) return;
 
    if (interaction.customId === "kies_waarheid") {
      await interaction.update({ components: [buildDisabledKiesButtons()] });
      const vraag = getVraag(waarheidVragen, gebruikteWaarheid);
      aantalWaarheid++;
      await interaction.followUp({ embeds: [buildWaarheidEmbed(vraag, user)], components: [buildActieButtons("waarheid")] });
      return;
    }
 
    if (interaction.customId === "kies_doen") {
      await interaction.update({ components: [buildDisabledKiesButtons()] });
      const opdracht = getVraag(doenOpdrachten, gebruikteDoen);
      aantalDoen++;
      await interaction.followUp({ embeds: [buildDoenEmbed(opdracht, user)], components: [buildActieButtons("doen")] });
      return;
    }
 
    if (interaction.customId === "kies_random") {
      await interaction.update({ components: [buildDisabledKiesButtons()] });
      if (Math.random() < 0.5) {
        const vraag = getVraag(waarheidVragen, gebruikteWaarheid);
        aantalWaarheid++;
        await interaction.followUp({ embeds: [buildWaarheidEmbed(vraag, user)], components: [buildActieButtons("waarheid")] });
      } else {
        const opdracht = getVraag(doenOpdrachten, gebruikteDoen);
        aantalDoen++;
        await interaction.followUp({ embeds: [buildDoenEmbed(opdracht, user)], components: [buildActieButtons("doen")] });
      }
      return;
    }
 
    if (interaction.customId === "reroll_waarheid") {
      registreerReroll(user);
      const vraag = getVraag(waarheidVragen, gebruikteWaarheid);
      await interaction.update({ embeds: [buildWaarheidEmbed(vraag, user, true)], components: [buildActieButtons("waarheid")] });
      return;
    }
 
    if (interaction.customId === "reroll_doen") {
      registreerReroll(user);
      const opdracht = getVraag(doenOpdrachten, gebruikteDoen);
      await interaction.update({ embeds: [buildDoenEmbed(opdracht, user, true)], components: [buildActieButtons("doen")] });
      return;
    }
 
    if (interaction.customId === "nieuwe_ronde") {
      await interaction.update({ components: [] });
      await interaction.followUp({ embeds: [buildKiesEmbed(user)], components: [buildKiesButtons()] });
      return;
    }
  }
});
 
// ─── Start ─────────────────────────────────────────────────────────────────────
 
client.login(process.env.DISCORD_TOKEN);
