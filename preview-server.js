// Local Neuron Foundry preview + optional GitHub project bridge.
// Run: node preview-server.js
// To enable GitHub sign-in, set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in
// this terminal before starting the server. Never place them in a project file.
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const clientId = process.env.GITHUB_CLIENT_ID || "";
const clientSecret = process.env.GITHUB_CLIENT_SECRET || "";
const redirectUri = process.env.GITHUB_REDIRECT_URI || `http://127.0.0.1:${port}/auth/github/callback`;
const applicationUrl = process.env.NEURON_FOUNDRY_APP_URL || "http://127.0.0.1:4173";
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".txt": "text/plain; charset=utf-8" };
const pendingAuthorizations = new Map();
const sessions = new Map();
const forbiddenProjectKeys = /^(pretrained(_?weights?)?|weights?|biases?|checkpoints?|model_?state|state_?dict|optimizer_?state|trained_?weights|weight_?tensor|bias_?tensor|parameter_?values)$/i;

function cookies(request) { return Object.fromEntries(String(request.headers.cookie || "").split(";").map((item) => item.trim().split(/=(.*)/s)).filter(([key]) => key)); }
function sessionFor(request) { return sessions.get(cookies(request).nf_github_session); }
function reply(response, status, body, headers = {}) { response.writeHead(status, { "Cache-Control": "no-store", "Access-Control-Allow-Origin": applicationUrl, "Access-Control-Allow-Credentials": "true", ...headers }); response.end(body); }
function json(response, status, value) { reply(response, status, JSON.stringify(value), { "Content-Type": "application/json; charset=utf-8" }); }
function safeProject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Project data must be an object");
  const copy = (entry, key = "") => {
    if (forbiddenProjectKeys.test(key)) return undefined;
    if (Array.isArray(entry)) return entry.map((item) => copy(item)).filter((item) => item !== undefined);
    if (entry && typeof entry === "object") return Object.fromEntries(Object.entries(entry).flatMap(([childKey, child]) => { const safe = copy(child, childKey); return safe === undefined ? [] : [[childKey, safe]]; }));
    return entry;
  };
  const result = copy(value);
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > 8 * 1024 * 1024) throw new Error("Project design is too large to import");
  return result;
}
function repositoryParts(value) { const match = String(value || "").trim().match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/); if (!match) throw new Error("Repository must look like owner/repository"); return { owner: match[1], repository: match[2] }; }
async function requestGithub(session, pathname, options = {}) {
  const response = await fetch(`https://api.github.com${pathname}`, { ...options, headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${session.accessToken}`, "X-GitHub-Api-Version": "2022-11-28", ...(options.headers || {}) } });
  if (!response.ok) throw new Error(`GitHub request failed (${response.status})`);
  return response.status === 204 ? null : response.json();
}
async function readBody(request) { let body = ""; for await (const chunk of request) { body += chunk; if (body.length > 10 * 1024 * 1024) throw new Error("Request is too large"); } return JSON.parse(body || "{}"); }
async function existingFileSha(session, owner, repository, file) {
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${encodeURIComponent(file)}`, { headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${session.accessToken}`, "X-GitHub-Api-Version": "2022-11-28" } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub could not read ${file} (${response.status})`);
  return (await response.json()).sha;
}
async function writeRepoFile(session, owner, repository, file, text, message) {
  const sha = await existingFileSha(session, owner, repository, file);
  const body = { message, content: Buffer.from(text, "utf8").toString("base64"), ...(sha ? { sha } : {}) };
  return requestGithub(session, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${encodeURIComponent(file)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    if (request.method === "OPTIONS") { reply(response, 204, "", { "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }); return; }
    if (url.pathname === "/api/github/status") { const session = sessionFor(request); json(response, 200, { configured: Boolean(clientId && clientSecret), connected: Boolean(session), user: session?.user || null }); return; }
    if (url.pathname === "/auth/github") {
      if (!clientId || !clientSecret) { json(response, 503, { error: "GitHub is not configured on this computer yet." }); return; }
      const state = crypto.randomBytes(32).toString("hex"); pendingAuthorizations.set(state, Date.now());
      const authorize = new URL("https://github.com/login/oauth/authorize"); authorize.searchParams.set("client_id", clientId); authorize.searchParams.set("redirect_uri", redirectUri); authorize.searchParams.set("state", state);
      response.writeHead(302, { Location: authorize.toString(), "Cache-Control": "no-store" }); response.end(); return;
    }
    if (url.pathname === "/auth/github/callback") {
      const state = url.searchParams.get("state"), code = url.searchParams.get("code");
      if (!state || !code || !pendingAuthorizations.has(state) || Date.now() - pendingAuthorizations.get(state) > 10 * 60 * 1000) { reply(response, 400, "GitHub sign-in expired. Return to Neuron Foundry and try again."); return; }
      pendingAuthorizations.delete(state);
      const tokenReply = await fetch("https://github.com/login/oauth/access_token", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }) });
      const token = await tokenReply.json(); if (!tokenReply.ok || !token.access_token) throw new Error("GitHub did not return an access token");
      const userReply = await fetch("https://api.github.com/user", { headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token.access_token}` } }); if (!userReply.ok) throw new Error("GitHub identity check failed");
      const user = await userReply.json(), sessionId = crypto.randomBytes(32).toString("hex"); sessions.set(sessionId, { accessToken: token.access_token, user: { login: user.login, avatarUrl: user.avatar_url } });
      response.writeHead(302, { Location: `${applicationUrl}/index.html#github`, "Set-Cookie": `nf_github_session=${sessionId}; HttpOnly; SameSite=Lax; Path=/`, "Cache-Control": "no-store" }); response.end(); return;
    }
    if (url.pathname === "/api/github/logout" && request.method === "POST") { sessions.delete(cookies(request).nf_github_session); reply(response, 204, "", { "Set-Cookie": "nf_github_session=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/" }); return; }
    if (url.pathname === "/api/github/export" && request.method === "POST") {
      const session = sessionFor(request); if (!session) { json(response, 401, { error: "Connect GitHub first." }); return; }
      const payload = await readBody(request), { owner, repository } = repositoryParts(payload.repository), project = safeProject(payload.project);
      if (typeof payload.python !== "string" || payload.python.length > 8 * 1024 * 1024) throw new Error("Generated Python is missing or too large");
      const title = String(project.name || "Neuron Foundry project");
      await writeRepoFile(session, owner, repository, "project.json", `${JSON.stringify(project, null, 2)}\n`, `Export ${title} project design`);
      await writeRepoFile(session, owner, repository, "train.py", payload.python, `Export ${title} CUDA training script`);
      await writeRepoFile(session, owner, repository, ".gitignore", "__pycache__/\n*.py[cod]\n.venv/\n.env\n*.pt\n*.pth\n*.ckpt\ncheckpoints/\nweights/\n", "Add Neuron Foundry safety gitignore");
      await writeRepoFile(session, owner, repository, "README.md", `# ${title}\n\nGenerated by Neuron Foundry. This repository stores the model design and generated training script. It intentionally does not include pretrained weights, checkpoints, optimizer state, or secrets.\n`, "Document Neuron Foundry export");
      json(response, 200, { ok: true, repository: `${owner}/${repository}`, url: `https://github.com/${owner}/${repository}` }); return;
    }
    if (url.pathname === "/api/github/import" && request.method === "GET") {
      const session = sessionFor(request); if (!session) { json(response, 401, { error: "Connect GitHub first." }); return; }
      const { owner, repository } = repositoryParts(url.searchParams.get("repository")); const ref = String(url.searchParams.get("ref") || "").trim(), query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
      const file = await requestGithub(session, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/project.json${query}`); if (!file?.content) throw new Error("That repository does not contain project.json");
      const project = safeProject(JSON.parse(Buffer.from(file.content.replace(/\s/g, ""), "base64").toString("utf8")));
      json(response, 200, { project, repository: `${owner}/${repository}`, ref: file.sha }); return;
    }
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname, file = path.join(root, pathname);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { reply(response, 404, "Not found"); return; }
    response.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" }); fs.createReadStream(file).pipe(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    if (request.url.startsWith("/api/")) json(response, 400, { error: message }); else reply(response, 500, message);
  }
}).listen(port, "127.0.0.1", () => console.log(`Preview: http://127.0.0.1:${port}`));
