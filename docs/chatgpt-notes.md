# DemakAI WhatsApp Bot — Ringkasan untuk Diskusi dengan ChatGPT

Gunakan dokumen ini saat mengobrol dengan ChatGPT supaya konteks bot jelas dan troubleshooting lebih cepat.

## Gambaran Singkat
- Mode: `BOT_MODE=prod` memakai gateway `mimamch/wa-gateway`.
- LLM: Gemini (`LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/models/`, `LLM_MODEL=gemini-2.5-flash`).
- Embedding: Ollama lokal (`OLLAMA_BASE_URL=http://10.133.21.51:11434`, `EMBEDDING_MODEL=bge-m3`).
- WhatsApp gateway: `WA_API_BASE_URL=http://10.133.21.24:5001`, session `WA_SESSION_ID=demak-bot`.
- Webhook server bot: port default 3000, endpoint utama `POST /webhook/message` (juga `/webhook` dan `/webhook/session`).
- Polling dimatikan secara default (`WA_ENABLE_POLLING=false`), gateway diharapkan push webhook.

## Jalur Kerja Produksi
1) Jalankan bot: `npm start` (pastikan hanya satu instance; jika perlu set `PORT` di .env).
2) Set di gateway (container wa-gateway):
   - `WEBHOOK_BASE_URL=http://<IP-bot>:3000`
   - Restart container setelah set env.
3) Kirim pesan WA ke nomor yang terhubung ke session `demak-bot`.
4) Log yang diharapkan di terminal bot:
   - `📨 Webhook hit: /webhook/message`
   - `📩 Incoming message from ...`
   - `✅ Message sent to ...`

## Cek Kesehatan
- Bot: `http://<host-bot>:3000/health`
- Ollama: `curl <OLLAMA_BASE_URL>/api/tags`
- WA Gateway quick start: scan QR via `http://<gateway>:5001/session/start?session=demak-bot`

## Perintah Uji Lokal (tanpa WhatsApp)
- PowerShell:
  ```
  curl.exe --% -X POST http://localhost:3000/webhook/message ^
    -H "Content-Type: application/json" ^
    -d '{"from":"628xxxx@s.whatsapp.net","text":"apa itu kbli"}'
  ```
- Git Bash:
  ```
  curl -X POST "http://localhost:3000/webhook/message" \
    -H 'Content-Type: application/json' \
    -d '{"from":"628xxxx@s.whatsapp.net","text":"apa itu kbli"}'
  ```
Ganti teks untuk uji mode: `#kbli usaha fotokopi`, `#kbji kerja programmer`, `#publikasi kemiskinan 2023`.

## Masalah Umum
- **Tidak ada log webhook / tidak balas WA**: gateway belum mencapai bot. Pastikan `WEBHOOK_BASE_URL` di gateway mengarah ke IP bot dan port 3000 terbuka (cek `curl http://<IP-bot>:3000/health` dari host gateway).
- **EADDRINUSE 3000**: ada instance lain jalan. Matikan yang lama, atau ganti `PORT` di .env.
- **Timed Out saat kirim pesan**: bot gagal memanggil gateway `/message/send-text`. Cek `WA_API_BASE_URL`, gateway hidup, dan tes manual:
  ```
  curl.exe --% -X POST http://10.133.21.24:5001/message/send-text ^
    -H "Content-Type: application/json" ^
    -d "{\"session\":\"demak-bot\",\"to\":\"628xxxx\",\"text\":\"tes langsung\"}"
  ```
- **Status unknown di log**: gateway tidak punya endpoint status; bot lanjut jalan. Pastikan sesi sudah scan QR.

## Lokasi File Penting
- Konfigurasi environment: `.env`, `.env.example`
- WhatsApp client (gateway): `src/waClient.js`
- Webhook server & entrypoint: `src/index.js`
- Handler WA dev (whatsapp-web.js): `src/wa.bot.js`
- Mode/handler pesan: `src/handlers.js`
