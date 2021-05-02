// ==UserScript==
// @name         Travian Enhanced
// @version      1.0
// @description  Enhance the Travian experience
// @author       Josef Andersson
// @match        https://*.travian.com/*
// @require      https://craig.global.ssl.fastly.net/js/mousetrap/mousetrap.min.js
// @icon         https://travian.com/favicon.ico
// @grant        GM_addStyle
// @grant        GM_addValueChangeListener
// @grant        GM_deleteValue
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

// TODO: Fetch data from gist
// TODO: Use deepAssign to update data from storage, then animation loop to change texts, and keep reference to relevant objects- with deepAssign the references will still be valid after update

// Cache
let data, currentDataKey, currentVillage, currentPlayer, currentBuilding, sidebarMenu, sidebarMenuVillageTable, dataChanged = false;
const timeMillis = Date.now(), timeFlooredMillis = Math.floor(timeMillis / 1000) * 1000;



// Helper functions
const cr = (tagName, attributes={}) => Object.assign(document.createElement(tagName), attributes);
const deepAssign = (target, source) => {
    if (typeof target === 'object' && typeof source === 'object') {
        Object.entries(source).forEach(([key, val]) => deepAssign(target[key], val) || (target[key] = val));
        return true;
    }
    return false;
};

/**
 * Get end time in millis for Travian timer (span.timer node)
 * @param {Element} timerNode span.timer node
 */
const timerToMillis = (timerNode) => {
    const timer = Travian.TimersAndCounters.timeCounters.find(counter => counter.node === timerNode);
    return (timer.startedAt + timer.value) * 1000;
};

/**
 * Save data object to storage
 */
const saveData = (force=true) => {
    if (dataChanged || force) {
        GM_setValue(getCurrentDataKey(), data);
        dataChanged = false;
        // TODO: Send info to other travian tabs?
    }
};

/**
 * Get the data object for the current village
 * @returns Current village data object
 */
const getCurrentVillage = () => {
    if (currentVillage)
        return currentVillage;
    const elCoords = document.querySelector('#sidebarBoxVillagelist .active .coordinatesGrid');
    if (elCoords) {
        const x = elCoords.getAttribute('data-x');
        const y = elCoords.getAttribute('data-y');
        const key = `${x}:${y}`;
        currentVillage = data.player.villages[key];
        currentVillage.key = key;
        return currentVillage;
    }
    return null;
}

/**
 * Get the username, uid and server of the current player
 * @returns 
 */
const getCurrentPlayer = () => {
    if (currentPlayer)
        return currentPlayer;
    const val = localStorage[Object.keys(localStorage).find(key => key.endsWith('UID'))];
    if (val) {
        const username = document.querySelector('.playerName')?.innerText;
        if (username) {
            const reg = new RegExp(`${username}/@_(\\d+)@`);
            const res = reg.exec(val);
            if (res) {
                const uid = res[1];
                return currentPlayer = { username, uid, server:location.host.replace('.travian.com', '') };
            }
        }
    }
    return null;
};

/**
 * Get the data key to use for current player and server
 * @returns 
 */
const getCurrentDataKey = () => {
    if (currentDataKey)
        return currentDataKey;
    const player = getCurrentPlayer();
    if (player)
        return `data-${player.server}-${player.uid}`;
    return null;
};

/**
 * Get an object representing current building (or resource field) if applicable to current page
 * @returns 
 */
const getCurrentBuilding = () => {
    if (currentBuilding)
        return currentBuilding;
    if (location.pathname === '/build.php') {
        const village = getCurrentVillage();
        const params = new URLSearchParams(location.search)
        const building = { villageKey:village.key, id:params.get('id'), isBuilt:false, page:params.get('s')||0 };
        const elLevel = document.querySelector('.level');
        if (elLevel) {
            building.level = +/(\d+)$/.exec(elLevel.innerText)[1];
            building.gid = params.get('gid');
            building.isBuilt = true;
            building.isUpgradePage = !!document.querySelector('.upgradeBuilding');
            const name = document.querySelector('.titleInHeader')?.childNodes[0].textContent?.trim();
            if (name && data.idMapping.buildings[name] !== building.gid) {
                data.idMapping.buildings[name] = building.gid;
                saveData();
            }
            building.name = name;
        }
        return currentBuilding = building;
    }
    return null;
};

/**
 * Check if we can build in village right now
 * @param {Object} village Village data object
 * @returns {Object} { resource:<Number>, building:<Number> }
 */
