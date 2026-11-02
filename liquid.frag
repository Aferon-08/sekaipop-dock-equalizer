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
    float lightClock;
    vec4 lyricCutout;
    float glassAmount;
    vec2 materialStyle;
};
layout(binding = 1) uniform sampler2D backdrop;

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

// Three soft frequency clouds along each side replace the absorbed capsules.
vec3 sideLight(vec2 p, bool rightSide) {
    vec3 audio = rightSide ? rightAudio.xyz : leftAudio.xyz;
    float sideX = dockRect.x + (rightSide ? dockRect.z : 0.0);
    float x = abs(p.x-sideX);
    float y = (p.y-dockRect.y)/max(1.0,dockRect.w);
    vec3 bands = vec3(exp(-pow((y-0.72)/0.25,2.0)),
        exp(-pow((y-0.43)/0.30,2.0)),exp(-pow((y-0.20)/0.22,2.0))) * audio;
    float energy = max(audio.x,max(audio.y,audio.z));
    float spread = exp(-pow(x/(18.0+30.0*energy),1.35));
    return (lightPrimary.rgb*bands.x+lightSecondary.rgb*bands.y
        +lightTertiary.rgb*bands.z)*spread;
}

vec3 bottomLight(vec2 p) {
    float x = clamp((p.x-dockRect.x)/max(1.0,dockRect.z),0.0,1.0);
    vec3 audio = mix(leftAudio.xyz,rightAudio.xyz,x);
    float energy = max(audio.x,max(audio.y,audio.z));
    float below = p.y-dockRect.y-dockRect.w;
    float spread = exp(-pow(abs(below)/(below>0.0 ? 13.0 : 24.0+14.0*energy),1.5));
    vec3 lobes = vec3(exp(-pow((x-0.2-0.045*sin(lightClock*0.7))/0.25,2.0)),
        exp(-pow((x-0.5)/0.3,2.0)),exp(-pow((x-0.8-0.045*cos(lightClock*0.8))/0.25,2.0)));
    lobes *= audio;
    return (lightPrimary.rgb*lobes.x + lightSecondary.rgb*lobes.y
        + lightTertiary.rgb*lobes.z)*spread*1.5;
}

