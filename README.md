# DemakAI WhatsApp Bot

RAG-powered assistant untuk KBLI/KBJI dan publikasi statistik, berjalan di WhatsApp via gateway `mimamch/wa-gateway`, LLM Gemini, dan embedding Ollama.

## Ringkasannya
- Mode: `BOT_MODE=prod` memakai wa-gateway (multi session, webhook push).
- LLM: Gemini (`gemini-2.5-flash`) via Google Generative Language API.
- Embedding: Ollama lokal (`bge-m3`).
- WhatsApp gateway: `WA_API_BASE_URL` default `http://10.133.21.24:5001`, session `demak-bot`.
- Webhook bot: listen di port `3000`, endpoint utama `POST /webhook/message` (juga `/webhook`, `/webhook/session`).
- Polling dimatikan (`WA_ENABLE_POLLING=false`); gateway diharapkan mengirim webhook.

## Prasyarat
- Node.js 18+ dan npm
- MongoDB (URI di `.env`)
- Ollama dengan model `bge-m3` tersedia (`ollama pull bge-m3`)
- Kontainer wa-gateway (mimamch/wa-gateway) berjalan dan sudah scan QR untuk session Anda

## Instalasi
```bash
git clone <repo-url>
cd ChatbotWADemak
npm install
cp .env.example .env
```

## Konfigurasi `.env`
Sesuaikan nilai berikut:
```
# Database
MONGO_URI=mongodb://user:pass@host:27017/?authSource=admin
DB_NAME=demakAI

# LLM / Embedding
OLLAMA_BASE_URL=http://<ip-ollama>:11434
EMBEDDING_MODEL=bge-m3
EMBEDDING_DIMENSION=1024
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/models/
LLM_MODEL=gemini-2.5-flash
GEMINI_API_KEY=<api-key>

# WhatsApp Gateway
WA_API_BASE_URL=http://<ip-gateway>:5001
WA_SESSION_ID=demak-bot
WA_ENABLE_POLLING=false
WA_ENABLE_WEBHOOK_REGISTER=false

# Bot
BOT_MODE=prod
PORT=3000
```

## Menjalankan
1. Pastikan Ollama aktif: `ollama serve`.
2. Pastikan wa-gateway aktif dan sesi telah scan QR: `http://<ip-gateway>:5001/session/start?session=demak-bot`.
3. Set env di gateway agar webhook menuju bot: `WEBHOOK_BASE_URL=http://<IP-bot>:3000`, lalu restart kontainer gateway.
4. Jalankan bot: `npm start`.
5. Cek kesehatan bot: `curl http://localhost:3000/health`.

## Pengujian Tanpa WhatsApp
- PowerShell:
  ```
  curl.exe --% -X POST http://localhost:3000/webhook/message ^
    -H "Content-Type: application/json" ^
    -d '{"from":"628xxxx@s.whatsapp.net","text":"apa itu kbli?"}'
  ```
- Git Bash:
  ```
  curl -X POST "http://localhost:3000/webhook/message" \
    -H 'Content-Type: application/json' \
    -d '{"from":"628xxxx@s.whatsapp.net","text":"apa itu kbli?"}'
  ```

## Mode & Perintah
- `#kbli [query]` / `#kbji [query]` – Mode KBLI/KBJI (text search)
- `#publikasi [query]` – Mode Publikasi (RAG + embedding)
- `/home` – Kembali ke mode natural
- `/help`, `/clear`, `/stats`, `/health`

## Struktur Proyek (ringkas)
```
src/
  index.js         # Entrypoint + webhook server
  waClient.js      # Client untuk wa-gateway (prod)
  wa.bot.js        # whatsapp-web.js (dev)
  handlers.js      # Mode system + router pesan
  rag.js, llm.js, embedding.js, db.js, session.js
config/constants.js
docs/chatgpt-notes.md
.env, .env.example
```

## Troubleshooting Cepat
- Tidak ada balasan / tidak ada log webhook:
  - Pastikan `WEBHOOK_BASE_URL` di gateway mengarah ke `http://<IP-bot>:3000`.
  - Pastikan port 3000 terbuka dari mesin gateway (uji `curl http://<IP-bot>:3000/health` dari host gateway).
- Timed Out saat kirim pesan:
  - Tes manual ke gateway:
    ```
    curl.exe --% -X POST http://<ip-gateway>:5001/message/send-text ^
      -H "Content-Type: application/json" ^
      -d "{\"session\":\"demak-bot\",\"to\":\"628xxxx\",\"text\":\"tes langsung\"}"
    ```
  - Periksa `WA_API_BASE_URL` dan status kontainer gateway.
- Port 3000 bentrok: hentikan instance lain atau ubah `PORT` di `.env`.
