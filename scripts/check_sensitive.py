#!/usr/bin/env python3
"""Scan op infrastructuurdetails en secrets in de repo.  scan:ignore-file

Gebruik:
  python scripts/check_sensitive.py --staged   # alleen toegevoegde regels in de staged diff
  python scripts/check_sensitive.py --all      # alle bestanden die git bijhoudt

Wat wordt gezocht:
  - IPv4- en IPv6-adressen (behalve loopback, 0.0.0.0 en documentatie-adressen
    uit RFC 5737 / RFC 3849)
  - interne hostnames (.local, .lan, .internal, .home, .localdomain, .home.arpa, ...)
  - MAC-adressen
  - secrets: Discord-webhook-URL's, Discord-bottokens, GitHub-tokens, private keys,
    een .env-bestand
  - eigen termen (servernamen e.d.) uit `.sensitive-terms` in de repo-root
    (één per regel, staat niet in git) of uit de omgevingsvariabele
    SENSITIVE_TERMS (voor CI, één term per regel)

Uitzonderingen:
  - een regel met `scan:ignore` erin wordt overgeslagen
  - een bestand met `scan:ignore-file` in de eerste 5 regels wordt overgeslagen

De gevonden waarde zelf wordt nooit getoond (logs kunnen publiek worden),
alleen het bestand, de regel en het soort treffer.
Exitcode 1 bij treffers, 0 als alles schoon is.
"""
from __future__ import annotations

import argparse
import ipaddress
import os
import re
import subprocess
import sys
from pathlib import Path

DOC_NETWERKEN = [
    ipaddress.ip_network(n)
    for n in ("192.0.2.0/24", "198.51.100.0/24", "203.0.113.0/24", "2001:db8::/32")
]

RE_IPV4 = re.compile(r"(?<![\d.])(\d{1,3}(?:\.\d{1,3}){3})(?![\d.])")
RE_IPV6 = re.compile(r"(?<![0-9A-Za-z_:])((?:[0-9A-Fa-f]{0,4}:){2,7}[0-9A-Fa-f]{0,4})(?![0-9A-Za-z_:])")
RE_HOST = re.compile(
    r"\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\."
    r"(?:local|lan|internal|home|localdomain|intranet|corp|home\.arpa)\b(?!\(|\.[a-z])",
    re.IGNORECASE,
)
RE_IMPORT = re.compile(r"^\s*(?:from|import)\s+[\w.]+")  # Python-imports als werkzeug.local
RE_URL_FOR = re.compile(r"url_for\(\s*['\"]$")  # Flask-endpoints als public.home
RE_MAC = re.compile(r"\b[0-9A-Fa-f]{2}(?:[:-][0-9A-Fa-f]{2}){5}\b")
SECRETS = {
    "Discord-webhook": re.compile(r"discord(?:app)?\.com/api/webhooks/\d+/[\w-]+", re.IGNORECASE),
    "Discord-bottoken": re.compile(r"\b[A-Za-z\d]{24,28}\.[\w-]{6}\.[\w-]{27,40}\b"),
    "GitHub-token": re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b"),
    "private key": re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
}


def ip_toegestaan(tekst: str) -> bool | None:
    """True = toegestaan, False = treffer, None = geen geldig IP-adres."""
    try:
        ip = ipaddress.ip_address(tekst)
    except ValueError:
        return None
    if ip.is_loopback or ip.is_unspecified:
        return True
    return any(ip.version == n.version and ip in n for n in DOC_NETWERKEN)


def laad_termen(root: Path) -> list[str]:
    termen: list[str] = []
    bestand = root / ".sensitive-terms"
    if bestand.exists():
        termen += bestand.read_text(encoding="utf-8").splitlines()
    termen += os.environ.get("SENSITIVE_TERMS", "").splitlines()
    return [t.strip().lower() for t in termen if t.strip() and not t.startswith("#")]


