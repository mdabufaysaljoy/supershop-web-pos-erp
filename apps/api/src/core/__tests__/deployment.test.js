import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';

const ROOT_DIR = path.resolve(import.meta.dirname, '../../../../../');

describe('Production Deployment Hardening (P10.4)', () => {
  it('all production Dockerfiles exist', () => {
    const files = [
      'apps/api/Dockerfile',
      'apps/admin/Dockerfile',
      'apps/admin/nginx.conf',
      'apps/storefront/Dockerfile',
    ];
    for (const f of files) {
      const full = path.join(ROOT_DIR, f);
      expect(fs.existsSync(full), `File ${f} should exist`).toBe(true);
      const content = fs.readFileSync(full, 'utf8');
      expect(content.length).toBeGreaterThan(50);
    }
  });

  it('docker-compose.prod.yml exists and declares all required services and volumes', () => {
    const composePath = path.join(ROOT_DIR, 'docker-compose.prod.yml');
    expect(fs.existsSync(composePath)).toBe(true);

    const content = fs.readFileSync(composePath, 'utf8');
    const requiredServices = ['mongo:', 'redis:', 'api:', 'admin:', 'storefront:', 'nginx:'];
    for (const svc of requiredServices) {
      expect(content).toContain(svc);
    }

    const requiredVolumes = ['mongo-data:', 'redis-data:', 'media-data:', 'certbot-etc:'];
    for (const vol of requiredVolumes) {
      expect(content).toContain(vol);
    }

    // Verify log rotation is configured
    expect(content).toContain('max-size:');
    expect(content).toContain('max-file:');
  });

  it('nginx configuration files exist with security headers and caching', () => {
    const nginxConf = path.join(ROOT_DIR, 'tools/deploy/nginx/nginx.conf');
    const siteConf = path.join(ROOT_DIR, 'tools/deploy/nginx/conf.d/supershop.conf');

    expect(fs.existsSync(nginxConf)).toBe(true);
    expect(fs.existsSync(siteConf)).toBe(true);

    const siteContent = fs.readFileSync(siteConf, 'utf8');
    expect(siteContent).toContain('upstream api_backend');
    expect(siteContent).toContain('upstream storefront_backend');
    expect(siteContent).toContain('upstream admin_backend');
    expect(siteContent).toContain('Strict-Transport-Security');
    expect(siteContent).toContain('X-Content-Type-Options');
    expect(siteContent).toContain('location /media/');
  });

  it('deployment scripts exist and are executable', () => {
    const scripts = [
      'tools/deploy/vps-setup.sh',
      'tools/deploy/deploy.sh',
      'tools/deploy/init-ssl.sh',
    ];

    for (const script of scripts) {
      const full = path.join(ROOT_DIR, script);
      expect(fs.existsSync(full), `${script} must exist`).toBe(true);
      const stat = fs.statSync(full);
      expect(stat.mode & 0o111, `${script} must be executable`).toBeTruthy();
    }
  });

  it('.env.production.example contains all required environment variables and passes validation', () => {
    const envExamplePath = path.join(ROOT_DIR, '.env.production.example');
    expect(fs.existsSync(envExamplePath)).toBe(true);

    const lines = fs.readFileSync(envExamplePath, 'utf8').split('\n');
    const parsed = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        parsed[key] = val;
      }
    }

    // Provide dummy production-valid secrets to test that the schema succeeds with real production settings
    const testConfig = {
      ...parsed,
      NODE_ENV: 'production',
      MASTER_KEY: Buffer.alloc(32, 1).toString('base64'),
      JWT_ACCESS_SECRET: 'access-secret-production-valid-length-32-chars-long',
      JWT_REFRESH_SECRET: 'refresh-secret-production-valid-length-32-chars-long',
    };

    const loaded = loadConfig(testConfig);
    expect(loaded.NODE_ENV).toBe('production');
    expect(loaded.TRUST_PROXY).toBe(1);
    expect(loaded.MEDIA_STORAGE).toBe('local');
    expect(loaded.API_PORT).toBe(4000);
  });

  it('CI/CD deploy workflow exists and is properly structured', () => {
    const workflowPath = path.join(ROOT_DIR, '.github/workflows/deploy.yml');
    expect(fs.existsSync(workflowPath)).toBe(true);

    const content = fs.readFileSync(workflowPath, 'utf8');
    expect(content).toContain('name: Deploy to Production (VPS)');
    expect(content).toContain('secrets.VPS_HOST');
    expect(content).toContain('tools/deploy/deploy.sh');
  });
});
