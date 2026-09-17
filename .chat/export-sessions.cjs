// Export full session transcripts (all sessions in this repo) to .chat/
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const db = path.join(process.env.TEMP, "opencode-copy.db");
const py = process.platform === "win32" ? "python" : "python3";

const script = `
import sqlite3, json, sys, os
db = sqlite3.connect(r"${db.replace(/\\/g, "\\\\")}")
db.row_factory = sqlite3.Row
repo = "loom-realm"
out = {}
# v2 sessions for this repo via project_directory
dirs = {r["project_id"]: r["directory"] for r in db.execute("SELECT project_id, directory FROM project_directory")}
for s in db.execute("SELECT * FROM session_v2"):
    pid = s["project_id"] if "project_id" in s.keys() else None
    d = dirs.get(pid, "")
    if repo not in (d or "") and repo not in (s["directory"] or ""):
        continue
    sid = s["id"]
    msgs = []
    for m in db.execute("SELECT * FROM session_message WHERE session_id = ? ORDER BY time_created", (sid,)):
        parts = []
        for p in db.execute("SELECT * FROM part WHERE session_id = ? ORDER BY time_created", (sid,)):
            try:
                parts.append(json.loads(p["data"]))
            except Exception:
                parts.append({"raw": str(p["data"])[:2000]})
        msgs.append({"id": m["id"], "time": m["time_created"], "parts": parts})
    out[sid] = {"title": s["title"], "directory": d or s["directory"], "messages": msgs}
print(json.dumps(out, ensure_ascii=False, default=str))
`;

const raw = execFileSync(py, ["-c", script], { encoding: "utf8", timeout: 120_000, maxBuffer: 256 * 1024 * 1024 });
const sessions = JSON.parse(raw);
const outDir = __dirname;
for (const [sid, session] of Object.entries(sessions)) {
  const file = path.join(outDir, `${sid}.json`);
  fs.writeFileSync(file, JSON.stringify(session, null, 2), "utf8");
  console.log(`${sid}: ${session.messages.length} messages -> ${path.basename(file)} (${session.title})`);
}
if (Object.keys(sessions).length === 0) console.log("NO SESSIONS FOUND for this repo");
