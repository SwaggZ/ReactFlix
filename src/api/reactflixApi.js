const BASE = ""; // keep empty if using Vite proxy

async function httpJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `Request failed (${res.status})`);
  }
  return res.json();
}

export async function fetchSeries() {
  // Flask: GET /series -> [ "Movies", "Rivers", ... ]
  return httpJson(`${BASE}/series`);
}

export async function fetchMovies() {
  // Flask: GET /movies?series=Movies -> [ ... ]
  return httpJson(`${BASE}/movies?series=Movies`);
}

export async function fetchSeriesData(seriesName) {
  // Flask: GET /series_data?series=<name> -> { movies: [...], genres: [...] }
  return httpJson(`${BASE}/series_data?series=${encodeURIComponent(seriesName)}`);
}
