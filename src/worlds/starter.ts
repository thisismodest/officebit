// The built-in world: the starter town, built from its config (starter.config.ts) by build.ts.
import { buildWorld } from './build.ts';
import { STARTER_CONFIG } from './starter.config.ts';

export const STARTER = buildWorld(STARTER_CONFIG);
