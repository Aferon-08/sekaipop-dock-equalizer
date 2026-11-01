.pragma library

function reset() {
    return { at: 0, energy: 0, mean: 0.04, fluxMean: 0.01,
        hit: -10000, intervals: [], bpm: 0, confidence: 0 }
}

// A lightweight estimate from CAVA envelopes, not an exact BPM tag.
// Rising bass energy triggers a beat; repeated consistent intervals establish
// tempo. This never starts an audio stream of its own.
function update(state, bands, stamp) {
    const s = state || reset()
    let square = 0
    for (let channel = 0; channel < 2; ++channel)
        for (let i = 1; i < 13; ++i) {
            const v = Math.max(0, Math.min(1, (bands[channel * 32 + i] || 0) / 1000))
            square += v * v
        }
    const energy = Math.sqrt(square / 24)
    const dt = s.at > 0 ? Math.max(1, Math.min(200, stamp - s.at)) : 33
    const flux = Math.max(0, energy - s.energy)
    const hit = energy > Math.max(0.065, s.mean * 1.13)
        && flux > Math.max(0.018, s.fluxMean * 1.65) && stamp - s.hit >= 240
    let lastHit = s.hit, intervals = s.intervals, bpm = s.bpm, confidence = s.confidence
    if (hit) {
        const gap = stamp - s.hit
        lastHit = stamp
        if (gap >= 300 && gap <= 1250) {
            intervals = intervals.concat([gap]).slice(-8)
            const sorted = intervals.slice().sort((a, b) => a - b)
            const median = sorted[Math.floor(sorted.length / 2)]
            const agreeing = intervals.filter(v => Math.abs(v - median) < median * 0.18)
            confidence = agreeing.length >= 3 ? agreeing.length / intervals.length : 0
            if (confidence >= 0.65) {
                const candidate = 60000 / (agreeing.reduce((a, b) => a + b, 0) / agreeing.length)
                bpm = bpm > 0 ? bpm * 0.7 + candidate * 0.3 : candidate
            }
        } else if (gap > 1250) {
            intervals = []; confidence = 0; bpm = 0
        }
    }
    if (stamp - lastHit > 3500) { bpm = 0; confidence = 0; intervals = [] }
    return { at: stamp, energy: energy,
        mean: s.mean + (energy - s.mean) * (1 - Math.exp(-dt / 1300)),
        fluxMean: s.fluxMean + (flux - s.fluxMean) * (1 - Math.exp(-dt / 700)),
        hit: lastHit, intervals: intervals, bpm: bpm, confidence: confidence,
        pulse: Math.exp(-Math.max(0, stamp - lastHit) / 170) }
}
