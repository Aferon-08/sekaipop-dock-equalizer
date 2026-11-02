.pragma library

function read(settings) {
    const s = settings || {}
    function number(key, fallback, min, max) {
        const value = s[key]
        return typeof value === "number" && Number.isFinite(value)
            ? Math.max(min, Math.min(max, value)) : fallback
    }
    return {
        enabled: s.dockGlass !== false,
        opacity: number("glassOpacity", 0.28, 0.1, 1),
        refraction: number("glassRefraction", 1, 0, 2),
        blur: number("glassBlur", 3.8, 0, 8),
        darkening: number("glassDarkening", 0.23, 0, 0.8),
        light: s.dockGlass === false ? 0 : number("glassLight", 1, 0, 2)
    }
}
