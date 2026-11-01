#version 440
layout(location=0) in vec2 qt_TexCoord0;
layout(location=0) out vec4 fragColor;
layout(std140,binding=0) uniform buf {
 mat4 qt_Matrix;float qt_Opacity;
 vec2 resolution;vec2 origin;vec2 a;vec2 b;vec2 c1;vec2 c2;
 vec4 light;vec4 nearLight;vec4 farLight;vec4 tint;float core;float sceneHeight;
};
vec2 curve(float t){float q=1.-t;return q*q*q*a+3.*q*q*t*c1+3.*q*t*t*c2+t*t*t*b;}
vec3 glow(vec2 p,vec4 l,float strength,bool head){
 vec2 delta=(p-l.xy)/max(8.,sceneHeight*.035*l.w);float r=dot(delta,delta);
 vec3 col=tint.rgb*exp(-r*2.2)*.75;
 if(head)col+=vec3(1.)*exp(-r*75./(.6+core))*core*1.5;
 return col*l.z*strength;
}
void main(){
 vec2 p=origin+qt_TexCoord0*resolution;
 // The light illuminates the tube from within; its optical halo is not a
 // solid body and must not be cut into a needle by the tube silhouette.
 vec3 rgb=glow(p,light,1.,true)+glow(p,nearLight,.42,false)+glow(p,farLight,.22,false);
 float alpha=clamp(max(max(rgb.r,rgb.g),rgb.b),0.,1.);
 fragColor=vec4(min(rgb,vec3(alpha)),alpha)*qt_Opacity;
}
