import NodeCache from 'node-cache';
import logger from '../utils/logger.js';

// StdTTL: 1 hour (3600 seconds)
const cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

export const get = async (key) => {
    try {
        const value = cache.get(key);
        return value || null;
    } catch (error) {
        logger.error({ err: error }, 'Cache Get Error');
        return null;
    }
};

export const set = async (key, value, ttlSeconds = 3600) => {
    try {
        cache.set(key, value, ttlSeconds);
    } catch (error) {
        logger.error({ err: error }, 'Cache Set Error');
    }
};

export default {
    get,
    set,
    client: cache,
};
