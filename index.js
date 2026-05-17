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
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import express from "express";
import session from "express-session";
import cors from "cors";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const VRAGEN_PAD = join(__dirname, "vragen.json");
const INSTELLINGEN_PAD = join(__dirname, "settings.json");
const CONFIG_PAD = join(__dirname, "config.json");

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
    waarheidVragen = data.waarheid.map(v => typeof v === 'string' ? { tekst: v, categorie: '18+', dmModus: false } : { dmModus: false, ...v });
    doenOpdrachten = data.doen.map(v => typeof v === 'string' ? { tekst: v, categorie: '18+', dmModus: false } : { dmModus: false, ...v });
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

// ─── Instellingen ──────────────────────────────────────────────────────────────

const instellingen = { cooldownMs: 1500, dmModus: false };

function laadInstellingen() {
  try {
    const data = JSON.parse(readFileSync(INSTELLINGEN_PAD, "utf-8"));
    Object.assign(instellingen, data);
    console.log("✅ Instellingen geladen.");
  } catch {
    console.log("ℹ️ Geen settings.json, standaardwaarden gebruikt.");
  }
}

function slaInstellingenOp() {
  try {
    writeFileSync(INSTELLINGEN_PAD, JSON.stringify(instellingen, null, 2), "utf-8");
  } catch (err) {
    console.error("❌ Fout bij opslaan instellingen:", err.message);
  }
}

laadInstellingen();

// ─── Configuratie ──────────────────────────────────────────────────────────────

const config = {
  redirectUri: "http://localhost:3001/auth/callback",
  frontendUrl: "http://localhost:3001",
};

function laadConfig() {
  try {
    const data = JSON.parse(readFileSync(CONFIG_PAD, "utf-8"));
    Object.assign(config, data);
    console.log("✅ Configuratie geladen.");
  } catch {
    console.log("ℹ️ Geen config.json, standaardwaarden gebruikt.");
  }
}

function slaConfigOp() {
  try {
    writeFileSync(CONFIG_PAD, JSON.stringify(config, null, 2), "utf-8");
  } catch (err) {
    console.error("❌ Fout bij opslaan configuratie:", err.message);
  }
}

laadConfig();

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

// ─── Beurtrotatie ──────────────────────────────────────────────────────────────

const beurtenLijst = []; // [{ id, naam }]
let huidigeBeurt = 0;

function getHuidigeSpelerNaam() {
  if (beurtenLijst.length === 0) return null;
  return beurtenLijst[huidigeBeurt].naam;
}

function advanceerBeurt() {
  if (beurtenLijst.length === 0) return null;
  huidigeBeurt = (huidigeBeurt + 1) % beurtenLijst.length;
  return beurtenLijst[huidigeBeurt];
}

