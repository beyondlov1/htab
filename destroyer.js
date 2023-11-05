/* globals $, chrome */
var usedOn = {};
var openedOn = {};
var accessed = {};
var activeTabId;
var timeout;
var activeInterval = 2500;
var hideTabIdList = []
var tabId2urlMap = {}

var windowGroupMap = {}
var tabId2tabMap = {}

function getData(key, callback){
    chrome.storage.local.get([key]).then(result => {
        callback(result)
    })
}


function getData2(key) {
    return chrome.storage.local.get([key])
}

function setData(item){
    chrome.storage.local.set(item)
}

function _debug() {
    // console.log.apply(console, arguments);
}

async function _getMax() {
    let p = await getData2("max")
    return parseInt(p.max || 20);
}

async function _getAlgo() {
    let p = await getData2("algo")
    return p.algo || 'accessedThenOldest';
}

function _markActive(tabId) {
    _debug('marked active', tabId);
    usedOn[tabId] = new Date().getTime();
    accessed[tabId] += 1;
}

function _handleTabActivated(data) {
    var tabId = data.tabId;
    activeTabId = tabId;
    _debug('activated', tabId);

    clearTimeout(timeout);

    // after 3 seconds mark this tab as active
    // this is so if you are quickly switching tabs
    // they are not considered active
    timeout = setTimeout(function() {
        _markActive(tabId);
    }, activeInterval);
}

function _handleTabRemoved(tabId) {
    clearTimeout(timeout);

    _debug('removed', tabId);
    delete usedOn[tabId];
    delete openedOn[tabId];
    delete accessed[tabId];

    let tab = tabId2tabMap[tabId]
    if(tab){
        if (tab.groupId < 0){
            let currGroupId = windowGroupMap[tab.windowId]
            if (currGroupId >= 0){
                chrome.tabs.query({ currentWindow: true, groupId: currGroupId}).then((tabs)=>{
                    if(tabs.length > 0){
                        tabs.sort((x1, x2) => {
                            return -(x1.index - x2.index)
                        })
                        getData2("max").then((maxObj)=>{
                            console.log("maxStr:" + maxObj.max)
                            let max = parseInt(maxObj.max) || 20;
                            chrome.tabs.query({ currentWindow: true, groupId: -1}).then((ungrouptabs)=>{
                                let toungroupcount = max - ungrouptabs.length
                                for (let i = 0; i < toungroupcount; i++) {
                                    if(i < tabs.length){
                                        chrome.tabs.ungroup([tabs[i].id])
                                    }
                                }
                            })
                            
                        })
                    } 
                })
            }
        }
        delete tabId2tabMap[tabId]
    }
}

function _handleTabReplaced(newTabId, oldTabId) {
    if (usedOn[oldTabId]) {
        usedOn[newTabId] = usedOn[oldTabId];
    }

    if (openedOn[oldTabId]) {
        openedOn[newTabId] = openedOn[oldTabId];
    }

    if (accessed[oldTabId]) {
        accessed[newTabId] = accessed[oldTabId];
    }

    tabId2tabMap[newTabId] = tabId2tabMap[oldTabId]
    delete tabId2tabMap[oldTabId]

    delete usedOn[oldTabId];
    delete openedOn[oldTabId];
    delete accessed[oldTabId];
}

async function _moveToGroup(tab) {
    if (tab) {
        console.log(tab.windowId)
        console.log(windowGroupMap)
        let windowId = tab.windowId
        if(windowId >= 0){
            return chrome.tabGroups.query({windowId:windowId, title:"HTAB"}).then((result)=>{
                if(result.length > 0){
                    windowGroupMap[windowId] = result[0].id
                }
                let groupId = windowGroupMap[windowId]
                if (groupId && groupId >= 0){
                    return chrome.tabs.group({ groupId: groupId, tabIds: [tab.id] }).then((groupId) => {
                        return chrome.tabGroups.update(groupId, { 
                            // collapsed: true, 
                            title: "HTAB" }).then((group) => {
                            return chrome.tabGroups.move(group.id, { index: 0 })
                        })
                    })
                }else{
                    return chrome.tabs.group({ tabIds: [tab.id] }).then((newGroupId)=>{
                        windowGroupMap[windowId] = newGroupId;
                        return chrome.tabGroups.update(newGroupId, { collapsed: true, title: "HTAB" }).then((group)=>{
                            return chrome.tabGroups.move(group.id, {index:0})
                        })
                    })
                }
            })
        }
    }
}

function _getLowestIn(data, tabs) {
    var lowest;
    var lowestIndex;
    var tabId;
    var value;
    for (var i = 0; i < tabs.length; i++) {
        tabId = tabs[i].id;

        // never close the currently active tab
        if (tabId === activeTabId) {
            continue;
        }

        // if you have never been to this tab then skip it
        if (
            // !usedOn.hasOwnProperty(tabId) ||
         !data.hasOwnProperty(tabId)) {
            continue;
        }

        value = data[tabId] || 0;

        if (lowest === undefined) {
            lowest = value;
        }

        if (value <= lowest) {
            lowestIndex = i;
            lowest = value;
        }
    }

    return lowestIndex;
}


