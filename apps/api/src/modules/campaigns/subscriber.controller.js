import { sendData } from '../../core/http.js';
import * as service from './subscriber.service.js';

export async function subscribe(req, res, next) {
  try {
    const email = req.body?.email || req.query?.email;
    const source = req.body?.source || 'storefront_newsletter';
    const ip = req.ip || req.headers['x-forwarded-for'] || null;
    const userAgent = req.get('user-agent') || null;

    const result = await service.subscribeNewsletter({ email, source, ip, userAgent });

    // Handle browser form submission (redirect or HTML)
    const isBrowserForm =
      req.headers['content-type']?.includes('application/x-www-form-urlencoded') ||
      (!req.is('json') && req.accepts('html') && !req.accepts('json'));

    if (isBrowserForm) {
      const referer = req.get('Referer');
      if (referer) {
        const redirectUrl = new URL(referer);
        redirectUrl.searchParams.set('newsletter', 'subscribed');
        return res.redirect(303, redirectUrl.toString());
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(
        '<!DOCTYPE html><html><head><title>Subscribed</title></head><body style="font-family:sans-serif;text-align:center;padding:50px;"><h2>✓ Subscribed Successfully!</h2><p>Thank you for subscribing to our updates.</p><p><a href="/">Return to Home</a></p></body></html>',
      );
    }

    sendData(
      res,
      {
        success: true,
        message: result.alreadySubscribed
          ? 'Already subscribed to offer updates'
          : 'Subscribed successfully',
        subscriber: result.subscriber,
        alreadySubscribed: result.alreadySubscribed,
      },
      { status: result.isNew ? 201 : 200 },
    );
  } catch (err) {
    next(err);
  }
}

export async function listSubscribers(req, res, next) {
  try {
    const result = await service.listSubscribers(req.query);
    sendData(res, result.data, { meta: result.meta });
  } catch (err) {
    next(err);
  }
}

export async function updateSubscriber(req, res, next) {
  try {
    const updated = await service.updateSubscriber(req.params.id, req.body);
    sendData(res, updated);
  } catch (err) {
    next(err);
  }
}

export async function deleteSubscriber(req, res, next) {
  try {
    const result = await service.deleteSubscriber(req.params.id);
    sendData(res, result);
  } catch (err) {
    next(err);
  }
}
