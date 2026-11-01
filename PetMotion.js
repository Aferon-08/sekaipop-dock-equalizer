.pragma library
// All coordinates use monitor-height units; this motor is wallpaper-only.
function clamp(x,a,b){return Math.max(a,Math.min(b,x))}
function ease(t){t=clamp(t,0,1);return t*t*t*(10+t*(-15+6*t))}
function create(p){return {x:p.x,y:p.y,vx:0,vy:0,ax:0,ay:0,facing:0,size:1,alpha:1,core:.6}}
function step(m,target,dt,options){
 options=options||{};dt=clamp(dt,0,.05);if(!dt)return m
 const omega=options.omega||5,maxSpeed=options.speed||.14,maxAccel=options.acceleration||.75
 // An analytic critically damped velocity stays stable with variable dt.
 // Delaying a clipped force prevents braking; limit velocity changes instead.
 const f=Math.exp(-omega*dt),ex=m.x-target.x,ey=m.y-target.y
 const vx=(m.vx-omega*(m.vx+omega*ex)*dt)*f,vy=(m.vy-omega*(m.vy+omega*ey)*dt)*f
 let dx=vx-m.vx,dy=vy-m.vy,change=Math.hypot(dx,dy),u=change?Math.min(1,maxAccel*dt/change):1
 const oldVX=m.vx,oldVY=m.vy;m.vx+=dx*u;m.vy+=dy*u
 let n=Math.hypot(m.vx,m.vy);if(n>maxSpeed){m.vx*=maxSpeed/n;m.vy*=maxSpeed/n}
 m.ax=(m.vx-oldVX)/dt;m.ay=(m.vy-oldVY)/dt
 m.x+=(oldVX+m.vx)*dt*.5;m.y+=(oldVY+m.vy)*dt*.5
 if(n>.003){const a=Math.atan2(m.vy,m.vx),delta=Math.atan2(Math.sin(a-m.facing),Math.cos(a-m.facing));m.facing+=clamp(delta,-dt*4,dt*4)}
 return m
}
function channel(m,key,target,dt,speed){m[key]+=(target-m[key])*(1-Math.exp(-dt*speed));return m[key]}
function reconcile(m,p,dt){
 // A collision only removes velocity into the wall. It never changes owner.
 const dx=p.x-m.x,dy=p.y-m.y,n=Math.hypot(dx,dy)
 if(n>1e-7){const nx=dx/n,ny=dy/n,d=m.vx*nx+m.vy*ny;if(d<0){m.vx-=d*nx;m.vy-=d*ny}m.ax*=.4;m.ay*=.4}
 m.x=p.x;m.y=p.y
}
