.pragma library

// Integrate a smooth velocity envelope: cruise, brake, rest, accelerate,
// cruise again. Alternating cruise lengths keep the pauses less mechanical.
function segment(t, cruise) {
    const ramp = 0.75, rest = 1.35
    if (t <= cruise) return t
    let u = (t - cruise) / ramp
    if (u < 1) return cruise + ramp * (u - u * u * u + 0.5 * u * u * u * u)
    if (t < cruise + ramp + rest) return cruise + ramp * 0.5
    u = (t - cruise - ramp - rest) / ramp
    if (u < 1) return cruise + ramp * 0.5 + ramp * (u * u * u - 0.5 * u * u * u * u)
    return t - rest - ramp
}

function motionTime(seconds) {
    const t = Math.max(0, Number(seconds) || 0)
    const first = 12.3, second = 14.6, period = first + second
    const laps = Math.floor(t / period)
    const local = t - laps * period
    const traveled = laps * (period - 4.2)
    return local < first ? traveled + segment(local, 6.8)
        : traveled + first - 2.1 + segment(local - first, 9.1)
}
