import { config as loadEnv } from "dotenv";
import { execFileSync } from "node:child_process";
import path from "node:path";

loadEnv();

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error("MONGODB_URI is not set. Add it to your .env file before running a backup.");
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.join("backups", timestamp);

console.log(`Running mongodump -> ${outDir}`);

try {
  execFileSync("mongodump", ["--uri", uri, "--out", outDir], { stdio: "inherit" });
  console.log("Backup complete:", outDir);
} catch (error) {
  console.error(
    "mongodump failed. Make sure the MongoDB Database Tools (mongodump) are installed and on your PATH:",
    error.message
  );
  process.exit(1);
}