const canBuildInVillage = village => {
    if (village.canBuild)
        return village.canBuild;
    const constructing = { resource:0, building:0 };
    village.queueConstruction.forEach(con => {
        if (!con.id) {
            const id = data.idMapping.buildings[con.name];
            if (id) {
                con.id = id;
                dataChanged = true;
            } else {
                console.warn('Unknown building', con.name);
                constructing.resource++;
                constructing.building++;
                return;
            }
        }
        constructing[con.id <= 4 ? 'resource' : 'building']++;
    });
    const tribe = data.player.tribe;
    switch (village.queueConstruction.length) {
        case 0: return village.canBuild = { resource:1, building:1 }; // 2 if roman and gold member
        case 1: {
            if (data.player.isPlus) return village.canBuild = { resource:1, building:1 };
            else if (tribe == 1) return village.canBuild = constructing.building ? { resource:1, building:0 } : { resource:0, building:1 };
            break;
        }
        case 2: {
            if (tribe == 1 && data.player.isPlus) {
                if (constructing.building === 2) return village.canBuild = { resource:1, building:0 };
                else if (constructing.resource === 2) return village.canBuild = { resource:0, building:1 };
                else return village.canBuild = { resource:1, building:1 };
            }
            break;
        }
    }
    return village.canBuild = { resource:0, building:0 }; // TODO: Calculate and update after every queueConstruction change
};


const calculateVillageResPercentage = village => {
    
};


// ==================
// Update data object
// ==================

/**
 * Try to update player username and uid
 */
const tryUpdateDataUsernameUid = () => {
    const { uid, username } = getCurrentPlayer();
    if (username && username !== data.player.username) {
        data.player.username = username;
        dataChanged = true;
    }
    if (uid && uid !== data.player.uid) {
        data.player.uid = uid;
        dataChanged = true;
    }
};

/**
 * Try to update player tribe
 */
const tryUpdateDataPlayerTribe = () => {
    data.player.tribe = 1; // TODO: Have to find this somewhere
};

/**
 * Try to update player travian plus status
 */
const tryUpdateDataPlayerPlus = () => {
    const btn = document.querySelector('#sidebarBoxLinklist a');
    if (btn) {
        const isPlus = btn.classList.contains('green');
        if (isPlus !== data.player.isPlus) {
            data.player.isPlus = isPlus;
            dataChanged = true;
        }
    }
};

/**
 * Try to update player villages list
 */
const tryUpdateDataVillages = () => {
    document.querySelectorAll('#sidebarBoxVillagelist li').forEach(li => {
        const elCoords = li.querySelector('.coordinatesGrid');

        const x = +elCoords.getAttribute('data-x');
        const y = +elCoords.getAttribute('data-y');
        const name = elCoords.getAttribute('data-villagename');

        const key = `${x}:${y}`;
        if (!data.player.villages[key]) {
            data.player.villages[key] = { x, y, name, did:elCoords.getAttribute('data-did') };
            dataChanged = true;
        } else if (data.player.villages[key].name !== name) {
            data.player.villages[key].name = name;
            dataChanged = true;
        }
    });
};

/**
 * Try to update alliance data
 */
const tryUpdateDataAlliance = () => {
    const name = document.querySelector('#sidebarBoxAlliance .name')?.textContent;
    if (name != data.alliance.name) {
        if (name) data.alliance.name = name
        else      data.alliance = { players:{} };
        dataChanged = true;
    }

    if (data.alliance.name) {
        // Embassy
        if (getCurrentBuilding()?.gid === 18) {
            const tag = document.querySelector('#ally_info td')?.textContent;
            if (tag && tag !== data.alliance.tag) {
                data.alliance.tag = tag;
                dataChanged = true;
            }
        }
        
        // Alliance page
        else if (location.pathname === '/alliance/profile') {
            const tag = document.querySelector('.allianceDetails td').textContent;
            if (tag && tag !== data.alliance.tag) {
                data.alliance.tag = tag;
                dataChanged = true;
            }
            const players = [];
            document.querySelectorAll('.allianceMembers tr:not(:first-child)').forEach(player => {
                const profile = player.querySelector('.player a');
                players.push({
                    id: /(\d*)$/.exec(profile.href)[1],
                    username: profile.innerText,
                    tribe: +/(\d)/.exec(player.querySelector('.tribe')[1]),
                    population: +profile.querySelector('.population')?.innerText,
                    numVillages: +profile.querySelector('.villages')?.innerText
                });
            });
            if (players.length) {
                data.alliance.players = players;
                data.alliance.numPlayers = players.length;
                dataChanged = true;
            } else {
                const numPlayers = document.querySelector('.allianceDetails td').textContent;
                if (numPlayers !== data.alliance.numMembers) {
                    data.alliance.numPlayers = numPlayers;
                    dataChanged = true;
                }
            }
        }
    }
};

/**
 * Try to update hero info
 */
const tryUpdateDataHero = () => {
    const elTopBarHero = document.querySelector('#topBarHero');
    if (elTopBarHero) {
        if (elTopBarHero.querySelector('.heroHome')) {
            if (!data.player.hero.isHome) {
                data.player.hero.isHome = true;
                data.player.hero.isReinforcing = false;
                dataChanged = true;
            }
        } else if (elTopBarHero.querySelector('.heroRunning')) {
            if (data.player.hero.isHome) {
                data.player.hero.isHome = false;
                data.player.hero.isReinforcing = false;
                dataChanged = true;
            }
        } else {
            if (!data.player.hero.isReinforcing) {
                data.player.hero.isHome = false;
                data.player.hero.isReinforcing = true;
                dataChanged = true;
            }
        }
        const numAdventures = +(elTopBarHero.querySelector('.adventure .content')?.innerText || 0);
        if (numAdventures !== data.player.hero.numAdventures) {
            data.player.hero.numAdventures = numAdventures;
            dataChanged = true;
        }
    }
    if (document.querySelector('.hero_on_adventure')) {
        const village = getCurrentVillage();
        data.player.hero.villageKey = village.key;
    }
};

