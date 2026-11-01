#version 440
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec2 resolution;
    vec4 tintColor;
    vec4 highlightColor;
};
layout(binding = 1) uniform sampler2D backdrop;

void main() {
    vec2 p = qt_TexCoord0 * resolution;
    vec2 center = resolution * 0.5;
    vec2 q = abs(p - center) - center + 26.0;
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 26.0;
    float mask = 1.0 - smoothstep(-0.8, 0.8, d);
    // The capture includes an eight-pixel guard band on every side.
    // A curved edge bends the actual animated dock light beneath this panel.
    vec2 n = normalize((p - center) - clamp(p - center,
        -center + vec2(26.0), center - vec2(26.0)) + vec2(0.0001));
    float bevel = exp(-max(0.0, -d) / 7.0);
    vec2 uv = (p + vec2(8.0) + n * bevel * 4.5) / (resolution + vec2(16.0));
    vec2 texel = 1.7 / (resolution + vec2(16.0));
    vec4 scene = texture(backdrop, uv) * 0.4;
    scene += texture(backdrop, uv + vec2(texel.x, 0.0)) * 0.15;
    scene += texture(backdrop, uv - vec2(texel.x, 0.0)) * 0.15;
    scene += texture(backdrop, uv + vec2(0.0, texel.y)) * 0.15;
    scene += texture(backdrop, uv - vec2(0.0, texel.y)) * 0.15;
    vec3 surface = mix(scene.rgb, tintColor.rgb, 0.16);
    float edge = 1.0 - smoothstep(0.45, 1.3, abs(d + 0.65));
    float specular = pow(max(0.0, dot(n, normalize(vec2(-0.55, -1.0)))), 3.0);
    surface = mix(surface, highlightColor.rgb, edge * (0.025 + specular * 0.16));
    surface += highlightColor.rgb * bevel * 0.016 * specular;
    // Sample only the housing: text and karaoke remain a sharp overlay.
    fragColor = vec4(surface, 1.0) * mask * qt_Opacity;
}
