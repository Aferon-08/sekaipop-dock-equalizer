#version 440
layout(location=0) in vec2 qt_TexCoord0;
layout(location=0) out vec4 fragColor;
layout(std140,binding=0) uniform buf {
 mat4 qt_Matrix; float qt_Opacity;
 vec2 resolution; vec2 coreSize; vec2 sceneSize; vec2 center;
 vec4 fillColor; vec4 lightColor;
 float kind; float glass; float angle; float illumination; float shimmer;
 vec4 pet0; vec4 pet1; vec4 petNear0; vec4 petNear1; vec4 petFar0; vec4 petFar1;
 float petCore;vec4 dent;vec4 bud;vec4 bud2;float stackDepth;float membraneOverlay;vec4 petColor;float occupancyOverlay;vec2 petOcclusion;float rimProgress;float rimOrigin;float maskOnly;float useWallMask;
};
layout(binding=1) uniform sampler2D backdrop;
layout(binding=2) uniform sampler2D wallMask;
float shape(vec2 p){
 vec2 b=coreSize*.5;
 if(kind<.5 || (kind>2.5 && kind<4.5)) {
  float r=min(b.x,b.y)*(kind>2.5 && kind<3.5?1.:.47);
  vec2 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;
 }
 vec2 v=p/b;float a=atan(v.y,v.x),r=length(v);
 if(kind<1.5)return (r-1.)*min(b.x,b.y);
 if(kind<2.5){float teeth=.86+.09*cos(a*9.);return max((r-teeth)*min(b.x,b.y),(.37-r)*min(b.x,b.y));}
 return (r-(.89+.09*sin(a*3.+.5)+.035*cos(a*5.)))*min(b.x,b.y);
}
vec3 glow(vec2 world,vec4 light,float strength,bool core,float obscured){
 vec2 delta=(world-light.xy)/max(8.,sceneSize.y*.035*light.w);
 float r=dot(delta,delta);
 vec3 c=petColor.rgb*exp(-r*2.2)*.75;
 if(core)c+=vec3(1.)*exp(-r*75./((.6+petCore)*(1.+obscured*.8)))*petCore*1.5*(1.-obscured*.15);
 return c*light.z*strength;
}
void main(){
 vec2 p=(qt_TexCoord0-.5)*resolution,dp=p;
 if(glass>.5 && abs(dent.z)>.001){
  mat2 invRot=mat2(cos(angle),-sin(angle),sin(angle),cos(angle));
  vec2 hit=invRot*(dent.xy-center),normal=normalize(hit+vec2(.0001));
  float fall=exp(-dot(p-hit,p-hit)/max(1.,dent.w*dent.w));
  dp-=normal*dent.z*fall;
 }
 float d=shape(dp);
 if(glass>.5 && bud.z>.001){
  mat2 rot=mat2(cos(angle),sin(angle),-sin(angle),cos(angle));
  vec2 world=center+rot*p;float b=length(world-bud.xy)-bud.z;
  float h=max(bud.w-abs(d-b),0.)/max(.001,bud.w);
  d=min(d,b)-h*h*bud.w*.25;
 }
 if(glass>.5 && bud2.z>.001){
  mat2 rot=mat2(cos(angle),sin(angle),-sin(angle),cos(angle));
  vec2 world=center+rot*p;float b=length(world-bud2.xy)-bud2.z;
  float h=max(bud2.w-abs(d-b),0.)/max(.001,bud2.w);d=min(d,b)-h*h*bud2.w*.25;
 }
 float aa=max(fwidth(d),.65);float mask=1.-smoothstep(-aa,aa,d);
 if(maskOnly>.5){fragColor=vec4(vec3(stackDepth)*mask,mask)*qt_Opacity;return;}
 if(membraneOverlay>.5){
  mat2 invRot=mat2(cos(angle),-sin(angle),sin(angle),cos(angle));
  vec2 hit=invRot*(dent.xy-center);
  float focus=exp(-dot(p-hit,p-hit)/max(1.,dent.w*dent.w));
  float rim=(1.-smoothstep(.6,2.1,abs(d+.8)))*focus*.65*clamp(abs(dent.z)/3.,0.,1.);
  fragColor=vec4(lightColor.rgb*rim,rim)*qt_Opacity;return;
 }
 if(occupancyOverlay>.5){
  mat2 rot=mat2(cos(angle),sin(angle),-sin(angle),cos(angle));vec2 world=center+rot*p;
  vec3 light=glow(world,petFar0,.22,false,0.)+glow(world,petFar1,.22,false,0.);
  light+=glow(world,petNear0,.42,false,0.)+glow(world,petNear1,.42,false,0.);
  light+=glow(world,pet0,1.,true,petOcclusion.x)+glow(world,pet1,1.,true,petOcclusion.y);
  if(useWallMask>.5)mask*=1.-step(stackDepth+.007,texture(wallMask,world/sceneSize).r)*texture(wallMask,world/sceneSize).a;
  float angleAt=atan(p.y/max(1.,coreSize.y),p.x/max(1.,coreSize.x))-rimOrigin;
  float arc=abs(atan(sin(angleAt),cos(angleAt)));
  float reveal=1.-smoothstep(rimProgress*3.141593-.07,rimProgress*3.141593+.07,arc);
  float rim=(1.-smoothstep(.8,2.6,abs(d+1.2)))*.23*reveal*rimProgress;
  float alpha=clamp(max(max(light.r,light.g),light.b),0.,1.);
  vec3 rgb=min(light,vec3(alpha));
  rgb=rgb*(1.-rim)+petColor.rgb*rim;alpha=alpha*(1.-rim)+rim;
  fragColor=vec4(rgb*mask,alpha*mask)*qt_Opacity;return;
 }
 float shadow=(1.-smoothstep(-2.,20.,shape(dp-vec2(0.,6.))))*.095*illumination;
 vec3 col=fillColor.rgb;
 vec2 materialUV=dp/coreSize+.5;
 float grad=clamp(materialUV.x*.23+materialUV.y*.72,0.,1.);
 col=mix(col*1.12,col*.86,grad);
 float wave=smoothstep(.52+.12*sin(materialUV.x*5.),.53+.12*sin(materialUV.x*5.),materialUV.y);
 col=mix(col,col*.88,wave*.55);
 vec2 n=normalize(vec2(dFdx(d),dFdy(d))+vec2(.00001));
 float bevel=exp(-max(0.,-d)/8.);
 float spec=pow(max(0.,dot(n,normalize(vec2(-.6,-1.)))),2.);
 if(glass>.5){
  mat2 rot=mat2(cos(angle),sin(angle),-sin(angle),cos(angle));
  vec2 uv=(center+rot*p+rot*n*bevel*7.)/sceneSize;
  vec2 tx=2.3/sceneSize;
  vec3 b=texture(backdrop,uv).rgb*.4;
  b+=texture(backdrop,uv+vec2(tx.x,0)).rgb*.15;
  b+=texture(backdrop,uv-vec2(tx.x,0)).rgb*.15;
  b+=texture(backdrop,uv+vec2(0,tx.y)).rgb*.15;
  b+=texture(backdrop,uv-vec2(0,tx.y)).rgb*.15;
  col=mix(b,fillColor.rgb,.19)+lightColor.rgb*.035;
  vec2 world=center+rot*p;

 }
 float edge=1.-smoothstep(.7,2.2,abs(d+1.3));
 float sweep=exp(-pow((materialUV.x*.65+materialUV.y*.35-shimmer)*8.,2.));
 col+=lightColor.rgb*illumination*(edge*(.055+spec*(glass>.5?.35:.14))+bevel*.035+sweep*.022);
 float alpha=mask+shadow*(1.-mask);
 fragColor=vec4(col*mask,alpha)*qt_Opacity;
}
