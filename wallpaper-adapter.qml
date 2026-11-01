        // BEGIN dock-equalizer wallpaper loader v1
        Rectangle {
            anchors.fill: parent
            color: "black"
            visible: win.proceduralPending || win.proceduralDesired
        }
        Loader {
            id: proceduralWallpaper
            anchors.fill: parent
            active: win.proceduralDesired && !!win.proceduralState.service
                && win.proceduralState.service.wallpaperSeed !== "" && widgetSnapshotReady
            property bool widgetSnapshotReady:false
            property int widgetScans:0
            property var widgetAreas:[]
            property string pendingWidgetAreas:""
            // Configured placement, independent of FocusGate/lock/Game Mode
            // destroying or hiding the widget's window.
            function widgetConfigured(id,screen){
                // The stock audio visualizer can overlap the wallpaper art.
                if(id==="visualizer")return false
                if(!EditMode.widgetShown(id))return false
                if(EditMode.cloneable(id))return EditMode.homeOf(id)===screen || WidgetClones.has(id,screen)
                if(id==="todo" || id==="notes")return DesktopMonitors.homeFor(id)===screen
                if(id.indexOf("image:")===0){const r=ImageService.rec(id.slice(6));return !!r && EditMode.homeScreen(r.screen)===screen}
                if(PluginService.isPluginId(id)){const st=PluginService.stateFor(id);return !!st && EditMode.homeScreen(st.screenName)===screen}
                return false
            }
            function collectWidgets(){
                if(EditMode.active)return
                const areas=[]
                const rects=win.proceduralState?.service?.widgetRects || {}
                for(const key of Object.keys(rects).sort()){
                    const r=rects[key]
                    if(r.screen!==win.screenName)continue
                    const id=key.slice(0,key.lastIndexOf("@"))
                    if(!widgetConfigured(id,r.screen))continue
                    areas.push({x:Math.floor(r.x/4)*4,y:Math.floor(r.y/4)*4,width:Math.ceil(r.width/4)*4+4,height:Math.ceil(r.height/4)*4+4})
                }
                const signature=JSON.stringify(areas)
                // Wait for placement/size to settle, including widgets recreated
                // after focus changes. Dragging in Edit Desktop is ignored above.
                if(signature===pendingWidgetAreas && signature!==JSON.stringify(widgetAreas))widgetAreas=areas
                const settled=signature===pendingWidgetAreas
                pendingWidgetAreas=signature
                widgetScans++
                if(widgetScans>=2 && settled)widgetSnapshotReady=true
            }
            Timer {interval:650;running:true;onTriggered:proceduralWallpaper.collectWidgets()}
            Timer {interval:1200;running:win.proceduralDesired;repeat:true;onTriggered:proceduralWallpaper.collectWidgets()}
            readonly property string petClaimKey: "widget:wallpaper-pet:" + win.screenName
            readonly property bool petWorking: active && !!item && item.pet.glass.length>0 && win.proceduralState.settings.wallpaperPet !== false
                && LockState.phase === "idle" && !win.fullscreenCovered && !GameModeService.enabled
            onPetWorkingChanged: syncPetClaim()
            function syncPetClaim() { if(win.proceduralState) win.proceduralState.want(petClaimKey,petWorking) }
            Component.onDestruction: if(win.proceduralState) win.proceduralState.want(petClaimKey,false)
            onStatusChanged: if(status === Loader.Error) win.proceduralFailed = true
            onActiveChanged: if(active && String(source) === "") loadScene()
            function loadScene() {
                setSource("file://" + win.proceduralState.dir + "/ProceduralWallpaper.qml", {
                    seed: Qt.binding(() => win.proceduralState.service.wallpaperSeed),
                    screenName: win.screenName,
                    theme: Theme,
                    widgetAreas: Qt.binding(() => proceduralWallpaper.widgetAreas),
                    music: Qt.binding(() => win.proceduralState.service),
                    barEdge: Qt.binding(() => BarPositionService.position),
                    barExtent: Qt.binding(() => Math.round((BarStyleService.index === 3
                        ? (BarPositionService.vertical ? win.mt.capStripV : win.mt.capStrip)
                        : BarPositionService.thickness) * win.uiScale)),
                    settings: Qt.binding(() => win.proceduralState.settings),
                    working: Qt.binding(() => LockState.phase === "idle" && !win.fullscreenCovered && !GameModeService.enabled)
                })
            }
            Component.onCompleted: { if(active && String(source) === "") loadScene();syncPetClaim() }
            Connections {
                target: proceduralWallpaper.item
                function onNewComposition() { win.proceduralState.setSetting("wallpaperRegenerate",true) }
            }
        }
        // END dock-equalizer wallpaper loader v1