function _getLowestsIn(data, tabs) {
    let lowestIndexes = []
    let lowestIndex = _getLowestIn(data, tabs)
    if (lowestIndex >= 0) {
        let lowest = data[tabs[lowestIndex].id] || 0;
        for (let i = 0; i < tabs.length; i++) {
            let value = data[tabs[i].id] || 0;
            if (lowest == value) {
                lowestIndexes.push(i)
            }
        }
    }
    return lowestIndexes;
}

async function _removeLeastAccessed(tabs) {
    var removeTabIndex = _getLowestIn(accessed, tabs);
    if (removeTabIndex >= 0) {
        await _moveToGroup(tabs[removeTabIndex]);
        tabs.splice(removeTabIndex, 1);
    }
    return tabs;
}

async function _removeOldest(tabs) {
    var removeTabIndex = _getLowestIn(openedOn, tabs);
    if (removeTabIndex >= 0) {
        await _moveToGroup(tabs[removeTabIndex]);
        tabs.splice(removeTabIndex, 1);
    }
    return tabs;
}

async function _removeLeastRecentlyUsed(tabs) {
    var removeTabIndex = _getLowestIn(usedOn, tabs);
    if (removeTabIndex >= 0) {
        await _moveToGroup(tabs[removeTabIndex]);
        tabs.splice(removeTabIndex, 1);
    }
    return tabs;
}


async function _removeLeastAccessedThenOldest(tabs) {
    var removeTabIndexes = _getLowestsIn(accessed, tabs);
    if (removeTabIndexes.length > 0) {
        if (removeTabIndexes.length == 1) {
            let removeTabIndex = removeTabIndexes[0]
            await _moveToGroup(tabs[removeTabIndex]);
            tabs.splice(removeTabIndex, 1);
        }else{
            let removeTabIds = removeTabIndexes.map((x)=>tabs[x].id)
            let fileteredTabs = tabs.filter((x)=> removeTabIds.indexOf(x.id) >= 0);
            return await _removeOldest(fileteredTabs)
        }
    }
    return tabs;
}

async function _removeTabs(tabs) {
    var length = tabs.length;
    let max = await _getMax()
    let algo = await _getAlgo()
    while (length >= max) {
        switch (algo) {
            case 'oldest':
                tabs = await _removeOldest(tabs);
                break;
            case 'accessed':
                tabs = await _removeLeastAccessed(tabs);
                break;
            case 'accessedThenOldest':
                tabs = await _removeLeastAccessedThenOldest(tabs);
                break;
            default:
                tabs = await _removeLeastRecentlyUsed(tabs);
                break;
        }
        length -= 1;
    }
}



function _handleTabAdded(data) {
    var tabId = data.id || data;

    console.log('added', tabId);

    if (data.url){
        tabId2urlMap[tabId] = data.url;
    }
    if (data instanceof Object) {
        tabId2tabMap[tabId] = { groupId: data.groupId , windowId: data.windowId}
    }

    // find tab to remove
    chrome.tabs.query({currentWindow: true, groupId: -1}).then(async (tabs)=>{
        tabs = tabs.filter(function(tab) {
            return !tab.pinned && tab.id != tabId;
        });

        let max = await _getMax()
        let algo = await _getAlgo()

        if (tabs.length >= max) {
            _removeTabs(tabs);
        }

        openedOn[tabId] = new Date().getTime();
        accessed[tabId] = 0;
    });
}


function _handleTabUpdated(tabId, changeInfo, tab) {
    tabId2urlMap[tabId] = tab.url;
}



function _bindEvents() {
    chrome.tabs.onActivated.addListener(_handleTabActivated);
    chrome.tabs.onCreated.addListener(_handleTabAdded);
    chrome.tabs.onUpdated.addListener(_handleTabUpdated);
    chrome.tabs.onAttached.addListener(_handleTabAdded);
    chrome.tabs.onRemoved.addListener(_handleTabRemoved);
    chrome.tabs.onDetached.addListener(_handleTabRemoved);
    chrome.tabs.onReplaced.addListener(_handleTabReplaced);
    chrome.tabGroups.onRemoved.addListener(
        (group)=>{
            if (windowGroupMap[group.windowId] && windowGroupMap[group.windowId] == group.id){
                console.log("delete group")
                delete windowGroupMap[group.windowId]
            }
        }
    )
}

function _init() {

    // on startup loop through all existing tabs and set them to active
    // this is only needed so that if you first install the extension
    // or bring a bunch of tabs in on startup it will work
    //
    // setting the time to their tab id ensures they will be closed in
    // the order they were opened in and there is no way to figure
    // out what time a tab was opened from chrome apis
    chrome.tabs.query({}, function(tabs) {
        for (var i = 0; i < tabs.length; i++) {
            tabId2tabMap[tabs[i].id] = tabs[i]
            if (!usedOn.hasOwnProperty(tabs[i].id)) {
                openedOn[tabs[i].id] = tabs[i].id;
                usedOn[tabs[i].id] = tabs[i].id;
                accessed[tabs[i].id] = 0;
            }
        }
        chrome.tabGroups.query({ title: "HTAB" }).then((result) => {
            if (result.length > 0) {
                result.forEach(group => {
                    windowGroupMap[group.windowId] = group.id
                });   
            }
            _bindEvents();
        })
    });
}

_init()
