    // BEGIN dock-equalizer widget registry v1
    function reportWallpaperRect(remove) {
        const st = PluginService.stateFor("dock-equalizer")
        if(!st || !st.service || typeof st.service.setWidgetRect !== "function")return
        const key = root.gridId
        if(!key)return
        const t = root.target, w = QsWindow.window
        // FocusGate can unload the entire widget. Its last layout rectangle
        // survives that lifecycle; the wallpaper filters real removals by settings.
        if(remove || !t || !w || t.width<=0 || t.height<=0)return
        if(w.placed !== undefined && !w.placed)return
        const k = w && w.uiScale !== undefined ? w.uiScale : 1
        st.service.setWidgetRect(key, {screen:root.screenName,x:t.x*k,y:t.y*k,width:t.width*k,height:t.height*k})
    }
    Timer {
        interval:800;repeat:true;running:true
        onTriggered:root.reportWallpaperRect(false)
        Component.onDestruction:root.reportWallpaperRect(true)
    }
    // END dock-equalizer widget registry v1
