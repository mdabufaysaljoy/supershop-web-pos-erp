/** Branches module — public API. */
export { createBranchRouter } from './branch.routes.js';
export {
  findUnknownBranches,
  getBranch,
  getBranchSummaries,
  listBranchOptions,
  registerBranchUsage,
  seedMainBranch,
} from './branch.service.js';