/**
 * Try to update troop count in village and troop movement
 */
const tryUpdateDataTroops = () => {
    if (location.pathname === '/dorf1.php') {
        const village = getCurrentVillage();
        const troops = {};
        if (document.querySelector('.noTroops'))
            return;
        document.querySelectorAll('#troops tbody tr').forEach(tr => {
            const res = /u(\w+)$/.exec(tr.querySelector('img').className);
            if (res) {
                const id = res[1];
                const num = +tr.querySelector('.num').innerText;
                const name = tr.querySelector('.un').innerText;
                troops[id] = num;
                data.idMapping.troops[name] = id;
            } else {
                console.warn('No match for', tr, tr.querySelector('img'));
            }
        });
        village.troopsTotal = troops;
        if (troops.hero && data.player.hero.isHome) // TODO: This should actually only realistically be done in rally point where we know for sure it's our hero
            data.player.hero.villageKey = village.key;
        dataChanged = true;
    }
};

/**
 * Try to update resource production data for current village
 */
const tryUpdateDataResourceProduction = () => {
    if (location.pathname !== '/dorf1.php') {
        // TODO: Check if any known resource bonuses has expired, if so decrease stored production
        return;
    }
    const elResources = document.querySelectorAll('#production .num');
    if (elResources.length === 4) {
        const village = getCurrentVillage();
        const [wood, clay, iron, wheat] = [...elResources].map(r => +r.innerText.replace(/\D/g, ''));
        if (!village.production
            || village.production.wood !== wood
            || village.production.clay !== clay
            || village.production.iron !== iron
            || village.production.wheat !== wheat) {
                village.production = { wood, clay, iron, wheat };
                dataChanged = true;
                console.log(village);
        }
    }
};

/**
 * Try to update resources stored in current village
 */
const tryUpdateDataResourceStorage = () => {
    const elStorage = document.querySelectorAll('#stockBar .value');
    if (elStorage.length === 7) {
        const village = getCurrentVillage();
        const [warehouse, wood, clay, iron, granary, wheat, upkeep] = [...elStorage].map(resource => +resource.innerText.replace(/\D/g, ''));
        if (!village.storage
            || village.storage.wood !== wood
            || village.storage.clay !== clay
            || village.storage.iron !== iron
            || village.storage.wheat !== wheat
            || village.storage.upkeep !== upkeep
            || !village.warehouse
            || !village.granary
            || village.warehouse !== warehouse
            || village.granary !== granary) {
                village.storage = { wood, clay, iron, wheat, upkeep, lastUpdated:timeMillis };
                village.warehouse = warehouse;
                village.granary = granary;
        }
    }
};

/**
 * Try to update construction queue for current village
 */
const tryUpdateDataQueueConstructionCurrent = () => {
    if (!/^\/dorf[12]\.php$/.test(location.pathname))
        return;
    const village = getCurrentVillage();
    const buildingList = document.querySelector('.buildingList');
    if (buildingList) {
        const queue = [];
        buildingList.querySelectorAll('li').forEach(li => {
            const name = li.querySelector('.name').childNodes[0].textContent.trim();
            const level = +/([0-9]{1,2})/.exec(li.querySelector('.lvl').innerText)[1];
            const done = timeFlooredMillis + +li.querySelector('.timer').getAttribute('value') * 1000;
            const id = data.idMapping.buildings[name] ?? null;
            const type = id == null ? null : id <= 4 ? 'r' : 'b';
            queue.push({ id, name, level, type, done });
        });
        village.queueConstruction = queue;
    } else {
        dataChanged = village.queueConstruction?.length !== 0;
        village.queueConstruction = [];
    }
};

/**
 * Try to update construction queue for all villages
 */
const tryUpdateDataQueueConstructionAll = () => {
    let minUpdate = 1e9;
    Object.values(data.player.villages).forEach(village => {
        if (!village.queueConstruction)
            return;
        const queue = village.queueConstruction.filter(con => timeMillis < con.done);
        if (queue.length !== village.queueConstruction.length) {
            village.queueConstruction = queue;
            village.canBuild = true;
            dataChanged = true;
        }
        queue.forEach(con => minUpdate = Math.min(minUpdate, con.done - timeMillis));
    });
    if (0 < minUpdate)
        setTimeout(() => {
            sidebarMenuVillageTable.remove(); // TODO: Update only the relevant row and make it flash or something
            insertSidebarMenuVillagesTable();
        }, minUpdate+1);
};

