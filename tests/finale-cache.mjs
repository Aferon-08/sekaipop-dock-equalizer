import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..'),cache={};function lib(n){if(cache[n])return cache[n];const s=fs.readFileSync(path.join(root,n),'utf8'),c=vm.createContext({});cache[n]=c;for(const m of s.matchAll(/^\.import "([^"]+)" as (\w+)/gm))c[m[2]]=lib(m[1]);vm.runInContext(s.replace(/^\.(import|pragma).*$/gm,''),c);return c}
const F=lib('MultiVoiceFinale.js'),E=lib('LyricsEnd.js');const voices=[{id:'a',lines:[{t:0,end:5,text:'First little light'}]},{id:'b',lines:[{t:3,end:9,text:'Second little light'}]}];
const doc={lines:[]};for(const members of [[0],[1],[0,1]]){const b=F.boundsFor(voices,members,doc,20);for(const t of [0,4,7,10,13,19])assert.equal(JSON.stringify(F.state(voices,members,doc,t,20,true)),JSON.stringify(F.forBounds(b,t,20,true)))}
let calls=0;const original=E.bounds;E.bounds=(...a)=>{calls++;return original(...a)};const b=F.boundsFor(voices,[0,1],doc,20);for(let i=0;i<1000;i++)F.forBounds(b,i/60,20,true);assert.equal(calls,1);
console.log('PASS cached finale matches original states; 1000 frames require one timeline build');
