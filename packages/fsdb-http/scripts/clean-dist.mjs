import { rm } from "node:fs/promises";

// This URL is package-local and fixed; it cannot resolve outside fsdb-http.
await rm(new URL("../dist/", import.meta.url), { recursive: true, force: true });