const tryUpdateDataQueueBarracks = () => {

};



// ================
// Create/run tasks
// ================

/**
 * Types of tasks
 * - build (upgrade/build building after a specified time and/or when there are enough resources)
 *   - check price
 *   - 
 * - adventure (send hero on adventure if one exists, can specify allowed difficulties)
 * - attack (attack with x amount of troops, can specify if troop count has to be met, can specify action if not met, specify exact tile or a list of tiles)
 */
const createTask = (type, details) => {
    switch (type) {
        case 'build': {
            if (!details.time) {

            }
            console.log('test');
        }
    }
    const { village } = details;
    data.tasks.push({
        type, village,
        details
    })
};

// createTask('build', { village:'50:-97', gid:17, time:undefined, fromLevel:4 });
// createTask('build', { village:'50:-97', gid:16, time:179834719237, fromLevel:undefined });



// ===============
// Insert elements
// ===============

/**
 * Insert styles for script
 */
const insertStyling = () => {
    GM_addStyle(`.te-btn{background-color:#ec3c3c;}
.te-btn:hover{background-color:red;}
.te-sidebar table,.te-sidebar th,.te-sidebar td{background-color:transparent;}
.te-sidebar .boxTitle span{font-size:10px;cursor:pointer;color:#555;}
.te-sidebar .boxTitle span:hover{color:green;}
.te-sidebar h3{margin:2px;}
.te-sidebar a,.te-sidebar a:active,.te-sidebar:visited{color:#333;font-weight:normal;}
.te-sidebar a:hover{color:green;}
.te-sidebar th{font-weight:bold;}
.te-sidebar tr:nth-child(2n){background-color:#dad1a3;}`);
};

/**
 * Insert script sidebar menu
 */
const insertSidebarMenu = () => {
    sidebarMenu = document.querySelector('.sidebarBoxWrapper').appendChild(cr('div', { className:'sidebarBox te-sidebar' })).appendChild(cr('div', { className:'content' }));
    sidebarMenu.appendChild(cr('div', { className:'boxTitle', innerText:'Travian Enhanced' })).appendChild(cr('span', { innerText:'popup', onclick:() => {
        window.open(`/messages#controller-${getCurrentDataKey()}`, 'Travian Enhanced Controller', 'width=600, height=400, scrollbars=yes');
    }}));

    // const autoAdventure = container.appendChild(cr('div'));
    // autoAdventure.appendChild(cr('label', { innerText:'Auto-send hero on adventures' })).appendChild(cr('input', { type:'checkbox', checked:true, onclick:() => console.log('Yasss') }));

    sidebarMenu.appendChild(cr('h3', { innerText:'Villages' }));
    insertSidebarMenuVillagesTable();
};

/**
 * Insert village table into script sidebar menu
 */
const insertSidebarMenuVillagesTable = () => {
    sidebarMenuVillageTable = sidebarMenu.appendChild(cr('table'));
    const header = sidebarMenuVillageTable.appendChild(cr('tr'));
    header.appendChild(cr('th', { innerText:'Name' }));
    header.appendChild(cr('th', { innerText:'Queue' }));
    header.appendChild(cr('th', { innerText:'Storage' }));
    Object.values(data.player.villages).sort((a, b) => a.name.localeCompare(b.name)).forEach(village => {
        const row = sidebarMenuVillageTable.appendChild(cr('tr'));
        row.appendChild(cr('td')).appendChild(cr('a', { href:`?newdid=${village.did}`, innerText:village.name }));
        row.appendChild(cr('td', { innerText:village.queueConstruction != null ? village.queueConstruction.map(con => {
            const id = data.idMapping.buildings[con.name];
            if (id != null) {
                if (id <= 4) return 'R';
                else return 'B';
            } else return 'U';
        }).join(' ') : '' })).style.color = village.canBuild ? 'red' : '#333';
        row.appendChild(cr('td', { innerText:village.storage != null && village.production != null
            ? (Object.entries(village.production).map(([resource, production]) => {
                const delta = timeMillis - village.storage.lastUpdated;
                const storage = village.storage[resource] + production * delta / 3600000;
                return storage / (resource === 'wheat' ? village.granary : village.warehouse);
            }).reduce((p, c) => p < c ? c : p, 0) * 100).toFixed(0) + '%'
            : ''}));
    });
};

/**
 * Insert build queue at bottom of dorf1 and dorf2
 */
const insertBuildQueue = () => {
    if (location.pathname !== '/dorf1.php' && location.pathname !== '/dorf2.php')
        return;
    const village = getCurrentVillage();
    const buildTasks = data.tasks.filter(task => task.villageKey === village.key && task.type === 'build');
    const buildingList = document.querySelector('.buildingList');
    if (!buildingList)
        return;
    const queue = buildingList.appendChild(cr('ul', { className:'te-queue' }));
    buildTasks.forEach(task => {
        const li = queue.appendChild(cr('li'));
        li.appendChild(cr('span', { innerText:task.title }));
    });
};

/**
 * Insert button to upgrade/build later
 */
