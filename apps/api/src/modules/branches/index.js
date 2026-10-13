/** Branches module — public API. */
export { createBranchRouter } from './branch.routes.js';
export {
  findUnknownBranches,
  getBranch,
  getBranchSummaries,
  registerBranchUsage,
  seedMainBranch,
} from './branch.service.js';
