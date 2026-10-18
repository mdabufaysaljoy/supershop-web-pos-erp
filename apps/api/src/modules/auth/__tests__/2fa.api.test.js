import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { createStaff } from '../../staff/index.js';
import { Credential } from '../auth.model.js';
import { generateTotp } from '../totp.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

const BASE = '/api/v1/auth/staff';
const PASSWORD = 'correct-horse-9';
const up = { db: () => true, redis: async () => true };

let app;
let staff;
let accessToken;

beforeEach(async () => {
  app = createApp({ checks: up });
  staff = await createStaff(null, {
    name: 'Admin User',
    email: 'admin@shop.test',
    password: PASSWORD,
  });

  const loginRes = await request(app)
    .post(`${BASE}/login`)
    .send({ email: 'admin@shop.test', password: PASSWORD });
  accessToken = loginRes.body.data.accessToken;
});

describe('Staff TOTP 2FA API', () => {
  it('reports 2FA initially disabled', async () => {
    const res = await request(app)
      .get(`${BASE}/2fa/status`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      enabled: false,
      enabledAt: null,
      recoveryCodesLeft: 0,
    });
  });

  it('performs full 2FA setup, verify, login challenge, and recovery code fallback', async () => {
    // 1. Initiate setup
    const setupRes = await request(app)
      .post(`${BASE}/2fa/setup`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(setupRes.status).toBe(200);
    const { secret, otpauthUri, qrSvg } = setupRes.body.data;
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(otpauthUri).toContain(`otpauth://totp/SuperShop:admin%40shop.test?secret=${secret}`);
    expect(qrSvg).toContain('<svg');
    expect(qrSvg).toContain('viewBox');

    // Confirm secret is NOT plaintext in the database
    const cred = await Credential.findOne({ principalId: staff.id }).lean();
    expect(cred.twoFactor.tempSecretEncrypted).toMatch(/^v1\./);
    expect(cred.twoFactor.tempSecretEncrypted).not.toContain(secret);
    expect(cred.twoFactor.enabled).toBe(false);

    // 2. Verification with invalid code fails
    const failVerify = await request(app)
      .post(`${BASE}/2fa/verify`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: '000000' });
    expect(failVerify.status).toBe(400);

    // 3. Verification with valid TOTP code succeeds
    const validCode = generateTotp(secret);
    const verifyRes = await request(app)
      .post(`${BASE}/2fa/verify`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: validCode });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.enabled).toBe(true);
    expect(verifyRes.body.data.recoveryCodes.length).toBe(8);

    const recoveryCodes = verifyRes.body.data.recoveryCodes;

    // Check credential in DB
    const credAfterVerify = await Credential.findOne({ principalId: staff.id }).lean();
    expect(credAfterVerify.twoFactor.enabled).toBe(true);
    expect(credAfterVerify.twoFactor.secretEncrypted).toMatch(/^v1\./);
    expect(credAfterVerify.twoFactor.secretEncrypted).not.toContain(secret);
    expect(credAfterVerify.twoFactor.tempSecretEncrypted).toBeNull();
    expect(credAfterVerify.twoFactor.recoveryCodeHashes.length).toBe(8);

    // Check status endpoint
    const statusRes = await request(app)
      .get(`${BASE}/2fa/status`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.enabled).toBe(true);
    expect(statusRes.body.data.recoveryCodesLeft).toBe(8);

    // 4. Next login returns MFA challenge gate
    const loginRes = await request(app)
      .post(`${BASE}/login`)
      .send({ email: 'admin@shop.test', password: PASSWORD });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.mfaRequired).toBe(true);
    expect(typeof loginRes.body.data.mfaToken).toBe('string');
    expect(loginRes.body.data.accessToken).toBeUndefined();

    const { mfaToken } = loginRes.body.data;

    // 5. Challenge with wrong code fails
    const badChallenge = await request(app)
      .post(`${BASE}/2fa/challenge`)
      .send({ mfaToken, code: '999999' });
    expect(badChallenge.status).toBe(401);

    // 6. Challenge with valid TOTP code succeeds
    const totpCode = generateTotp(secret);
    const goodChallenge = await request(app)
      .post(`${BASE}/2fa/challenge`)
      .send({ mfaToken, code: totpCode });

    expect(goodChallenge.status).toBe(200);
    expect(goodChallenge.body.data.accessToken).toBeDefined();
    expect(goodChallenge.body.data.profile.id).toBe(staff.id);
    expect(goodChallenge.headers['set-cookie']).toBeDefined();

    // 7. Test single-use recovery code fallback
    // Get a new MFA challenge token
    const loginRes2 = await request(app)
      .post(`${BASE}/login`)
      .send({ email: 'admin@shop.test', password: PASSWORD });
    const mfaToken2 = loginRes2.body.data.mfaToken;

    const usedRecoveryCode = recoveryCodes[0];
    const recoveryChallenge = await request(app)
      .post(`${BASE}/2fa/challenge`)
      .send({ mfaToken: mfaToken2, code: usedRecoveryCode });

    expect(recoveryChallenge.status).toBe(200);
    expect(recoveryChallenge.body.data.accessToken).toBeDefined();

    // Check that recovery code count is now 7
    const statusRes2 = await request(app)
      .get(`${BASE}/2fa/status`)
      .set('Authorization', `Bearer ${recoveryChallenge.body.data.accessToken}`);
    expect(statusRes2.body.data.recoveryCodesLeft).toBe(7);

    // Reusing the same recovery code must fail
    const loginRes3 = await request(app)
      .post(`${BASE}/login`)
      .send({ email: 'admin@shop.test', password: PASSWORD });
    const mfaToken3 = loginRes3.body.data.mfaToken;

    const reuseRecovery = await request(app)
      .post(`${BASE}/2fa/challenge`)
      .send({ mfaToken: mfaToken3, code: usedRecoveryCode });
    expect(reuseRecovery.status).toBe(401);

    // 8. Disable 2FA requires correct password
    const failDisable = await request(app)
      .post(`${BASE}/2fa/disable`)
      .set('Authorization', `Bearer ${recoveryChallenge.body.data.accessToken}`)
      .send({ password: 'wrong-password' });
    expect(failDisable.status).toBe(401);

    const goodDisable = await request(app)
      .post(`${BASE}/2fa/disable`)
      .set('Authorization', `Bearer ${recoveryChallenge.body.data.accessToken}`)
      .send({ password: PASSWORD });
    expect(goodDisable.status).toBe(200);
    expect(goodDisable.body.data.enabled).toBe(false);

    // Credential in DB is cleared
    const credDisabled = await Credential.findOne({ principalId: staff.id }).lean();
    expect(credDisabled.twoFactor.enabled).toBe(false);
    expect(credDisabled.twoFactor.secretEncrypted).toBeNull();
    expect(credDisabled.twoFactor.recoveryCodeHashes).toEqual([]);

    // Subsequent login logs in directly without MFA
    const directLogin = await request(app)
      .post(`${BASE}/login`)
      .send({ email: 'admin@shop.test', password: PASSWORD });
    expect(directLogin.status).toBe(200);
    expect(directLogin.body.data.mfaRequired).toBeUndefined();
    expect(directLogin.body.data.accessToken).toBeDefined();
  });
});