const insertBuildLater = () => {
    if (location.pathname !== '/build.php')
        return;
    const village = getCurrentVillage();
    const building = getCurrentBuilding();
    const buildingTasks = data.tasks.filter(task => task.villageKey === building.villageKey && task.buildingId === building.id);

    // TODO: Should be different if building.isBuilt=false
    if (building.isUpgradePage) {
        if (building.isBuilt) {
            const container = document.querySelector('.upgradeBuilding').appendChild(cr('div'));
            container.appendChild(cr('button', { innerText:'Add to building queue', className:'textButtonV1 te-btn', onclick:() => {
                data.tasks.push({ type:'build', title:`Upgrade ${building.name} from ${building.level}`, villageKey:village.key, buildingId:building.id, buildingGid:building.gid, fromLevel:building.level }); // TODO: Fromlevel should be higher if building is in the process of upgrading atm
                saveData();
            }}));
            container.appendChild(cr('div', { innerText:
`Current queue: ${village.queueConstruction.length} + ${data.tasks.filter(t => t.villageKey === village.key && t.type === 'building').length}
Start time: --
Done time: --` }));
            container.appendChild(cr('div', { innerText:'Tasks for this building:\n' + buildingTasks.map(task => task.title).join('\n')}));
        }
    } else {
        const elBuildings = document.querySelectorAll('.buildingWrapper');
        if (elBuildings) {
            elBuildings.forEach(el => {
                const name = el.querySelector('h2').innerText;
                const id = /g(\d+)/.exec(el.querySelector('img').className)[1];
                if (name && id && data.idMapping.buildings[name] !== id) {
                    data.idMapping.buildings[name] = id;
                    dataChanged = true;
                }
            });
        }
    }
};



// =========
// Run tasks
// =========

const runTaskBuild = async () => {
    const village = getCurrentVillage();
    const tasksVillage = data.tasks.filter(task => task.villageKey === village.key && task.type === 'build');
    const canBuild = canBuildInVillage(village);
    tasksVillage.forEach(task => {
        if (+task.buildingId <= 4) {
            if (canBuild.resource)
                doUpgrade(task.buildingId, task.buildingGid);
        } else {
            if (canBuild.building) {
                if (doUpgrade(task.buildingId, task.buildingGid)) {
                    data.tasks.splice(data.tasks.indexOf(task), 1);
                    saveData();
                }
            } else
                console.log('Cant build yet', task);
        }
    });
    
};

/**
 * Upgrade building or field matching id, gid and/or villageKey
 * @param {String|Number} id
 * @param {String|Number} gid
 * @param {String} villageKey
 * @returns {Boolean} Success
 */
const doUpgrade = async (id, gid, villageKey=null) => {
    if (villageKey && !(await goToVillage(villageKey)))
        return false;
    console.log('Doing upgrade', id, gid, villageKey);
    const res = await fetch(`/build.php?id=${id}&gid=${gid}`, { credentials:'include' });
    const text = await res.text();
    const res1 = /textButtonV1 green build\" onclick=\".*'(.*)'/.exec(text);
    if (res1) {
        // TODO: Wait a couple of seconds before this next request
        const res2 = await fetch(res1[1].replace('amp;', ''), { credentials:'include' });
        const text1 = await res2.text();
        return true;
    }
};

/**
 * Switch village to village
 * @param {String} villageKey
 * @returns {Boolean} Success
 */
const goToVillage = async villageKey => {
    if (getCurrentVillage().key === villagKey)
        return true;
    console.log('Changing village to', villageKey);
    
    return false;
};


// ====
// Init
// ====
const init = () => {
    if (!document.querySelector('#topBar') || !getCurrentPlayer())
        return;

    data = Object.assign(DEFAULT_DATA, GM_getValue(getCurrentDataKey()));


    // ==============
    // Call functions
    // ==============

    tryUpdateDataUsernameUid();
    tryUpdateDataPlayerTribe();
    tryUpdateDataPlayerPlus();
    tryUpdateDataVillages();
    tryUpdateDataAlliance();
    tryUpdateDataTroops();
    tryUpdateDataHero();
    tryUpdateDataResourceProduction();
    tryUpdateDataResourceStorage();
    tryUpdateDataQueueConstructionCurrent();
    tryUpdateDataQueueConstructionAll();

    insertStyling();
    insertSidebarMenu();
    insertBuildQueue();
    insertBuildLater();

    saveData();

    runTaskBuild();



    // ===========
    // Keybindings
    // ===========

    const keyBindings = {
        '1': () => location.href = '/dorf1.php',
        '2': () => location.href = '/dorf2.php',
        '3': () => location.href = '/karte.php',
        '4': () => location.href = '/statistiken.php',
        '5': () => location.href = '/berichte.php',
        '6': () => location.href = '/messages.php',
        'r': () => location.reload(),
    };

    for (const key in keyBindings)
        Mousetrap.bind(key, keyBindings[key]);



    // ====================
    // Listen to controller
    // ====================
    let goToUrl, goToUrlId;
    GM_addValueChangeListener('go-to-url', (name, oldVal, newVal, remote) => {
        if (!remote || document.hidden) return;
        console.log('Go to url', newVal, '(was', oldVal, ')');
        goToUrl = newVal;
        goToUrlId = Math.random();
        GM_setValue('go-to-url-reserve', goToUrlId);
        GM_deleteValue('go-to-url');
    });
    GM_addValueChangeListener('go-to-url-confirm', (name, oldVal, newVal, remote) => {
        if (newVal === goToUrlId) {
            GM_deleteValue('go-to-url-confirm');
            location.href = goToUrl;
        }
    });
};

