    // BEGIN dock-equalizer wallpaper properties v1
    property bool proceduralFailed: false
    readonly property var proceduralState: PluginService.stateFor("dock-equalizer")
    readonly property bool proceduralPending: !PluginService.scanned || (!!proceduralState && !proceduralState.loaded)
    readonly property bool proceduralDesired: !!proceduralState && proceduralState.loaded
        && proceduralState.settings.proceduralWallpaper === true && !proceduralFailed
        && (!proceduralState.service || proceduralState.service.wallpaperError === "")
    // END dock-equalizer wallpaper properties v1
