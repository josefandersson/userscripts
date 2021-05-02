var data = {};

function st() {
    try {
        const [name, tribe] = /(.*) \((.*)\)/.exec(document.querySelector('.titleInHeader').innerText.trim().toLowerCase()).slice(1);
        const [wood, clay, iron, crop, attack, defenceInfantry, defenceCavalry] = [...document.querySelectorAll('#troop_info .value, #troop_info tr:nth-child(2) td')].map(e => e.innerText).map(v => +v);
        const [speedRaw, carryRaw, upkeepRaw, trainingTimeRaw] = [...document.querySelectorAll('.troopData td')].map(e => e.innerText);
        const speed = +speedRaw.replace(/\D/g, '');
        const carry = +carryRaw.replace(/\D/g, '');
        const upkeep = +upkeepRaw;
        const [h, m, s] = trainingTimeRaw.split(':').map(v => +v);
        const trainingTime = { h, m, s };
        if (name != null && tribe != null && wood != null && clay != null && iron != null && crop != null && attack != null && defenceInfantry != null && defenceCavalry != null && speed != null && carry != null && upkeep != null && h != null && m != null && s != null) {
            if (!data[tribe]) data[tribe] = {};
            if (!data[tribe].troops) data[tribe].troops = {};
            if (data[tribe].troops[name]) return;
            data[tribe].troops[name] = { wood, clay, iron, crop, attack, defenceInfantry, defenceCavalry, speed, carry, upkeep, trainingTime };
            console.log('Saved', tribe, name);
        }
    } catch (e) {
    }
}
