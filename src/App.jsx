import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
} from "react";
import { fetchMovies, fetchSeries, fetchSeriesData } from "./api/reactflixApi";
import { adminLogin, fetchGenres, uploadMovie } from "./api/adminApi";
import "./styles/index.css";

export default function App() {
  const [movies, setMovies] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const [moviesPerPage, setMoviesPerPage] = useState(24);

  const [selectedMovie, setSelectedMovie] = useState(null);
  const [isVideoOpen, setIsVideoOpen] = useState(false);

  const [currentGenre, setCurrentGenre] = useState("All");
  const [seriesList, setSeriesList] = useState([]);
  const [currentSeries, setCurrentSeries] = useState("Movies");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [seriesGenres, setSeriesGenres] = useState([]);

  const [updatesOpen, setUpdatesOpen] = useState(false);
  const [updatesVersion, setUpdatesVersion] = useState("");
  const [updatesBody, setUpdatesBody] = useState("");

  const UPDATES_URL = "/api/updates.txt";
  const UPDATES_STORAGE_KEY = "reactflix_last_seen_updates_version";

  const [adminToken, setAdminToken] = useState(
    () => localStorage.getItem("reactflix_admin_token") || "",
  );
  const [adminOpen, setAdminOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  // Updates modal (versioned)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${UPDATES_URL}?t=${Date.now()}`);
        if (!res.ok)
          throw new Error(`GET ${UPDATES_URL} failed: ${res.status}`);

        const text = await res.text();

        const lines = text.replace(/\r/g, "").split("\n");
        const version = (lines[0] ?? "").trim();

        let bodyLines = lines.slice(1);
        if (bodyLines.length && bodyLines[0].trim() === "")
          bodyLines = bodyLines.slice(1);
        const body = bodyLines.join("\n").trim();

        if (cancelled) return;

        setUpdatesVersion(version);
        setUpdatesBody(body);

        const lastSeen = localStorage.getItem(UPDATES_STORAGE_KEY) || "";
        if (version && version !== lastSeen) {
          setUpdatesOpen(true);
          localStorage.setItem(UPDATES_STORAGE_KEY, version);
        }
      } catch (e) {
        console.warn("Failed to load updates:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Sidebar series list
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const list = await fetchSeries();
        if (!cancelled) setSeriesList(Array.isArray(list) ? list : []);
      } catch (e) {
        console.warn("Failed to load series list:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Close modal on ESC
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") closeMovie();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function openMovie(movie) {
    setSelectedMovie(movie);
    setIsVideoOpen(true);
  }

  function closeMovie() {
    setIsVideoOpen(false);
    setSelectedMovie(null);
  }

  function goHome() {
    closeMovie();
    setCurrentSeries("Movies");
    setCurrentGenre("All");
    setQuery("");
    setCurrentPage(1);
  }

  // Dynamic movies-per-page (based on actual grid width)
  useEffect(() => {
    const mainEl = document.getElementById("main");
    if (!mainEl) return;

    const ROWS = 4;

    function recalc() {
      const mainRect = mainEl.getBoundingClientRect();
      const mainWidth = Math.max(0, mainRect.width);

      const firstCard = mainEl.querySelector(".movie");
      const cardRect = firstCard?.getBoundingClientRect();
      const cardWidth = cardRect?.width ?? 300;

      const cs = window.getComputedStyle(mainEl);
      const gapStr = cs.columnGap || cs.gap || "24px";
      const gap = Number.parseFloat(gapStr) || 24;

      const cols = Math.max(
        1,
        Math.floor((mainWidth + gap) / (cardWidth + gap)),
      );
      const perPage = Math.max(1, cols * ROWS);

      setMoviesPerPage((prev) => (prev === perPage ? prev : perPage));
    }

    recalc();

    const ro = new ResizeObserver(() => recalc());
    ro.observe(mainEl);
    window.addEventListener("resize", recalc);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recalc);
    };
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [moviesPerPage]);

  // Load movies for current series
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError("");

        if (currentSeries === "Movies") {
          const data = await fetchMovies();
          if (!cancelled) {
            setMovies(Array.isArray(data) ? data : []);
            setSeriesGenres([]);
          }
        } else {
          const data = await fetchSeriesData(currentSeries);

          const moviesArr = Array.isArray(data?.movies) ? data.movies : [];
          const genresArr = Array.isArray(data?.genres)
            ? data.genres.filter((g) => typeof g === "string" && g.trim())
            : [];
          setSeriesGenres(genresArr);

          if (!cancelled) {
            setMovies(moviesArr);
            setSeriesGenres(genresArr); // ✅ must be array of strings
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || "Failed to load");
          setMovies([]);
          setSeriesGenres([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentSeries]);

  // Reset page + genre when switching series
  useEffect(() => {
    setCurrentPage(1);
    setCurrentGenre("All");
  }, [currentSeries]);

  // Filtered list
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return movies.filter((m) => {
      if (q) {
        const name = String(m?.name ?? "").toLowerCase();
        const desc = String(m?.description ?? "").toLowerCase();
        if (!name.includes(q) && !desc.includes(q)) return false;
      }

      if (currentGenre && currentGenre !== "All") {
        const gs = Array.isArray(m?.genres)
          ? m.genres
          : typeof m?.genres === "string"
            ? m.genres
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean)
            : [];
        if (!gs.includes(currentGenre)) return false;
      }

      return true;
    });
  }, [movies, query, currentGenre]);

  const selectedIndex = useMemo(() => {
    if (!selectedMovie) return -1;
    const selKey = selectedMovie?.id ?? selectedMovie?.name;
    return filtered.findIndex((m) => (m?.id ?? m?.name) === selKey);
  }, [filtered, selectedMovie]);

  const nextMovie = useMemo(() => {
    if (selectedIndex < 0) return null;
    return filtered[selectedIndex + 1] ?? null;
  }, [filtered, selectedIndex]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / moviesPerPage));

  useEffect(() => setCurrentPage(1), [query]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
    if (currentPage < 1) setCurrentPage(1);
  }, [currentPage, totalPages]);

  const pageMovies = useMemo(() => {
    const start = (currentPage - 1) * moviesPerPage;
    return filtered.slice(start, start + moviesPerPage);
  }, [filtered, currentPage, moviesPerPage]);

  const allGenres = useMemo(() => {
    let raw = [];

    if (currentSeries !== "Movies" && seriesGenres.length > 0) {
      raw = ["All", ...seriesGenres];
    } else {
      const set = new Set();
      for (const m of movies) {
        const gs = Array.isArray(m?.genres)
          ? m.genres
          : typeof m?.genres === "string"
            ? m.genres
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean)
            : [];
        for (const g of gs) set.add(g);
      }
      raw = ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
    }

    // ✅ keep only strings
    return raw
      .map((x) => (typeof x === "string" ? x : (x?.name ?? String(x))))
      .filter((x) => typeof x === "string" && x.trim());
  }, [movies, seriesGenres, currentSeries]);

  return (
    <>
      <header>
        <div id="topNav">
          <div className="nav-left">
            <div className="nav-left-group">
              <button
                className="hamburger"
                onClick={() => setIsDrawerOpen(true)}
                aria-label="Open series menu"
              >
                ☰
              </button>

              <button
                className="updates-btn"
                onClick={() => setUpdatesOpen(true)}
                aria-label="Open updates"
                title="Updates"
              >
                Updates{" "}
                {updatesVersion ? (
                  <span className="updates-pill">{updatesVersion}</span>
                ) : null}
              </button>

              <button className="admin-btn" onClick={() => setAdminOpen(true)}>
                Admin
              </button>

              {adminToken && (
                <button
                  className="admin-btn"
                  onClick={() => setUploadOpen(true)}
                >
                  Upload
                </button>
              )}
            </div>
          </div>

          <button
            className="mainName"
            id="mainName"
            onClick={goHome}
            aria-label="Go to Movies"
          >
            <img src="/reactflix.png" alt="REACTFLIX" id="logoImage" />
          </button>

          <div className="nav-right">
            <div className="search-form">
              <input
                type="text"
                id="search"
                className="search"
                placeholder="🔍 Search..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
      </header>

      <div id="genre-line">
        <div className="genre-line-inner">
          {allGenres.map((g) => (
            <button
              key={`genre-${g}`}
              className={`genre-btn ${g === currentGenre ? "active" : ""}`}
              onClick={() => setCurrentGenre(g)}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <div id="main">
        {loading && (
          <div className="main-loading-wrap">
            <SmallLoader label="Loading titles…" />
          </div>
        )}

        {!loading && error && (
          <div style={{ padding: 16, whiteSpace: "pre-wrap", color: "white" }}>
            <b>Couldn’t load movies.</b>
            {"\n"}
            {error}
          </div>
        )}

        {!loading &&
          !error &&
          pageMovies.map((m) => (
            <MovieCard key={m.id ?? m.name} movie={m} onOpen={openMovie} />
          ))}
      </div>

      <div className="pagination">
        <button
          id="prevPage"
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          disabled={currentPage === 1}
        >
          Previous
        </button>

        <span id="pageCounter">
          {getPaginationItems(currentPage, totalPages).map((item, idx) => {
            if (item.type === "ellipsis") {
              return (
                <span key={`e-${idx}`} className="ellipsis">
                  ...
                </span>
              );
            }

            const p = item.page;
            const isActive = p === currentPage;

            return (
              <button
                key={`p-${p}-${idx}`}
                className={`page-btn ${isActive ? "active" : ""}`}
                onClick={() => setCurrentPage(p)}
              >
                {p}
              </button>
            );
          })}
        </span>

        <button
          id="nextPage"
          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          disabled={currentPage === totalPages}
        >
          Next
        </button>
      </div>

      <VideoModal
        open={isVideoOpen}
        movie={selectedMovie}
        nextMovie={nextMovie}
        onPlayNext={(m) => openMovie(m)}
        onClose={closeMovie}
      />

      <SeriesDrawer
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        currentSeries={currentSeries}
        seriesList={seriesList}
        onSelect={(name) => {
          setCurrentSeries(name);
          setIsDrawerOpen(false);
        }}
      />

      <UpdatesModal
        open={updatesOpen}
        version={updatesVersion}
        body={updatesBody}
        onClose={() => setUpdatesOpen(false)}
      />

      <AdminLoginModal
        open={adminOpen}
        onClose={() => setAdminOpen(false)}
        onLoggedIn={(token) => {
          localStorage.setItem("reactflix_admin_token", token);
          setAdminToken(token);
          setUploadOpen(true);
        }}
      />

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        token={adminToken}
        onUploaded={() => window.location.reload()}
      />
    </>
  );
}

function AdminLoginModal({ open, onClose, onLoggedIn }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPw("");
    setErr("");
    setBusy(false);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="modal"
      style={{ display: "block" }}
      onMouseDown={(e) => {
        if (e.target.classList.contains("modal")) onClose();
      }}
    >
      <div className="modal-content" style={{ maxWidth: 520 }}>
        <button className="close" onClick={onClose}>
          &times;
        </button>
        <h2>Admin</h2>
        <p style={{ opacity: 0.85 }}>Enter password to upload.</p>

        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="Password"
          style={{ width: "100%", padding: 10, marginTop: 10 }}
        />

        {err && (
          <div
            style={{ marginTop: 10, color: "#ffb3b3", whiteSpace: "pre-wrap" }}
          >
            {err}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button
            className="upnext-play"
            disabled={busy || !pw.trim()}
            onClick={async () => {
              try {
                setBusy(true);
                setErr("");
                const res = await adminLogin(pw.trim());
                onLoggedIn(res.token);
                onClose();
              } catch (e) {
                setErr(e?.message || "Login failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Logging in..." : "Login"}
          </button>

          <button className="upnext-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function SmallLoader({ label = "Loading" }) {
  return (
    <div className="small-loader" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span className="small-loader-text">{label}</span>
    </div>
  );
}

function UploadModal({ open, onClose, token, onUploaded }) {
  const [mode, setMode] = useState("movie"); // "movie" | "series"

  // ---- Movie fields
  const [genres, setGenres] = useState([]);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [rating, setRating] = useState("0.0");
  const [mp4, setMp4] = useState(null);
  const [jpg, setJpg] = useState(null);

  // ---- Series fields
  const [seriesMode, setSeriesMode] = useState("new"); // "new" | "existing"
  const [seriesName, setSeriesName] = useState("");
  const [existingSeries, setExistingSeries] = useState([]);
  const [selectedExisting, setSelectedExisting] = useState("");
  const [episodeFiles, setEpisodeFiles] = useState([]); // File[]
  const [seasonPosters, setSeasonPosters] = useState([]); // File[]

  // ---- shared
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");

  useEffect(() => {
    if (!open) return;

    setErr("");
    setOkMsg("");
    setBusy(false);

    // reset tabs
    setMode("movie");

    // reset movie
    setSelectedGenres([]);
    setName("");
    setDesc("");
    setRating("0.0");
    setMp4(null);
    setJpg(null);

    // reset series
    setSeriesMode("new");
    setSeriesName("");
    setSelectedExisting("");
    setEpisodeFiles([]);
    setSeasonPosters([]);

    // load genres for movies
    (async () => {
      try {
        const { fetchGenres } = await import("./api/adminApi");
        const res = await fetchGenres("Movies");
        setGenres(res.genres || []);
      } catch {
        setGenres([]);
      }
    })();

    // load existing series list (for "add episodes")
    (async () => {
      try {
        const list = await fetchSeries();
        // list includes "Movies" too — remove it
        const only = (Array.isArray(list) ? list : []).filter(
          (s) => s !== "Movies",
        );
        setExistingSeries(only);
        // default selection
        if (only.length) setSelectedExisting(only[0]);
      } catch {
        setExistingSeries([]);
      }
    })();
  }, [open]);

  if (!open) return null;

  const movieReady =
    token &&
    name.trim() &&
    desc.trim() &&
    mp4 &&
    jpg &&
    selectedGenres.length > 0;

  const effectiveSeriesName =
    seriesMode === "existing" ? selectedExisting : seriesName.trim();

  const seriesReady = token && effectiveSeriesName && episodeFiles.length > 0; // posters optional (but recommended)

  return (
    <div
      className="modal"
      style={{ display: "block" }}
      onMouseDown={(e) => {
        if (e.target.classList.contains("modal")) onClose();
      }}
    >
      <div className="modal-content" style={{ maxWidth: 760 }}>
        <button className="close" onClick={onClose}>
          &times;
        </button>

        <h2>Upload</h2>

        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <button
            className={`page-btn ${mode === "movie" ? "active" : ""}`}
            onClick={() => {
              setErr("");
              setOkMsg("");
              setMode("movie");
            }}
          >
            Movie
          </button>
          <button
            className={`page-btn ${mode === "series" ? "active" : ""}`}
            onClick={() => {
              setErr("");
              setOkMsg("");
              setMode("series");
            }}
          >
            Series
          </button>
        </div>

        {/* ---------------- MOVIE ---------------- */}
        {mode === "movie" && (
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            <label>
              Name (used as filename)
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ width: "100%", padding: 10 }}
              />
            </label>

            <label>
              Description
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                rows={3}
                style={{ width: "100%", padding: 10 }}
              />
            </label>

            <label>
              Rating (0–10)
              <input
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                style={{ width: "100%", padding: 10 }}
              />
            </label>

            <label>
              Genres (pick any)
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 8,
                  marginTop: 8,
                }}
              >
                {genres.length === 0 ? (
                  <div style={{ opacity: 0.8 }}>No genres found.</div>
                ) : (
                  genres.map((g) => {
                    const checked = selectedGenres.includes(g);
                    return (
                      <label
                        key={g}
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setSelectedGenres((prev) => {
                              if (e.target.checked)
                                return Array.from(new Set([...prev, g]));
                              return prev.filter((x) => x !== g);
                            });
                          }}
                        />
                        <span>{g}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </label>

            <label>
              MP4 file
              <input
                type="file"
                accept="video/mp4,video/x-m4v"
                onChange={(e) => setMp4(e.target.files?.[0] || null)}
              />
            </label>

            <label>
              Poster JPG
              <input
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                onChange={(e) => setJpg(e.target.files?.[0] || null)}
              />
            </label>

            {err && (
              <div style={{ color: "#ffb3b3", whiteSpace: "pre-wrap" }}>
                {err}
              </div>
            )}
            {okMsg && (
              <div style={{ color: "#b7ffb7", whiteSpace: "pre-wrap" }}>
                {okMsg}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="upnext-play"
                disabled={!movieReady || busy}
                onClick={async () => {
                  try {
                    setBusy(true);
                    setErr("");
                    setOkMsg("");

                    const { uploadMovie } = await import("./api/adminApi");
                    await uploadMovie({
                      token,
                      fileMp4: mp4,
                      fileJpg: jpg,
                      name: name.trim(),
                      description: desc.trim(),
                      rating: rating.trim() || "0.0",
                      genres: selectedGenres,
                    });

                    setOkMsg("Movie uploaded ✅");
                    onUploaded?.();
                    onClose();
                  } catch (e) {
                    setErr(e?.message || "Upload failed");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Uploading..." : "Upload Movie"}
              </button>

              <button className="upnext-cancel" onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ---------------- SERIES ---------------- */}
        {mode === "series" && (
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                className={`page-btn ${seriesMode === "new" ? "active" : ""}`}
                onClick={() => setSeriesMode("new")}
              >
                New series
              </button>
              <button
                className={`page-btn ${seriesMode === "existing" ? "active" : ""}`}
                onClick={() => setSeriesMode("existing")}
              >
                Add episodes to existing
              </button>
            </div>

            {seriesMode === "new" ? (
              <label>
                Series name (folder)
                <input
                  value={seriesName}
                  onChange={(e) => setSeriesName(e.target.value)}
                  style={{ width: "100%", padding: 10 }}
                  placeholder="e.g. Rivers"
                />
              </label>
            ) : (
              <label>
                Choose series
                <select
                  value={selectedExisting}
                  onChange={(e) => setSelectedExisting(e.target.value)}
                  style={{ width: "100%", padding: 10 }}
                >
                  {existingSeries.length === 0 ? (
                    <option value="">(no series found)</option>
                  ) : (
                    existingSeries.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))
                  )}
                </select>
              </label>
            )}

            <div style={{ opacity: 0.85, fontSize: 13, lineHeight: 1.35 }}>
              <b>Naming rules:</b>
              <br />
              Episodes must include <code>SxxEyy</code> in the filename
              (example: <code>S01E03.mp4</code>).
              <br />
              Season posters must be named <code>S01.jpg</code>,{" "}
              <code>S02.jpg</code>, etc.
              <br />
              (Backend will rename to <code>s01e03.mp4</code> and save posters
              as <code>s01.jpg</code>.)
            </div>

            <label>
              Episode files (multi-select)
              <input
                type="file"
                multiple
                accept="video/mp4,video/x-m4v"
                onChange={(e) =>
                  setEpisodeFiles(Array.from(e.target.files || []))
                }
              />
              {!!episodeFiles.length && (
                <div style={{ marginTop: 6, opacity: 0.8, fontSize: 13 }}>
                  Selected: {episodeFiles.length} file(s)
                </div>
              )}
            </label>

            <label>
              Season posters (optional, multi-select)
              <input
                type="file"
                multiple
                accept="image/jpeg,image/jpg,image/png,image/webp"
                onChange={(e) =>
                  setSeasonPosters(Array.from(e.target.files || []))
                }
              />
              {!!seasonPosters.length && (
                <div style={{ marginTop: 6, opacity: 0.8, fontSize: 13 }}>
                  Selected: {seasonPosters.length} poster(s)
                </div>
              )}
            </label>

            {err && (
              <div style={{ color: "#ffb3b3", whiteSpace: "pre-wrap" }}>
                {err}
              </div>
            )}
            {okMsg && (
              <div style={{ color: "#b7ffb7", whiteSpace: "pre-wrap" }}>
                {okMsg}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="upnext-play"
                disabled={!seriesReady || busy}
                onClick={async () => {
                  try {
                    setBusy(true);
                    setErr("");
                    setOkMsg("");

                    const { uploadSeries } = await import("./api/adminApi");
                    const res = await uploadSeries({
                      token,
                      mode: seriesMode, // "new" | "existing"
                      seriesName: effectiveSeriesName,
                      episodeFiles,
                      posters: seasonPosters,
                    });

                    const msg =
                      typeof res?.added === "number"
                        ? `Series upload ✅ Added: ${res.added}, Skipped: ${res.skipped_existing || 0}, Bad: ${res.bad_files || 0}`
                        : "Series upload ✅";

                    setOkMsg(msg);
                    onUploaded?.();
                    onClose();
                  } catch (e) {
                    setErr(e?.message || "Series upload failed");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy
                  ? "Uploading..."
                  : seriesMode === "new"
                    ? "Create Series"
                    : "Add Episodes"}
              </button>

              <button className="upnext-cancel" onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function UpdatesModal({ open, version, body, onClose }) {
  if (!open) return null;

  const content = body?.trim() ? body : "none";

  return (
    <div className="drawer-overlay" onMouseDown={onClose}>
      <div className="updates-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="updates-header">
          <div className="updates-title">
            Updates{" "}
            {version ? <span className="updates-pill">{version}</span> : null}
          </div>
          <button
            className="drawer-close"
            onClick={onClose}
            aria-label="Close updates"
          >
            ✕
          </button>
        </div>

        <pre className="updates-body">{content}</pre>

        <div className="updates-footer">
          <button className="updates-close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function SeriesDrawer({ open, onClose, currentSeries, seriesList, onSelect }) {
  const [navQuery, setNavQuery] = useState("");

  useEffect(() => {
    if (open) setNavQuery("");
  }, [open]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const items = useMemo(() => {
    const out = [];
    const seen = new Set();
    const add = (name) => {
      const n = String(name ?? "").trim();
      if (!n) return;
      const key = n.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(n);
    };
    for (const s of seriesList) add(s);
    return out;
  }, [seriesList]);

  const filteredItems = useMemo(() => {
    const q = navQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((name) => name.toLowerCase().includes(q));
  }, [items, navQuery]);

  if (!open) return null;

  return (
    <div className="drawer-overlay" onMouseDown={onClose}>
      <div className="drawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div className="drawer-title">Browse</div>
          <button className="drawer-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="drawer-search">
          <input
            className="drawer-search-input"
            placeholder="Search series..."
            value={navQuery}
            onChange={(e) => setNavQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className="drawer-list">
          {filteredItems.length === 0 ? (
            <div className="drawer-empty">No matches</div>
          ) : (
            filteredItems.map((name) => (
              <button
                key={name}
                className={`drawer-item ${name === currentSeries ? "active" : ""}`}
                onClick={() => onSelect(name)}
              >
                {name}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

async function urlExists(url) {
  try {
    const res = await fetch(url, { method: "HEAD" });
    if (res.ok) return true;

    // Some servers/proxies don’t like HEAD; fallback to GET (small file anyway)
    const res2 = await fetch(url, { method: "GET" });
    return res2.ok;
  } catch {
    return false;
  }
}

function VideoModal({ open, movie, nextMovie, onPlayNext, onClose }) {
  const videoRef = useRef(null);

  const [showUpNext, setShowUpNext] = useState(false);
  const [autoPlayNext, setAutoPlayNext] = useState(true);
  const [countdown, setCountdown] = useState(10);

  const [playbackError, setPlaybackError] = useState(false);
  const [skipCountdown, setSkipCountdown] = useState(5);
  const [skipCancelled, setSkipCancelled] = useState(false);

  const [subtitleTracks, setSubtitleTracks] = useState([]); // [{src,label,lang,default}]
  const tracksKey = useMemo(
    () =>
      subtitleTracks.length
        ? subtitleTracks.map((t) => t.src).join("|")
        : "no-subs",
    [subtitleTracks],
  );

  const rawVideoPath =
    movie?.video_path ||
    movie?.file ||
    movie?.video ||
    movie?.path ||
    movie?.url;

  const videoSrc = useMemo(() => toMediaUrl(rawVideoPath), [rawVideoPath]);

  const ext = useMemo(() => {
    const s = String(videoSrc || "");
    const q = s.split("?")[0];
    return q.split(".").pop()?.toLowerCase();
  }, [videoSrc]);

  const subtitleCandidates = useMemo(() => {
    if (!rawVideoPath) return [];
    const normalized = String(rawVideoPath).replaceAll("\\", "/");
    const noExt = normalized.replace(/\.[^/.]+$/, ""); // remove .mp4/.mkv...
    return [
      { src: toMediaUrl(`${noExt}.vtt`), label: "Subtitles", lang: "en" },
      { src: toMediaUrl(`${noExt}HE.vtt`), label: "עברית", lang: "he" },
    ].filter((t) => t.src);
  }, [rawVideoPath]);

  const mime = useMemo(() => {
    if (ext === "mkv") return "video/x-matroska";
    return "video/mp4";
  }, [ext]);

  const showFormatWarning = playbackError && ext === "mkv";

  // ✅ whenever the video changes, immediately clear subtitle UI + disable any old tracks
  useLayoutEffect(() => {
    setSubtitleTracks([]);

    const v = videoRef.current;
    if (!v) return;

    try {
      for (const tt of Array.from(v.textTracks || [])) {
        tt.mode = "disabled";
      }
    } catch {
      // ignore
    }
  }, [videoSrc, movie?.id, movie?.name]);

  // ✅ detect which subtitle files exist for THIS video
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!open) return;

      setSubtitleTracks([]); // clear immediately for this movie

      const found = [];
      for (const t of subtitleCandidates) {
        if (!t?.src) continue;
        const ok = await urlExists(t.src);
        if (cancelled) return;
        if (ok) found.push(t);
      }

      // default: if only one exists, make it default.
      // if both exist, make the non-HE one default.
      const withDefault = found.map((t) => ({ ...t, default: false }));
      if (withDefault.length === 1) withDefault[0].default = true;
      if (withDefault.length === 2) {
        const enIdx = withDefault.findIndex((t) => t.lang !== "he");
        if (enIdx >= 0) withDefault[enIdx].default = true;
      }

      setSubtitleTracks(withDefault);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, subtitleCandidates, videoSrc]);

  useEffect(() => {
    if (!open) return;
    setShowUpNext(false);
    setAutoPlayNext(true);
    setCountdown(10);

    setPlaybackError(false);
    setSkipCountdown(5);
    setSkipCancelled(false);
  }, [open, movie?.id, movie?.name, videoSrc]);

  useEffect(() => {
    const v = videoRef.current;
    if (!open || !v || !videoSrc) return;

    const canPlay = v.canPlayType(mime);
    if (!canPlay && ext === "mkv") {
      setPlaybackError(true);
      return;
    }

    setPlaybackError(false);

    v.pause();
    v.currentTime = 0;
    v.load();

    let cancelled = false;

    const p = v.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => {
        if (!cancelled) setPlaybackError(true);
      });
    }

    const startup = setTimeout(() => {
      if (cancelled) return;
      const notStarted =
        v.readyState === 0 || (v.paused && v.currentTime === 0);
      if (notStarted && ext === "mkv") setPlaybackError(true);
    }, 1500);

    return () => {
      cancelled = true;
      clearTimeout(startup);
    };
  }, [open, videoSrc, mime, ext]);

  useEffect(() => {
    if (!showFormatWarning) return;
    if (!nextMovie) return;
    if (skipCancelled) return;

    setSkipCountdown(5);

    const t = setInterval(() => setSkipCountdown((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [showFormatWarning, nextMovie, skipCancelled]);

  useEffect(() => {
    if (!showFormatWarning) return;
    if (!nextMovie) return;
    if (skipCancelled) return;
    if (skipCountdown > 0) return;

    onPlayNext(nextMovie);
  }, [skipCountdown, showFormatWarning, nextMovie, skipCancelled, onPlayNext]);

  useEffect(() => {
    if (!showUpNext) return;
    if (!autoPlayNext) return;
    if (!nextMovie) return;

    const t = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [showUpNext, autoPlayNext, nextMovie]);

  useEffect(() => {
    if (!showUpNext) return;
    if (!autoPlayNext) return;
    if (!nextMovie) return;
    if (countdown > 0) return;

    onPlayNext(nextMovie);
  }, [countdown, showUpNext, autoPlayNext, nextMovie, onPlayNext]);

  if (!open || !movie) return null;

  return (
    <div
      id="videoModal"
      className="modal"
      style={{ display: "block" }}
      onMouseDown={(e) => {
        if (e.target.id === "videoModal") onClose();
      }}
    >
      <div className="modal-content">
        <button className="close" onClick={onClose}>
          &times;
        </button>

        <h2 id="modalName">{movie?.name ?? ""}</h2>
        <p id="modalDescription">{movie?.description ?? ""}</p>

        {!videoSrc ? (
          <div style={{ padding: 12 }}>
            Couldn’t find video path for this movie.
          </div>
        ) : (
          <div style={{ position: "relative" }}>
            {showFormatWarning && (
              <div className="format-warning">
                This file is <b>.mkv</b> and can’t be played in this browser.
                <br />
                {nextMovie ? (
                  <>
                    Skipping to next in <b>{skipCountdown}</b>…
                    <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
                      <button
                        className="upnext-play"
                        onClick={() => onPlayNext(nextMovie)}
                      >
                        Skip now
                      </button>
                      <button
                        className="upnext-cancel"
                        onClick={() => setSkipCancelled(true)}
                      >
                        Not now
                      </button>
                    </div>
                  </>
                ) : (
                  <div style={{ marginTop: 6 }}>No next video to skip to.</div>
                )}
              </div>
            )}

            <video
              // ✅ key forces the <video> element to fully remount when tracks change
              key={`${movie?.id ?? movie?.name ?? videoSrc}|${tracksKey}`}
              ref={videoRef}
              id="videoPlayer"
              controls
              autoPlay
              preload="auto"
              style={{ width: "100%" }}
              onError={() => setPlaybackError(true)}
              onEnded={() => {
                if (nextMovie) setShowUpNext(true);
              }}
            >
              <source src={videoSrc} type={mime} />
              {subtitleTracks.map((t) => (
                <track
                  key={t.src}
                  kind="subtitles"
                  src={t.src}
                  srcLang={t.lang}
                  label={t.label}
                  default={t.default}
                />
              ))}
              Your browser does not support the video tag.
            </video>

            {showUpNext && nextMovie && (
              <div className="upnext-overlay">
                <div className="upnext-box">
                  <div className="upnext-title">Up Next</div>
                  <div className="upnext-name">{nextMovie?.name ?? "Next"}</div>

                  <div className="upnext-actions">
                    <button
                      className="upnext-play"
                      onClick={() => onPlayNext(nextMovie)}
                    >
                      Play Next {autoPlayNext ? `(${countdown})` : ""}
                    </button>

                    <button
                      className="upnext-cancel"
                      onClick={() => {
                        setAutoPlayNext(false);
                        setShowUpNext(false);
                      }}
                    >
                      Not now
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function getPaginationItems(currentPage, totalPages) {
  const items = [];
  const addPage = (p) => items.push({ type: "page", page: p });
  const addEllipsis = () => items.push({ type: "ellipsis" });

  if (totalPages <= 5) {
    for (let i = 1; i <= totalPages; i++) addPage(i);
    return items;
  }

  if (currentPage <= 2) {
    for (let i = 1; i <= 3; i++) addPage(i);
    addEllipsis();
    addPage(totalPages);
    return items;
  }

  if (currentPage === 3) {
    for (let i = 1; i <= 4; i++) addPage(i);
    addEllipsis();
    addPage(totalPages);
    return items;
  }

  if (currentPage === totalPages - 2) {
    addPage(1);
    addEllipsis();
    for (let i = totalPages - 3; i <= totalPages; i++) addPage(i);
    return items;
  }

  if (currentPage >= totalPages - 1) {
    addPage(1);
    addEllipsis();
    for (let i = totalPages - 2; i <= totalPages; i++) addPage(i);
    return items;
  }

  addPage(1);
  addEllipsis();
  addPage(currentPage - 1);
  addPage(currentPage);
  addPage(currentPage + 1);
  addEllipsis();
  addPage(totalPages);

  return items;
}

function MovieCard({ movie, onOpen }) {
  const name = movie?.name ?? "Untitled";
  const desc = movie?.description ?? "";
  const ratingNum = Number(movie?.rating ?? 0);

  const rawPosterPath =
    movie?.poster_path || movie?.poster || movie?.posterFile || movie?.image;
  const posterSrc = toMediaUrl(rawPosterPath) || "/reactflix.png";

  const genres = Array.isArray(movie?.genres)
    ? movie.genres
    : typeof movie?.genres === "string"
      ? movie.genres
          .split(",")
          .map((g) => g.trim())
          .filter(Boolean)
      : [];

  return (
    <div
      className="movie"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(movie)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen(movie);
      }}
    >
      <img
        src={posterSrc}
        alt={name}
        onError={(e) => {
          e.currentTarget.src = "/reactflix.png";
        }}
      />

      <div className="movie-info">
        <h3>{name}</h3>

        <div className="rating-row">
          <span className={getRatingClass(ratingNum)}>
            {String(movie?.rating ?? "0.0")}
          </span>
          <Stars rating={movie?.rating} />
        </div>

        {genres.length > 0 && (
          <div className="genres">
            {genres.map((g) => (
              <span key={g} className="genre-tag">
                {g}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="overview">
        <h3>Overview</h3>
        {desc}
      </div>
    </div>
  );
}

function getRatingClass(r) {
  if (Number.isNaN(r)) return "norating";
  if (r >= 7.5) return "green";
  if (r >= 5) return "orange";
  return "red";
}

function Stars({ rating }) {
  const r = Number(rating);
  const safe = Number.isFinite(r) ? Math.max(0, Math.min(10, r)) : 0;
  const stars5 = safe / 2;
  const rounded = Math.round(stars5 * 2) / 2;
  const full = Math.floor(rounded);
  const hasHalf = rounded - full >= 0.5;

  return (
    <span className="stars" aria-label={`${rounded} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => {
        const idx = i + 1;
        if (idx <= full)
          return (
            <span key={i} className="star full">
              ★
            </span>
          );
        if (idx === full + 1 && hasHalf)
          return (
            <span key={i} className="star half">
              <span className="half-left">★</span>
              <span className="half-right">★</span>
            </span>
          );
        return (
          <span key={i} className="star empty">
            ★
          </span>
        );
      })}
    </span>
  );
}

/**
 * IMPORTANT: your Flask serves media at "/<path:filename>"
 * and your backend returns "Movies/Some.mp4" etc,
 * so we map it to "/Movies/Some.mp4" (NOT "/media/...").
 */
function toMediaUrl(path) {
  if (!path) return null;
  let p = String(path).replaceAll("\\", "/");
  p = p.replace(/^\/+/, "");
  // encodeURI keeps "/" but encodes spaces etc.
  return encodeURI(`/${p}`);
}
