#version 440
layout(location=0) in vec2 qt_TexCoord0;
layout(location=0) out vec4 fragColor;
layout(std140,binding=0) uniform buf {
 mat4 qt_Matrix; float qt_Opacity;
 vec2 resolution; vec4 baseColor; vec4 colorA; vec4 colorB;
 float lightAmount; float variant;
};
void main(){
 vec2 uv=qt_TexCoord0;
 vec3 c=baseColor.rgb;
 float wave=.64+.13*sin(uv.x*3.8+variant);
 float w1=1.-smoothstep(wave-.07,wave+.07,uv.y);
 float w2=1.-smoothstep(.76-.19*sin(uv.x*4.4+1.2+variant),.86-.19*sin(uv.x*4.4+1.2+variant),uv.y);
 // Wide translucent folds, keeping a readable, quiet base.
 c=mix(c,colorA.rgb,(1.-w1)*.22);
 c=mix(c,colorB.rgb,(1.-w2)*.24);
 float glow=exp(-dot((uv-vec2(.30,.18))*vec2(1.,1.3),(uv-vec2(.30,.18))*vec2(1.,1.3))*5.);
 c+=vec3(.075)*glow*lightAmount;
 float grain=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5;
 fragColor=vec4(c+grain*.004,1.)*qt_Opacity;
}
