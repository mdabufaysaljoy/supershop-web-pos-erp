import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT_DIR = path.resolve(import.meta.dirname, '../../../../../');
const BACKUP_SCRIPT = path.join(ROOT_DIR, 'tools/ops/backup.sh');
const RESTORE_SCRIPT = path.join(ROOT_DIR, 'tools/ops/restore.sh');
const TEST_BACKUP_DIR = path.join(ROOT_DIR, 'tmp/ops-test-backups');

describe('Database Ops Scripts (P10.3)', () => {
  beforeAll(() => {
    fs.mkdirSync(TEST_BACKUP_DIR, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(TEST_BACKUP_DIR, { recursive: true, force: true });
  });

  it('scripts exist and are executable', () => {
    expect(fs.existsSync(BACKUP_SCRIPT)).toBe(true);
    expect(fs.existsSync(RESTORE_SCRIPT)).toBe(true);
    expect(fs.statSync(BACKUP_SCRIPT).mode & 0o111).toBeTruthy();
    expect(fs.statSync(RESTORE_SCRIPT).mode & 0o111).toBeTruthy();
  });

  it('restore.sh aborts without --confirm in non-interactive mode', () => {
    expect(() => {
      execSync(`"${RESTORE_SCRIPT}" "non-existent-file.gz" < /dev/null`, {
        stdio: 'pipe',
      });
    }).toThrow();
  });

  it('backup.sh creates a valid compressed archive and manifest JSON', () => {
    const mongoUri =
      process.env.TEST_REAL_MONGO_URI ||
      'mongodb://127.0.0.1:27017/supershop?directConnection=true';

    const output = execSync(`"${BACKUP_SCRIPT}"`, {
      env: {
        ...process.env,
        MONGO_URI: mongoUri,
        BACKUP_DIR: TEST_BACKUP_DIR,
        RETENTION_DAYS: '1',
      },
      stdio: 'pipe',
      encoding: 'utf8',
    });

    expect(output).toContain('Backup created successfully');

    const files = fs.readdirSync(TEST_BACKUP_DIR);
    const archiveFile = files.find((f) => f.endsWith('.archive.gz'));
    const manifestFile = files.find((f) => f.endsWith('.manifest.json'));

    expect(archiveFile).toBeDefined();
    expect(manifestFile).toBeDefined();

    const manifestContent = JSON.parse(
      fs.readFileSync(path.join(TEST_BACKUP_DIR, manifestFile), 'utf8'),
    );

    expect(manifestContent.file).toBe(archiveFile);
    expect(manifestContent.status).toBe('success');
    expect(manifestContent.sizeBytes).toBeGreaterThan(0);
    expect(manifestContent.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifestContent.timestamp).toMatch(/^\d{8}_\d{6}Z$/);
  });
});