function buildBeurtenLijstTekst() {
  return beurtenLijst
    .map((s, i) => `${i === huidigeBeurt ? "▶️" : `${i + 1}.`} **${s.naam}**`)
    .join("\n");
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

function haalVraagUitEmbed(description, lijst, gebruikte) {
  if (!description) return;
  const markerIdx = description.indexOf('\n\n> ');
  if (markerIdx === -1) return;
  const oudeVraag = description.slice(markerIdx + 4);
  const oudeIndex = lijst.findIndex(v => v.tekst === oudeVraag);
  if (oudeIndex !== -1) gebruikte.delete(oudeIndex);
}

// ─── Cooldown ──────────────────────────────────────────────────────────────────

const cooldowns = new Set();

function inCooldown(userId) {
  if (cooldowns.has(userId)) return true;
  cooldowns.add(userId);
  setTimeout(() => cooldowns.delete(userId), instellingen.cooldownMs);
  return false;
}

// ─── Bot Setup ─────────────────────────────────────────────────────────────────

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
  new SlashCommandBuilder()
    .setName("wod")
    .setDescription("Start een ronde Waarheid of Doen!")
    .addUserOption(opt =>
      opt.setName("speler")
        .setDescription("Richt de vraag op een specifieke speler.")
        .setRequired(false)
    )
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
    .setName("beurt")
    .setDescription("Beheer de beurtrotatie.")
    .addSubcommand(sub =>
      sub.setName("toevoegen")
        .setDescription("Voeg een speler toe aan de rotatie.")
        .addUserOption(opt => opt.setName("speler").setDescription("De toe te voegen speler.").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("verwijder")
        .setDescription("Verwijder een speler uit de rotatie.")
        .addUserOption(opt => opt.setName("speler").setDescription("De te verwijderen speler.").setRequired(true))
    )
    .addSubcommand(sub => sub.setName("lijst").setDescription("Bekijk de huidige rotatie."))
    .addSubcommand(sub => sub.setName("reset").setDescription("Wis de rotatie."))
    .addSubcommand(sub => sub.setName("volgende").setDescription("Sla de huidige speler over en ga naar de volgende."))
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

function buildKiesEmbed(user, doelNaam = null) {
  const naam = doelNaam ?? user.displayName;
  return new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle("🎮 Waarheid of Doen")
    .setDescription(`Het is **${naam}**'s beurt! Kies een optie hieronder.`)
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

function buildStrafWaarheidEmbed(vraag, user) {
  return new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle("🔵 Waarheid — Strafvraag")
    .setDescription(`**${user.displayName}** heeft gepast! Hier is je strafvraag:\n\n> ${vraag}`)
    .setFooter({ text: `Waarheid of Doen • ${gebruikteWaarheid.size}/${waarheidVragen.length} vragen gehad` })
    .setTimestamp();
}

function buildStrafDoenEmbed(opdracht, user) {
  return new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle("🔴 Doen — Strafopdracht")
    .setDescription(`**${user.displayName}** heeft gepast! Hier is je strafopdracht:\n\n> ${opdracht}`)
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
    new ButtonBuilder().setCustomId(`passen_${type}`).setLabel("❌ Passen").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("nieuwe_ronde").setLabel("🔄 Nieuwe ronde").setStyle(ButtonStyle.Success)
  );
}

function buildStatistiekenEmbed() {
  const totaal = aantalWaarheid + aantalDoen;
  const duur = Math.floor((new Date() - sessieStart) / 60000);
  const uren = Math.floor(duur / 60);
  const minuten = duur % 60;
  const duurTekst = uren > 0 ? `${uren}u ${minuten}m` : `${minuten}m`;

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
      { name: "​", value: "​", inline: true },
      { name: "🔵 Waarheid", value: `${aantalWaarheid}x`, inline: true },
      { name: "🔴 Doen", value: `${aantalDoen}x`, inline: true },
      { name: "​", value: "​", inline: true },
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
    const regel = `**${i + 1}.** ${lijst[i].tekst}\n`;
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
      const doelLid = interaction.options.getMember("speler");
      let doelNaam = null;
      if (doelLid) {
        doelNaam = doelLid.displayName;
      } else if (beurtenLijst.length > 0) {
        doelNaam = getHuidigeSpelerNaam();
      }
      await interaction.reply({ embeds: [buildKiesEmbed(user, doelNaam)], components: [buildKiesButtons()] });
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
        await interaction.reply({ embeds: [buildWaarheidEmbed(vraag.tekst, user)], components: [buildActieButtons("waarheid")] });
      } else {
        const vraag = getVraag(waarheidVragen, gebruikteWaarheid);
        aantalWaarheid++;
        await interaction.reply({ embeds: [buildWaarheidEmbed(vraag.tekst, user)], components: [buildActieButtons("waarheid")] });
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
        await interaction.reply({ embeds: [buildDoenEmbed(opdracht.tekst, user)], components: [buildActieButtons("doen")] });
      } else {
        const opdracht = getVraag(doenOpdrachten, gebruikteDoen);
        aantalDoen++;
        await interaction.reply({ embeds: [buildDoenEmbed(opdracht.tekst, user)], components: [buildActieButtons("doen")] });
      }
      return;
    }

    if (interaction.commandName === "beurt") {
      const sub = interaction.options.getSubcommand();

      if (sub === "toevoegen") {
        const doelUser = interaction.options.getUser("speler");
        const doelLid = interaction.options.getMember("speler");
        const naam = doelLid?.displayName ?? doelUser.username;
        if (beurtenLijst.some(s => s.id === doelUser.id)) {
          await interaction.reply({ content: `**${naam}** staat al in de rotatie.`, ephemeral: true });
          return;
        }
        beurtenLijst.push({ id: doelUser.id, naam });
        await interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("✅ Speler toegevoegd")
            .setDescription(`**${naam}** is toegevoegd aan de rotatie.\n\n${buildBeurtenLijstTekst()}`)
            .setTimestamp()],
        });
        return;
      }

      if (sub === "verwijder") {
        const doelUser = interaction.options.getUser("speler");
        const idx = beurtenLijst.findIndex(s => s.id === doelUser.id);
        if (idx === -1) {
          await interaction.reply({ content: "Die speler staat niet in de rotatie.", ephemeral: true });
          return;
        }
        const verwijderd = beurtenLijst.splice(idx, 1)[0];
        if (huidigeBeurt >= beurtenLijst.length) huidigeBeurt = 0;
        await interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("✅ Speler verwijderd")
            .setDescription(`**${verwijderd.naam}** is verwijderd uit de rotatie.${beurtenLijst.length > 0 ? `\n\n${buildBeurtenLijstTekst()}` : ""}`)
            .setTimestamp()],
        });
        return;
      }

      if (sub === "lijst") {
        if (beurtenLijst.length === 0) {
          await interaction.reply({ content: "De rotatie is leeg. Voeg spelers toe met `/beurt toevoegen`.", ephemeral: true });
          return;
        }
        await interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle("🔄 Beurtrotatie")
            .setDescription(buildBeurtenLijstTekst())
            .setTimestamp()],
        });
        return;
      }

      if (sub === "reset") {
        beurtenLijst.length = 0;
        huidigeBeurt = 0;
        await interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("✅ Rotatie gewist")
            .setDescription("De beurtrotatie is gewist.")
            .setTimestamp()],
        });
        return;
      }

      if (sub === "volgende") {
        if (beurtenLijst.length === 0) {
          await interaction.reply({ content: "De rotatie is leeg.", ephemeral: true });
          return;
        }
        const volgende = advanceerBeurt();
        await interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle("🔄 Volgende speler")
            .setDescription(`Het is nu **${volgende.naam}**'s beurt!\n\n${buildBeurtenLijstTekst()}`)
            .setTimestamp()],
        });
        return;
      }
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
        waarheidVragen.push({ tekst, categorie: 'algemeen' });
      } else {
        doenOpdrachten.push({ tekst, categorie: 'algemeen' });
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

      const tekst = lijst[nummer - 1].tekst;

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffa500)
            .setTitle("⚠️ Bevestig verwijdering")
            .setDescription(`Weet je zeker dat je ${label} #${nummer} wilt verwijderen?\n\n> ${tekst}`)
            .setTimestamp(),
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`verwijder_ja_${type}_${nummer}`).setLabel("🗑️ Ja, verwijder").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("verwijder_nee").setLabel("❌ Annuleer").setStyle(ButtonStyle.Secondary)
          ),
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
      if (instellingen.dmModus || vraag.dmModus) {
        try {
          await interaction.user.send({ embeds: [buildWaarheidEmbed(vraag.tekst, user)] });
          await interaction.followUp({ content: `📩 Vraag verstuurd via DM aan **${user.displayName}**!`, components: [buildActieButtons("waarheid")] });
        } catch {
          await interaction.followUp({ embeds: [buildWaarheidEmbed(vraag.tekst, user)], components: [buildActieButtons("waarheid")] });
        }
      } else {
        await interaction.followUp({ embeds: [buildWaarheidEmbed(vraag.tekst, user)], components: [buildActieButtons("waarheid")] });
      }
      return;
    }

    if (interaction.customId === "kies_doen") {
      await interaction.update({ components: [buildDisabledKiesButtons()] });
      const opdracht = getVraag(doenOpdrachten, gebruikteDoen);
      aantalDoen++;
      if (instellingen.dmModus || opdracht.dmModus) {
        try {
          await interaction.user.send({ embeds: [buildDoenEmbed(opdracht.tekst, user)] });
          await interaction.followUp({ content: `📩 Opdracht verstuurd via DM aan **${user.displayName}**!`, components: [buildActieButtons("doen")] });
        } catch {
          await interaction.followUp({ embeds: [buildDoenEmbed(opdracht.tekst, user)], components: [buildActieButtons("doen")] });
        }
      } else {
        await interaction.followUp({ embeds: [buildDoenEmbed(opdracht.tekst, user)], components: [buildActieButtons("doen")] });
      }
      return;
    }

    if (interaction.customId === "kies_random") {
      await interaction.update({ components: [buildDisabledKiesButtons()] });
      if (Math.random() < 0.5) {
        const vraag = getVraag(waarheidVragen, gebruikteWaarheid);
        aantalWaarheid++;
        if (instellingen.dmModus || vraag.dmModus) {
          try {
            await interaction.user.send({ embeds: [buildWaarheidEmbed(vraag.tekst, user)] });
            await interaction.followUp({ content: `📩 Vraag verstuurd via DM aan **${user.displayName}**!`, components: [buildActieButtons("waarheid")] });
          } catch {
            await interaction.followUp({ embeds: [buildWaarheidEmbed(vraag.tekst, user)], components: [buildActieButtons("waarheid")] });
          }
        } else {
          await interaction.followUp({ embeds: [buildWaarheidEmbed(vraag.tekst, user)], components: [buildActieButtons("waarheid")] });
        }
      } else {
        const opdracht = getVraag(doenOpdrachten, gebruikteDoen);
        aantalDoen++;
        if (instellingen.dmModus || opdracht.dmModus) {
          try {
            await interaction.user.send({ embeds: [buildDoenEmbed(opdracht.tekst, user)] });
            await interaction.followUp({ content: `📩 Opdracht verstuurd via DM aan **${user.displayName}**!`, components: [buildActieButtons("doen")] });
          } catch {
            await interaction.followUp({ embeds: [buildDoenEmbed(opdracht.tekst, user)], components: [buildActieButtons("doen")] });
          }
        } else {
          await interaction.followUp({ embeds: [buildDoenEmbed(opdracht.tekst, user)], components: [buildActieButtons("doen")] });
        }
      }
      return;
    }

    if (interaction.customId === "reroll_waarheid") {
      registreerReroll(user);
      haalVraagUitEmbed(interaction.message.embeds[0]?.description, waarheidVragen, gebruikteWaarheid);
      const vraag = getVraag(waarheidVragen, gebruikteWaarheid);
      await interaction.deferUpdate();
      await interaction.message.delete();
      if (instellingen.dmModus || vraag.dmModus) {
        try {
          await interaction.user.send({ embeds: [buildWaarheidEmbed(vraag.tekst, user, true)] });
          await interaction.followUp({ content: `📩 Reroll verstuurd via DM aan **${user.displayName}**!`, components: [buildActieButtons("waarheid")] });
        } catch {
          await interaction.followUp({ embeds: [buildWaarheidEmbed(vraag.tekst, user, true)], components: [buildActieButtons("waarheid")] });
        }
      } else {
        await interaction.followUp({ embeds: [buildWaarheidEmbed(vraag.tekst, user, true)], components: [buildActieButtons("waarheid")] });
      }
      return;
    }

    if (interaction.customId === "reroll_doen") {
      registreerReroll(user);
      haalVraagUitEmbed(interaction.message.embeds[0]?.description, doenOpdrachten, gebruikteDoen);
      const opdracht = getVraag(doenOpdrachten, gebruikteDoen);
      await interaction.deferUpdate();
      await interaction.message.delete();
      if (instellingen.dmModus || opdracht.dmModus) {
        try {
          await interaction.user.send({ embeds: [buildDoenEmbed(opdracht.tekst, user, true)] });
          await interaction.followUp({ content: `📩 Reroll verstuurd via DM aan **${user.displayName}**!`, components: [buildActieButtons("doen")] });
        } catch {
          await interaction.followUp({ embeds: [buildDoenEmbed(opdracht.tekst, user, true)], components: [buildActieButtons("doen")] });
        }
      } else {
        await interaction.followUp({ embeds: [buildDoenEmbed(opdracht.tekst, user, true)], components: [buildActieButtons("doen")] });
      }
      return;
    }

    if (interaction.customId === "passen_waarheid") {
      haalVraagUitEmbed(interaction.message.embeds[0]?.description, waarheidVragen, gebruikteWaarheid);
      const vraag = getVraag(waarheidVragen, gebruikteWaarheid);
      await interaction.deferUpdate();
      await interaction.message.delete();
      if (instellingen.dmModus || vraag.dmModus) {
        try {
          await interaction.user.send({ embeds: [buildStrafWaarheidEmbed(vraag.tekst, user)] });
          await interaction.followUp({ content: `📩 Strafvraag verstuurd via DM aan **${user.displayName}**!`, components: [buildActieButtons("waarheid")] });
        } catch {
          await interaction.followUp({ embeds: [buildStrafWaarheidEmbed(vraag.tekst, user)], components: [buildActieButtons("waarheid")] });
        }
      } else {
        await interaction.followUp({ embeds: [buildStrafWaarheidEmbed(vraag.tekst, user)], components: [buildActieButtons("waarheid")] });
      }
      return;
    }

    if (interaction.customId === "passen_doen") {
      haalVraagUitEmbed(interaction.message.embeds[0]?.description, doenOpdrachten, gebruikteDoen);
      const opdracht = getVraag(doenOpdrachten, gebruikteDoen);
      await interaction.deferUpdate();
      await interaction.message.delete();
      if (instellingen.dmModus || opdracht.dmModus) {
        try {
          await interaction.user.send({ embeds: [buildStrafDoenEmbed(opdracht.tekst, user)] });
          await interaction.followUp({ content: `📩 Strafopdracht verstuurd via DM aan **${user.displayName}**!`, components: [buildActieButtons("doen")] });
        } catch {
          await interaction.followUp({ embeds: [buildStrafDoenEmbed(opdracht.tekst, user)], components: [buildActieButtons("doen")] });
        }
      } else {
        await interaction.followUp({ embeds: [buildStrafDoenEmbed(opdracht.tekst, user)], components: [buildActieButtons("doen")] });
      }
      return;
    }

    if (interaction.customId === "nieuwe_ronde") {
      let doelNaam = null;
      if (beurtenLijst.length > 0) {
        doelNaam = advanceerBeurt().naam;
      }
      await interaction.update({ components: [] });
      await interaction.followUp({ embeds: [buildKiesEmbed(user, doelNaam)], components: [buildKiesButtons()] });
      return;
    }

    if (interaction.customId.startsWith("verwijder_ja_")) {
      // customId formaat: verwijder_ja_{type}_{nummer}
      const parts = interaction.customId.split("_");
      const type = parts[2];
      const nummer = parseInt(parts[3]);
      const lijst = type === "waarheid" ? waarheidVragen : doenOpdrachten;
      const label = type === "waarheid" ? "waarheidsvraag" : "doe-opdracht";

      if (nummer > lijst.length) {
        await interaction.update({
          embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("❌ Niet gevonden").setDescription(`${label} #${nummer} bestaat niet meer.`).setTimestamp()],
          components: [],
        });
        return;
      }

      const verwijderd = lijst.splice(nummer - 1, 1)[0];
      gebruikteWaarheid.clear();
      gebruikteDoen.clear();
      const succes = slaVragenOp();

      await interaction.update({
        embeds: [
          new EmbedBuilder()
            .setColor(succes ? 0x57f287 : 0xed4245)
            .setTitle(succes ? "🗑️ Verwijderd" : "❌ Opslaan mislukt")
            .setDescription(
              succes
                ? `${label.charAt(0).toUpperCase() + label.slice(1)} #${nummer} verwijderd:\n\n> ${verwijderd.tekst}\n\n*(De nummers zijn opnieuw ingedeeld)*`
                : "De vraag is verwijderd maar kon niet worden opgeslagen naar `vragen.json`."
            )
            .setTimestamp(),
        ],
        components: [],
      });
      return;
    }

    if (interaction.customId === "verwijder_nee") {
      await interaction.update({
        embeds: [new EmbedBuilder().setColor(0x57f287).setTitle("✅ Geannuleerd").setDescription("De verwijdering is geannuleerd.").setTimestamp()],
        components: [],
      });
      return;
    }
  }
});

