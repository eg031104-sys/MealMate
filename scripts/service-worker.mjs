import { readdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const assets = (await readdir("dist/assets")).map((f) => "/assets/" + f);
const files = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon.svg",
  ...assets,
  ...(await readdir("dist/recipe-photos")).map((f) => "/recipe-photos/" + f),
  ...(await readdir("dist/recipe-sources")).map((f) => "/recipe-sources/" + f),
];
const hasher = createHash("sha256");
for (const file of files.filter((f) => f !== "/"))
  hasher.update(await readFile("dist" + file));
const hash = hasher.digest("hex").slice(0, 10);
await writeFile(
  "dist/sw.js",
  `const CACHE='mealmate-${hash}';const FILES=${JSON.stringify(files)};
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('mealmate-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 if(event.request.mode==='navigate'){
  event.respondWith((async()=>{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),3000);try{return await fetch(event.request,{signal:controller.signal});}catch{return (await caches.match('/index.html'))||Response.error();}finally{clearTimeout(timer);}})());
 }else{
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
 }
});`,
);
