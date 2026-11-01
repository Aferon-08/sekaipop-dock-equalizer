#version 440
layout(location=0) in vec2 qt_TexCoord0;
layout(location=0) out vec4 fragColor;
layout(std140,binding=0) uniform buf {
 mat4 qt_Matrix;float qt_Opacity;vec2 resolution;vec4 phoneBox;vec4 shapeBox;vec4 backdropBox;
 float radius;float water;float photo;float clock;float hasBackground;vec4 tint;vec4 accent;
};
layout(binding=1) uniform sampler2D source;
layout(binding=2) uniform sampler2D background;
float rounded(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
float field(vec2 p){
 float a=atan(p.y,p.x);
 float wave=(sin(a*3.+clock*2.)*.065+cos(a*5.-clock*3.)*.032)*water;
 return rounded(p/(1.+wave),shapeBox.zw*.5,min(radius,min(shapeBox.z,shapeBox.w)*.49));
}
void main(){
 vec2 world=qt_TexCoord0*resolution,p=world-shapeBox.xy;
 float d=field(p),mask=1.-smoothstep(-1.,1.,d);
 vec2 n=normalize(vec2(field(p+vec2(1.,0.))-field(p-vec2(1.,0.)),field(p+vec2(0.,1.))-field(p-vec2(0.,1.)))+vec2(.00001));
 float depth=max(0.,-d),edge=exp(-depth/20.);
 vec2 refractOffset=-n*(17.*edge)-p/max(shapeBox.zw,vec2(1.))*3.+vec2(sin(p.y*.015+clock*2.),cos(p.x*.012))*water*7.;
 vec2 uv=(world+backdropBox.xy+refractOffset)/max(backdropBox.zw,vec2(1.));
 vec2 fringe=n*edge*1.5/max(backdropBox.zw,vec2(1.));
 vec4 behind=texture(background,clamp(uv,0.,1.));
 vec3 refracted=vec3(texture(background,clamp(uv+fringe,0.,1.)).r,behind.g,texture(background,clamp(uv-fringe,0.,1.)).b);
 // The texture contains live app windows only, with transparent gaps. Never substitute wallpaper.
 float coverage=behind.a*hasBackground;
 float lens=clamp(edge*.72+.16,0.,.88)*coverage;
 float baseAlpha=.075;
 vec3 glass=mix(tint.rgb,accent.rgb,.12)*baseAlpha;
 glass+=refracted*lens;
 float alpha=baseAlpha+lens*(1.-baseAlpha);
 float rim=exp(-abs(d)/1.6),inner=exp(-abs(d+7.)/4.);
 float light=pow(max(0.,dot(n,normalize(vec2(-.6,-.8)))),5.);
 glass+=vec3(1.)*rim*(.20+.55*light)+accent.rgb*inner*.13;
 alpha=max(alpha,rim*.8);
 glass+=vec3(1.)*pow(max(0.,1.-abs(p.x/shapeBox.z+p.y/shapeBox.w+.4)),18.)*.035;
 vec2 q=p/(shapeBox.zw*.5);
 float a=atan(q.y,q.x),wave=(sin(a*3.+clock*2.)*.065+cos(a*5.-clock*3.)*.032)*water;
 vec2 samplePixel=phoneBox.xy+phoneBox.zw*.5+(q/(1.+wave))*phoneBox.zw*.5;
 vec4 phone=texture(source,clamp(samplePixel/resolution,0.,1.));
 // Same textured surface throughout; the phone's ink dissolves into the moving glass.
 phone*=mix(1.,mask,water);
 vec4 liquid=vec4(min(glass,vec3(alpha))*mask,alpha*mask);
 vec4 result=mix(liquid,phone,photo);
 fragColor=vec4(min(result.rgb,vec3(result.a)),result.a)*qt_Opacity;
}
