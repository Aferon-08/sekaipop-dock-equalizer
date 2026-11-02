.pragma library
function clamp(x){return Math.max(0,Math.min(1,x))}
function smooth(a,b,x){const u=clamp((x-a)/(b-a));return u*u*(3-2*u)}
function mix(a,b,t){return a+(b-a)*t}
function frame(closing,t,phone,panel){
 const pc={x:phone.x+phone.width/2,y:phone.y+phone.height/2};
 const out={x:pc.x,y:pc.y,w:phone.width,h:phone.height,r:60,water:0,photo:1,content:0};
 const puddle={w:Math.min(panel.width*1.04,phone.width*1.12),h:phone.height*.76};
 if(!closing){
  const melt=smooth(0,.42,t),gather=smooth(.60,1,t);
  out.x=mix(pc.x,panel.x+panel.width/2,gather);out.y=mix(pc.y,panel.y+panel.height/2,gather);
  out.w=mix(mix(phone.width,puddle.w,melt),panel.width,gather);
  out.h=mix(mix(phone.height,puddle.h,melt),panel.height,gather);
  out.r=mix(mix(60,Math.min(puddle.w,puddle.h)*.40,melt),44,gather);
  out.water=melt*(1-gather);out.photo=1-smooth(.03,.53,t);out.content=smooth(.87,1,t);
 }else{
  const shrink=smooth(0,.53,t),burst=1-Math.pow(1-smooth(.64,.86,t),2),settle=smooth(.86,1,t);
  const size=76;
  out.x=mix(panel.x+panel.width/2,pc.x,shrink);out.y=mix(panel.y+panel.height/2,pc.y,shrink);
  out.w=mix(mix(panel.width,size,shrink),phone.width*1.055,burst);out.w=mix(out.w,phone.width,settle);
  out.h=mix(mix(panel.height,size,shrink),phone.height*1.055,burst);out.h=mix(out.h,phone.height,settle);
  out.r=mix(mix(44,38,shrink),60,burst);out.water=Math.sin(Math.PI*clamp(t/.92))*.8;
  out.photo=smooth(.72,1,t);out.content=1-smooth(0,.28,t);
 }
 return out;
}
