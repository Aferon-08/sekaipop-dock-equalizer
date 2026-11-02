import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const file=process.argv[2];if(!file)throw Error('Pass the patched shell PluginManifest.js');
const c=vm.createContext({});vm.runInContext(fs.readFileSync(file,'utf8').replace(/^\.pragma.*$/gm,''),c);
const manifest=JSON.parse(fs.readFileSync(new URL('../plugin.json',import.meta.url),'utf8'));
const files='Widget.qml Service.qml Dock.qml Wallpaper.qml Settings.qml';
const result=c.parse(JSON.stringify(manifest),manifest.id,files);assert(result.ok,JSON.stringify(result));assert.equal(JSON.stringify(result.plugin.extensions),JSON.stringify(manifest.extensions));
const bad={...manifest,extensions:['unexpected-slot']};assert(!c.parse(JSON.stringify(bad),bad.id,files).ok);
const legacy={...manifest};delete legacy.extensions;const old=c.parse(JSON.stringify(legacy),legacy.id,'Widget.qml Service.qml');assert(old.ok);assert.equal(old.plugin.extensions.length,0);
console.log('PASS native manifest, unsupported-slot rejection, existing API-1 widget compatibility');
// Exercise the actual shell expression: a loaded dock must wake its service
// even when neither the optional desktop card nor the bar entry is enabled.
const stateFile=new URL('../../../services/PluginState.qml',new URL('file://'+fs.realpathSync(file)));
const state=fs.readFileSync(stateFile,'utf8');
const body=state.match(/readonly property var wanted:\s*\{([\s\S]*?)\n    \}/)?.[1];
assert(body,'shell service lifecycle expression exists');
const wanted=new Function('root',body);
const run=(claims,extensions=manifest.extensions)=>wanted({claims,plugin:{extensions}});
assert.deepEqual(run({'dock:eDP-1':true}),['dock']);
assert.deepEqual(run({'wallpaper:eDP-1':true}),['wallpaper']);
assert.deepEqual(run({'dock:eDP-1':true,'wallpaper:eDP-1':true}),['dock','wallpaper']);
assert.deepEqual(run({}),[],'last surface closes: service sleeps');
assert.deepEqual(run({'widget:eDP-1':true},null),['widget']);
assert.deepEqual(run({'dock:eDP-1':true},[]),[],'undeclared slot cannot wake a legacy plugin');
console.log('PASS native dock/wallpaper wake service; legacy widgets and idle lifecycle preserved');
