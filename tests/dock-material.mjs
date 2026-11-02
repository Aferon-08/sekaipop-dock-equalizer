import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const c=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../DockMaterial.js',import.meta.url),'utf8').replace(/^\.pragma.*$/gm,''),c);
const manifest=JSON.parse(fs.readFileSync(new URL('../plugin.json',import.meta.url),'utf8'));
const plain=v=>JSON.parse(JSON.stringify(v));
const defaults={enabled:true,opacity:.28,refraction:1,blur:3.8,darkening:.23,light:1};
assert.deepEqual(plain(c.read({})),defaults,'older saved settings inherit defaults');
assert.deepEqual(plain(c.read(manifest.settings)),defaults,'manifest matches renderer');
const custom={dockGlass:true,glassOpacity:.7,glassRefraction:1.5,glassBlur:6,glassDarkening:.4,glassLight:1.6};
const before=plain(custom),on=plain(c.read(custom));
custom.dockGlass=false;
const off=plain(c.read(custom));
assert.equal(off.enabled,false);assert.equal(off.light,0);
assert.equal(off.blur,6);assert.equal(off.opacity,.7);
custom.dockGlass=true;
assert.deepEqual(plain(c.read(custom)),on,'toggle restores every tuned value');
assert.deepEqual(custom,before,'renderer does not rewrite saved settings');
assert.deepEqual(plain(c.read({glassOpacity:-1,glassRefraction:9,glassBlur:-2,glassDarkening:9,glassLight:-1})),
 {enabled:true,opacity:.1,refraction:2,blur:0,darkening:.8,light:0});
assert.deepEqual(plain(c.read({glassOpacity:NaN,glassRefraction:'bad',glassBlur:null,glassLight:Infinity})),defaults);
for(const k of ['dockGlass','glassOpacity','glassRefraction','glassBlur','glassDarkening','glassLight']) {
 assert.equal(manifest.settingsInfo[k].group,'Стекло дока');
 assert(manifest.groups.includes(manifest.settingsInfo[k].group),'setting is reachable in the actual panel');
}
console.log('PASS material defaults, clamps, old settings, master toggle, retained custom values and UI metadata');
