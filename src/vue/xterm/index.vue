<template>
    <div class="box">
        <div id="header">
            <div id="status"></div>
        </div>
        <div id="terminal-container" class="terminal"></div>
    </div>
</template>

<script>
    import { Terminal } from 'xterm'
    import { FitAddon } from 'xterm-addon-fit'
    import { WebLinksAddon } from "xterm-addon-web-links";
    import { SearchAddon } from 'xterm-addon-search';
    import { SearchBarAddon } from 'xterm-addon-search-bar';
    import { auto } from "./theme/auto";
    import { eventNames } from 'process';
    require('xterm/css/xterm.css')
    require('./css/style.css')
    import { inject } from "../mixin/vscodeInject";
    export default {
        mixins: [inject],
        data() {
            return {};
        },
        mounted() {
            var errorExists = false;
            const terminal = new Terminal({
                theme: auto(),
                cursorStyle: "bar",
                fontSize: 18,
                fontFamily: "'Consolas ligaturized',Consolas, 'Microsoft YaHei','Courier New', monospace",
                disableStdin: false,
                lineHeight: 1.1,
                rightClickSelectsWord: true,
                cursorBlink: true, scrollback: 10000, tabStopWidth: 8, bellStyle: "sound"
            })

            const fitAddon = new FitAddon()
            const searchAddon = new SearchAddon();
            const searchAddonBar = new SearchBarAddon({ searchAddon });

            terminal.loadAddon(fitAddon)
            terminal.loadAddon(searchAddonBar);
            terminal.loadAddon(new WebLinksAddon(() => { }, {
                willLinkActivate: (e, uri) => {
                    // set timeout to remove selection
                    setTimeout(() => {
                        this.emit('openLink', uri)
                    }, 100);
                }
            }))

            terminal.open(document.getElementById('terminal-container'))
            fitAddon.fit()
            terminal.focus()
            terminal.onData((data) => {
                this.emit('data', data)
            })

            function resizeScreen() {
                fitAddon.fit()
                this.emit('resize', { cols: terminal.cols, rows: terminal.rows })
            }

            window.addEventListener('resize', resizeScreen, false)
            window.addEventListener("keyup", async event => {
                if (event.code == "KeyV" && event.ctrlKey && !event.altKey && !event.shiftKey) {
                    this.emit('data', await navigator.clipboard.readText())
                    event.preventDefault()
                    event.stopPropagation()
                }
                if (event.code == "KeyF" && event.ctrlKey && !event.altKey && !event.shiftKey) {
                    searchAddonBar.show();
                    event.preventDefault()
                    event.stopPropagation()
                }
            });

            window.addEventListener("contextmenu", async () => {
                if (terminal.hasSelection()) {
                    document.execCommand('copy')
                    terminal.clearSelection()
                } else {
                    this.emit('data', await navigator.clipboard.readText())
                }
            })

            const status = document.getElementById('status')
            this
                .on('connecting', content => {
                    terminal.write(content)
                    terminal.focus()
                })
                .on('data', (content) => {
                    terminal.write(content)
                    terminal.focus()
                })
                .on('path', path => {
                    this.emit('data', `cd ${path}\n`)
                })
                .on('status', (data) => {
                    resizeScreen()
                    status.innerHTML = data
                    status.style.backgroundColor = '#338c33'
                    terminal.focus()
                })
                .on('ssherror', (data) => {
                    status.innerHTML = data
                    status.style.backgroundColor = 'red'
                    errorExists = true
                })
                .on('error', (err) => {
                    if (!errorExists) {
                        status.style.backgroundColor = 'red'
                        status.innerHTML = 'ERROR: ' + err
                    }
                });

            this.emit('initTerminal', { cols: terminal.cols, rows: terminal.rows })
        },
        methods: {}
    };
</script>