const DEFAULT_DATA = {
    tasks: [], // { type, minTime, maxTime }
    repeatingTasks: [],
    player: {
        villages: {}, // [x:y] => { name, x, y, warehouse, granary, troopsTotal, troopsOwn, troopsOthers, queueConstruction, queueBarracks, queueStable, queueRallyPoint }
        hero: {}, // village, level, experience, health, isHome, isReinforcing, numAdventures, production, attributes, speed, inventory
    },
    alliance: {
        players: {}
    },
    idMapping: {
        buildings: {}, // buildingName:id
        troops: {}, // troopName:id
    }
};

const initController = () => {
    const datakey = location.hash.replace('#controller-', '');
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    document.title = 'Travian Enhanced Controller';
    setTimeout(() => {
        document.head.innerHTML = '';
        document.body.innerHTML = '';
        for (let i = 0; i < 1e6; i++) {
            clearInterval(i);
            clearTimeout(i);
        }
        buildController();
    }, 100);

    data = Object.assign(DEFAULT_DATA, GM_getValue(datakey));

    GM_addValueChangeListener(datakey, (name, oldVal, newVal, remote) => {
        if (!remote) return;

        data = newVal;
        
        villagesTable.innerHTML = '';
        buildVillagesTable();
    });

    let villagesTable;
    const buildController = () => {
        document.body.appendChild(cr('style', { innerHTML:
`.bg-clay{background:url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAMAAABcOc2zAAAA/FBMVEUAAAAMHCloRzksICRaQDhQOzhSPjcyLzEzLjEqKzEpKi4aIiygfFXmrnJFIyGdY0tTMSx9STmAR0N2OTZONDA4Q1EvN0FaOz4WERtxTUEnJy3/wnz/y4GeNi08Fxb/snPzomz/nmjKhlrfhFq0bk1CHx7/vXr+rW/4omfQcU+nZkjDXkSxWkSfXEG8SziJPTiOPTFsOjCmOS1iNS1NKCdnKiRKHBj/4o32unn4rXL/qG3dqG3in2fjlWTOjGDYj1/ljF7AeVPadlOmb03Hbk19R0iYXUa7WUasVETIUkCkWz2ISTinSDW8Qi+AOi+uPy6IMCViHyAuFRhHERdp9D4ZAAAAG3RSTlMADbeznpCIZ1hQOSr+9PLs5+bi2tG2sbGspEjA8p8iAAAApUlEQVQI103N1Q7CUBAE0MXdnVsXqHuLu7v9/7/QQEk4D5vszMNAIB2PJTPwE0pFS8perzRSQZBlNdzCb9am9u0TfYxi1+er7dRDAMmwKpNYB2FTnidcvQwjYYkbi9mkwzyJ+0UzIIcQJT5Mjju98MPOzAMz7HYHzqo3ZkRZsXkP0tECS7sSRiJEbgkvAr52q1jl5rRAqcTnD7bDEn1swr9MPObfNxTGFD7Ui8z0AAAAAElFTkSuQmCC') no-repeat;background-position:center;}
.bg-crop{background:url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAABSlBMVEUAAAAhIilEOCMnKSsdIi0RHTCjWgWyehLCkyWkgCpALiV3VBozKikoKTE9Nic3MSQqKyg0ODQeKC8YIi+mkDisexa1dAOpbhG0oziaWANoOhK7fxJ2Pg+hn0NvSxyJSg6VeiqDXBiTXg5zRRFBLBpnQBaRch99dUBsaUJ2XiuNizY3LCRkVSVLKxpZRyU5LSZ3XBxePxtTQSVdWz1dVCUhEiFNTDP/zBH1qwnEdgBBKTntvCn/4Sb6wSX/zCT5vBvztRnpphf/6hTjsxT+xwvfmAiyZQf5sgaXUgXzswP6rgObTAKxXgHsogDGfQD/9Eb2yDn//zQ+Jy351StxQyr2uyiobyVPLiO1hSGFSyG0eB+QVx/EmBv/wRpNJRPnoRLSkBL0vA7sng6HTg7/twm5ewnpnQOJQQPekgHQgwH5lQDslADfhQCjSwA6bPhkAAAAN3RSTlMAKXw0IQ/+/Prv2bSCb2xjVUIWBvz49uzn5+Xj19PSzsnHwLy4uK+uqqmmoZ2XlouKgYB3cmBZG/lIOAAAAMxJREFUGNNjAANGFkFGBiQgKKujrsDDBOezcvo7i4RaczAYa5mB+bwBtvYx1l6KGoFOCcwMDEZ2EpzBthaJlpZO0jwCLAxMEeIWNp4u8b5+7mIqSkkcDMyMDPquLuYOvp6ubDnypoZAMzTZJTPNHSy8LH2kuNVYgW6QY9ROd7Rzz2Dz9k7m5mNgEGYQYtJ1s0/xy5VhFoa5hDckLCo6kgvhVIE4K6ugcCQBZUd2Dw8fNz64gJ5NrHl2VioLQgm/qHOaqhCyh/lNDCABAAAD6B8gwH0dUAAAAABJRU5ErkJggg==') no-repeat;background-position:center;}
.bg-iron{background:url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAMAAABcOc2zAAAA+VBMVEUAAABWV1soLDYNERwXGSGAgIWCgIA9S1s5PUctMj0vMz4dIywNEBhoanRHZHqjo6RJa4FIX3RYXGtnf4qYl5d1cnN+e3k6PkpKZG9jZGg6P0tkZmkkLTgnKzUbHyn///9+g5dlan7u7u+Fipp3fJJeY3c9QU/Z3eTU2OCRma17jKOHjKFvc4jl5urh4+rL0tvJzda8xtC/wcqotsSxtMOuscCoq7uhprm3tbeGm7OcnauOkqaChphvfJR8gZJmcYZWW3JUWGtIUWgzOUb/+/bz8/Witse2ucPIxcKOorZ4kqdnd45bb4xNbodEWnJHV29YXGxIT189RlrXQloZAAAAH3RSTlMAhlwkF/zs1ZKQcFQO/Pn08/Px6+nj1dCzp6SVfz80SrTt7AAAALNJREFUCNctylUSwkAQANEhBHd3ZjduuFsUd7j/YSBVeX9d1eALN1qhPxYC6TJyyHGjdtBsDgcjRZ2snnwp7P9L7A8HPW1yfK2xDtA9o9KT5fXusvou8ZqCKvblg0JdunMje+Oeh8p8jJxjE/rxeFPUHhDlxe3YFjbUc6bmVstCVDAoTza6JJHhTLgVILKYT3VVFSVjdiLUikFGJ8QqxlM1YfGWxBhAh2GSTBoAks1EPMHCD2mtGPjWMjeDAAAAAElFTkSuQmCC') no-repeat;background-position:center;}
.bg-lumber{background:url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAMAAABcOc2zAAAA7VBMVEUAAAAeIys2KCSCbDpCMSU4LigrKywvKCYSHSqWWyF3KQq+okOnj0aDTiBnJg+RfEOBbT9kMhhJFBBcPCN3YS9AIx5pSilNKxtFLSFSQy0yIyQiHyX//33/9mzXiyXIeyDGchmiUxOhQQb//3L842P+1Vn3zljxxFDLlzzbnDaYYiq0dynRgSK0byLAcx+nYx/UdxnAbxmNQxG4Wg65TwaHLwZqIASoQAN3JQKrNgCgNQD/73X/6mjt2mf/82PgvlfhqD27hzbpnDC7ei3ukiNyNhunXBm7ZxWFPQ6ZSAqvTgmXQgiAKwSYMgJZDQC00RVoAAAAHHRSTlMAI1+vc1JIQQvu7ubZ19S5uayrnJOLiYd7b2k822+kWwAAAJpJREFUCNdNjtUSglAARC+N3U13h4AIdrf//zmKDjPs05592DmgELgPFWjSKVlHN1+gYc3xOD8IiR/izbO3Zy534RmhGZMbSmH9QJjPpiyHfQdUViU9zZCxwxaAqgdNkh/vK8eYfPyCAUIt3Z1m8JbDC2kdB6BB0+ZpRW1vcVIeZ5ejtWgb9EJNoh75d0AqA1gR9XbREmBdIq8fIEUSQS8GFAgAAAAASUVORK5CYII=') no-repeat;background-position:center;}
body{margin:0;padding:5px;background-color:#121212;color:#c3c3c3}
h1,h2,h3{margin:2px 0;}
a,a:visited,a:active{text-decoration:none;color:#96baff;cursor:pointer;}
a:hover{color:#3870da;}
th{text-align:left;}
tr:nth-child(2n){background-color:#212121;}
tr.alert{background-color:red;}
.percentage-bar{border-bottom:2px solid #9999;margin: 0 2px;display:inline-block;}
.percentage-bar>div{border-bottom:2px solid red;}`}));

        document.body.appendChild(cr('h1', { innerText:'Travian Enhanced Controller' }));
        document.body.appendChild(cr('h2', { innerText:'Villages' }));
        villagesTable = document.body.appendChild(cr('table', { innerText:'Villages' }));

        buildVillagesTable();
    };

    const buildVillagesTable = () => {
        const header = villagesTable.appendChild(cr('tr'));
        ['Name', 'Queue', 'Next done'].forEach(innerText => header.appendChild(cr('th', { innerText })));
        ['bg-lumber', 'bg-clay', 'bg-iron', 'bg-crop'].forEach(className => header.appendChild(cr('th', { className })));
        Object.values(data.player.villages).sort((a, b) => a.name.localeCompare(b.name)).forEach(village => {
            const row = villagesTable.appendChild(cr('tr'));
            row.appendChild(cr('td')).appendChild(cr('a', { onclick:() => sendGoToUrl(`?newdid=${village.did}`), innerText:village.name }));
            row.appendChild(cr('td', { innerText:village.queueConstruction?.length ? village.queueConstruction.map(con => con.type).join(' ') : '' }));
            row.appendChild(cr('td', { innerText:village.queueConstruction?.length ? Math.min(village.queueConstruction.map(con => con.done - timeMillis)) + 's' : ''}));
            if (village.storage != null && village.production != null) {
                const deltaTime = Math.max(0, timeMillis - village.storage.lastUpdated) / 3600000; // hrs since last storage update
                Object.entries(village.production).forEach(([resource, producesPerHour]) => {
                    const inStorage = village.storage[resource];// + producesPerHour * deltaTime;
                    const decimal = inStorage / (resource === 'wheat' ? village.granary : village.warehouse);
                    row.appendChild(cr('td')).appendChild(crBar(decimal, Math.round(inStorage)));
                })
            } else {
                for (let i = 0; i < 4; i++) row.appendChild(cr('td'));
            }
        });
    };
    
    const crBar = (decimal, innerText) => {
        const div = cr('div', { className:'percentage-bar', innerText });
        const bar = div.appendChild(cr('div'));
        bar.style.width = `${Math.max(0, Math.min(100, decimal * 100))}%`;
        return div;
    };

    /**
     * Make main window go to url
     */
    let waitingToConfirm = false;
    const sendGoToUrl = (url) => {
        waitingToConfirm = true;
        GM_setValue('go-to-url', url);
    };
    GM_addValueChangeListener('go-to-url-reserve', (name, oldVal, newVal, remote) => {
        if (waitingToConfirm) {
            waitingToConfirm = false;
            GM_setValue('go-to-url-confirm', newVal);
        }

    });
};


