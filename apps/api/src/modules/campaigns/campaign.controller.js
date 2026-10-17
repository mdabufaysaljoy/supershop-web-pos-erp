import { sendData } from '../../core/http.js';
import * as service from './campaign.service.js';

export async function createCampaign(req, res, next) {
  try {
    const campaign = await service.createCampaign(req.valid.body, req.access?.user?._id);
    sendData(res, campaign, { status: 201 });
  } catch (err) {
    next(err);
  }
}

export async function listCampaigns(req, res, next) {
  try {
    const result = await service.listCampaigns(req.valid.query);
    sendData(res, result.data, { meta: result.meta });
  } catch (err) {
    next(err);
  }
}

export async function getCampaign(req, res, next) {
  try {
    const campaign = await service.getCampaign(req.valid.params.id);
    sendData(res, campaign);
  } catch (err) {
    next(err);
  }
}

export async function updateCampaign(req, res, next) {
  try {
    const campaign = await service.updateCampaign(req.valid.params.id, req.valid.body);
    sendData(res, campaign);
  } catch (err) {
    next(err);
  }
}

export async function sendCampaign(req, res, next) {
  try {
    const campaign = await service.sendCampaign(req.valid.params.id, req.access?.user?._id, {
      inline: req.query.inline === 'true',
    });
    sendData(res, campaign);
  } catch (err) {
    next(err);
  }
}

export async function scheduleCampaign(req, res, next) {
  try {
    const campaign = await service.scheduleCampaign(
      req.valid.params.id,
      req.valid.body.scheduledAt,
      req.access?.user?._id,
    );
    sendData(res, campaign);
  } catch (err) {
    next(err);
  }
}

export async function cancelCampaign(req, res, next) {
  try {
    const campaign = await service.cancelCampaign(req.valid.params.id, req.access?.user?._id);
    sendData(res, campaign);
  } catch (err) {
    next(err);
  }
}

export async function sendTestCampaign(req, res, next) {
  try {
    const result = await service.sendTestCampaign({
      id: req.valid.params.id,
      ...req.valid.body,
    });
    sendData(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getAudienceCount(req, res, next) {
  try {
    const { segment, channel } = req.query;
    const result = await service.getAudienceCount(segment, channel);
    sendData(res, result);
  } catch (err) {
    next(err);
  }
}

export async function listDeliveries(req, res, next) {
  try {
    const { page, limit } = req.query;
    const result = await service.listCampaignDeliveries(req.valid.params.id, {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    sendData(res, result.data, { meta: result.meta });
  } catch (err) {
    next(err);
  }
}

export async function unsubscribe(req, res, next) {
  try {
    const input = req.method === 'GET' ? req.query : req.valid.body;
    const result = await service.optOutCustomer(input);
    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(
        '<!DOCTYPE html><html><head><title>Unsubscribed</title></head><body style="font-family:sans-serif;text-align:center;padding:50px;"><h2>You have been unsubscribed</h2><p>You will no longer receive marketing messages from SuperShop.</p></body></html>',
      );
    }
    sendData(res, result);
  } catch (err) {
    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res
        .status(400)
        .send(
          '<!DOCTYPE html><html><head><title>Error</title></head><body style="font-family:sans-serif;text-align:center;padding:50px;"><h2>Invalid Request</h2><p>Could not process unsubscribe request.</p></body></html>',
        );
    }
    next(err);
  }
}
