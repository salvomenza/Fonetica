import os
import re
import json
import urllib.request
import urllib.parse
from flask import Flask, request, jsonify
from flask_cors import CORS
import anthropic

app = Flask(__name__)
CORS(app)

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

# ─────────────────────────────────────────────
# WIKTIONARY
# ─────────────────────────────────────────────

def get_wiktionary_ipa(word):
    """Fetch IPA for an Italian word from English Wiktionary. Returns raw IPA string or None."""
    encoded = urllib.parse.quote(word.lower())
    url = f"https://en.wiktionary.org/w/api.php?action=parse&page={encoded}&prop=wikitext&format=json"
    req = urllib.request.Request(url, headers={"User-Agent": "FoneticaItaliana/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            data = json.loads(r.read().decode())
    except Exception:
        return None

    if "parse" not in data:
        return None

    wikitext = data["parse"]["wikitext"]["*"]

    # Find Italian section
    it_section = re.search(
        r"==Italian==(.*?)(?:\n==[^=]|\Z)", wikitext, re.DOTALL
    )
    if not it_section:
        return None

    it_text = it_section.group(1)

    # Extract IPA
    ipa_matches = re.findall(r"\{\{IPA\|it\|([^}]+)\}\}", it_text)
    if not ipa_matches:
        return None

    # Take first match, strip slashes/brackets
    raw = ipa_matches[0].split("|")[0]
    raw = raw.strip("/[]")
    return raw


def parse_wiktionary_ipa(ipa_str, word):
    """
    Parse a Wiktionary IPA string and extract:
    - stress position (primary ˈ)
    - vowel qualities (ɛ/e, ɔ/o)
    - s/z voicing
    Returns a dict with keys: ipa, vowels, sz
    """
    if not ipa_str:
        return None

    result = {
        "word": word,
        "ipa_raw": ipa_str,
        "has_epsilon": "ɛ" in ipa_str,
        "has_open_o": "ɔ" in ipa_str,
        "has_voiced_s": "z" in ipa_str and "dz" not in ipa_str,
        "has_voiced_z": "dz" in ipa_str,
        "has_voiceless_z": "ts" in ipa_str,
        "source": "wiktionary",
    }
    return result


# ─────────────────────────────────────────────
# CLAUDE
# ─────────────────────────────────────────────

ORACLE_SYSTEM = """Sei un esperto di fonetica italiana. Ti viene chiesto di fornire informazioni fonologiche su una parola italiana.

Per la parola fornita, rispondi SOLO con JSON valido (nessun testo, nessun backtick):
{
  "word": "parola",
  "stressed_vowel_index": <indice 0-based della vocale tonica nella parola, contando solo le vocali>,
  "syllables": ["sil", "la", "be"],
  "vowel_qualities": {"e": "chiusa"|"aperta", "o": "chiusa"|"aperta"},
  "sz": {"s_intervocalic": "sorda"|"sonora"|null, "z": "sorda"|"sonora"|null},
  "source": "claude"
}
vowel_qualities: includi solo le vocali medie (e, o) presenti in sillaba tonica.
sz: includi solo se la parola ha s o z in posizione intervocalica."""

CORRECTOR_SYSTEM = """Sei un esperto di fonetica italiana. Valuta la trascrizione IPA di uno studente universitario di linguistica.

CONVENZIONI OBBLIGATORIE:
- Parentesi quadre [...]
- Sillabe separate da punto .
- Accento primario ˈ su tutte le parole polisillabiche (incluse parole grammaticali polisillabiche)
- Clitici monosillabici (articoli det. monosill., preposizioni semplici monosill., pronomi clitici): nessun accento primario, possono ricevere ˌ
- Accento secondario ˌ per valli accentuali (3+ sillabe atone consecutive tra due accenti primari)
- Scontro accentuale: la prima tonica perde l'accento, nessun simbolo aggiunto
- Frase come parola continua salvo virgola e punto che introducono pausa
- Due vocali atone contigue tra parole si fondono in una sola sillaba
- Vocali atone: sempre e o chiuse
- AUTOGEMINAZIONE: ʃ→ʃʃ, ʎ→ʎʎ, ɲ→ɲɲ, ts→tts, dz→ddz SEMPRE (anche in posizione iniziale assoluta), TRANNE se in nesso consonantico
- tʃ e dʒ NON si autogeminano
- Raddoppio affricato: solo fase occlusiva → tts, ddz
- Vocali lunghe: ː (cronema)
- Consonanti lunghe: simbolo doppio
- r: scempia o doppia come nell'ortografia
- Approssimanti: j w
- Raddoppiamento fonosintattico tra parole: sì
- Assimilazioni cross-word obbligatorie: n→m davanti labiale, n→ŋ davanti velare
- h muta
- Vocali toniche e s/z intervocaliche: secondo le informazioni fornite nel messaggio (fonte: dizionario)

Rispondi SOLO con JSON valido (nessun testo, nessun backtick):
{
  "trascrizione_corretta": "...",
  "esito": "corretto"|"parzialmente_corretto"|"errato",
  "errori": [{"tipo":"...","studente":"...","atteso":"...","spiegazione":"..."}],
  "fenomeni": [{"nome":"...","descrizione":"..."}],
  "commento_generale": "..."
}"""

GENERATOR_SYSTEM = """Sei un esperto di fonetica italiana e generatore di frasi didattiche."""

def call_claude(messages, system="", max_tokens=1000):
    if not ANTHROPIC_API_KEY:
        raise ValueError("ANTHROPIC_API_KEY non configurata")
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=max_tokens,
        system=system,
        messages=messages,
    )
    return response.content[0].text.strip()


def parse_json_response(raw):
    cleaned = re.sub(r"```json|```", "", raw).strip()
    return json.loads(cleaned)


# ─────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "claude_available": bool(ANTHROPIC_API_KEY)})


@app.route("/api/lookup", methods=["POST"])
def lookup():
    """
    Look up phonological info for a list of words.
    Uses Wiktionary first, Claude as fallback.
    Returns per-word info or a list of words needing user input.
    """
    data = request.get_json()
    words = data.get("words", [])
    results = []
    needs_user_input = []

    for word in words:
        word_clean = re.sub(r"[^\w]", "", word.lower())
        if not word_clean:
            continue

        # Try Wiktionary
        ipa_raw = get_wiktionary_ipa(word_clean)
        if ipa_raw:
            info = parse_wiktionary_ipa(ipa_raw, word_clean)
            results.append(info)
            continue

        # Try Claude
        if ANTHROPIC_API_KEY:
            try:
                raw = call_claude(
                    [{"role": "user", "content": f"Parola: {word_clean}"}],
                    system=ORACLE_SYSTEM,
                    max_tokens=300,
                )
                info = parse_json_response(raw)
                info["source"] = "claude"
                results.append(info)
                continue
            except Exception:
                pass

        # Neither worked — needs user input
        needs_user_input.append(word_clean)

    return jsonify({"results": results, "needs_user_input": needs_user_input})


@app.route("/api/generate", methods=["POST"])
def generate():
    """Generate a bizarre Italian sentence with required phonological features."""
    if not ANTHROPIC_API_KEY:
        return jsonify({"error": "claude_unavailable"}), 503

    try:
        raw = call_claude(
            [{
                "role": "user",
                "content": (
                    "Genera UNA frase in italiano con queste caratteristiche obbligatorie:\n"
                    "1. Almeno un raddoppiamento fonosintattico\n"
                    "2. Almeno un caso di autogeminazione (tra: ʃ ʎ ɲ ts dz)\n"
                    "3. Almeno due assimilazioni di nasale tra parole "
                    "(n→m davanti labiale, n→ŋ davanti velare)\n"
                    "4. Almeno due consonanti con trascrizione fonetica diversa "
                    "da quella ortografica\n"
                    "5. BIZZARRA, surreale, assurda, divertente al massimo. "
                    "Più è strampalata meglio è.\n"
                    "6. 8-14 parole\n"
                    "Rispondi SOLO con la frase, senza virgolette né commenti."
                ),
            }],
            system=GENERATOR_SYSTEM,
            max_tokens=200,
        )
        return jsonify({"frase": raw})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/verify", methods=["POST"])
def verify():
    """Verify a student's IPA transcription."""
    if not ANTHROPIC_API_KEY:
        return jsonify({"error": "claude_unavailable"}), 503

    data = request.get_json()
    frase = data.get("frase", "")
    trascrizione = data.get("trascrizione", "")
    info_parole = data.get("info_parole", [])
    user_choices = data.get("user_choices", {})

    # Build phonological context string
    context_lines = []
    for info in info_parole:
        word = info.get("word", "")
        source = info.get("source", "?")
        parts = []
        if info.get("has_epsilon"):
            parts.append("e tonica = ɛ (aperta)")
        elif "e" in word:
            parts.append("e tonica = e (chiusa)")
        if info.get("has_open_o"):
            parts.append("o tonica = ɔ (aperta)")
        elif "o" in word:
            parts.append("o tonica = o (chiusa)")
        if info.get("has_voiced_s"):
            parts.append("s intervocalica = z (sonora)")
        if info.get("has_voiced_z"):
            parts.append("z = dz (sonora)")
        if info.get("has_voiceless_z"):
            parts.append("z = ts (sorda)")
        if parts:
            context_lines.append(f'"{word}" [{source}]: {", ".join(parts)}')

    # Add user choices for words that needed manual input
    for word, choices in user_choices.items():
        parts = []
        if "v" in choices:
            parts.append(f"vocale tonica = [{choices['v']}]")
        if "sz" in choices:
            parts.append(f"s/z intervocalica = [{choices['sz']}]")
        if parts:
            context_lines.append(f'"{word}" [utente]: {", ".join(parts)}')

    context = "\n".join(context_lines) if context_lines else "Nessuna informazione dizionario disponibile."

    user_msg = (
        f'Frase: "{frase}"\n\n'
        f"Informazioni fonologiche dal dizionario:\n{context}\n\n"
        f"Trascrizione dello studente: {trascrizione}"
    )

    try:
        raw = call_claude(
            [{"role": "user", "content": user_msg}],
            system=CORRECTOR_SYSTEM,
            max_tokens=1500,
        )
        result = parse_json_response(raw)
        result["context"] = context_lines
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/solution", methods=["POST"])
def solution():
    """Get the correct transcription without evaluating a student answer."""
    if not ANTHROPIC_API_KEY:
        return jsonify({"error": "claude_unavailable"}), 503

    data = request.get_json()
    frase = data.get("frase", "")
    info_parole = data.get("info_parole", [])
    user_choices = data.get("user_choices", {})

    context_lines = []
    for info in info_parole:
        word = info.get("word", "")
        source = info.get("source", "?")
        parts = []
        if info.get("has_epsilon"):
            parts.append("e tonica = ɛ (aperta)")
        if info.get("has_open_o"):
            parts.append("o tonica = ɔ (aperta)")
        if info.get("has_voiced_s"):
            parts.append("s intervocalica = z (sonora)")
        if info.get("has_voiced_z"):
            parts.append("z = dz (sonora)")
        if info.get("has_voiceless_z"):
            parts.append("z = ts (sorda)")
        if parts:
            context_lines.append(f'"{word}" [{source}]: {", ".join(parts)}')

    for word, choices in user_choices.items():
        parts = []
        if "v" in choices:
            parts.append(f"vocale tonica = [{choices['v']}]")
        if "sz" in choices:
            parts.append(f"s/z intervocalica = [{choices['sz']}]")
        if parts:
            context_lines.append(f'"{word}" [utente]: {", ".join(parts)}')

    context = "\n".join(context_lines) if context_lines else "Nessuna informazione dizionario disponibile."

    user_msg = (
        f'Frase: "{frase}"\n\n'
        f"Informazioni fonologiche dal dizionario:\n{context}\n\n"
        "Non c'è una trascrizione da valutare. "
        "Fornisci solo la trascrizione corretta e i fenomeni fonologici."
    )

    try:
        raw = call_claude(
            [{"role": "user", "content": user_msg}],
            system=CORRECTOR_SYSTEM,
            max_tokens=1500,
        )
        result = parse_json_response(raw)
        result["context"] = context_lines
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
