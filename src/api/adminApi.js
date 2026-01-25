const BASE = ""; // keep empty if using Vite proxy

async function httpJson(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `Request failed (${res.status})`);
  }
  // login returns json, genres returns json
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

export async function adminLogin(password) {
  // Flask: POST /api/admin/login
  return httpJson(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
}

export async function fetchGenres(series = "Movies") {
  // Flask: GET /api/genres?series=<name> -> { genres: [...] }
  return httpJson(`${BASE}/api/genres?series=${encodeURIComponent(series)}`);
}

export async function uploadMovie({
  token,
  fileMp4,
  fileJpg,
  name,
  description,
  rating,
  genres,
}) {
  const fd = new FormData();
  fd.append("name", name);
  fd.append("description", description);
  fd.append("rating", rating);
  fd.append("genres", JSON.stringify(genres));
  fd.append("poster", fileJpg);
  fd.append("file", fileMp4);

  // Flask: POST /add_movie?series=Movies  (Bearer token)
  return httpJson(`${BASE}/add_movie?series=Movies`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
}

export async function uploadSeries({
  token,
  mode, // "new" | "existing"
  seriesName,
  episodeFiles, // File[]
  posters, // File[]
}) {
  const fd = new FormData();
  fd.append("mode", mode);
  fd.append("seriesName", seriesName);

  for (const f of episodeFiles) fd.append("files", f);
  for (const p of posters) fd.append("posters", p);

  const res = await fetch("/add_series", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Series upload failed (${res.status})`);
  }

  // backend returns json in my suggested route
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return await res.json();
  return { ok: true, text: await res.text() };
}
