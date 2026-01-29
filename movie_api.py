import os
import json
import re
import logging
import time
import hmac
import hashlib
from io import BytesIO
from functools import wraps

from flask import (
    Flask,
    jsonify,
    send_from_directory,
    request,
)
from flask_cors import CORS
from cachetools import cached, TTLCache
from werkzeug.utils import secure_filename

# =====================
# App setup
# =====================

app = Flask(__name__, static_folder="static")
CORS(app)

BASE_DIRECTORY = os.path.dirname(__file__)
MOVIES_FOLDER = "Movies"

cache = TTLCache(maxsize=100, ttl=300)

# =====================
# 🔐 Admin auth config
# =====================

ADMIN_PASSWORD = "Kaparot1!"  # ← set password here
ADMIN_SECRET = "dambelator"  # ← random secret string
TOKEN_TTL_SECONDS = 60 * 60 * 24  # 24 hours

EP_RE = re.compile(r"[sS](\d{1,2})[eE](\d{1,3})", re.IGNORECASE)
SEASON_POSTER_RE = re.compile(r"[sS](\d{1,2})", re.IGNORECASE)


def safe_series_folder(name: str) -> str:
    name = (name or "").strip()

    # Remove characters that break Windows/Linux paths
    name = re.sub(r'[<>:"/\\|?*\x00-\x1F]', "", name)

    # Collapse whitespace
    name = re.sub(r"\s+", " ", name).strip()

    # Block traversal / dot-only names
    if not name or name in {".", ".."} or ".." in name:
        return ""

    return name


def _make_token():
    ts = str(int(time.time()))
    sig = hmac.new(ADMIN_SECRET.encode(), ts.encode(), hashlib.sha256).hexdigest()
    return f"{ts}.{sig}"


def _verify_token(token: str) -> bool:
    try:
        ts_str, sig = token.split(".", 1)
        ts = int(ts_str)
    except Exception:
        return False

    if time.time() - ts > TOKEN_TTL_SECONDS:
        return False

    expected = hmac.new(
        ADMIN_SECRET.encode(), ts_str.encode(), hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(expected, sig)


def require_admin(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "Unauthorized"}), 401

        token = auth.split(" ", 1)[1].strip()
        if not _verify_token(token):
            return jsonify({"error": "Unauthorized"}), 401

        return f(*args, **kwargs)

    return wrapper


# =====================
# Logging
# =====================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger()

VIDEO_EXTS = [".mp4", ".mkv", ".m4v"]
POSTER_EXTS = [".jpg", ".jpeg", ".png", ".webp"]

# =====================
# Admin login
# =====================


@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    data = request.get_json(silent=True) or {}
    password = data.get("password", "").strip()

    if password != ADMIN_PASSWORD:
        return jsonify({"error": "Wrong password"}), 401

    return jsonify({"token": _make_token()})


# =====================
# Utilities
# =====================


def find_existing_rel_path(series_path, series_name, base_name, exts):
    for ext in exts:
        filename = f"{base_name}{ext}"
        abs_path = os.path.join(series_path, filename)
        if os.path.exists(abs_path):
            return os.path.join(series_name, filename)
    return None


# =====================
# Frontend + API
# =====================


@app.route("/")
def serve_index():
    return send_from_directory("static", "index.html")


@cached(cache)
def get_series_list():
    ignore = {"static", "packages", ".venv", "node_modules", "public", "src", ".git"}
    folders = [
        f
        for f in os.listdir(BASE_DIRECTORY)
        if os.path.isdir(os.path.join(BASE_DIRECTORY, f)) and f not in ignore
    ]
    folders.sort()
    if MOVIES_FOLDER in folders:
        folders.remove(MOVIES_FOLDER)
    return [MOVIES_FOLDER] + folders


@app.route("/series", methods=["GET"])
def list_series():
    return jsonify(get_series_list())


@cached(cache)
def list_genres(series_name):
    path = os.path.join(BASE_DIRECTORY, series_name, "descriptions.json")
    if not os.path.exists(path):
        return []

    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    genres = set()
    for m in data:
        for g in m.get("genres", []):
            genres.add(g)
    return sorted(genres)


