const chrono = require('chrono-node');
const Helpers = {
    getPriceAsFloat: function(value) {
        return value ? parseFloat(value.substring(0, value.indexOf('€')-1).replace(/,/, '.')) : null;
    },
    extractIsAvailable: function(value) {
        if(value) {
            return (value.toLowerCase().includes('auf lager') && !value.toLowerCase().includes("nicht")) ? true : false
        }
        return false;
    },
    extractDeliveryDate: function(value) {
        if(value) {
            var i = value.toLowerCase().indexOf('wenn sie');
            if(i >= 0) {
                value = value.substring(0, i);
            }
            return chrono.de.parseDate(value);
        }
        return null;
    }
}
module.exports = Helpers;