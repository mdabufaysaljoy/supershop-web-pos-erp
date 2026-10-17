/** Campaigns module — public API. */
export { createCampaignRouter } from './campaign.routes.js';
export {
  cancelCampaignJob,
  queueCampaignDispatch,
  setCampaignCanceler,
  setCampaignDispatcher,
  setCampaignRunner,
  startCampaignWorkers,
} from './campaign.jobs.js';
export {
  createCampaign,
  cancelCampaign,
  executeCampaignDispatch,
  getAudienceCount,
  getCampaign,
  listCampaignDeliveries,
  listCampaigns,
  optOutCustomer,
  scheduleCampaign,
  sendCampaign,
  sendTestCampaign,
  toCampaignDto,
  updateCampaign,
} from './campaign.service.js';
export { createUnsubscribeToken, verifyUnsubscribeToken } from './campaign.unsubscribeToken.js';