@app.route("/api/genres")
def api_genres():
    series = request.args.get("series", MOVIES_FOLDER)
    return jsonify({"genres": list_genres(series)})


@cached(cache)
def load_movies_from_folder(series_name, genre_filter=None):
    path = os.path.join(BASE_DIRECTORY, series_name, "descriptions.json")
    if not os.path.exists(path):
        return []

    with open(path, encoding="utf-8") as f:
        descriptions = json.load(f)

    series_path = os.path.join(BASE_DIRECTORY, series_name)
    movies = []

    for movie in descriptions:
        name = movie["name"]

        # video is episode file for series, normal file for Movies
        video = find_existing_rel_path(series_path, series_name, name, VIDEO_EXTS)

        poster = None
        if series_name == MOVIES_FOLDER:
            # Movies: poster matches movie name
            poster = find_existing_rel_path(series_path, series_name, name, POSTER_EXTS)
        else:
            # Series: poster is per-season (S01.jpg / S02.png etc)
            m = EP_RE.search(name)
            if m:
                season = int(m.group(1))
                poster = find_existing_rel_path(
                    series_path, series_name, f"S{season:02}", POSTER_EXTS
                )

        if not video or not poster:
            continue

        if genre_filter and genre_filter not in movie["genres"]:
            continue

        movies.append(
            {
                "id": movie["id"],
                "name": name,
                "description": movie["description"],
                "rating": movie["rating"],
                "genres": movie["genres"],
                "video_path": video,
                "poster_path": poster,
            }
        )

    return movies


@app.route("/movies")
def list_movies():
    series = request.args.get("series", MOVIES_FOLDER)
    genre = request.args.get("genre")
    return jsonify(load_movies_from_folder(series, genre))


@app.route("/series_data")
def series_data():
    series = request.args.get("series", MOVIES_FOLDER)
    return jsonify(
        {
            "movies": load_movies_from_folder(series),
            "genres": list_genres(series),
        }
    )


@app.route("/api/updates.txt")
def updates():
    return send_from_directory("public", "updates.txt")


# =====================
# 🎬 Add movie (ADMIN)
# =====================


@app.route("/add_movie", methods=["POST"])
@require_admin
def add_movie():
    try:
        name = request.form["name"]
        description = request.form["description"]
        rating = request.form["rating"]
        genres = json.loads(request.form["genres"])
        poster = request.files["poster"]
        video = request.files["file"]

        series = request.args.get("series", MOVIES_FOLDER)
        series_path = os.path.join(BASE_DIRECTORY, series)
        desc_path = os.path.join(series_path, "descriptions.json")

        with open(desc_path, encoding="utf-8") as f:
            descriptions = json.load(f)

        new_id = max((m["id"] for m in descriptions), default=0) + 1
        descriptions.append(
            {
                "id": new_id,
                "name": name,
                "description": description,
                "rating": rating,
                "genres": genres,
            }
        )

        with open(desc_path, "w", encoding="utf-8") as f:
            json.dump(descriptions, f, indent=4, ensure_ascii=False)

        poster_ext = os.path.splitext(poster.filename)[1].lower()
        video_ext = os.path.splitext(video.filename)[1].lower()

        if poster_ext not in POSTER_EXTS or video_ext not in VIDEO_EXTS:
            return "Unsupported file type", 400

        poster.save(os.path.join(series_path, f"{name}{poster_ext}"))
        video.save(os.path.join(series_path, f"{name}{video_ext}"))

        cache.clear()
        return "Movie added", 200

    except Exception as e:
        logger.exception("Add movie failed")
        return "Failed", 500


def _parse_episode(filename: str):
    m = EP_RE.search(filename)
    if not m:
        return None
    season = int(m.group(1))
    ep = int(m.group(2))
    return season, ep


def _parse_season_poster(filename: str):
    # Accept S01.jpg etc
    m = SEASON_POSTER_RE.search(os.path.splitext(filename)[0])
    if not m:
        return None
    return int(m.group(1))


def _load_descriptions(path):
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, list) else []


