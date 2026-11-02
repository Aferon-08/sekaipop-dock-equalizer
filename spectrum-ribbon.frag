#version 440
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec2 resolution;
    vec4 primaryColor;
    vec4 secondaryColor;
    vec4 inkColor;
    vec4 audio0;
    vec4 audio1;
    vec4 audio2;
    vec4 audio3;
    float clock;
    float direction;
};
float sampleBand(int i) {
    if (i < 4) return audio0[i];
    if (i < 8) return audio1[i-4];
    if (i < 12) return audio2[i-8];
    return audio3[i-12];
}
void main() {
    float x = direction < 0.0 ? 1.0 - qt_TexCoord0.x : qt_TexCoord0.x;
    float y = (qt_TexCoord0.y - 0.5) * 2.0;
    float amplitude = 0.0;
    float weight = 0.0;
    for (int i=0; i<16; ++i) {
        float w = exp(-pow((x - float(i)/15.0) * 13.0, 2.0));
        amplitude += sampleBand(i) * w;
        weight += w;
    }
    amplitude /= max(0.001, weight);
    float taper = pow(max(0.0, sin(x * 3.14159265)), 0.65);
    float energy = amplitude * taper;
    float edge = smoothstep(0.0, 0.06, x) * smoothstep(0.0, 0.06, 1.0-x);
    float aa = 2.0 / max(1.0, resolution.y);
    vec3 color = vec3(0.0);
    float alpha = 0.0;
    // Each ribbon has a separate drifting spine; no hard individual bars.
    for (int layer=0; layer<3; ++layer) {
        float phase = float(layer)*2.094;
        float center = sin(x*9.0 - clock*1.3 + phase) * energy * 0.32;
        float radius = energy * (0.86 + 0.27*sin(x*6.0 + phase + clock*0.7));
        float d = abs(y-center);
        float fill = 1.0-smoothstep(radius-aa, radius+aa, d);
        float mist = exp(-pow(d/max(0.035, radius*1.5), 2.0));
        float a = (fill*0.45 + mist*0.16) * smoothstep(0.0,0.025,energy) * edge;
        vec3 hue = layer==0 ? primaryColor.rgb : layer==1 ? secondaryColor.rgb
            : mix(inkColor.rgb, primaryColor.rgb,0.82);
        color = hue*a + color*(1.0-a);
        alpha = a + alpha*(1.0-a);
    }
    float core = exp(-pow(y/max(aa,0.028+energy*0.06),2.0))
        * smoothstep(0.0,0.08,energy) * edge * 0.2;
    color = inkColor.rgb*core + color*(1.0-core);
    alpha = core + alpha*(1.0-core);
    fragColor = vec4(color,alpha)*qt_Opacity;
}
