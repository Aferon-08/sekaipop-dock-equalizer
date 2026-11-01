            // BEGIN dock-equalizer adapter v1
            Loader {
                id: dockEqualizerAdapter
                anchors.fill: parent
                readonly property var st: PluginService.stateFor("dock-equalizer")
                active: !!st && st.loaded
                readonly property bool working: active && dockWindow.visible
                    && !dockWindow.tucked && !LockState.desktopAsleep
                    && !GameModeService.enabled && !!st.settings.enabled
                    && !!item && item.fits
                readonly property string claimKey: "widget:dock-equalizer:" + (dockWindow.screen ? dockWindow.screen.name : "")
                property var claimedState: null
                readonly property string lyricsSignature: media.player
                    ? [media.title, media.artist, media.player.trackAlbum, media.player.lengthSupported ? media.player.length : 0,
                       String((media.player.metadata || {})["xesam:url"] || "")].join("\u241f") : ""
                onLyricsSignatureChanged: lyricsRequest.restart()
                Timer {
                    id: lyricsRequest
                    interval: 500
                    onTriggered: {
                        if (!dockEqualizerAdapter.st || !dockEqualizerAdapter.st.settings.enabled
                            || dockEqualizerAdapter.st.settings.lyrics === false || !media.player) return
                        const p = media.player
                        LyricsService.request(media.artist, media.title, p.trackAlbum || "",
                            p.lengthSupported ? p.length : 0, String((p.metadata || {})["xesam:url"] || ""))
                    }
                }

                function syncClaim() {
                    if (claimedState && claimedState !== st)
                        claimedState.want(claimKey, false)
                    claimedState = st
                    if (st)
                        st.want(claimKey, working)
                }
                onWorkingChanged: {
                    syncClaim()
                    if (working) lyricsRequest.restart()
                }
                onStChanged: syncClaim()
                onActiveChanged: {
                    if (active)
                        setSource("file://" + st.dir + "/DockWings.qml", { host: dockEqualizerHost })
                }
                Component.onCompleted: {
                    if (active)
                        setSource("file://" + st.dir + "/DockWings.qml", { host: dockEqualizerHost })
                    syncClaim()
                    lyricsRequest.restart()
                }
                Component.onDestruction: {
                    if (claimedState)
                        claimedState.want(claimKey, false)
                }

                QtObject {
                    id: dockEqualizerHost
                    readonly property var theme: dockWindow.mt
                    readonly property var settings: dockEqualizerAdapter.st ? dockEqualizerAdapter.st.settings : ({})
                    readonly property var service: dockEqualizerAdapter.st ? dockEqualizerAdapter.st.service : null
                    readonly property bool working: dockEqualizerAdapter.working
                    function reportSurface(state) {
                        const service = dockEqualizerAdapter.st ? dockEqualizerAdapter.st.service : null
                        if (service && typeof service.setSurface === "function")
                            service.setSurface(dockWindow.screen ? dockWindow.screen.name : "", state)
                    }
                    readonly property QtObject dock: QtObject {
                        readonly property var item: dockPill
                        readonly property bool vertical: dockWindow.vertical
                        readonly property bool capsule: dockWindow.look === "capsule"
                        readonly property string look: dockWindow.look
                        readonly property real radius: dockPill.cornerRadius
                        readonly property real shadow: dockPill.shadowDy
                        readonly property bool asleep: LockState.desktopAsleep
                        readonly property var mediaSource: media
                        readonly property string screenName: dockWindow.screen ? dockWindow.screen.name : ""
                        readonly property var lyrics: LyricsService
                        readonly property bool hovered: dockWindow.hovered || dockWindow.dragOver
                            || dockWindow.menuOpen || dockWindow.folderOpen || dockWindow.toolOpen !== ""
                        readonly property bool editing: dockWindow.editing
                        readonly property real baseWidth: dockWindow.rowLen + dockWindow.magData.total + dockWindow.pillPaddingH * 2
                        readonly property real baseCapHeight: dockWindow.iconSize + dockWindow.pillPaddingV * 2
                        readonly property real stageWidth: dockEqualizerAdapter.width
                        readonly property bool desktopEmpty: {
                            const name = dockWindow.screen ? dockWindow.screen.name : ""
                            const monitor = Hyprland.monitors.values.find(m => m.name === name)
                            if (!monitor || !monitor.activeWorkspace) return false
                            const activeName = String(monitor.activeWorkspace.name || "")
                            const specialName = String(monitor.lastIpcObject?.specialWorkspace?.name || "")
                            return !Hyprland.toplevels.values.some(t => {
                                const info = t.lastIpcObject || {}
                                if (info.mapped === false || info.hidden === true || DockService.isMinimized(t)) return false
                                const ws = t.workspace
                                const wsName = String(info.workspace?.name || ws?.name || "")
                                return (activeName !== "" && wsName === activeName)
                                    || (specialName !== "" && wsName === specialName)
                                    || (info.pinned === true && (ws?.monitor?.name === name || info.monitor === monitor.id))
                            })
                        }
                        readonly property var palette: ({
                            fill: capsule ? dockWindow.mt.capBody : dockWindow.mt.surface,
                            rim: capsule ? dockWindow.mt.capRim : dockWindow.mt.line,
                            border: capsule ? dockWindow.mt.capRimWidth : dockWindow.mt.borderWidth,
                            ringWidth: capsule ? dockWindow.mt.capRimWidth : dockWindow.mt.borderWidth + dockWindow.mt.outerRingWidth,
                            ring: capsule ? dockWindow.mt.capBody : dockWindow.mt.surfaceRing,
                            shadow: capsule ? dockWindow.mt.capShade : dockWindow.mt.lineShadow,
                            ink: dockWindow.mt.ink,
                            accent: capsule ? dockWindow.mt.capLit : dockWindow.mt.accentCyan
                        })
                    }
                }
            }
            // END dock-equalizer adapter v1

