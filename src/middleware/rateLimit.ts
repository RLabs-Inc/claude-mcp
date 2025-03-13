import { Context, MiddlewareHandler, Next } from 'hono';
import { logger } from '../lib/logger';

// Simple in-memory rate limiter
// In production, this should be replaced with a Redis-based solution
import { config } from '../lib/config';

class RateLimiter {
  private requests: Map<string, { count: number, resetTime: number }> = new Map();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number = config.RATE_LIMIT_MAX, windowMs: number = config.RATE_LIMIT_WINDOW_MS) { // Default from config
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    // Cleanup expired entries periodically
    setInterval(() => this.cleanup(), windowMs);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, data] of this.requests) {
      if (now > data.resetTime) {
        this.requests.delete(key);
      }
    }
  }

  isRateLimited(ip: string): boolean {
    const now = Date.now();
    const requestData = this.requests.get(ip);
    
    if (!requestData) {
      // First request from this IP
      this.requests.set(ip, {
        count: 1,
        resetTime: now + this.windowMs
      });
      return false;
    }

    if (now > requestData.resetTime) {
      // Rate limit window has expired, reset the counter
      this.requests.set(ip, {
        count: 1,
        resetTime: now + this.windowMs
      });
      return false;
    }

    // Increment the counter if within the time window
    if (requestData.count < this.maxRequests) {
      requestData.count++;
      return false;
    }

    // Rate limit exceeded
    return true;
  }

  getRemainingRequests(ip: string): number {
    const now = Date.now();
    const requestData = this.requests.get(ip);
    
    if (!requestData || now > requestData.resetTime) {
      return this.maxRequests;
    }
    
    return Math.max(0, this.maxRequests - requestData.count);
  }

  getResetTime(ip: string): number {
    const requestData = this.requests.get(ip);
    if (!requestData) {
      return Date.now() + this.windowMs;
    }
    return requestData.resetTime;
  }
}

// Create a singleton instance
const rateLimiter = new RateLimiter();

/**
 * Rate limiting middleware to protect against abuse
 */
export const rateLimit = (): MiddlewareHandler => {
  return async (c: Context, next: Next) => {
    // Get the client's IP address
    const ip = c.req.header('x-forwarded-for') || 'unknown';
    
    // Check if rate limited
    if (rateLimiter.isRateLimited(ip)) {
      logger.warn('Rate limit exceeded', { ip, path: c.req.path });
      
      // Set rate limit headers
      c.header('X-RateLimit-Limit', rateLimiter.maxRequests.toString());
      c.header('X-RateLimit-Remaining', '0');
      c.header('X-RateLimit-Reset', Math.ceil(rateLimiter.getResetTime(ip) / 1000).toString());
      
      return c.json({
        success: false,
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.'
      }, 429);
    }
    
    // Set rate limit headers
    c.header('X-RateLimit-Limit', rateLimiter.maxRequests.toString());
    c.header('X-RateLimit-Remaining', rateLimiter.getRemainingRequests(ip).toString());
    c.header('X-RateLimit-Reset', Math.ceil(rateLimiter.getResetTime(ip) / 1000).toString());
    
    await next();
  };
};