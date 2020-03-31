var gaProperty = 'UA-162378524-1';
var p;
var statusBefore;

cookieconsent.initialise({
    "palette": {
        "popup": {
            "background": "#0066b3"
        },
        "button": {
            "background": "#fff",
            "text": "#0066b3"
        }
    },
    "theme": "classic",
    "type": "opt-in",
    "content": {
        "message": "Wir verwenden Cookies, um den Traffic auf dieser Website zu analysieren und uns deine Cookie-Einstellungen zu merken.",
        "deny": "Ablehnen",
        "allow": "Cookies akzeptieren",
        "link": "Mehr erfahren",
        "href": "/datenschutz",
    },
    onInitialise: function (status) { 
        if(window.dataLayer) {
          dataLayer.push({'cookieconsent_status': status});
          dataLayer.push({'event': 'consent_changed'});
        }
        statusBefore = status;
    },
    onStatusChange: function (status, chosenBefore) {
        if(window.dataLayer) {
          dataLayer.push({'cookieconsent_status': status});
          dataLayer.push({'event': 'consent_changed'});
        }
        var tmpStatusBefore = statusBefore;
        statusBefore =  status;
        if(chosenBefore && status === "deny" && "deny" !== tmpStatusBefore) {
            deleteGACookies();
        }
    }
}, function (popup) {
    p = popup;
});

var revokeBtn = document.getElementById('btn-revokeChoice');
if(revokeBtn) {
    revokeBtn.onclick = function () {
        p.open();
    };
}

// Disable tracking if the opt-out cookie exists.
var disableStr = 'ga-disable-' + gaProperty;
if (document.cookie.indexOf(disableStr + '=true') > -1) {
    window[disableStr] = true;
}

// Opt-out function
function gaOptout() {
    document.cookie = disableStr + '=true; expires=Thu, 31 Dec 2099 23:59:59 UTC; path=/';
    window[disableStr] = true;
    deleteGACookies();
}

// Function for deleting Cookies (such as that ones from Google Analytics)
// Source: https://blog.tcs.de/delete-clear-google-analytics-cookies-with-javascript/
function clearCookie(d,b,c){try{if(function(h){var e=document.cookie.split(";"),a="",f="",g="";for(i=0;i<e.length;i++){a=e[i].split("=");f=a[0].replace(/^\s+|\s+$/g,"");if(f==h){if(a.length>1)g=unescape(a[1].replace(/^\s+|\s+$/g,""));return g}}return null}(d)){b=b||document.domain;c=c||"/";document.cookie=d+"=; expires="+new Date+"; domain="+b+"; path="+c}}catch(j){}};
  
function deleteGACookies() {
    var gtag_cookie = "_gat_" + gaProperty;
    clearCookie('_ga');
    clearCookie('_gid');
    clearCookie('_gat');
    clearCookie(gtag_cookie);
   	location.reload();
}