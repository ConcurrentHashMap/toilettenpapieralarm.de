var app = new Vue({
    el: '#app',
    data: {
        availability: availability
    },
    /*
    mounted() {
        axios.get('/availability').then(response => (this.info = response.data))
    },*/
    filters: {
        eurFormatted: function (value) {
            if (!value) return ''
            value = parseFloat(value).toFixed(2)
            return value.replace(/\./, ',')
        },
        truncate: function (value, n, useWordBoundary) {
            if (!value) return ''
            if (value.length <= n) { return value; }
            var subString = value.substr(0, n - 1);
            return (useWordBoundary
                ? subString.substr(0, subString.lastIndexOf(' '))
                : subString) + "&hellip;";
        }
    }
});