def _save_descriptions(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4)


@app.route("/add_series", methods=["POST"])
@require_admin
def add_series():
    try:
        mode = (request.form.get("mode") or "").strip().lower()  # "new" | "existing"
        series_name = (request.form.get("seriesName") or "").strip()

        if not series_name:
            return "Missing seriesName", 400

        # prevent weird folder traversal
        series_folder = safe_series_folder(series_name)
        if not series_folder:
            return "Invalid seriesName", 400

        series_path = os.path.join(BASE_DIRECTORY, series_folder)
        descriptions_path = os.path.join(series_path, "descriptions.json")

        exists = os.path.isdir(series_path)

        if mode == "new":
            if exists:
                return "Series already exists", 409
            os.makedirs(series_path, exist_ok=True)
            descriptions = []
        elif mode == "existing":
            if not exists:
                return "Series not found", 404
            descriptions = _load_descriptions(descriptions_path)
        else:
            return "Invalid mode (use 'new' or 'existing')", 400

        # Determine next id start
        existing_ids = [m.get("id", 0) for m in descriptions if isinstance(m, dict)]
        next_id = (max(existing_ids) if existing_ids else 0) + 1

        # Build set of existing episode names like "s01e01"
        existing_names = set()
        for m in descriptions:
            n = str(m.get("name", "")).lower().strip()
            if n:
                existing_names.add(n)

        # ---- posters: save as s01.jpg etc (one per season)
        posters = request.files.getlist("posters")
        for p in posters:
            if not p or not p.filename:
                continue
            p_ext = os.path.splitext(p.filename)[1].lower()
            if p_ext not in POSTER_EXTS:
                continue

            season = _parse_season_poster(p.filename)
            if season is None:
                # if user didn't name it S01, ignore (or return 400 if you prefer)
                continue

            poster_name = f"S{season:02}{p_ext}"  # S01.jpg, S02.jpg, ...
            p.save(os.path.join(series_path, poster_name))

        # ---- episodes
        files = request.files.getlist("files")
        if not files:
            return "No episode files uploaded", 400

        added = 0
        skipped = 0
        bad = 0

        for f in files:
            if not f or not f.filename:
                continue

            info = _parse_episode(f.filename)
            if info is None:
                bad += 1
                continue

            season, ep = info

            ext = os.path.splitext(f.filename)[1].lower()
            if ext not in VIDEO_EXTS:
                bad += 1
                continue

            # ✅ Enforce UPPERCASE naming
            episode_base = f"S{season:02}E{ep:02}"  # S01E01, S02E03, ...
            episode_key = episode_base.lower()  # key used for duplicate detection

            if episode_key in existing_names:
                skipped += 1
                continue

            # save file as SxxExx.ext
            out_name = f"{episode_base}{ext}"
            f.save(os.path.join(series_path, out_name))

            # add description entry with UPPERCASE name
            descriptions.append(
                {
                    "name": episode_base,  # stays UPPERCASE in JSON
                    "description": series_name,
                    "rating": "0.0",
                    "genres": [f"Season {season}"],
                    "id": next_id,
                }
            )

            existing_names.add(episode_key)  # keep the set lowercase for matching
            next_id += 1
            added += 1

        # keep in nice order: s01e01, s01e02, s02e01...
        def sort_key(item):
            n = str(item.get("name", "")).lower()
            m = EP_RE.match(n)
            if not m:
                return (9999, 9999)
            return (int(m.group(1)), int(m.group(2)))

        descriptions.sort(key=sort_key)
        _save_descriptions(descriptions_path, descriptions)
        cache.clear()

        return (
            jsonify(
                {
                    "ok": True,
                    "series": series_folder,
                    "added": added,
                    "skipped_existing": skipped,
                    "bad_files": bad,
                }
            ),
            200,
        )

    except Exception as e:
        logging.exception("Error adding series")
        return f"Failed to add series: {e}", 500


# =====================
# Media serving
# =====================


@app.route("/<path:filename>")
def media(filename):
    return send_from_directory(BASE_DIRECTORY, filename)


# =====================
# Run
# =====================

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=80)
