#version 440
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec2 resolution;
    vec4 tintColor;
    vec4 highlightColor;
    vec4 materialStyle;
};
layout(binding = 1) uniform sampler2D backdrop;

void main() {
    vec2 p = qt_TexCoord0 * resolution;
    vec2 center = resolution * 0.5;
    vec2 q = abs(p - center) - center + 26.0;
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 26.0;
    float mask = 1.0 - smoothstep(-0.8, 0.8, d);
    if (materialStyle.x < 0.5) {
        // Flat, opaque module; keep the lyric's landing light from its source.
        vec4 scene = texture(backdrop,(p+vec2(8.0))/(resolution+vec2(16.0)));
        fragColor = vec4(mix(scene.rgb,tintColor.rgb,0.45),1.0)*mask*qt_Opacity;
        return;
    }
    // The capture includes an eight-pixel guard band on every side.
    // A curved edge bends the actual animated dock light beneath this panel.
    vec2 n = normalize((p - center) - clamp(p - center,
        -center + vec2(26.0), center - vec2(26.0)) + vec2(0.0001));
    float bevel = exp(-max(0.0, -d) / 7.0);
    vec2 uv = (p + vec2(8.0) + n * bevel * 4.5 * materialStyle.w) / (resolution + vec2(16.0));
    vec2 texel = materialStyle.y / (resolution + vec2(16.0));
    vec4 scene = texture(backdrop, uv) * 0.2;
    scene += texture(backdrop, uv + vec2(texel.x, 0.0)) * 0.12;
    scene += texture(backdrop, uv - vec2(texel.x, 0.0)) * 0.12;
    scene += texture(backdrop, uv + vec2(0.0, texel.y)) * 0.12;
    scene += texture(backdrop, uv - vec2(0.0, texel.y)) * 0.12;
    scene += texture(backdrop, uv + texel) * 0.08;
    scene += texture(backdrop, uv - texel) * 0.08;
    scene += texture(backdrop, uv + vec2(texel.x,-texel.y)) * 0.08;
    scene += texture(backdrop, uv + vec2(-texel.x,texel.y)) * 0.08;
    // Preserve source alpha: the old opaque output hid the actual desktop.
    // A small dark coating and a wider blur give the lens a matte finish.
    float coating = materialStyle.z;
    float transmission = 0.58;
    float alpha = coating + scene.a * transmission * (1.0-coating);
    vec3 surface = tintColor.rgb * coating + scene.rgb * transmission * (1.0-coating);
    float specular = pow(max(0.0, dot(n, normalize(vec2(-0.55, -1.0)))), 3.0);
    // Broad, subtle reflection rather than a separate hard outline around lyrics.
    surface += highlightColor.rgb * bevel * 0.006 * specular;
    // Sample only the housing: text and karaoke remain a sharp overlay.
    fragColor = vec4(min(surface,vec3(alpha)), alpha) * mask * qt_Opacity;
}
