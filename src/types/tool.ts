import { Hono } from 'hono';

export interface Tool {
  name: string;
  description: string;
  version: string;
  routes: Hono;
  
  // Optional methods that tools can implement
  initialize?: () => Promise<void>;
  cleanup?: () => Promise<void>;
}