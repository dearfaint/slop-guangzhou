// Node counterpart of scripts/static_data.py: writes a generated dataset to
// public/data/static/<name>.<hash>.json and a thin src/<name>.ts loader module.
import {createHash} from 'node:crypto';
import {mkdirSync,readdirSync,unlinkSync,writeFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);

/** @param {string} name @param {unknown} value @param {{comment:string,module:(file:string)=>string}} options */
export function writeStaticData(name,value,{comment,module}){
  const text=JSON.stringify(value),digest=createHash('sha256').update(text).digest('hex').slice(0,8),file=`${name}.${digest}.json`;
  const out=new URL('public/data/static/',root);mkdirSync(out,{recursive:true});
  for(const old of readdirSync(out))if(old!==file&&old.startsWith(name+'.')&&old.endsWith('.json')&&/^[0-9a-f]{8}$/.test(old.slice(name.length+1,-5)))unlinkSync(new URL(old,out));
  writeFileSync(new URL(file,out),text);
  writeFileSync(new URL(`src/${name}.ts`,root),`// ${comment}\n// Data: public/data/static/${file}, loaded at startup via src/static-data.ts.\nimport {loadStaticData} from './static-data.ts';\n${module(file)}`);
  return file;
}
