.pragma library

function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value))
}

function smooth(value) {
    var t = clamp(value, 0, 1)
    return t * t * (3 - 2 * t)
}

function travel(value) {
    var t = clamp(value, 0, 1)
    return t * t * t * (t * (t * 6 - 15) + 10)
}

// A soft impact with zero initial velocity and one small recoil.
function settle(seconds) {
    if (seconds < 0 || seconds > 0.42)
        return 0
    var t = seconds * 24
    return (1 + t) * Math.exp(-t) * Math.cos(seconds * 23)
}

// Song time, rather than chained animations, keeps landings on word stamps.
// A held word gets a quiet rest; a quick phrase gets shallower, faster arcs.
function sample(time, start, next, fromX, toX, maxArc) {
    var interval = next - start
    var distance = toX - fromX
    var canHop = isFinite(interval) && interval > 0.025 && Math.abs(distance) > 0.5
    var duration = canHop ? Math.min(interval * 0.82,
        clamp(0.22 + Math.sqrt(Math.abs(distance)) * 0.008, 0.22, 0.4)) : 0
    var launch = canHop ? next - duration : Infinity
    var phase = canHop ? clamp((time - launch) / duration, 0, 1) : 0
    var air = Math.pow(Math.sin(Math.PI * phase), 2)
    var height = Math.max(0, maxArc) * clamp(duration / 0.28, 0.48, 1)
    var landing = smooth((phase - 0.8) / 0.2)
    var release = 1 - smooth(phase / 0.22)
    var impact = settle(time - start) * release + landing
    var horizontal = 30 * phase * phase * Math.pow(phase - 1, 2) * distance
    var vertical = -height * Math.PI * Math.sin(2 * Math.PI * phase)
    var angle = canHop ? Math.atan2(vertical, Math.max(0.001, Math.abs(horizontal))) * 180 / Math.PI : 0
    return {
        x: fromX + distance * travel(phase),
        y: -height * air + 0.6 * impact,
        scaleX: 1 + 0.27 * air + 0.28 * impact,
        scaleY: 1 - 0.1 * air - 0.24 * impact,
        angle: clamp(angle, -32, 32) * air,
        air: air,
        impact: impact,
        phase: phase,
        duration: duration
    }
}

// The endpoints can move with the scrolling rows. The interpolation has zero
// endpoint velocity of its own, so it joins each endpoint's motion smoothly.
function bridge(time, start, end, source, target, ceiling) {
    var phase = clamp((time - start) / Math.max(0.01, end - start), 0, 1)
    var blend = travel(phase)
    var air = Math.pow(Math.sin(Math.PI * phase), 2)
    var impact = smooth((phase - 0.8) / 0.2)
    var x = source.x + (target.x - source.x) * blend
    var baseY = source.y + (target.y - source.y) * blend
    var size = source.size + (target.size - source.size) * blend
    var arc = Math.min(18 + Math.abs(target.x - source.x) * 0.015,
        Math.max(0, baseY - ceiling - size * 0.65 - 1))
    var dx = target.x - source.x
    var dy = target.y - source.y - arc * Math.PI * Math.sin(2 * Math.PI * phase)
    return {
        x: x, y: baseY - arc * air + 0.6 * impact,
        size: size,
        scaleX: (source.scaleX || 1) * (1 - blend) + blend + 0.27 * air + 0.28 * impact,
        scaleY: (source.scaleY || 1) * (1 - blend) + blend - 0.1 * air - 0.24 * impact,
        angle: clamp(Math.atan2(dy, Math.max(1, Math.abs(dx))) * 180 / Math.PI, -32, 32) * air * (dx < 0 ? -1 : 1),
        air: air, impact: impact, phase: phase,
        alpha: source.gap ? smooth(phase / 0.14) : 1,
        duration: end - start
    }
}