if (location.pathname === '/messages' && location.hash.startsWith('#controller-'))
    initController();
else
    init();

// (function() {
//     if (/\/allianz.php/.test(window.location.href)) {
//         let container = document.querySelector('.contentContainer')
//         let div = document.createElement('div')
//         div.style.margin = '5px 20px'
//         div.innerHTML = `<p>Travian Enhanced</p>
//             <form action='#' id='searchNearbyForm'>
//                 <label for='tileX'>x</label><input id='tileX' type='number' value='0' style='width:55px'>
//                 <label for='tileY'>y</label><input id='tileY' type='number' value='0' style='width:55px'>
//                 <label for='flags'>flags</label><select multiple id='flags' style='height:120px'>
//                     <option selected>online</option>
//                     <option selected>24hrs</option>
//                     <option selected>3days</option>
//                     <option selected>7days</option>
//                     <option selected>roman</option>
//                     <option selected>gaul</option>
//                     <option selected>teuton</option>
//                     <option>oasis</option>
//                 </select>
//                 <input type='submit' value='Search'>
//             </form>`
//         container.appendChild(div)

//         document.querySelector('#searchNearbyForm').addEventListener('submit', ev => {
//             ev.preventDefault()
//             let x = document.getElementById('tileX').value
//             let y = document.getElementById('tileY').value
//             let flags = {}
//             ;[...document.getElementById('flags').options].forEach(i => flags[i.value] = i.selected)

//             if (flags.length < 1) return

//             getMapTiles(x, y, 2).then(json => {
//                 // console.log(json.tiles.map(t => Math.sqrt(Math.pow(t.position.x - x, 2) + Math.pow(t.position.y - y, 2))))
//                 let tiles = json.tiles
//                     .filter(tile => tile.aid === data.alliance.id) // same alliance
//                     .filter(tile => { // status and tribe flags
//                         let player = data.alliance.players[tile.uid]
//                         return flags[player.status] && flags[player.tribe]
//                     })
//                     .filter(tile => tile > 0 || flags.oasis) // oasis flag
//                     .filter(tile => )
//                 console.log(tiles)
//             }).catch(console.error)
//         })
//     }

//     // if (/\/karte.php/.test(window.location.href)) {
//     //     let menu = document.querySelector('#contextmenu div.background-content')
//     //     menu.appendChild(menu.children[1].cloneNode(true))
//     //     let contents = menu.appendChild(menu.children[2].cloneNode(true))
//     //     contents = contents.children[1].children[0].children[0]
//     //     contents.innerHTML = `<div class='title'>TravianE</div>
//     //         <div class='entry'>
//     //         <a href='#'>Search neighbors</a>
//     //         </div>`
//     // }
// })();
