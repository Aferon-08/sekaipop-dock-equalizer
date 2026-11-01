#version 440
layout(location=0) in vec2 qt_TexCoord0;
layout(location=0) out vec4 fragColor;
layout(std140,binding=0) uniform buf {mat4 qt_Matrix;float qt_Opacity;vec2 resolution;vec2 panelSize;float progress;vec4 tint;vec4 accent;};
layout(binding=1) uniform sampler2D source;
float rounded(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
void main(){
 vec2 uv=qt_TexCoord0,p=(uv-.5)*resolution;
 float melt=sin(progress*3.141593),settle=smoothstep(.4,1.,progress);
 float angle=atan(p.y,p.x);
 vec2 b=mix(vec2(min(resolution.x*.42,560.),min(resolution.y*.3,300.)),panelSize*.5,settle);
 float wave=(sin(angle*3.+progress*5.)*.055+cos(angle*5.-progress*3.)*.025)*melt;
 vec2 q=p/(1.+wave);
 float d=rounded(q,b,mix(60.,min(b.x,b.y)*.8,melt));
 float mask=1.-smoothstep(-1.,1.,d);
 vec2 bend=normalize(p+vec2(.01))*melt*.025+vec2(sin(uv.y*23.),cos(uv.x*18.))*melt*.008;
 vec4 photo=texture(source,clamp(uv+bend,0.,1.));
 float rim=exp(-abs(d)*.5);
 vec3 glass=tint.rgb*.82+accent.rgb*(.06+rim*.3)+vec3(pow(max(0.,1.-abs(q.x/b.x+q.y/b.y)*.5),8.))*.035;
 float dissolve=smoothstep(0.,.48,progress);
 vec4 body=vec4(glass*mask*.97,mask*.97);
 fragColor=mix(photo,body,dissolve)*qt_Opacity;
}
