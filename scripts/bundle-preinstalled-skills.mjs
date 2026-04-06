#!/usr/bin/env zx

import 'zx/globals';
import {
  readFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  cpSync,
  writeFileSync,
  readdirSync,
} from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform === 'win32') {
  $.shell = 'powershell.exe';
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MANIFEST_PATH = join(ROOT, 'resources', 'skills', 'preinstalled-manifest.json');
const OUTPUT_ROOT = join(ROOT, 'build', 'preinstalled-skills');
const CACHE_ROOT = process.env.PREINSTALLED_SKILLS_CACHE_DIR
  ? resolvePath(process.env.PREINSTALLED_SKILLS_CACHE_DIR)
  : join(ROOT, 'build', '.cache-preinstalled-skills');
const LOCAL_ROOT = process.env.PREINSTALLED_SKILLS_LOCAL_ROOT
  ? resolvePath(process.env.PREINSTALLED_SKILLS_LOCAL_ROOT)
  : join(ROOT, 'resources', 'skills', 'local');
const SKIP_REMOTE = process.env.PREINSTALLED_SKILLS_SKIP_REMOTE === '1';
const REFRESH_REMOTE = process.env.PREINSTALLED_SKILLS_REFRESH === '1';
const GITHUB_HEADERS = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'UfrenClaw-build-script',
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};

function resolvePath(input) {
  return isAbsolute(input) ? input : join(ROOT, input);
}

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(`Missing manifest: ${MANIFEST_PATH}`);
  }
  const raw = readFileSync(MANIFEST_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.skills)) {
    throw new Error('Invalid preinstalled-skills manifest format');
  }
  for (const item of parsed.skills) {
    if (!item.slug || !item.repo || !item.repoPath) {
      throw new Error(`Invalid manifest entry: ${JSON.stringify(item)}`);
    }
  }
  return parsed.skills;
}

function groupByRepoRef(entries) {
  const grouped = new Map();
  for (const entry of entries) {
    const ref = entry.ref || 'main';
    const key = `${entry.repo}#${ref}`;
    if (!grouped.has(key)) grouped.set(key, { repo: entry.repo, ref, entries: [] });
    grouped.get(key).entries.push(entry);
  }
  return [...grouped.values()];
}

function createRepoDirName(repo, ref) {
  return `${repo.replace(/[\\/]/g, '__')}__${ref.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
}

function getRepoCacheRoot(repo, ref) {
  return join(CACHE_ROOT, createRepoDirName(repo, ref));
}

function getLatestMetaPath(repo, ref) {
  return join(getRepoCacheRoot(repo, ref), 'latest.json');
}

function readLatestMeta(repo, ref) {
  const latestPath = getLatestMetaPath(repo, ref);
  if (!existsSync(latestPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(latestPath, 'utf8'));
  } catch {
    return null;
  }
}

function writeLatestMeta(repo, ref, commit) {
  const latestPath = getLatestMetaPath(repo, ref);
  mkdirSync(dirname(latestPath), { recursive: true });
  writeFileSync(
    latestPath,
    `${JSON.stringify({ commit, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  );
}

function listCachedCommits(repo, ref) {
  const repoCacheRoot = getRepoCacheRoot(repo, ref);
  if (!existsSync(repoCacheRoot)) {
    return [];
  }
  return readdirSync(repoCacheRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
}

function pickCachedCommit(repo, ref) {
  const latestMeta = readLatestMeta(repo, ref);
  if (latestMeta?.commit) {
    return latestMeta.commit;
  }
  return listCachedCommits(repo, ref)[0] || null;
}

function resolveLocalSource(entry) {
  const candidates = [];
  if (entry.localPath) {
    candidates.push(resolvePath(entry.localPath));
  }
  candidates.push(join(LOCAL_ROOT, entry.slug));
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'SKILL.md'))) {
      return candidate;
    }
  }
  return null;
}

