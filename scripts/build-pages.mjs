import { cp, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { backendOrigin } from './pages-config.mjs';

const source = new URL('../public/',import.meta.url);
const target = resolve(process.argv[2] || fileURLToPath(new URL('../dist/pages/',import.meta.url)));
const api = backendOrigin();
await mkdir(target,{recursive:true});
await cp(source,target,{recursive:true});
await writeFile(join(target,'deployment.mjs'),'export const apiBase = ' + JSON.stringify(api) + ';\n');
await writeFile(join(target,'.nojekyll'),'');
console.log('Pages 产物已生成：' + target);
