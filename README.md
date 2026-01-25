# ReactFlix

ReactFlix is a self-hosted video streaming web app inspired by Netflix. Browse and watch your own Movies + TV Series on a local server (offline/LAN friendly).

> ⚠️ Status: early-stage / WIP. Desktop-first UI (no phone support yet). The code works, but it’s not pretty and will be refactored over time.

---

## Features

- Movies + TV Series browsing
- Search by title/description
- Genre filtering + pagination
- Video player with “Up Next”
- Subtitles support (`.vtt`, English + Hebrew)
- Admin login + uploads (Movie upload + Series upload / add episodes)
- Offline / LAN friendly (no external APIs)

---

## Project Structure (How it works)

### Backend (Flask) — `movie_api.py`
- Scans folders on disk and reads metadata from `descriptions.json`
- Endpoints:
  - `GET /series` → list available libraries (Movies + series folders)
  - `GET /movies?series=Movies` → list movies in Movies
  - `GET /series_data?series=<name>` → `{ movies, genres }` for a series folder
  - `GET /api/genres?series=<name>` → `{ genres: [...] }`
  - `POST /api/admin/login` → returns an admin token
  - `POST /add_movie?series=Movies` (admin) → uploads movie + poster + updates `descriptions.json`
  - `POST /add_series` (admin) → creates series OR adds episodes; saves episodes/posters; updates `descriptions.json`
  - `GET /api/updates.txt` → serves the updates file
  - `GET /<path:filename>` → serves media files directly from the project directory

### Frontend (React)
- `App.jsx` is the main UI:
  - Loads **series list** (drawer sidebar)
  - Loads **movies** / **series_data** depending on selected library
  - Builds the **genre bar**
  - Handles **search**, **pagination**, **VideoModal**
  - Handles **Admin login** and **Upload modal**
- Media URLs: the backend returns paths like `Movies/File.mp4`, and the UI maps them to `/<path>`.

---

## First Setup

### Requirements
- Python 3.10+ recommended
- Node.js 18+ recommended

### Backend (Flask)
1. Create a venv and install deps:
   ```bash
   python -m venv .venv
   # Windows
   .\.venv\Scripts\activate
   # Linux/Mac
   source .venv/bin/activate

   pip install flask flask-cors cachetools werkzeug
