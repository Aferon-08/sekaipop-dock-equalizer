#version 440
layout(location=0) in vec2 qt_TexCoord0;
layout(location=0) out vec4 fragColor;
layout(std140,binding=0) uniform buf {
 mat4 qt_Matrix;float qt_Opacity;
 vec2 resolution;vec2 sceneSize;vec2 origin;
 vec4 capsule;vec4 roomRect;float roomKind;float roomAngle;float unionAmount;float attached;float drawBody;
 vec4 dent;vec4 light;vec4 nearLight;vec4 farLight;
 vec4 tint;vec4 fillColor;vec4 highlight;float core;float time;
};
layout(binding=1) uniform sampler2D backdrop;
float roomShape(vec2 world){
 vec2 v=world-roomRect.xy;float c=cos(roomAngle),s=sin(roomAngle);vec2 p=vec2(c*v.x+s*v.y,-s*v.x+c*v.y);
 vec2 hit=dent.xy-roomRect.xy;hit=vec2(c*hit.x+s*hit.y,-s*hit.x+c*hit.y);
 if(abs(dent.z)>.001)p-=normalize(hit+vec2(.0001))*dent.z*exp(-dot(p-hit,p-hit)/max(1.,dent.w*dent.w));
 vec2 b=roomRect.zw*.5;
 if(roomKind<.5 || (roomKind>2.5 && roomKind<4.5)){float r=min(b.x,b.y)*(roomKind>2.5 && roomKind<3.5?1.:.47);vec2 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
 vec2 n=p/b;float a=atan(n.y,n.x),r=length(n);
 if(roomKind<1.5)return (r-1.)*min(b.x,b.y);
 if(roomKind<2.5)return max(r-(.86+.09*cos(a*9.)),.37-r)*min(b.x,b.y);
 return (r-(.89+.09*sin(a*3.+.5)+.035*cos(a*5.)))*min(b.x,b.y);
}
float capsuleShape(vec2 world){vec2 p=world-capsule.xy;float a=.1*sin(time*1.5),c=cos(a),s=sin(a);p=vec2(c*p.x+s*p.y,-s*p.x+c*p.y);p/=vec2(max(.8,capsule.w),1./max(.8,capsule.w));return length(p)-capsule.z;}
float liquidUnion(float a,float b,float k){float h=max(k-abs(a-b),0.)/max(.001,k);return min(a,b)-h*h*k*.25;}
vec3 glow(vec2 p,vec4 point,float strength,bool head){
 vec2 delta=(p-point.xy)/max(8.,sceneSize.y*.035*point.w);float r=dot(delta,delta);
 vec3 col=tint.rgb*exp(-r*2.2)*.75;if(head)col+=vec3(1.)*exp(-r*75./(.6+core))*core*1.5;
 return col*point.z*strength;
}
void main(){
 vec2 world=origin+qt_TexCoord0*resolution;
 float d=capsule.z>.01?capsuleShape(world):10000.;
 if(attached>.5)d=liquidUnion(roomShape(world),d,unionAmount);
 // Before budding and after absorption, only the room contains the light.
 if(capsule.z<.01 && drawBody<.5)d=roomShape(world);
 float aa=max(.65,fwidth(d)),mask=1.-smoothstep(-aa,aa,d);
 vec3 col=vec3(0.);float alpha=0.;
 if(drawBody>.5){
  vec2 n=normalize(world-capsule.xy+vec2(.001));float edge=exp(-max(0.,-d)/7.);
  // A spherical lens bends the actual opaque backdrop through its volume.
  // The previous rim-only offset left the centre optically flat.
  vec2 local=(world-capsule.xy)/max(1.,capsule.z);
  float thickness=sqrt(max(0.,1.-dot(local,local)));
  vec2 refracted=world-(world-capsule.xy)*thickness*.55+n*edge*capsule.z*.24;
  vec2 uv=refracted/sceneSize;
  vec3 background=texture(backdrop,uv).rgb*.4;
  vec2 dx=vec2(.8/sceneSize.x,0.),dy=vec2(0.,.8/sceneSize.y);
  background+=(texture(backdrop,uv+dx).rgb+texture(backdrop,uv-dx).rgb+texture(backdrop,uv+dy).rgb+texture(backdrop,uv-dy).rgb)*.15;
  col=mix(background,fillColor.rgb,.19)+highlight.rgb*.035;
  float rim=(1.-smoothstep(.7,2.2,abs(d+1.3)));
  col+=highlight.rgb*(rim*(.055+.35*pow(max(0.,dot(n,normalize(vec2(-.6,-1.)))),2.))+edge*.035);
  alpha=mask;col*=mask;
 }
 vec3 lightRGB=glow(world,farLight,.22,false)+glow(world,nearLight,.42,false)+glow(world,light,1.,true);
 float la=clamp(max(max(lightRGB.r,lightRGB.g),lightRGB.b),0.,1.)*mask;
 col=col*(1.-la)+min(lightRGB,vec3(1.))*mask;alpha=alpha+la*(1.-alpha);
 fragColor=vec4(min(col,vec3(alpha)),alpha)*qt_Opacity;
}
