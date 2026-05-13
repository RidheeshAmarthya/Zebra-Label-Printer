/**
 * PrinterManager V2 - Stability & Precision Overhaul
 * Features: Passive Monitoring, Atomic Job Locking, and Just-In-Time Handshaking
 */

const PrinterManager = {
    device: null,
    status: 'connecting', // 'online' (blue-detected), 'ready' (green-active), 'offline' (red), 'error' (gray)
    lastStatusMsg: '',
    isProcessing: false, // Atomic lock for ALL hardware commands
    suppressChecksUntil: 0, // Temporarily pause discovery checks during print bursts
    postJobRecheckTimer: null,
    lastHandshakeAt: 0,
    handshakeCooldownMs: 2500, // Balance stability with frequent enough readiness checks
    jobsSinceHandshake: 0,
    maxJobsWithoutHandshake: 3,
    idleTimeout: null,
    isIdle: false,
    isDebug: false, // DEBUG MODE: Logs to console instead of sending to hardware
    
    init() {
        console.log("PrinterManager: Initializing Universal Service...");
        
        this.setupListeners();
        this.startHeartbeat();
        this.checkConnection(true);
    },

    setupListeners() {
        // 1. Visibility: Stop pings if the user isn't even looking at the tab
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stopHeartbeat();
            } else {
                this.startHeartbeat();
                this.checkConnection(true);
            }
        });

        // 2. Idle Detection: Back-off if the user hasn't moved for 15 mins
        const resetIdle = () => {
            if (this.isIdle) {
                this.isIdle = false;
                this.startHeartbeat();
            }
            if (this.idleTimeout) clearTimeout(this.idleTimeout);
            this.idleTimeout = setTimeout(() => {
                this.isIdle = true;
                this.startHeartbeat();
            }, 15 * 60 * 1000); // 15 mins
        };

        window.addEventListener('mousemove', resetIdle);
        window.addEventListener('keydown', resetIdle);
        resetIdle();
    },

    startHeartbeat() {
        this.stopHeartbeat();
        if (document.hidden) return;

        // Adaptive Interval: 10s for active, 60s for idle
        const interval = this.isIdle ? 60000 : 10000;
        
        this.heartbeatInterval = setInterval(() => {
            this.checkConnection();
        }, interval); 
    },

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    },

    async checkConnection(isInitial = false) {
        if (this.isDebug) {
            this.updateStatus('online', 'DEBUG MODE');
            return;
        }

        if (typeof BrowserPrint === 'undefined') {
            this.updateStatus('error', 'Service Not Running');
            return;
        }

        if (this.isProcessing || Date.now() < this.suppressChecksUntil) return;

        BrowserPrint.getLocalDevices((devices) => {
            if (this.isProcessing || Date.now() < this.suppressChecksUntil) return;

            let zebraPrinters = (devices || []).filter(d => 
                d.deviceType === 'printer' && 
                (d.name.toLowerCase().includes('zebra') || d.name.toLowerCase().includes('zd'))
            );

            if (zebraPrinters.length === 0) {
                zebraPrinters = (devices || []).filter(d => 
                    d.deviceType === 'printer' && 
                    !d.name.toLowerCase().includes('pdf') && 
                    !d.name.toLowerCase().includes('microsoft')
                );
            }

            if (zebraPrinters.length > 0) {
                if (!this.device) {
                    this.device = zebraPrinters[0];
                    this.updateStatus('online', `Printer: ${this.device.name}`);
                } else {
                    const stillPresent = zebraPrinters.some(p => p.name === this.device.name);
                    if (stillPresent) {
                        this.updateStatus('online', `Printer: ${this.device.name}`);
                    } else {
                        this.device = null;
                        this.updateStatus('offline', 'Printer Unplugged');
                    }
                }
            } else {
                this.device = null;
                this.updateStatus('offline', 'No Printer Found');
            }
        }, (error) => {
            if (this.isProcessing || Date.now() < this.suppressChecksUntil) return;
            this.updateStatus('error', 'Service Not Running');
        }, "printer");
    },

    scheduleConnectionRecheck(delayMs = 3000) {
        if (this.postJobRecheckTimer) {
            clearTimeout(this.postJobRecheckTimer);
            this.postJobRecheckTimer = null;
        }
        this.postJobRecheckTimer = setTimeout(() => {
            this.postJobRecheckTimer = null;
            this.checkConnection();
        }, delayMs);
    },

    async waitForIdle(timeoutMs = 15000) {
        const start = Date.now();
        while (this.isProcessing) {
            if (Date.now() - start > timeoutMs) {
                throw new Error("Printer busy.");
            }
            await new Promise(resolve => setTimeout(resolve, 75));
        }
    },

    async ensureReady() {
        if (this.isDebug) {
            this.updateStatus('ready', 'DEBUG READY');
            return true;
        }

        if (!this.device) {
            await new Promise(resolve => {
                this.autoDiscover();
                setTimeout(resolve, 2000);
            });
        }

        if (!this.device) throw new Error("No printer detected.");

        const recentlyHandshook = (Date.now() - this.lastHandshakeAt) < this.handshakeCooldownMs;
        if (recentlyHandshook && this.jobsSinceHandshake < this.maxJobsWithoutHandshake) {
            return true;
        }

        return new Promise((resolve, reject) => {
            this.updateStatus('connecting', 'Waking Printer...');
            this.device.send("~HS", (s) => {
                const hsText = String(s || '').toLowerCase();
                const warning = this.parsePrinterWarning(hsText);
                if (warning) return reject(new Error(warning));
                
                this.lastHandshakeAt = Date.now();
                this.jobsSinceHandshake = 0;
                this.updateStatus('ready', 'PRINTER READY');
                resolve(true);
            }, (err) => {
                this.device = null;
                reject(new Error("Printer not responding."));
            });
        });
    },

    parsePrinterWarning(text) {
        if (!text) return null;
        if (text.includes('head open') || text.includes('top open')) return 'TOP/HEAD OPEN';
        if (text.includes('pause')) return 'PAUSED';
        if (text.includes('paper out') || text.includes('media out')) return 'MEDIA OUT';
        if (text.includes('ribbon out')) return 'RIBBON OUT';
        return null;
    },

    isTransientTopOpenError(error) {
        const msg = String(error?.message || error || '').toLowerCase();
        return msg.includes('head open') || msg.includes('top open');
    },

    async sendJob(zpl) {
        if (this.isDebug) {
            this.isProcessing = true;
            try {
                console.log("DEBUG PRINT JOB SENT");
                this.updateStatus('ready', 'Debug Success');
                return true;
            } finally {
                this.isProcessing = false;
            }
        }

        if (typeof BrowserPrint === 'undefined' || this.status === 'error') {
            throw new Error("Zebra Browser Print Service is not running.");
        }
        if (this.status === 'offline') {
            throw new Error("No Zebra printer detected.");
        }

        if (this.isProcessing) await this.waitForIdle();

        try {
            this.isProcessing = true;
            this.suppressChecksUntil = Date.now() + 2000;

            const maxAttempts = 2;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    await this.ensureReady();
                    await new Promise((resolve, reject) => {
                        this.device.send(zpl, resolve, (err) => reject(new Error(err || "Disconnected")));
                    });
                    this.jobsSinceHandshake += 1;
                    break;
                } catch (attemptError) {
                    if (!this.isTransientTopOpenError(attemptError) || attempt === maxAttempts) throw attemptError;
                    this.device = null;
                    await new Promise(resolve => setTimeout(resolve, 700));
                    this.autoDiscover();
                    await new Promise(resolve => setTimeout(resolve, 900));
                }
            }

            this.updateStatus('ready', 'Success');
            this.suppressChecksUntil = Date.now() + 2500;
            this.scheduleConnectionRecheck(3500);
            return true;
        } catch (error) {
            this.device = null;
            this.updateStatus('error', error.message || 'Print Failed');
            throw error;
        } finally {
            this.isProcessing = false;
        }
    },

    autoDiscover() {
        if (typeof BrowserPrint === 'undefined') return;
        BrowserPrint.getLocalDevices((devices) => {
            const zebraPrinters = (devices || []).filter(d => 
                d.deviceType === 'printer' && 
                (d.name.toLowerCase().includes('zebra') || d.name.toLowerCase().includes('zd'))
            );
            if (zebraPrinters.length > 0) {
                this.device = zebraPrinters[0];
                this.updateStatus('online', `Printer: ${this.device.name}`);
            }
        }, null, "printer");
    },

    updateStatus(status, msg) {
        if (this.status !== status || this.lastStatusMsg !== msg) {
            this.status = status;
            this.lastStatusMsg = msg;
            this.broadcastStatus();
        }
    },

    broadcastStatus() {
        this.updateUI(this.status, this.lastStatusMsg);
    },

    updateUI(status, msg) {
        const dot = document.getElementById('printer-status-dot');
        const text = document.getElementById('printer-status-text');
        const msgEl = document.getElementById('printer-status-msg');
        if (!dot || !text || !msgEl) return;

        dot.className = 'status-dot';
        text.className = 'status-text';
        
        switch(status) {
            case 'ready':
            case 'online':
                dot.classList.add('online');
                text.innerText = status === 'ready' ? 'READY' : 'ONLINE';
                msgEl.innerText = msg;
                break;
            case 'offline':
                dot.classList.add('offline');
                text.innerText = 'OFFLINE';
                msgEl.innerText = msg;
                break;
            case 'connecting':
                dot.classList.add('connecting');
                text.innerText = 'CONNECTING';
                msgEl.innerText = msg;
                break;
            case 'error':
                dot.classList.add('offline');
                text.innerText = 'SERVICE ERROR';
                msgEl.innerText = msg;
                break;
        }
    }

};

window.addEventListener('load', () => {
    setTimeout(() => PrinterManager.init(), 2000);
});
