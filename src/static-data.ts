// Runtime loader for generated datasets kept out of the JS bundle.
// Each generated src/*-data.ts module awaits one file from public/data/static/ at
// module load (top-level await), so consumers keep their synchronous imports.
// Browser: fetched relative to Vite's base. Node (tests, prepare scripts): read from disk.
const nodeRuntime=typeof window==='undefined'&&!!(globalThis as {process?:{versions?:{node?:string}}}).process?.versions?.node;

export const STATIC_DATA_DIR='data/static/';

export async function loadStaticData<T>(file:string):Promise<T>{
  if(nodeRuntime){
    const fsModule='node:fs/promises';
    const {readFile}=await import(/* @vite-ignore */ fsModule) as {readFile:(path:URL,encoding:'utf8')=>Promise<string>};
    const moduleUrl=import.meta.url;
    return JSON.parse(await readFile(new URL('../public/'+STATIC_DATA_DIR+file,moduleUrl),'utf8')) as T;
  }
  try{
    const response=await fetch(import.meta.env.BASE_URL+STATIC_DATA_DIR+file);
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    return await response.json() as T;
  }catch(cause){
    // main.ts has not started yet, so surface the failure on the boot screen directly.
    const message=`城市数据 ${file} 加载失败（${cause instanceof Error?cause.message:String(cause)}）。请通过本地或静态服务器访问，并确认 data/static/ 已完整上传。`;
    const boot=document.getElementById('boot-message');if(boot)boot.textContent=message;
    document.getElementById('boot-retry')?.removeAttribute('hidden');
    throw new Error(message,{cause});
  }
}
