# LabMatch 🎓

**Repository Purpose:** An intelligent campus resource booking system that recommends suitable lab equipment based on student tasks and manages reservations efficiently.

### Features
- User registration and login
- Task-based resource recommendations
- Booking conflict prevention
- Booking history and cancellation

### Tech Stack
Next.js · TypeScript · Tailwind CSS · FastAPI · PostgreSQL · ChromaDB

### Run Locally

**1. Start the backend (Terminal 1)**

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn main:app --reload --port 8000
```

**2. Start the frontend (Terminal 2)**

```powershell
npm install
npm run dev
```

Open **http://localhost:3000** in your browser.

Ensure PostgreSQL is running and the required environment variables are configured in `.env.local` and `backend/.env`.

**LabMatch — Smarter campus resource booking.**