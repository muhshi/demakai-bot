# DemakAI WhatsApp Bot

RAG-based intelligent assistant untuk KBLI (Klasifikasi Baku Lapangan Usaha Indonesia), KBJI (Klasifikasi Baku Jabatan Indonesia), dan publikasi statistik.

## ✨ Features

- 📋 **Mode KBLI/KBJI** - Cari kode klasifikasi usaha dan jabatan (Text Search)
- 📚 **Mode Publikasi** - Cari data dan publikasi (Semantic Search dengan Embeddings)
- 💬 **Mode Natural** - Percakapan natural seperti ChatGPT
- 🔄 **Hash Trigger System** - Aktivasi mode dengan #kbli, #kbji, atau #publikasi
- ⏰ **Auto-Reset** - Mode kembali ke natural setelah 15 menit idle
- 📊 **Statistics & Monitoring** - Built-in stats untuk tracking usage

## 🏗️ Architecture

```
User → WhatsApp → Mimmach API → Bot Handler
                                    ↓
                    ┌───────────────┴────────────────┐
                    │                                │
              Mode Detection                    Session Check
            (#kbli/#publikasi)              (15min auto-reset)
                    │                                │
        ┌───────────┼────────────┐                  │
        ▼           ▼            ▼                  ▼
   Natural     KBLI/KBJI    Publikasi         History
     Mode    (Text Search) (Embeddings)       Context
        │           │            │                  │
        └───────────┼────────────┘                  │
                    ▼                                │
                  LLM (Ollama)  ◄───────────────────┘
                    │
                    ▼
                Response
```

## 📦 Installation

```bash
# 1. Clone repository
git clone <repo-url>
cd DemakAI-bot

# 2. Install dependencies
npm install

# 3. Setup environment
cp .env.example .env
# Edit .env

# 4. Install Ollama models
ollama pull llama3.1:8b
ollama pull bge-m3

# 5. Start Ollama
ollama serve

# 6. Start bot
npm start
```

## ⚙️ Environment Variables

```bash
# Database
MONGO_URI=

# Ollama
OLLAMA_BASE_URL=http://localhost:11434
LLM_MODEL=llama3.1:8b
EMBEDDING_MODEL=bge-m3
EMBEDDING_DIMENSION=1024

# WhatsApp API (Mimmach)
WA_API_BASE_URL=
WA_SESSION_NAME=

# Webhook (optional)
PORT=
WEBHOOK_URL=

# Cleanup (optional)
CLEANUP_INACTIVE_DAYS=90
```

## 🎯 Usage

### Mode System

**Aktivasi Mode:**
- `#kbli [query]` - Mode KBLI (usaha/kegiatan)
- `#kbji [query]` - Mode KBJI (pekerjaan/jabatan)  
- `#publikasi [query]` - Mode Publikasi (data/statistik)
- `/home` - Kembali ke mode natural

**Contoh:**
```
User: #kbli saya mau buka usaha fotokopi
Bot: [📋 Mode KBLI aktif]
     Berikut kemungkinan yang paling relevan:
     
     KBLI (usaha/kegiatan):
     1. [82199] Fotokopi, Persiapan Dokumen...
     ...

User: kok gak ada yang cocok?
Bot: [percakapan natural, context-aware]

User: /home
Bot: [💬 Mode Natural aktif]
```

### Commands

- `/help` - Panduan penggunaan
- `/clear` - Hapus riwayat percakapan
- `/stats` - Statistik sistem
- `/health` - Status server
- `/home` - Kembali ke mode natural

### Scripts

```bash
# Show statistics
npm run stats

# Cleanup all sessions (WARNING: Delete all!)
npm run cleanup

# Cleanup old sessions (>90 days inactive)
npm run cleanup:old
```

## 📁 Project Structure

```
DemakAI-bot/
├── src/
│   ├── db.js                 # Database abstraction layer
│   ├── embedding.js          # Ollama embedding client
│   ├── llm.js                # LLM handler (Ollama)
│   ├── rag.js                # RAG pipeline
│   ├── handlers.js           # Message handler dengan mode system
│   ├── session.js            # Session management
│   └── wa.client.js          # WhatsApp HTTP client (optional)
├── config/
│   └── constants.js          # Centralized config (synonyms, stopwords, etc)
├── scripts/
│   ├── showStats.js          # Statistics
│   ├── cleanup.js            # Delete all sessions
│   └── cleanupOldSessions.js # Cleanup inactive sessions
├── .env
├── .env.example
├── package.json
└── README.md
```

## 🔧 Configuration

Edit `config/constants.js` untuk:

**Tambah Synonyms:**
```javascript
export const SYNONYMS = {
  "fotokopi": ["fotokopi", "fotocopy", "cetak", "penggandaan"],
  "salon": ["salon", "pangkas", "cukur", "barbershop"],
  // Tambah di sini
};
```

**Adjust Thresholds:**
```javascript
export const SIMILARITY_THRESHOLD = {
  kbli_kbji: 0.45,  // Lower = more results
  publikasi: 0.60,  // Higher = more precise
};
```

**Max Results:**
```javascript
export const MAX_RESULTS = {
  kbli: 3,
  kbji: 3,
  publikasi: 8,
};
```

## 🎨 Mode Indicators

Setiap response dari bot akan include emoji indicator:
- 💬 Natural Mode
- 📋 KBLI/KBJI Mode
- 📚 Publikasi Mode

Footer navigation:
```
───────────────
Ketik /home untuk mode natural | #publikasi untuk publikasi
```

## 🔍 Search Methods

**KBLI/KBJI (Text Search):**
1. MongoDB `$text` search dengan scoring
2. Query expansion dengan sinonim
3. Regex fallback jika text search kosong
4. Take top 3 results

**Publikasi (Semantic Search):**
1. Embed query dengan Ollama
2. Cosine similarity dengan document chunks
3. Filter by threshold (0.60)
4. Take top 8 chunks

**Capacity:**
- 1-5 concurrent users: Smooth
- 5-10 users: Good (need monitoring)
- 10+ users: Need scaling (queue system)

## 🚀 Production Checklist

- [ ] Set `LLM_MODEL=llama3.1:8b` (minimum)
- [ ] Configure synonyms di `config/constants.js`
- [ ] Setup monitoring (health checks)
- [ ] Configure cleanup schedule (cron)
- [ ] Setup Redis untuk production cache (optional)
- [ ] Configure proper webhook URL
- [ ] Setup backup MongoDB

## 🐛 Troubleshooting

**"Ollama not available"**
```bash
ollama serve
ollama list  # Check models
```

**"Mode tidak reset"**
Check session.modeActivatedAt - should auto-reset after 15 min idle.

**"KBLI/KBJI tidak ketemu"**
1. Check MongoDB text index exists: `db.KBLI2020.getIndexes()`
2. Add more synonyms di `config/constants.js`
3. Lower threshold di constants

**"Publikasi tidak relevan"**
1. Check embeddings exist di chunks
2. Adjust `SIMILARITY_THRESHOLD.publikasi`
3. Check Ollama embedding model loaded

## 📝 License

MIT

## 🙏 Support

Untuk pertanyaan atau issue, buka issue di repository.