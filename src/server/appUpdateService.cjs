const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.resolve(__dirname, '../..');

function runCmd(cmd, args, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === 'win32';
    const file = isWin && (cmd === 'npm' || cmd === 'npx') ? `${cmd}.cmd` : cmd;
    execFile(
      file,
      args,
      {
        cwd: REPO_ROOT,
        timeout: timeoutMs,
        windowsHide: true,
        shell: isWin && file.endsWith('.cmd'),
      },
      (err, stdout, stderr) => {
        if (err) {
          const msg = (stderr || stdout || err.message || '').toString().trim();
          reject(new Error(msg || `Command failed: ${cmd} ${args.join(' ')}`));
          return;
        }
        resolve((stdout || '').toString().trim());
      }
    );
  });
}

function readPackageVersion() {
  try {
    const pkgPath = path.join(REPO_ROOT, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

async function checkAppUpdate(options = {}) {
  const fetchRemote = options.fetchRemote !== false;
  const version = readPackageVersion();

  try {
    if (fetchRemote) {
      try {
        await runCmd('git', ['fetch', 'origin', 'master', '--quiet'], 15000);
      } catch (fetchErr) {
        // Offline or GitHub unreachable — continue with cached refs and report warning
        const localSha = await runCmd('git', ['rev-parse', '--short', 'HEAD']).catch(() => 'unknown');
        const localSummary = await runCmd('git', ['log', '-1', '--format=%h • %s (%cr)']).catch(() => localSha);
        return {
          ok: true,
          offlineWarning: `Could not reach GitHub (${fetchErr.message}). Showing local version.`,
          version,
          branch: 'master',
          localSha,
          localCommitSummary: localSummary,
          remoteSha: localSha,
          behindCount: 0,
          aheadCount: 0,
          updateAvailable: false,
          incomingCommits: [],
          checkedAt: new Date().toISOString(),
        };
      }
    }

    const [branch, localSha, localSummary, remoteSha, behindStr, aheadStr, logRaw] = await Promise.all([
      runCmd('git', ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => 'master'),
      runCmd('git', ['rev-parse', '--short', 'HEAD']),
      runCmd('git', ['log', '-1', '--format=%h • %s (%cr)']).catch(() => ''),
      runCmd('git', ['rev-parse', '--short', 'origin/master']).catch(() => ''),
      runCmd('git', ['rev-list', 'HEAD..origin/master', '--count']).catch(() => '0'),
      runCmd('git', ['rev-list', 'origin/master..HEAD', '--count']).catch(() => '0'),
      runCmd('git', ['log', 'HEAD..origin/master', '--pretty=format:%h|%s|%cr', '-n', '15']).catch(() => ''),
    ]);

    const behindCount = parseInt(behindStr, 10) || 0;
    const aheadCount = parseInt(aheadStr, 10) || 0;
    const incomingCommits = logRaw
      ? logRaw
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => {
            const [sha, subject, relativeDate] = line.split('|');
            return {
              sha: sha || '',
              message: subject || '',
              date: relativeDate || '',
            };
          })
      : [];

    return {
      ok: true,
      version,
      branch,
      localSha,
      localCommitSummary: localSummary || localSha,
      remoteSha: remoteSha || localSha,
      behindCount,
      aheadCount,
      updateAvailable: behindCount > 0,
      incomingCommits,
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      version,
      error: err.message || 'Failed to check Git status.',
      updateAvailable: false,
      behindCount: 0,
      incomingCommits: [],
      checkedAt: new Date().toISOString(),
    };
  }
}

async function applyAppUpdate(options = {}) {
  const stepsLog = [];
  const isElectron = Boolean(options.isElectron);

  // 1. Fetch latest origin/master
  stepsLog.push('Fetching latest commits from GitHub (origin/master)...');
  await runCmd('git', ['fetch', 'origin', 'master'], 30000);

  const beforeFullSha = await runCmd('git', ['rev-parse', 'HEAD']);
  const beforeShortSha = await runCmd('git', ['rev-parse', '--short', 'HEAD']);
  const targetFullSha = await runCmd('git', ['rev-parse', 'origin/master']);
  const targetShortSha = await runCmd('git', ['rev-parse', '--short', 'origin/master']);

  const behindStr = await runCmd('git', ['rev-list', 'HEAD..origin/master', '--count']).catch(() => '0');
  const behindCount = parseInt(behindStr, 10) || 0;

  if (beforeFullSha === targetFullSha || behindCount === 0) {
    stepsLog.push(`Already up to date at commit ${beforeShortSha}.`);
    const status = await checkAppUpdate({ fetchRemote: false });
    return {
      ok: true,
      alreadyUpToDate: true,
      previousSha: beforeShortSha,
      newSha: targetShortSha,
      updatedCommitsCount: 0,
      stashedChanges: false,
      ranNpmInstall: false,
      ranBuild: false,
      stepsLog,
      status,
    };
  }

  // 2. Check for local uncommitted edits or CRLF diffs and auto-stash them so git pull never fails
  let stashedChanges = false;
  const dirtyStatus = await runCmd('git', ['status', '--porcelain']).catch(() => '');
  if (dirtyStatus.trim().length > 0) {
    stepsLog.push('Backing up local file changes into git stash so update applies cleanly...');
    try {
      await runCmd(
        'git',
        ['stash', 'push', '-u', '-m', `cmpvs-auto-backup-${new Date().toISOString()}`],
        20000
      );
      stashedChanges = true;
    } catch {
      // Fallback if stash fails for any reason
      await runCmd('git', ['reset', '--hard', 'HEAD'], 15000);
    }
  }

  // 3. Fast-forward / clean sync to origin/master
  stepsLog.push(`Updating repository from ${beforeShortSha} to ${targetShortSha} (${behindCount} new commit${behindCount === 1 ? '' : 's'})...`);
  try {
    await runCmd('git', ['pull', '--ff-only', 'origin', 'master'], 30000);
  } catch {
    await runCmd('git', ['reset', '--hard', 'origin/master'], 20000);
  }

  // 4. Check if package.json or package-lock.json changed between beforeFullSha and targetFullSha
  let ranNpmInstall = false;
  const changedFilesRaw = await runCmd('git', ['diff', '--name-only', beforeFullSha, targetFullSha]).catch(() => '');
  const changedFiles = changedFilesRaw.split(/\r?\n/).map((s) => s.trim());
  if (changedFiles.includes('package.json') || changedFiles.includes('package-lock.json')) {
    stepsLog.push('Dependencies changed in package.json — running npm install...');
    await runCmd('npm', ['install', '--no-audit', '--no-fund'], 180000);
    ranNpmInstall = true;
  }

  // 5. Rebuild dist/ if running in Electron mode
  let ranBuild = false;
  if (isElectron) {
    stepsLog.push('Rebuilding desktop bundle (npm run build)...');
    await runCmd('npm', ['run', 'build'], 180000);
    ranBuild = true;
  }

  const finalStatus = await checkAppUpdate({ fetchRemote: false });
  stepsLog.push(`Update complete! Now running commit ${finalStatus.localSha}.`);

  return {
    ok: true,
    alreadyUpToDate: false,
    previousSha: beforeShortSha,
    newSha: finalStatus.localSha,
    updatedCommitsCount: behindCount,
    stashedChanges,
    ranNpmInstall,
    ranBuild,
    stepsLog,
    status: finalStatus,
  };
}

module.exports = {
  checkAppUpdate,
  applyAppUpdate,
};