vec3 spectralHue(vec2 p) {
    float t = (p.x+p.y*0.6)*0.017-lightClock*0.65;
    vec3 w = 0.5+0.5*cos(t+vec3(0.0,2.094,4.188));
    return (lightPrimary.rgb*w.x+lightSecondary.rgb*w.y+lightTertiary.rgb*w.z)/1.5;
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
    // The main dock is a translucent lens, rather than an opaque dark pill.
    // Capture only app windows behind it; gaps reveal the real desktop directly.
    vec2 halfDock = dockRect.zw*0.5;
    float mainD = roundedBox(p,dockRect.xy+halfDock,dockRect.zw,params.y);
    if (glassAmount > 0.001 && cover > 0.0) {
        vec2 n = normalize(vec2(body(p+vec2(1.0,0.0))-body(p-vec2(1.0,0.0)),
            body(p+vec2(0.0,1.0))-body(p-vec2(0.0,1.0)))+vec2(0.00001));
        float bevel = exp(-max(0.0,depth)/9.0);
        vec2 uv = clamp((p-n*bevel*13.0*materialStyle.y)/resolution,0.0,1.0);
        vec2 fringe = n*bevel*1.1*materialStyle.y/resolution;
        vec4 scene = texture(backdrop,uv);
        scene.r = texture(backdrop,clamp(uv+fringe,0.0,1.0)).r;
        scene.b = texture(backdrop,clamp(uv-fringe,0.0,1.0)).b;
        float mainMask = 1.0-smoothstep(-1.0,1.0,mainD);
        float tintAlpha = mix(min(1.0,materialStyle.x+0.29),materialStyle.x,mainMask);
        float transmission = 0.78;
        float a = tintAlpha+scene.a*transmission*(1.0-tintAlpha);
        vec3 tint = mix(fillColor.rgb,lightPrimary.rgb,0.065);
        vec3 rgb = tint*tintAlpha+scene.rgb*transmission*(1.0-tintAlpha);
        float rim = exp(-abs(distance+0.8)/1.1);
        float inner = exp(-abs(distance+5.0)/2.0);
        float spec = pow(max(0.0,dot(n,normalize(vec2(-0.5,-1.0)))),3.0);
        float highlight = rim*(0.13+spec*0.44)+inner*0.075;
        rgb += mix(vec3(1.0),lightPrimary.rgb,0.18)*highlight;
        a = max(a,highlight);
        result = mix(result,vec4(min(rgb,vec3(a)),a),glassAmount*cover);
    }
    // Compact audio light stays INSIDE the side capsules; no main-dock halo.
    if (lightData.x < 0.999 && skinStyle.z > 0.5) {
        vec2 wingSize = vec2(wingData.w, params.x);
        float wingD = min(roundedBox(p,wingData.xy,wingSize,params.x*0.5),
            roundedBox(p,wingData.zy,wingSize,params.x*0.5));
        float wingCover = (1.0-smoothstep(-aa,aa,wingD))*smoothstep(-1.0,1.0,mainD);
        vec3 audio = p.x < dockRect.x+dockRect.z*0.5 ? leftAudio.xyz : rightAudio.xyz;
        float energy = max(audio.x,max(audio.y,audio.z));
        float inward = exp(-max(0.0,-wingD)/7.0);
        float intensity = (inward*0.54+0.10)*wingCover
            *energy*lightData.w*(1.0-lightData.x)*glassAmount;
        float a = clamp(intensity,0.0,0.85);
        vec3 hue = spectralHue(p);
        result.rgb = min(vec3(result.a),hue*a*result.a+result.rgb*(1.0-a));
    }
    if (lightData.x > 0.001) {
        float mainDistance = roundedBox(p, dockRect.xy + dockRect.zw * 0.5, dockRect.zw, params.y);
        float mainCover = 1.0 - smoothstep(-aa, aa, mainDistance);
        float cutoutD = roundedBox(p,lyricCutout.xy+lyricCutout.zw*0.5,
            lyricCutout.zw,26.0);
        float opaqueZone = smoothstep(-1.0,2.0,cutoutD);
        vec3 light = (sideLight(p,false)+sideLight(p,true)+bottomLight(p))
            *lightData.w*opaqueZone + lyricLight(p);
        // Stronger under-glass light; only a tight, faint spill outside.
        float outer = exp(-pow(max(0.0, mainDistance) / 12.5, 1.5));
        float lightMask = lightData.x * 0.95 * mainCover;
        float lightAlpha = clamp(max(light.r, max(light.g, light.b)) * lightMask, 0.0, 0.85);
        result.a = max(result.a, lightAlpha);
        result.rgb = min(vec3(result.a), result.rgb + light * lightMask * 0.72);
        float arc = perimeterTravel(p);
        float traced = lightData.y < 0.001 ? 0.0 : 1.0 - smoothstep(lightData.y - 0.012, lightData.y, arc);
        if (lightData.y > 0.999) traced = 1.0;
        // Composite an actual translucent emitter outside the silhouette.
        // Normalizing the hue avoids multiplying dim light by its alpha twice.
        vec3 outsideLight = (sideLight(p,false)+sideLight(p,true)+bottomLight(p))*lightData.w;
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
        float lowerEdge = smoothstep(0.65,1.0,(p.y-dockRect.y)/max(1.0,dockRect.w));
        float energy = max(max(leftAudio.x,leftAudio.y),max(rightAudio.x,rightAudio.y));
        float strength = clamp((line * (0.3 + head * 0.2) + halo) * lightData.x * lightData.w * lowerEdge * energy, 0.0, 1.0);
        result.rgb = mix(result.rgb, spectralHue(p), strength);
        result.a = max(result.a, strength);
    }
    // All compositing above is premultiplied for the translucent outer spill.
    fragColor = vec4(min(result.rgb,vec3(result.a)),result.a) * qt_Opacity;
}
