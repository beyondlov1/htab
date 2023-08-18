/* global $, Aftershave */

function getData(key, callback) {
    chrome.storage.local.get([key]).then(result => {
        callback(result)
    })
}

function getData2(key) {
    return chrome.storage.local.get([key])
}


function setData(item) {
    chrome.storage.local.set(item)
}

function _handleChange() {
    var input = $('#input-max');
    if (this.value === 'other') {
        input.show();
        input.trigger('focus');
        return;
    }

    // localStorage.max = this.value;
    setData({max:this.value})
    input.hide();
}

function _saveMax() {
    var input = $('#input-max');
    // localStorage.max = input.val();
    setData({ max: input.val() })
}

function _saveAlgo() {
    // localStorage.algo = this.value;
    setData({ algo: this.value })
}

function _run() {
    var options = {
        10: 10,
        15: 15,
        20: 20,
        25: 25,
        30: 30,
        35: 35,
        40: 40,
        45: 45,
        50: 50
    };

    getData2("algo").then((algo)=>{
        getData2("max").then((max)=>{
            let algo1 = algo.algo || 'used';
            let max1 = parseInt(max.max || 20);
            $('body').html(Aftershave.render('popup', { options: options, algo: algo1, max: max1 }));
        })
    })
    
}

$.ready(function() {
    $(document).on('change', 'select', _handleChange);
    $(document).on('change', '#input-max', _saveMax);
    $(document).on('change', 'input[type=radio]', _saveAlgo);
    _run();
});
