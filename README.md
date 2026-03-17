# Laboratorio di fonetica italiana

App didattica per la verifica della trascrizione fonetica IPA dell'italiano.

## Struttura

```
fonetica/
├── backend/        # Flask API (Python)
└── frontend/       # React + Vite
```

## Deploy su Railway

Il progetto si compone di **due servizi Railway separati**: backend e frontend.

---

### 1. Backend

1. Crea un nuovo servizio Railway dalla cartella `backend/`
2. Railway rileva automaticamente Python e usa il `Procfile`
3. Aggiungi la variabile d'ambiente:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
4. Prendi nota dell'URL del backend (es. `https://fonetica-backend.railway.app`)

---

### 2. Frontend

1. Crea un secondo servizio Railway dalla cartella `frontend/`
2. Aggiungi la variabile d'ambiente:
   ```
   VITE_API_URL=https://fonetica-backend.railway.app
   ```
3. Railway esegue automaticamente `npm run build` e serve il risultato

---

## Sviluppo locale

### Backend
```bash
cd backend
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...
python app.py
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Il frontend in dev mode fa il proxy delle chiamate `/api` al backend locale (porta 5000).

---

## Architettura

Per ogni parola della frase, l'app cerca informazioni fonologiche in questo ordine:

1. **Wiktionary** — accento tonico, qualità vocali medie (ɛ/e, ɔ/o), sonorità s/z
2. **Claude** (fallback) — se la parola non è su Wiktionary
3. **Utente** (fallback finale) — se Claude non è disponibile, viene chiesto all'utente di specificare manualmente i suoni ambigui

La correzione della trascrizione è sempre eseguita da Claude, che riceve tutte le informazioni fonologiche già risolte.

---

## Convenzioni di trascrizione

- Parentesi quadre `[...]`
- Sillabe separate da `.`
- Accento primario `ˈ` su tutte le parole polisillabiche
- Accento secondario `ˌ` per valli accentuali (3+ sillabe atone consecutive)
- Scontro accentuale: rimuovi l'accento della prima tonica
- Frase continua (salvo `,` e `.`)
- Fusione di vocali atone contigue tra parole
- Autogeminazione: `ʃʃ ʎʎ ɲɲ tts ddz` sempre (anche in posizione iniziale)
- Raddoppiamento fonosintattico tra parole
- Assimilazioni cross-word obbligatorie