// ─── Admin API Server ──────────────────────────────────────────────────────────

const app = express();
const ADMIN_PORT = parseInt(process.env.ADMIN_PORT || "3001");
const DISCORD_API = "https://discord.com/api/v10";

// cors gebruikt config.frontendUrl op request-tijd zodat wijzigingen direct gelden
app.use(cors({ origin: (_, cb) => cb(null, config.frontendUrl), credentials: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || "changeme-zet-een-echt-secret-in-.env",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 },
}));

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Niet ingelogd" });
  next();
}

// ── Auth ──

app.get("/auth/login", (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "identify guilds",
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("Geen code ontvangen.");
  try {
    const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: "POST",
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: config.redirectUri,
      }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error("Geen access token ontvangen.");

    const [userRes, guildsRes] = await Promise.all([
      fetch(`${DISCORD_API}/users/@me`, { headers: { Authorization: `Bearer ${tokenData.access_token}` } }),
      fetch(`${DISCORD_API}/users/@me/guilds`, { headers: { Authorization: `Bearer ${tokenData.access_token}` } }),
    ]);
    const userData = await userRes.json();
    const guildsData = await guildsRes.json();

    // Toegang verlenen als de gebruiker ManageGuild heeft op een server waar de bot ook in zit
    const botGuildIds = new Set(client.guilds.cache.keys());
    const isAdmin = guildsData.some(
      g => botGuildIds.has(g.id) && (BigInt(g.permissions) & 0x20n) !== 0n
    );
    if (!isAdmin) return res.redirect(`${config.frontendUrl}?error=geen_toegang`);

    req.session.user = { id: userData.id, username: userData.username, avatar: userData.avatar };
    res.redirect(config.frontendUrl);
  } catch (err) {
    console.error("OAuth fout:", err);
    res.status(500).send("Authenticatie mislukt.");
  }
});

