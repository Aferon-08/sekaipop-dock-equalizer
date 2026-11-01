#version 440
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec2 resolution;
    vec4 dockRect;
    vec4 wingData;
    vec4 params;
    vec4 skinStyle;
    vec4 fillColor;
    vec4 rimColor;
    vec4 ringColor;
    vec4 shadowColor;
    vec4 lightData;
    vec4 leftAudio;
    vec4 rightAudio;
    vec4 lightPrimary;
    vec4 lightSecondary;
    vec4 lightTertiary;
    vec4 wordLight;
    vec4 wordLightTail;
    vec4 wordLightMist;
    vec2 glowBreath;
    float heartPulse;
};

float roundedBox(vec2 p, vec2 center, vec2 size, float radius) {
    vec2 q = abs(p - center) - size * 0.5 + radius;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

float liquidUnion(float a, float b, float k) {
    if (k < 0.001) return min(a, b);
    float h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h * h * k * 0.25;
}

float body(vec2 p) {
    vec2 center = dockRect.xy + dockRect.zw * 0.5;
    float mainBody = roundedBox(p, center, dockRect.zw, params.y);
    vec2 wingSize = vec2(wingData.w, params.x);
    float left = roundedBox(p, wingData.xy, wingSize, params.x * 0.5);
    float right = roundedBox(p, wingData.zy, wingSize, params.x * 0.5);
    if (skinStyle.z < 0.5) return min(left, right);
    return liquidUnion(liquidUnion(mainBody, left, params.z), right, params.z);
}

// Arc length from either side's midpoint to the nearest top/bottom midpoint.
// Reflection makes four fronts meet continuously on the horizontal edges.
float perimeterTravel(vec2 p) {
    vec2 halfSize = dockRect.zw * 0.5;
    vec2 q = abs(p - dockRect.xy - halfSize);
    float r = min(params.y, min(halfSize.x, halfSize.y));
    vec2 corner = halfSize - r;
    float d;
    if (q.y <= corner.y) d = q.y;
    else if (q.x >= corner.x)
        d = corner.y + r * atan(max(0.0, q.y - corner.y), max(0.0001, q.x - corner.x));
    else d = corner.y + r * 1.5707963 + corner.x - q.x;
    return d / max(1.0, corner.y + r * 1.5707963 + corner.x);
}

vec3 sideLight(vec2 p, bool rightSide, float sensitivity) {
    vec3 audio = clamp((rightSide ? rightAudio.xyz : leftAudio.xyz) * sensitivity, 0.0, 1.0);
    float sideX = dockRect.x + (rightSide ? dockRect.z : 0.0);
    float x = abs(p.x - sideX);
    float y = (p.y - dockRect.y) / max(1.0, dockRect.w);
    // Three overlapping frequency clouds, never discrete spectrum bars.
    vec3 bands = vec3(exp(-pow((y - 0.72) / 0.25, 2.0)),
        exp(-pow((y - 0.43) / 0.3, 2.0)), exp(-pow((y - 0.2) / 0.22, 2.0)));
    bands *= vec3(0.035) + audio * 0.95;
    float energy = max(audio.x, max(audio.y, audio.z));
    float reach = 18.0 + 30.0 * energy;
    float spread = exp(-pow(x / reach, 1.35));
    return (lightPrimary.rgb * bands.x + lightSecondary.rgb * bands.y
        + lightTertiary.rgb * bands.z) * spread;
}

// Elliptical, feathered pools follow the lyric marker under the glass.
float wordPool(vec2 p, vec4 anchor, vec2 spread) {
    vec2 offset = (p - dockRect.xy - anchor.xy) / (spread * glowBreath.x);
    return exp(-dot(offset, offset) * 1.6) * anchor.z;
}
vec3 lyricLight(vec2 p) {
    float head = wordPool(p, wordLight, mix(vec2(27.0, 16.0), vec2(17.0, 14.0), lightData.z));
    float tail = wordPool(p, wordLightTail, mix(vec2(38.0, 20.0), vec2(27.0, 18.0), lightData.z));
    float mist = wordPool(p, wordLightMist, mix(vec2(50.0, 24.0), vec2(36.0, 23.0), lightData.z));
    float core = wordPool(p, wordLight, vec2(5.0, 4.0));
    return (lightPrimary.rgb * head * 0.38
        + mix(lightPrimary.rgb, lightSecondary.rgb, 0.4) * tail * 0.14
        + lightSecondary.rgb * mist * 0.065) * glowBreath.y
        + vec3(1.0) * core * (0.1 + 0.56 * heartPulse);
}

void main() {
    vec2 p = qt_TexCoord0 * resolution;
    float distance = body(p);
    float aa = max(fwidth(distance), 0.65);
    float cover = 1.0 - smoothstep(-aa, aa, distance);
    float depth = -distance;
    vec4 face = mix(rimColor, ringColor,
        smoothstep(skinStyle.x - aa, skinStyle.x + aa, depth));
    face = mix(face, fillColor,
        smoothstep(skinStyle.y - aa, skinStyle.y + aa, depth));
    // The fused glass housing sits flat; an offset opaque shadow reads as
    // an extra bottom lip and conceals the subtle lower emitter.
    float shadowShift = params.w * (1.0 - lightData.x);
    vec2 shadowOffset = skinStyle.w > 0.5 ? vec2(shadowShift, 0.0) : vec2(0.0, shadowShift);
    float shade = 1.0 - smoothstep(-aa, aa, body(p - shadowOffset));
    vec4 result = face * cover + shadowColor * shade * (1.0 - cover);
    if (lightData.x > 0.001) {
        float mainDistance = roundedBox(p, dockRect.xy + dockRect.zw * 0.5, dockRect.zw, params.y);
        float mainCover = 1.0 - smoothstep(-aa, aa, mainDistance);
        vec3 light = (sideLight(p, false, 1.0) + sideLight(p, true, 1.0)) * lightData.w + lyricLight(p);
        // Stronger under-glass light; only a tight, faint spill outside.
        float outer = exp(-pow(max(0.0, mainDistance) / 12.5, 1.5));
        float lightMask = lightData.x * 0.95 * mainCover;
        float lightAlpha = clamp(max(light.r, max(light.g, light.b)) * lightMask, 0.0, 0.85);
        result.rgb = mix(result.rgb, light, lightMask * 0.85);
        result.a = max(result.a, lightAlpha);
        float arc = perimeterTravel(p);
        float traced = lightData.y < 0.001 ? 0.0 : 1.0 - smoothstep(lightData.y - 0.012, lightData.y, arc);
        if (lightData.y > 0.999) traced = 1.0;
        // Composite an actual translucent emitter outside the silhouette.
        // Normalizing the hue avoids multiplying dim light by its alpha twice.
        vec3 outsideLight = (sideLight(p, false, 1.2) + sideLight(p, true, 1.2)) * lightData.w;
        float brightness = max(outsideLight.r, max(outsideLight.g, outsideLight.b));
        float glowAlpha = clamp(brightness * outer * 0.86 * lightData.x
            * (1.0 - mainCover) * traced, 0.0, 0.72);
        vec3 glowHue = outsideLight / max(0.001, brightness);
        result.rgb = glowHue * glowAlpha + result.rgb * (1.0 - glowAlpha);
        result.a = glowAlpha + result.a * (1.0 - glowAlpha);
        float line = (1.0 - smoothstep(0.55, 1.35, abs(mainDistance + 0.8))) * traced;
        float head = exp(-pow((arc - lightData.y) / 0.035, 2.0))
            * (1.0 - smoothstep(0.8, 1.0, lightData.y));
        float halo = exp(-abs(mainDistance) / 3.0) * traced * 0.11;
        float strength = clamp((line * (0.65 + head * 0.35) + halo) * lightData.x * lightData.w, 0.0, 1.0);
        result.rgb = mix(result.rgb, lightPrimary.rgb, strength);
        result.a = max(result.a, strength);
    }
    // All compositing above is premultiplied for the translucent outer spill.
    fragColor = result * qt_Opacity;
}
