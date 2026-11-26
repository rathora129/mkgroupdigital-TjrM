import { registerHooks } from 'node:module';
import { load, resolve } from './alias-loader.mjs';

registerHooks({ resolve, load });
