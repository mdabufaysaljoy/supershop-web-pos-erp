import { describe, expect, it } from 'vitest';
import { CUSTOMER_SEGMENTS, createCampaignSchemas, interpolateCampaignTemplate } from '../index.js';

describe('Campaigns shared module (P7.3)', () => {
  const schemas = createCampaignSchemas();

  describe('interpolateCampaignTemplate', () => {
    it('interpolates single and nested placeholders', () => {
      const template =
        'Hello {{customer.name}}, welcome to {{store.name}}! Unsubscribe: {{unsubscribe_url}}';
      const result = interpolateCampaignTemplate(template, {
        customer: { name: 'Faisal' },
        store: { name: 'SuperShop' },
        unsubscribe_url: 'https://shop.sa/opt-out?token=123',
      });
      expect(result).toBe(
        'Hello Faisal, welcome to SuperShop! Unsubscribe: https://shop.sa/opt-out?token=123',
      );
    });

    it('renders missing variables as empty string', () => {
      const template = 'Hi {{customer.name}}, your code is {{code}}!';
      const result = interpolateCampaignTemplate(template, { customer: {} });
      expect(result).toBe('Hi , your code is !');
    });

    it('handles empty or null template safely', () => {
      expect(interpolateCampaignTemplate(null, {})).toBe('');
      expect(interpolateCampaignTemplate('', {})).toBe('');
    });
  });

  describe('createCampaign schema', () => {
    it('validates a correct email campaign', () => {
      const valid = {
        name: 'Eid Super Sale',
        channel: 'email',
        segment: CUSTOMER_SEGMENTS.VIP,
        subject: 'Special offer for our VIP members',
        message: 'Dear {{customer.name}}, enjoy 30% off your next purchase!',
      };
      const res = schemas.createCampaign.safeParse(valid);
      expect(res.success).toBe(true);
    });

    it('validates a correct SMS campaign', () => {
      const valid = {
        name: 'Flash Weekend SMS',
        channel: 'sms',
        segment: CUSTOMER_SEGMENTS.ACTIVE,
        message: 'SuperShop: 20% off all items this weekend only. Unsub: {{unsubscribe_url}}',
      };
      const res = schemas.createCampaign.safeParse(valid);
      expect(res.success).toBe(true);
    });

    it('rejects an email campaign without a subject', () => {
      const invalid = {
        name: 'No Subject Email',
        channel: 'email',
        segment: CUSTOMER_SEGMENTS.ALL,
        message: 'Where is the subject?',
      };
      const res = schemas.createCampaign.safeParse(invalid);
      expect(res.success).toBe(false);
      expect(res.error.issues[0].path).toContain('subject');
    });

    it('rejects invalid channel and segment', () => {
      const invalid = {
        name: 'Test',
        channel: 'telegram',
        segment: 'super_rich',
        message: 'Hello',
      };
      const res = schemas.createCampaign.safeParse(invalid);
      expect(res.success).toBe(false);
    });
  });

  describe('sendTest schema', () => {
    it('validates valid email recipient', () => {
      const res = schemas.sendTest.safeParse({
        channel: 'email',
        to: 'test@example.com',
      });
      expect(res.success).toBe(true);
    });

    it('validates valid phone recipient for SMS', () => {
      const res = schemas.sendTest.safeParse({
        channel: 'sms',
        to: '+966512345678',
      });
      expect(res.success).toBe(true);
      expect(res.data.to).toBe('+966512345678');
    });

    it('rejects invalid phone for SMS', () => {
      const res = schemas.sendTest.safeParse({
        channel: 'sms',
        to: 'not-a-phone',
      });
      expect(res.success).toBe(false);
    });
  });

  describe('optOut schema', () => {
    it('accepts opt-out with token', () => {
      const res = schemas.optOut.safeParse({ token: 'abc-xyz', channel: 'email' });
      expect(res.success).toBe(true);
    });

    it('accepts opt-out with email', () => {
      const res = schemas.optOut.safeParse({ email: 'user@example.com' });
      expect(res.success).toBe(true);
      expect(res.data.channel).toBe('all');
    });

    it('rejects opt-out with no identifier', () => {
      const res = schemas.optOut.safeParse({});
      expect(res.success).toBe(false);
    });
  });
});