def scan_regel(regel: str, termen: list[str]) -> list[str]:
    if "scan:ignore" in regel:
        return []
    soorten: list[str] = []
    for m in RE_IPV4.finditer(regel):
        if ip_toegestaan(m.group(1)) is False:
            soorten.append("IPv4-adres")
    for m in RE_IPV6.finditer(regel):
        if m.group(1).count(":") >= 2 and ip_toegestaan(m.group(1)) is False:
            soorten.append("IPv6-adres")
    if not RE_IMPORT.match(regel) and any(
        not RE_URL_FOR.search(regel[: m.start()]) for m in RE_HOST.finditer(regel)
    ):
        soorten.append("interne hostname")
    if RE_MAC.search(regel):
        soorten.append("MAC-adres")
    for naam, patroon in SECRETS.items():
        if patroon.search(regel):
            soorten.append(naam)
    laag = regel.lower()
    if any(t in laag for t in termen):
        soorten.append("eigen term uit .sensitive-terms")
    return soorten


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], capture_output=True, text=True, encoding="utf-8", errors="replace", check=True
    ).stdout


def is_env_bestand(pad: str) -> bool:
    naam = Path(pad).name
    return naam == ".env" or (naam.startswith(".env.") and naam != ".env.example")


def scan_staged(eigen_pad: str, termen: list[str]) -> list[str]:
    treffers: list[str] = []
    for pad in git("diff", "--cached", "--name-only", "--diff-filter=AM").splitlines():
        if is_env_bestand(pad):
            treffers.append(f"{pad}: .env-bestand mag niet in git")
    diff = git("diff", "--cached", "--unified=0", "--no-color", "--diff-filter=AM")
    pad, regelnr, overslaan = None, 0, False
    for regel in diff.splitlines():
        if regel.startswith("+++ "):
            pad = regel[6:] if regel.startswith("+++ b/") else None
            overslaan = pad in (None, eigen_pad) or bevat_ignore_file(pad)
            continue
        if regel.startswith("@@"):
            m = re.search(r"\+(\d+)", regel)
            regelnr = int(m.group(1)) if m else 0
            continue
        if regel.startswith("+") and pad and not overslaan:
            for soort in scan_regel(regel[1:], termen):
                treffers.append(f"{pad}:{regelnr}: {soort}")
            regelnr += 1
    return treffers


def bevat_ignore_file(pad: str) -> bool:
    try:
        with open(pad, encoding="utf-8", errors="ignore") as f:
            kop = [next(f, "") for _ in range(5)]
    except OSError:
        return False
    return any("scan:ignore-file" in r for r in kop)


def scan_alles(eigen_pad: str, termen: list[str]) -> list[str]:
    treffers: list[str] = []
    for pad in git("ls-files").splitlines():
        if is_env_bestand(pad):
            treffers.append(f"{pad}: .env-bestand mag niet in git")
            continue
        if pad == eigen_pad or bevat_ignore_file(pad):
            continue
        try:
            data = Path(pad).read_bytes()
        except OSError:
            continue
        if b"\0" in data[:8192] or len(data) > 2_000_000:
            continue  # binair of te groot
        for nr, regel in enumerate(data.decode("utf-8", errors="replace").splitlines(), 1):
            for soort in scan_regel(regel, termen):
                treffers.append(f"{pad}:{nr}: {soort}")
    return treffers


def main() -> int:
    parser = argparse.ArgumentParser(description="Scan op infrastructuurdetails en secrets.")
    groep = parser.add_mutually_exclusive_group(required=True)
    groep.add_argument("--staged", action="store_true", help="alleen de staged wijzigingen")
    groep.add_argument("--all", action="store_true", help="alle bestanden in git")
    args = parser.parse_args()

    root = Path(git("rev-parse", "--show-toplevel").strip())
    os.chdir(root)
    eigen_pad = Path(__file__).resolve().relative_to(root).as_posix()
    termen = laad_termen(root)

    treffers = scan_staged(eigen_pad, termen) if args.staged else scan_alles(eigen_pad, termen)
    if treffers:
        print(f"Gevoelige data gevonden ({len(treffers)}):")
        for t in treffers:
            print(f"  {t}")
        return 1
    print("Scan op gevoelige data: schoon.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