app.get("/auth/me", (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Niet ingelogd" });
  res.json(req.session.user);
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ── Vragen API ──

app.get("/api/vragen", requireAuth, (req, res) => {
  res.json({ waarheid: waarheidVragen, doen: doenOpdrachten });
});

app.post("/api/vragen", requireAuth, (req, res) => {
  const { type, tekst, categorie, dmModus } = req.body;
  if (!["waarheid", "doen"].includes(type) || !tekst?.trim()) {
    return res.status(400).json({ error: "Ongeldige invoer." });
  }
  const trimmed = tekst.trim();
  const cat = categorie?.trim() || 'algemeen';
  const vDM = typeof dmModus === 'boolean' ? dmModus : false;
  if (type === "waarheid") waarheidVragen.push({ tekst: trimmed, categorie: cat, dmModus: vDM });
  else doenOpdrachten.push({ tekst: trimmed, categorie: cat, dmModus: vDM });
  slaVragenOp();
  res.json({ ok: true });
});

app.put("/api/vragen/:type/:index", requireAuth, (req, res) => {
  const { type, index } = req.params;
  const { tekst, categorie, dmModus } = req.body;
  const lijst = type === "waarheid" ? waarheidVragen : type === "doen" ? doenOpdrachten : null;
  const idx = parseInt(index);
  if (!lijst || isNaN(idx) || idx < 0 || idx >= lijst.length || !tekst?.trim()) {
    return res.status(400).json({ error: "Ongeldige invoer." });
  }
  lijst[idx] = {
    tekst: tekst.trim(),
    categorie: categorie?.trim() || lijst[idx].categorie || 'algemeen',
    dmModus: typeof dmModus === 'boolean' ? dmModus : lijst[idx].dmModus ?? false,
  };
  slaVragenOp();
  res.json({ ok: true });
});

app.delete("/api/vragen/:type/:index", requireAuth, (req, res) => {
  const { type, index } = req.params;
  const lijst = type === "waarheid" ? waarheidVragen : type === "doen" ? doenOpdrachten : null;
  const idx = parseInt(index);
  if (!lijst || isNaN(idx) || idx < 0 || idx >= lijst.length) {
    return res.status(400).json({ error: "Ongeldige invoer." });
  }
  lijst.splice(idx, 1);
  gebruikteWaarheid.clear();
  gebruikteDoen.clear();
  slaVragenOp();
  res.json({ ok: true });
});

// ── Vragen export / import ──

function escapeCSV(val) {
  return `"${String(val).replace(/"/g, '""')}"`;
}

function parseCSVRow(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current); current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

app.get("/api/vragen/export", requireAuth, (req, res) => {
  const rows = [['type', 'tekst', 'categorie']];
  waarheidVragen.forEach(v => rows.push(['waarheid', v.tekst, v.categorie]));
  doenOpdrachten.forEach(v => rows.push(['doen', v.tekst, v.categorie]));
  const csv = rows.map(r => r.map(escapeCSV).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="vragen.csv"');
  res.send(csv);
});

app.post("/api/vragen/import", requireAuth, express.text({ type: '*/*' }), (req, res) => {
  try {
    const lines = req.body.trim().split(/\r?\n/);
    if (lines.length < 2) return res.status(400).json({ error: 'Bestand bevat geen data.' });
    const header = parseCSVRow(lines[0]).map(h => h.toLowerCase());
    const typeIdx = header.indexOf('type');
    const tekstIdx = header.indexOf('tekst');
    const catIdx = header.indexOf('categorie');
    if (typeIdx === -1 || tekstIdx === -1) {
      return res.status(400).json({ error: 'Kolommen "type" en "tekst" zijn verplicht.' });
    }
    let toegevoegd = 0;
    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVRow(lines[i]);
      const type = row[typeIdx]?.toLowerCase().trim();
      const tekst = row[tekstIdx]?.trim();
      const categorie = catIdx !== -1 ? (row[catIdx]?.trim() || 'algemeen') : 'algemeen';
      if (!tekst || !['waarheid', 'doen'].includes(type)) continue;
      if (type === 'waarheid') waarheidVragen.push({ tekst, categorie });
      else doenOpdrachten.push({ tekst, categorie });
      toegevoegd++;
    }
    slaVragenOp();
    res.json({ ok: true, toegevoegd });
  } catch {
    res.status(400).json({ error: 'Fout bij verwerken van bestand.' });
  }
});

// ── Statistieken API ──

app.get("/api/statistieken", requireAuth, (req, res) => {
  res.json({
    sessieStart,
    aantalWaarheid,
    aantalDoen,
    rerollTeller: Object.fromEntries(rerollTeller),
    waarheidTotaal: waarheidVragen.length,
    doenTotaal: doenOpdrachten.length,
  });
});

app.post("/api/reset", requireAuth, (req, res) => {
  gebruikteWaarheid.clear();
  gebruikteDoen.clear();
  resetStatistieken();
  res.json({ ok: true });
});

app.post("/api/reload", requireAuth, (req, res) => {
  const succes = laadVragen();
  res.json({ ok: succes });
});

// ── Instellingen API ──

app.get("/api/instellingen", requireAuth, (req, res) => {
  res.json(instellingen);
});

app.put("/api/instellingen", requireAuth, (req, res) => {
  const { cooldownMs, dmModus } = req.body;
  if (typeof cooldownMs === "number" && cooldownMs >= 0 && cooldownMs <= 10000) {
    instellingen.cooldownMs = cooldownMs;
  }
  if (typeof dmModus === "boolean") {
    instellingen.dmModus = dmModus;
  }
  slaInstellingenOp();
  res.json(instellingen);
});

// ── Configuratie API ──

app.get("/api/config", requireAuth, (req, res) => {
  res.json(config);
});

app.put("/api/config", requireAuth, (req, res) => {
  const { redirectUri, frontendUrl } = req.body;
  if (redirectUri && typeof redirectUri === "string") config.redirectUri = redirectUri.trim();
  if (frontendUrl && typeof frontendUrl === "string") config.frontendUrl = frontendUrl.trim();
  slaConfigOp();
  res.json(config);
});

// ── Statische bestanden (productie) ──

const adminDist = join(__dirname, "admin", "dist");
if (existsSync(adminDist)) {
  app.use(express.static(adminDist));
  app.get("*", (req, res) => res.sendFile(join(adminDist, "index.html")));
}

app.listen(ADMIN_PORT, () => {
  console.log(`✅ Admin panel API draait op http://localhost:${ADMIN_PORT}`);
});

// ─── Start ─────────────────────────────────────────────────────────────────────

client.login(process.env.DISCORD_TOKEN);
