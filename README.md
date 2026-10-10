# Weather-Aware Truck Routing — Django REST Framework + React

Compare up to three truck routes by forecast weather at each checkpoint's ETA, load-dependent wind
rules and travel time, and get an explainable route recommendation on an interactive map.

| Layer | Stack |
|---|---|
| Backend | Python 3.12 · Django 5.2 · Django REST Framework |
| Frontend | React · TypeScript · Vite · Tailwind CSS · TanStack Query · MapLibre GL JS |
| Providers | HERE Routing v8 (truck routes, geocoding) · Open-Meteo (hourly forecast) |

> Work in progress — full documentation (architecture, assumptions, API, limitations) lands in the final phase.

## Local development

### Backend (Django + DRF)
```bash
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env          # add your HERE_API_KEY
python manage.py runserver    # http://localhost:8000/api/health
pytest                        # tests
```

### Frontend (React)
```bash
cd frontend
npm install
cp .env.example .env
npm run dev                   # http://localhost:5173
npm test && npm run build
```
