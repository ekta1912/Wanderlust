const { createClient } = require("redis");
const { RedisStore } = require("rate-limit-redis");
const { MemoryStore } = require("express-rate-limit");

const redisUrl = process.env.REDIS_URL;
let redisClient = null;
let isConnected = false;
let activeRateLimitStore = null;

if (redisUrl) {
    redisClient = createClient({
        url: redisUrl,
        // Explicitly NO exponential backoff: fixed retry delay of 5000ms
        socket: {
            reconnectStrategy: (retries) => {
                // Fixed 5-second retry interval without exponential backoff
                return 5000;
            }
        }
    });

    redisClient.on("connect", () => {
        isConnected = true;
        console.log("[Redis] Connected to Redis server.");
    });

    redisClient.on("ready", () => {
        isConnected = true;
        console.log("[Redis] Redis client is ready.");
        if (activeRateLimitStore && activeRateLimitStore.redisStore && activeRateLimitStore.initOptions && !activeRateLimitStore.redisStoreReady) {
            Promise.resolve(activeRateLimitStore.redisStore.init(activeRateLimitStore.initOptions))
                .then(() => {
                    activeRateLimitStore.redisStoreReady = true;
                    console.log("[RateLimit] Distributed Redis rate limiting active.");
                })
                .catch(() => {
                    activeRateLimitStore.redisStoreReady = false;
                });
        }
    });

    redisClient.on("error", (err) => {
        isConnected = false;
        console.warn(`[Redis] Connection error: ${err.message}`);
    });

    redisClient.on("end", () => {
        isConnected = false;
        console.warn("[Redis] Connection closed.");
    });

    // Connect asynchronously; do not crash application if Redis is temporarily unreachable
    redisClient.connect().catch((err) => {
        isConnected = false;
        console.warn(`[Redis] Failed initial connection to Redis: ${err.message}`);
        console.warn("[Redis] Gracefully degrading: caching disabled, falling back to database reads.");
    });
} else {
    console.log("[Redis] REDIS_URL not configured. Running in standalone mode without Redis.");
}

function isRedisReady() {
    return Boolean(isConnected && redisClient && redisClient.isReady);
}

async function getCache(key) {
    if (!isRedisReady()) return null;
    try {
        const raw = await redisClient.get(key);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (err) {
        console.warn(`[Redis Cache] Read error for "${key}": ${err.message}`);
        return null;
    }
}

async function setCache(key, value, ttlSeconds = 3600) {
    if (!isRedisReady()) return false;
    try {
        const serialized = JSON.stringify(value);
        await redisClient.set(key, serialized, { EX: ttlSeconds });
        return true;
    } catch (err) {
        console.warn(`[Redis Cache] Write error for "${key}": ${err.message}`);
        return false;
    }
}

async function delCache(key) {
    if (!isRedisReady()) return false;
    try {
        await redisClient.del(key);
        return true;
    } catch (err) {
        console.warn(`[Redis Cache] Invalidation error for "${key}": ${err.message}`);
        return false;
    }
}

/**
 * Resilient rate-limit store that dynamically delegates to RedisStore
 * when Redis is ready, and safely degrades to MemoryStore if Redis is offline
 * or unconfigured.
 */
class ResilientRateLimitStore {
    constructor() {
        this.memoryStore = new MemoryStore();
        this.redisStore = null;
        this.redisStoreReady = false;
        this.warned = false;

        if (redisClient) {
            try {
                this.redisStore = new RedisStore({
                    sendCommand: async (...args) => {
                        if (!isRedisReady()) {
                            throw new Error("Redis client not connected");
                        }
                        return await redisClient.sendCommand(args);
                    },
                    prefix: "rl:login:"
                });
            } catch (err) {
                this.redisStore = null;
            }
        }
    }

    init(options) {
        this.memoryStore.init(options);
        this.initOptions = options;
        if (this.redisStore && typeof this.redisStore.init === "function" && isRedisReady()) {
            Promise.resolve(this.redisStore.init(options))
                .then(() => {
                    this.redisStoreReady = true;
                    console.log("[RateLimit] Distributed Redis rate limiting active.");
                })
                .catch((err) => {
                    this.redisStoreReady = false;
                    this.logFallback(err);
                });
        }
    }

    async get(key) {
        if (isRedisReady() && this.redisStore && this.redisStoreReady) {
            try {
                return await this.redisStore.get(key);
            } catch (err) {
                this.logFallback(err);
            }
        }
        return await this.memoryStore.get(key);
    }

    async increment(key) {
        if (isRedisReady() && this.redisStore && this.redisStoreReady) {
            try {
                return await this.redisStore.increment(key);
            } catch (err) {
                this.logFallback(err);
            }
        }
        return await this.memoryStore.increment(key);
    }

    async decrement(key) {
        if (isRedisReady() && this.redisStore && this.redisStoreReady) {
            try {
                return await this.redisStore.decrement(key);
            } catch (err) {
                this.logFallback(err);
            }
        }
        return await this.memoryStore.decrement(key);
    }

    async resetKey(key) {
        if (isRedisReady() && this.redisStore && this.redisStoreReady) {
            try {
                return await this.redisStore.resetKey(key);
            } catch (err) {
                this.logFallback(err);
            }
        }
        return await this.memoryStore.resetKey(key);
    }

    logFallback(err) {
        if (!this.warned) {
            console.warn(`[RateLimit] Redis unavailable (${err ? err.message : 'offline'}). Degrading to process-local memory store. Warning: Rate limits are not synchronized across multiple instances without Redis.`);
            this.warned = true;
        }
    }
}

function getRateLimitStore() {
    if (!activeRateLimitStore) {
        activeRateLimitStore = new ResilientRateLimitStore();
    }
    return activeRateLimitStore;
}

module.exports = {
    redisClient,
    isRedisReady,
    getCache,
    setCache,
    delCache,
    getRateLimitStore
};
