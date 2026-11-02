import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const m=vm.createContext({});vm.runInContext(fs.readFileSync(new URL('../SettingsMotion.js',import.meta.url),'utf8').replace(/^\.pragma.*$/gm,''),m);
const phone={x:110,y:160,width:1050,height:640},panel={x:70,y:20,width:1130,height:920};
const open0=m.frame(false,0,phone,panel),open1=m.frame(false,1,phone,panel),close0=m.frame(true,0,phone,panel),close1=m.frame(true,1,phone,panel);
assert.equal(open0.photo,1);assert.equal(open0.w,phone.width);assert.equal(open0.h,phone.height);
assert.equal(open1.w,panel.width);assert.equal(open1.h,panel.height);assert.equal(open1.content,1);
assert.equal(close0.w,open1.w);assert.equal(close0.h,open1.h);
assert.equal(close1.w,phone.width);assert.equal(close1.h,phone.height);assert.equal(close1.photo,1);
const pauseA=m.frame(false,.43,phone,panel),pauseB=m.frame(false,.59,phone,panel);
assert.equal(pauseA.w,pauseB.w);assert.equal(pauseA.h,pauseB.h);
for(let i=0;i<=1000;i++)for(const closing of [false,true]){
 const p=m.frame(closing,i/1000,phone,panel);assert(p.w>=76 && p.h>=76);assert(Number.isFinite(p.x+p.y+p.r));
 if(i){const q=m.frame(closing,(i-1)/1000,phone,panel);assert(Math.abs(p.w-q.w)<28 && Math.abs(p.h-q.h)<28,'continuous geometry')}
}
const drop=m.frame(true,.6,phone,panel);assert.equal(drop.w,76);assert.equal(drop.h,76);assert.equal(drop.photo,0);
console.log('PASS textured phone endpoints, separate opening/closing, puddle hold, small drop, continuous geometry');
