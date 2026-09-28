# Fase 1 — Build en repo op orde (GitHub Actions)

> Eerste fase van v1.10.0. Daarmee wordt v1.10.0 al door GitHub Actions gebouwd en gepusht, en is `build-and-push.sh` alleen nog een noodoptie. `VERSION` blijft in deze fase op `1.9.3`.

## Doel
GitHub bouwt het Docker-image en pusht het naar GHCR zodra er een nieuwe `VERSION` op `main` staat. Het image komt daardoor altijd uit de gepushte code. Bij elke push en pull request controleert GitHub ook of het panel bouwt en of de versienummers kloppen. Daarnaast wordt de repo opgeschoond: lock files erin (en overal `npm ci`), `admin/node_modules` en `admin/dist` eruit, en een volledige `.dockerignore`.

## Bestanden
- `.github/workflows/docker.yml`: **nieuw**
- `package-lock.json`, `admin/package-lock.json`: **nieuw** (gegenereerd)
- `.gitignore`: aangepast (lock files niet meer negeren)
- `.dockerignore`: aangepast (aangevuld)
- `build-and-push.sh`: aangepast (versie uit `VERSION`, noodoptie)
- `Dockerfile`: aangepast (OCI-label, `npm ci`)
- `admin/node_modules/`, `admin/dist/`: uit git (niet van schijf)
- `README.md`: aangepast (sectie Deployment, lokaal starten)
- `CLAUDE.md`: aangepast (werkwijze en commando's)

## Hoe het werkt

| Gebeurtenis | Job `check` | Job `release` |
|---|---|---|
| Push naar `main`, **`VERSION` nieuw** (tag `v<VERSION>` bestaat nog niet) | ✅ | ✅ bouwt, pusht `:<versie>` en `:latest`, maakt git-tag `v<versie>` |
| Push naar `main`, `VERSION` ongewijzigd (tag bestaat al) | ✅ | ⏭️ slaat over |
| Pull request | ✅ | ⏭️ |
| Handmatig (*Run workflow*) met `force: true` | ✅ | ✅ bouwt opnieuw, zonder bestaande tag aan te passen |

"Nieuwe VERSION" betekent hier: er bestaat nog geen git-tag `v<VERSION>`. Zo bouwt een tussentijdse push nooit per ongeluk opnieuw, en bouwt een vergeten versie alsnog bij de volgende push.

## Stappen

### 1. Workflow `.github/workflows/docker.yml`

```yaml
name: Docker image

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:
    inputs:
      force:
        description: 'Bouw opnieuw, ook als de tag al bestaat'
        type: boolean
        default: false

concurrency:
  group: docker-${{ github.ref }}
  cancel-in-progress: false

env:
  IMAGE: ghcr.io/hendriebuilds/wod

jobs:
  check:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    outputs:
      version: ${{ steps.versie.outputs.version }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: admin/package-lock.json

      - name: VERSION gelijk aan package.json
        id: versie
        run: |
          V=$(tr -d '[:space:]' < VERSION)
          P=$(node -p "require('./package.json').version")
          echo "VERSION=$V, package.json=$P"
          if ! echo "$V" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
            echo "::error::VERSION is geen geldig versienummer: '$V'"; exit 1
          fi
          if [ "$V" != "$P" ]; then
            echo "::error::VERSION ($V) en package.json ($P) verschillen"; exit 1
          fi
          echo "version=$V" >> "$GITHUB_OUTPUT"

      - name: Syntaxcontrole bot
        run: |
          node --check index.js
          find src -name '*.js' -print0 | xargs -0 -n1 node --check

      - name: Panel bouwen
        working-directory: admin
        run: |
          npm ci --no-audit --no-fund
          npm run build

  release:
    needs: check
    if: github.event_name != 'pull_request' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      contents: write     # git-tag aanmaken
      packages: write     # pushen naar GHCR
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # tags ophalen

      - name: Moet er gebouwd worden?
        id: nodig
        env:
          V: ${{ needs.check.outputs.version }}
          FORCE: ${{ inputs.force }}
        run: |
          if git rev-parse -q --verify "refs/tags/v$V" >/dev/null; then
            if [ "$FORCE" = "true" ]; then
              echo "Tag v$V bestaat, maar force staat aan: opnieuw bouwen."
              echo "bouwen=true" >> "$GITHUB_OUTPUT"
              echo "tag=false" >> "$GITHUB_OUTPUT"
            else
              echo "Tag v$V bestaat al: niets te bouwen."
              echo "bouwen=false" >> "$GITHUB_OUTPUT"
            fi
          else
            echo "Nieuwe versie v$V: bouwen."
            echo "bouwen=true" >> "$GITHUB_OUTPUT"
            echo "tag=true" >> "$GITHUB_OUTPUT"
          fi

      - uses: docker/setup-buildx-action@v3
        if: steps.nodig.outputs.bouwen == 'true'

      - uses: docker/login-action@v3
        if: steps.nodig.outputs.bouwen == 'true'
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/build-push-action@v6
        if: steps.nodig.outputs.bouwen == 'true'
        with:
          context: .
          push: true
          tags: |
            ${{ env.IMAGE }}:${{ needs.check.outputs.version }}
            ${{ env.IMAGE }}:latest
          labels: |
            org.opencontainers.image.version=${{ needs.check.outputs.version }}
            org.opencontainers.image.revision=${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Git-tag aanmaken
        if: steps.nodig.outputs.tag == 'true'
        env:
          V: ${{ needs.check.outputs.version }}
        run: |
          git tag "v$V" "$GITHUB_SHA"
          git push origin "v$V"

      - name: Samenvatting
        if: steps.nodig.outputs.bouwen == 'true'
        run: |
          echo "### 🐳 ${IMAGE}:${{ needs.check.outputs.version }} gepusht (ook :latest)" >> "$GITHUB_STEP_SUMMARY"
```

Opmerkingen voor Claude Code:
- De lock files komen in deze fase in git (stap 2), dus de workflow gebruikt `npm ci`. Doe stap 2 vóór de eerste push, anders faalt `check`.
- Het image wordt alleen voor `linux/amd64` gebouwd. Dat is genoeg voor Unraid.
- Gebruik geen extra secrets. `GITHUB_TOKEN` volstaat, mits de package-instelling uit stap 7 goed staat.
- Zet geen infrastructuurdetails in de workflow (harde regel 1).

### 2. Lock files, `.gitignore` en git opschonen
1. Haal in `.gitignore` de regels `package-lock.json` en `admin/package-lock.json` (en het commentaar erboven) weg.
2. Draai `npm install` in de root en in `admin/`. Dat maakt beide lock files aan. Commit ze.
3. Haal de per ongeluk gecommitte mappen uit git, niet van schijf:
   ```sh
   git rm -r --cached admin/node_modules admin/dist
   ```
   Ze staan al in `.gitignore`, dus ze komen niet terug. (Nu staan er ruim 2200 bestanden uit `admin/node_modules` in git.)
4. Controleer daarna: `cd admin && npm run build` werkt, en `node index.js` start lokaal.

### 3. `Dockerfile`: `npm ci` en OCI-label
- Stage 1 (panel):
  ```dockerfile
  COPY admin/package.json admin/package-lock.json ./
  RUN npm ci --no-audit --no-fund
  ```
- Stage 2 (bot):
  ```dockerfile
  COPY package.json package-lock.json ./
  RUN npm ci --omit=dev --no-audit --no-fund
  ```
- Voeg in de laatste stage toe:
  ```dockerfile
  LABEL org.opencontainers.image.source="https://github.com/hendriebuilds/wod"
  ```
  Daarmee koppelt GHCR het package aan de repo, en krijgt de workflow via `GITHUB_TOKEN` toegang.

### 4. `.dockerignore` aanvullen
Het bestand bestaat al met de juiste naam (het backlog-item "heet geen `.dockerignore`" klopt niet meer). Vul het aan tot:
```
node_modules
admin/node_modules
admin/dist
.git
.github
.env
.env.*
data
*.db
*.db-shm
*.db-wal
updateplannen
errorcodes
```
`config.json` blijft buiten `.dockerignore`, want de `Dockerfile` kopieert hem nog (zie backlog "`config.json` buiten het image").

### 5. `build-and-push.sh` als noodoptie
- Versie uit `VERSION` in plaats van `package.json`: `VERSION=$(tr -d '[:space:]' < VERSION)`.
- Zet bovenaan een commentaar: `# Noodoptie. Normaal bouwt GitHub Actions het image (.github/workflows/docker.yml).`
- De uitgebreide controles (repo schoon, alles gepusht) horen bij het backlog-item "`build-and-push.sh` volgens de standaard" en blijven buiten deze fase. Eén controle kan er wel meteen bij, omdat hij klein is: stop als `VERSION` en `package.json` verschillen.

### 6. Bestaande versie taggen (eenmalig, vóór de eerste push met de workflow)
Er bestaan nog geen git-tags. Maak de tag voor de huidige release aan, zodat de workflow v1.9.3 niet opnieuw bouwt:
```sh
git tag v1.9.3 54c42c7
git push origin v1.9.3
```
Controleer eerst met `git log --oneline` dat `54c42c7` de commit `v1.9.3 — veiligheid & stabiliteit` is.

### 7. Toegang tot het package op GHCR (handmatig, door Hendrie)
Het package `ghcr.io/hendriebuilds/wod` is eerder vanaf een eigen machine gepusht. De workflow mag er pas in schrijven als de repo toegang heeft:
1. Ga op GitHub naar het package `wod` (profiel of organisatie `hendriebuilds` → *Packages*).
2. *Package settings* → *Manage Actions access* → *Add repository* → `hendriebuilds/wod`, rol **Write**.
3. Controleer onder de repo → *Settings* → *Actions* → *General* → *Workflow permissions* dat workflows tags mogen pushen. De `permissions` in de workflow regelen de rest.

Claude Code kan dit niet zelf doen. Vermeld het in de samenvatting als open actiepunt.

### 8. Werkwijze bijwerken in `CLAUDE.md`
(Hieronder gaan "stap 7" en "stap 8" over de werkwijze in `CLAUDE.md`, niet over dit plan.)
- Stap 7, bullet over `VERSION`, wordt:
  `Werk VERSION en package.json alleen bij in de laatste fase van een versie. Een nieuwe VERSION op main start de build van het image.`
- Stap 8 wordt:
  `Het image wordt gebouwd door GitHub Actions (.github/workflows/docker.yml) zodra een nieuwe VERSION op main staat. Controleer na de push onder Actions of de workflow groen is en meld het resultaat in de samenvatting. build-and-push.sh is alleen een noodoptie als Actions niet werkt, en dan pas als alles gecommit en gepusht is.`
- Voeg toe aan stap 7: `Commits van tussenliggende fases heten v<versie> (fase N/M) — <omschrijving>.`
- "Commando's": `npm install` → `npm ci` (root en `admin/`); `npm install` alleen bij het toevoegen of bijwerken van een package, en dan de lock file meecommitten. Voeg toe:
  `gh run list --workflow docker.yml   # status van de image-builds (als gh beschikbaar is)`
  en bij lokaal starten: `node index.js` heeft een gebouwd panel nodig (`cd admin && npm run build`).
- Voeg `.github/workflows/docker.yml`, `package-lock.json`, `admin/package-lock.json` en `.dockerignore` toe aan de lijst bij "Structuur".

### 9. README
Sectie over bouwen en deployen:
- Het image wordt automatisch gebouwd bij een nieuwe `VERSION` op `main`, met tags `:<versie>` en `:latest`.
- Opnieuw bouwen kan via *Actions* → *Docker image* → *Run workflow* met `force`.
- `build-and-push.sh` is een noodoptie.
- Lokaal ontwikkelen: `npm ci` in root en `admin/`, panel bouwen, dan `node index.js`.

## Databasewijzigingen
Geen.

## Klaar als
- [ ] `.github/workflows/docker.yml` bestaat met de jobs `check` en `release`.
- [ ] `check` faalt als `VERSION` en `package.json` verschillen, als een JS-bestand een syntaxfout heeft of als het panel niet bouwt.
- [ ] `release` draait alleen op `main`, bouwt alleen als tag `v<VERSION>` nog niet bestaat (of met `force`), pusht `:<versie>` en `:latest`, en maakt daarna de tag aan.
- [ ] Tag `v1.9.3` staat op GitHub.
- [ ] De `Dockerfile` heeft het label `org.opencontainers.image.source` en gebruikt in beide stages `npm ci` met de lock file.
- [ ] `package-lock.json` en `admin/package-lock.json` staan in git; `.gitignore` negeert ze niet meer.
- [ ] `git ls-files admin/node_modules admin/dist` geeft niets terug.
- [ ] `.dockerignore` bevat de lijst uit stap 4.
- [ ] `docker build .` lukt lokaal (als Docker beschikbaar is), anders is `check` in Actions groen.
- [ ] `build-and-push.sh` leest `VERSION` en is gemarkeerd als noodoptie.
- [ ] `CLAUDE.md` en `README.md` beschrijven de nieuwe werkwijze.
- [ ] `VERSION` staat nog op `1.9.3`. Commit: `v1.10.0 (fase 1/5) — build via GitHub Actions, lock files`.
- [ ] De samenvatting noemt stap 7 (package-toegang) als actiepunt voor Hendrie.

## Teststappen
1. **Package-toegang:** voer stap 7 uit vóór de eerste push met de workflow.
2. **Tussentijdse push:** push de commit van deze fase met `VERSION` nog op `1.9.3`. Onder *Actions* is `check` groen en slaat `release` het bouwen over ("Tag v1.9.3 bestaat al").
3. **Foute versie:** zet op een testbranch `VERSION` op `9.9.9` zonder `package.json` aan te passen en open een pull request. `check` wordt rood met de melding dat ze verschillen. Sluit de PR daarna zonder te mergen.
4. **Repo:** op GitHub staan `admin/node_modules` en `admin/dist` niet meer, de twee lock files wel.
5. **Echte release** (pas in fase 5): bij de laatste fase van de versie wordt `VERSION` opgehoogd en gepusht. `release` bouwt en pusht het image, en de git-tag `v<versie>` verschijnt onder *Tags*. Onder *Packages* → `wod` staan `<versie>` en `latest`.
6. **Deploy** (na fase 5): op Unraid → *Docker* → *Check for updates* → update de container. De bot start, en in het panel en in Discord werkt alles zoals voorheen.
7. **Noodoptie:** `./build-and-push.sh` toont de versie uit `VERSION`. Je hoeft niet te pushen, afbreken na de eerste regel is genoeg.