function encodeRepoPath(repoPath) {
  return repoPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: GITHUB_HEADERS });
  if (!response.ok) {
    throw new Error(`${url} -> ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function fetchBuffer(url) {
  const response = await fetch(url, { headers: GITHUB_HEADERS });
  if (!response.ok) {
    throw new Error(`${url} -> ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function resolveCommit(repo, ref) {
  const data = await fetchJson(
    `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(ref)}`,
  );
  if (!data?.sha) {
    throw new Error(`Unable to resolve commit for ${repo} @ ${ref}`);
  }
  return data.sha;
}

async function writeGitHubFile(entry, snapshotRoot) {
  const targetPath = join(snapshotRoot, entry.path);
  mkdirSync(dirname(targetPath), { recursive: true });
  if (entry.download_url) {
    writeFileSync(targetPath, await fetchBuffer(entry.download_url));
    return;
  }
  if (!entry.git_url) {
    throw new Error(`Unable to download ${entry.path}`);
  }
  const blob = await fetchJson(entry.git_url);
  const content =
    blob?.encoding === 'base64'
      ? Buffer.from((blob.content || '').replace(/\n/g, ''), 'base64')
      : Buffer.from(blob?.content || '', 'utf8');
  writeFileSync(targetPath, content);
}

async function downloadRepoPath(repo, ref, repoPath, snapshotRoot) {
  const url = `https://api.github.com/repos/${repo}/contents/${encodeRepoPath(repoPath)}?ref=${encodeURIComponent(ref)}`;
  const payload = await fetchJson(url);
  if (Array.isArray(payload)) {
    mkdirSync(join(snapshotRoot, repoPath), { recursive: true });
    for (const entry of payload) {
      if (entry.type === 'dir') {
        await downloadRepoPath(repo, ref, entry.path, snapshotRoot);
        continue;
      }
      if (entry.type === 'file' || entry.type === 'symlink') {
        await writeGitHubFile(entry, snapshotRoot);
      }
    }
    return;
  }
  if (payload?.type === 'dir') {
    await downloadRepoPath(repo, ref, payload.path, snapshotRoot);
    return;
  }
  if (payload?.type === 'file' || payload?.type === 'symlink') {
    await writeGitHubFile(payload, snapshotRoot);
    return;
  }
  throw new Error(`Unsupported GitHub contents payload for ${repoPath}`);
}

async function ensureRemoteGroupSnapshot(group) {
  const cachedCommit = pickCachedCommit(group.repo, group.ref);
  let commit = cachedCommit;
  if (!commit || REFRESH_REMOTE) {
    if (SKIP_REMOTE) {
      throw new Error(`No cached snapshot available for ${group.repo} while PREINSTALLED_SKILLS_SKIP_REMOTE=1`);
    }
    try {
      commit = await resolveCommit(group.repo, group.ref);
    } catch (error) {
      if (!commit) {
        throw error;
      }
      echo`   ⚠️  Failed to refresh ${group.repo}, using cached snapshot ${commit}`;
    }
  } else if (!commit) {
    throw new Error(`No cached snapshot available for ${group.repo} while PREINSTALLED_SKILLS_SKIP_REMOTE=1`);
  }

  const snapshotRoot = join(getRepoCacheRoot(group.repo, group.ref), commit);
  mkdirSync(snapshotRoot, { recursive: true });

  for (const repoPath of [...new Set(group.entries.map((entry) => entry.repoPath))]) {
    if (existsSync(join(snapshotRoot, repoPath))) {
      continue;
    }
    if (SKIP_REMOTE) {
      throw new Error(`Missing cached path for ${group.repo}: ${repoPath}`);
    }
    echo`   caching ${repoPath}`;
    await downloadRepoPath(group.repo, group.ref, repoPath, snapshotRoot);
  }

  writeLatestMeta(group.repo, group.ref, commit);
  return { commit, snapshotRoot };
}

echo`Bundling preinstalled skills...`;
const manifestSkills = loadManifest();

rmSync(OUTPUT_ROOT, { recursive: true, force: true });
mkdirSync(OUTPUT_ROOT, { recursive: true });
mkdirSync(CACHE_ROOT, { recursive: true });

const lock = {
  generatedAt: new Date().toISOString(),
  skills: [],
};

const remoteEntries = [];
for (const entry of manifestSkills) {
  const localSourceDir = resolveLocalSource(entry);
  if (!localSourceDir) {
    remoteEntries.push(entry);
    continue;
  }

  const targetDir = join(OUTPUT_ROOT, entry.slug);
  rmSync(targetDir, { recursive: true, force: true });
  cpSync(localSourceDir, targetDir, { recursive: true, dereference: true });

  const skillManifest = join(targetDir, 'SKILL.md');
  if (!existsSync(skillManifest)) {
    throw new Error(`Skill ${entry.slug} is missing SKILL.md after copy`);
  }

  lock.skills.push({
    slug: entry.slug,
    version: 'local',
    repo: entry.repo,
    repoPath: entry.repoPath,
    ref: entry.ref || 'main',
    commit: null,
    localPath: localSourceDir,
  });

  echo`Using local ${entry.slug} -> ${localSourceDir}`;
}

const groups = groupByRepoRef(remoteEntries);
for (const group of groups) {
  echo`Fetching ${group.repo} @ ${group.ref}`;
  let snapshot;
  try {
    snapshot = await ensureRemoteGroupSnapshot(group);
    echo`   commit ${snapshot.commit}`;
  } catch (e) {
    echo`   ⚠️  Failed to fetch ${group.repo} (${String(e?.message || e)}), skipping`;
    continue;
  }

  for (const entry of group.entries) {
    const sourceDir = join(snapshot.snapshotRoot, entry.repoPath);
    const targetDir = join(OUTPUT_ROOT, entry.slug);

    if (!existsSync(sourceDir)) {
      throw new Error(`Missing source path in cached snapshot: ${entry.repoPath}`);
    }

    rmSync(targetDir, { recursive: true, force: true });
    cpSync(sourceDir, targetDir, { recursive: true, dereference: true });

    const skillManifest = join(targetDir, 'SKILL.md');
    if (!existsSync(skillManifest)) {
      throw new Error(`Skill ${entry.slug} is missing SKILL.md after copy`);
    }

    const requestedVersion = (entry.version || '').trim();
    const resolvedVersion = !requestedVersion || requestedVersion === 'main'
      ? snapshot.commit
      : requestedVersion;
    lock.skills.push({
      slug: entry.slug,
      version: resolvedVersion,
      repo: entry.repo,
      repoPath: entry.repoPath,
      ref: group.ref,
      commit: snapshot.commit,
    });

    echo`   OK ${entry.slug}`;
  }
}

writeFileSync(join(OUTPUT_ROOT, '.preinstalled-lock.json'), `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
echo`Preinstalled skills ready: ${OUTPUT_ROOT}`;
