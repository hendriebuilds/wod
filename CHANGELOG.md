# Changelog

All notable changes to this project are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.11.0] - 2026-10-23

### Added
- Optional `PANEL_URL` environment variable: on the first start the bot creates `config.json` from it, so self-hosting needs no hand-written config file.
- `config.example.json` and an English `.env.example` with every environment variable.
- MIT license, `SECURITY.md` and this changelog.
- README in English (`README.md`) and Dutch (`README.nl.md`).
- CI on every pull request and push to `main`: a scan for sensitive data and a syntax check of the bot.
- Dependabot for the npm packages of the bot and the panel and for GitHub Actions.

### Changed
- `config.json` now lives in the data folder (`/app/data/config.json` in the container) and is no longer part of the image or the repository. Changes made in the panel under Configuration survive an update.
- The Docker image declares `VOLUME /app/data` and sets `DATA_DIR=/app/data`.
- Creating category folders on a server without questions now says to add questions first.
- `PANEL_URL` must be an `http` or `https` URL without `?` or `#`; otherwise the bot stops with a clear message.
- An invalid `config.json` in the data folder stops the bot with a clear message instead of silently falling back to `localhost`.
- The GitHub Release of a version uses its section from this changelog.
- All GitHub Actions are pinned to a full commit SHA.

### Fixed
- Saving under Configuration reported success even when `config.json` could not be written.
- Error messages in the panel for creating category folders and leaving a server no longer show technical details from Discord.

### Upgrading
The image no longer contains `config.json`. First check whether `config.json` has a mount of its own:

```sh
docker inspect <CONTAINER> --format '{{range .Mounts}}{{.Destination}} <- {{.Source}}{{println}}{{end}}'
```

If `/app/config.json` is in the list, the file is mounted separately: keep that mount for this update (second option below). If only `/app/data` is listed, the file exists only inside the old image and disappears with the update: use the first or third option. Do one of these before you update:
- **Recommended:** set `PANEL_URL` to the URL of your panel (without a trailing `/`). On the first start the bot creates `config.json` in the data folder and logs `Configuratie aangemaakt vanuit PANEL_URL`.
- If you mounted your own `config.json` on `/app/config.json`, keep the mount for this update. The bot copies it into the data folder on the first start and logs `Configuratie overgenomen uit het oude config.json en opgeslagen in de datamap`. Remove the old mount only after a restart logs `Configuratie geladen uit de datamap`.
- Or copy the current file into the data folder yourself: `docker cp <CONTAINER>:/app/config.json <DATA-FOLDER>/config.json`, where `<DATA-FOLDER>` is the host folder mounted on `/app/data` (it also holds `bot.db`). Check that `redirectUri` and `frontendUrl` in the copied file are the URLs of your own panel: the bot does not check a `config.json` in the data folder for placeholders.

Without `config.json` and without `PANEL_URL`, the panel falls back to `http://localhost:3001` and logging in through your own URL stops working. Once `config.json` is in the data folder, the log says `Configuratie geladen uit de datamap`.

## [1.10.1] - 2026-10-04

### Added
- `/voeg-toe` has a required `categorie` option.
- `GET /health` and a Docker `HEALTHCHECK`.
- Graceful shutdown on `SIGTERM`/`SIGINT`: sessions are saved and the web server, Discord connection and database are closed.

### Changed
- The default category is `algemeen`. Categories are validated in the panel, the API, the CSV import and `/voeg-toe`; unknown categories are marked in the panel.
- Questions are limited to 500 characters and statements to 300. Longer existing texts are shortened when shown.
- The image runs with `NODE_ENV=production`, and API errors are always returned as JSON.

### Fixed
- Database migrations of player levels ran in the wrong order.
- Duplicate questions were cleaned up again on every start.
- The import message in the panel was not translated.

## [1.10.0] - 2026-09-28

### Changed
- Only the player of a round can use its buttons. Starting a round with `/wod` no longer gives points; choosing truth, dare or random does.
- After "Nieuwe ronde" the bot shows who answered and whose turn it is now. Without a turn rotation the round is open to the first player who chooses.
- A channel linked to a category only shows questions from that category, also for numbered questions and in DM mode.
- `/nooit` gives points once per vote, `/relatietest` once per pair per day.
- Achievements match the eight levels and were corrected once for existing players; "Lafaard" is now called "Schijterd".
- Panel sessions survive a restart, and the panel is protected against CSRF.

### Added
- `/strafpunten` for admins to deduct 1 to 100 points.

## [1.9.3] - 2026-09-28

### Changed
- An error in a command or button shows a message instead of crashing the bot.
- The cooldown shows a message and applies per server.
- Admin commands and buttons check the *Manage Server* permission themselves.
- The Configuration page and its API are limited to superadmins.
- Safer panel login: secure session cookie, OAuth `state` and a new session ID after logging in.

### Fixed
- Level-up messages after "Nieuwe ronde" and `/nooit` appear again.

## Earlier versions

Earlier versions were not tracked in this changelog.
