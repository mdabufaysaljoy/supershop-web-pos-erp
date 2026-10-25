/** Media module — public API. Other modules reference media by id and resolve URLs here. */
export { createMediaRouter } from './media.routes.js';
export { getMediaByIds, publicImage, toMediaDto, uploadMedia } from './media.service.js';
