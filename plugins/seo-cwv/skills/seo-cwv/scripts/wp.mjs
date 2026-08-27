// wp.mjs — SAFE apply helpers for WordPress via WP-CLI over SSH.
// Runs ON THE USER'S machine (Claude Code), against THEIR server. Never hardcode
// credentials — they come from the per-site config passed in.
//
// Guardrails baked in:
//  - dryRun: prints the command, does NOT execute.
//  - backup(): timestamped copy before touching a file.
//  - every mutating call returns {ok, cmd, out} so Claude can log it.
//
// Usage from Claude Code:
//   import { wp, sshRun, backupRemote } from "./scripts/wp.mjs";
//   const cfg = JSON.parse(fs.readFileSync("config/<site>.json"));
//   await wp(cfg, "plugin list --status=active", { dryRun: true });
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const pexec = promisify(execFile);

// Build the ssh target from config.ssh = { host, user, port?, key?, wpPath }
function sshArgs(cfg) {
  const s = cfg.ssh || {};
  const args = [];
  if (s.port) args.push("-p", String(s.port));
  if (s.key) args.push("-i", s.key);
  args.push("-o", "StrictHostKeyChecking=accept-new");
  args.push(`${s.user}@${s.host}`);
  return args;
}

// Run a raw command on the server over SSH.
export async function sshRun(cfg, command, { dryRun = false } = {}) {
  const full = command;
  if (dryRun) { console.log("[dry-run ssh]", full); return { ok: true, dryRun: true, cmd: full }; }
  try {
    const { stdout, stderr } = await pexec("ssh", [...sshArgs(cfg), full], { maxBuffer: 10 * 1024 * 1024 });
    return { ok: true, cmd: full, out: stdout.trim(), err: stderr.trim() };
  } catch (e) {
    return { ok: false, cmd: full, error: String(e.stderr || e.message || e) };
  }
}

// Run a WP-CLI command in the WordPress path.
export async function wp(cfg, wpCommand, opts = {}) {
  const path = (cfg.ssh && cfg.ssh.wpPath) || "~/public_html";
  return sshRun(cfg, `cd ${path} && wp ${wpCommand}`, opts);
}

// Timestamped backup of a remote file BEFORE editing it (returns backup path).
export async function backupRemote(cfg, remoteFile, { dryRun = false } = {}) {
  const stamp = "$(date +%Y%m%d-%H%M%S)";
  const bak = `${remoteFile}.bak-${stamp}`;
  const r = await sshRun(cfg, `cp -a "${remoteFile}" "${bak}" && echo "${bak}"`, { dryRun });
  return { ...r, backup: bak };
}

// Convenience: is WP-CLI available on the server?
export async function checkWpCli(cfg, opts = {}) {
  return wp(cfg, "--info", opts);
}
