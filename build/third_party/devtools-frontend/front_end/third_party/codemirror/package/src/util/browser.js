// Kludges for bugs and behavior differences that can't be feature
// detected are enabled based on userAgent etc sniffing.
let userAgent = navigator.userAgent;
let platform = navigator.platform;
export let gecko = /gecko\/\d/i.test(userAgent);
let ie_upto10 = /MSIE \d/.test(userAgent);
let ie_11up = /Trident\/(?:[7-9]|\d{2,})\..*rv:(\d+)/.exec(userAgent);
let edge = /Edge\/(\d+)/.exec(userAgent);
export let ie = ie_upto10 || ie_11up || edge;
export let ie_version = ie && (ie_upto10 ? document.documentMode || 6 : +(edge || ie_11up)[1]);
export let webkit = !edge && /WebKit\//.test(userAgent);
let qtwebkit = webkit && /Qt\/\d+\.\d+/.test(userAgent);
export let chrome = !edge && /Chrome\//.test(userAgent);
export let presto = /Opera\//.test(userAgent);
export let safari = /Apple Computer/.test(navigator.vendor);
export let mac_geMountainLion = /Mac OS X 1\d\D([8-9]|\d\d)\D/.test(userAgent);
export let phantom = /PhantomJS/.test(userAgent);
export let ios = safari && (/Mobile\/\w+/.test(userAgent) || navigator.maxTouchPoints > 2);
export let android = /Android/.test(userAgent);
// This is woefully incomplete. Suggestions for alternative methods welcome.
export let mobile = ios || android || /webOS|BlackBerry|Opera Mini|Opera Mobi|IEMobile/i.test(userAgent);
export let mac = ios || /Mac/.test(platform);
export let chromeOS = /\bCrOS\b/.test(userAgent);
export let windows = /win/i.test(platform);
let presto_version = presto && userAgent.match(/Version\/(\d*\.\d*)/);
if (presto_version)
    presto_version = Number(presto_version[1]);
if (presto_version && presto_version >= 15) {
    presto = false;
    webkit = true;
}
// Some browsers use the wrong event properties to signal cmd/ctrl on OS X
export let flipCtrlCmd = mac && (qtwebkit || presto && (presto_version == null || presto_version < 12.11));
export let captureRightClick = gecko || (ie && ie_version >= 9);
//# sourceMappingURL=browser.js.map