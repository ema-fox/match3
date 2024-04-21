'use strict';

const I = Immutable.fromJS;

function animation_frame() {
    return new Promise(resolve => requestAnimationFrame(resolve));
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function mod(n, d) {
    return ((n % d) + d) % d;
}

function rand(end) {
    return (Math.random() * end) | 0;
}

function rand_choice(xs) {
    return xs.get(rand(xs.count()));
}

const SIZE = 7;

const TILEPCT = 100 / SIZE;

const SKILLS = I({
    'fire-ball': {
        levels: [
            {dmg: 1, area: 1},
            {dmg: 2, area: 2},
            {dmg: 4, area: 4},
            {dmg: 16, area: 16},
        ],
        effective: 'skeleton',
    },
    'ice-storm': {
        levels: [
            {dmg: 1, area: 1},
            {dmg: 1, area: 4},
            {dmg: 2, area: 8},
            {dmg: 16, area: 16},
        ],
        effective: 'leech',
    },
    'battle-axe': {
        levels: [
            {dmg: 1, area: 1},
            {dmg: 4, area: 1},
            {dmg: 8, area: 2},
            {dmg: 32, area: 8},
        ],
        effective: 'tentacle-vine',
    },
    'arrows': {
        levels: [
            {dmg: 1, area: 1},
            {dmg: 2, area: 2},
            {dmg: 4, area: 4},
            {dmg: 16, area: 16},
        ],
        effective: 'werhog',
    }
});

const MONSTERS = I([
    'skeleton',
    'leech',
    'werhog',
    'tentacle-vine'
]);

function P(p0, p1) {
    return Immutable.List([p0, p1]);
}

function level2power(l) {
    return Math.pow(4, l - 1);
}

let state = I({
    board: Immutable.Map({}),

    enemies: Immutable.Range(0, 50).map(i => Immutable.Map({
        type: rand_choice(MONSTERS),
        hp: 1 + i + (Math.random() * 5) | 0,
    })).toList(),

    player: {
        hp: 50,
        xp: 0,
    }
});

let hover = null;

function all_large_columns() {
    return Immutable.Range(0, SIZE).map(p0 =>
        Immutable.Range(-SIZE, SIZE).map(p1 => P(p0, p1))
    );
}


function all_columns() {
    return Immutable.Range(0, SIZE).map(p0 =>
        Immutable.Range(0, SIZE).map(p1 => P(p0, p1))
    );
}

function all_ps() {
    return all_columns().flatten(1);
}

function empty_ps(b) {
    return all_ps().filter(p => {
        let stone = b.get(p);
        return !stone || stone.get('ghost');
    });
}

let next_id = 0;

function make_stone() {
    return Immutable.Map({
        id: next_id++,
        type: rand_choice(SKILLS.keySeq()),
        level: 1
    });
}

function all_slices() {
    return Immutable.Range(0, SIZE - 2).flatMap(pa =>
        Immutable.Range(0, SIZE).flatMap(pb =>
            [Immutable.Range(0, 3).map(i => P(pa + i, pb)),
             Immutable.Range(0, 3).map(i => P(pb, pa + i))])
    );
}

function match_slices(b) {
    return all_slices().filter(slice => {
        return Immutable.Set(slice.map(p => b.get(p).remove('id'))).size === 1;
    });
}

function match_and_merge(st) {
    let slices = match_slices(st.get('board'));
    return state.update('board', b => b.merge(
        Immutable.Map(slices.flatMap(slice => [
            [slice.get(0), b.get(slice.get(0)).set('ghost', true)],
            [slice.get(2), b.get(slice.get(2)).set('ghost', true)],
        ])),
        Immutable.Map(slices.flatMap(slice => [
            [slice.get(1), b.get(slice.get(1)).update('level', x => x + 1)],
        ]))
    ));
}

function fall(st) {
    return state.update('board', b => Immutable.Map(
        all_large_columns().flatMap((ps, p0) => {
            let stack = ps.map(p => b.get(p)).filter(stone => stone && !stone.get('ghost')).toList();
            return stack.map((stone, offset1) => {
                return [P(p0, SIZE + offset1 - stack.size), stone];
            });
        })
    ));
}

function fill(st) {
    return st.update('board', b => b.merge(Immutable.Map(
        empty_ps(b).map(p => [p.update(1, x => x - SIZE), make_stone()])
    )));
}

function rotate_row(p1, ammount) {
    return st => st.update('board', b => b.merge(Immutable.Map(
        Immutable.Range(0, SIZE).map(p0 => [P(p0, p1), b.get(P(mod(p0 - ammount, SIZE), p1))])
    )));
}

function rotate_col(p0, ammount) {
    return st => st.update('board', b => b.merge(Immutable.Map(
        Immutable.Range(0, SIZE).map(p1 => [P(p0, p1), b.get(P(p0, mod(p1 - ammount, SIZE)))])
    )));
}

function stone_data(stone) {
    let skill = SKILLS.get(stone.get('type'));
    let lvlskill = skill.getIn(['levels', stone.get('level') - 1]);
    return lvlskill.merge(skill.remove('levels'))
}

function get_dmgs(es, skill) {
    let power = skill.get('dmg');
    return es.map((e, i) => {
        if (i < skill.get('area')) {
            return e.get('type') === skill.get('effective') ? power * 2 : power;
        } else {
            return 0;
        }
    })
}

function deploy(p) {
    return st => {
        let stone = st.getIn(['board', p]);
        let skill = stone_data(stone);
        let newst = st
            .update('board', b =>
                b.update(p, stone => stone.set('ghost', true))
            )
            .update('enemies', es => {
                return es.zipWith((e, dmg) => e.update('hp', hp => hp - dmg),
                                  get_dmgs(es, skill));
            });
        let addxp = newst.get('enemies').filter(e => e.get('hp') <= 0).count();
        return newst.update('enemies', es => es.filter(e => e.get('hp') > 0))
            .updateIn(['player', 'hp'], hp => hp + addxp)
            .updateIn(['player', 'xp'], xp => xp + addxp);
    };
}

function board2axs(b) {
    return b.map((stone, p) => Immutable.fromJS({
        t: 'div',
        parent: 'Board',
        attrs: {id: `stone-${stone.get('id')}`,
                'class': `stone level-${stone.get('level')} ${stone.get('type')}`},
        style: {
            left: `${p.get(0) * TILEPCT}%`,
            top: `${p.get(1) * TILEPCT}%`,
            opacity: stone.get('ghost') ? 0 : 1,
        },
        props: {innerText: level2power(stone.get('level')),
               p: p}
    }));
}

function add_attrs_props_style(el, tel) {
    tel.get('attrs', [])
        .forEach((v, k)=> {
            el.setAttribute(k, v);
        });

    tel.get('props', [])
        .forEach((v, k) => {
            el[k] = v;
        });

    tel.get('style', [])
        .forEach((v, k) => {
            el.style.setProperty(k, v);
        });

    tel.get('on', [])
        .forEach((v, k) => {
            el.addEventListener(k, v);
        })
}

function element(tel) {
    let tag = tel.get('t');
    if (!tag) {
        console.log(tel)
    }
    let el = document.createElement(tag);

    add_attrs_props_style(el, tel);

    let children = tel.get('children', []).map(element);

    children.forEach(child => {
        el.append(child);
    });

    return el;
}

function conform(tel) {
    let id = tel.getIn(['attrs', 'id']);
    let el = document.getElementById(id);
    if (!el) {
        el = document.createElement(tel.get('t'));
        document.getElementById(tel.get('parent')).append(el);
        el.base = Immutable.Map();
    }

    el.base.get('attrs', [])
        .forEach((_, k) => {
            el.removeAttribute(k);
        });

    el.base.get('props', [])
        .forEach((_, k) => {
            delete el[k];
        });

    el.base.get('style', [])
        .forEach((_, k) => {
            delete el.style.removeProperty(k);
        });

    add_attrs_props_style(el, tel);
    el.base = tel;
}

function render() {
    let st = state;
    let dmgs = Immutable.Repeat(0);
    if (hover) {
        let stone = st.getIn(['board', hover]);
        if (stone) {
            let skill = stone_data(stone);
            dmgs = get_dmgs(st.get('enemies'), skill);
        }
    }
    HP.innerText = st.getIn(['player', 'hp']);
    XP.innerText = st.getIn(['player', 'xp']);
    Enemies.replaceWith(element(Immutable.fromJS({
        t: 'div',
        attrs: {'id': 'Enemies'},
        children: st.get('enemies').zipWith((e, dmg) => Immutable.fromJS({
            t: 'div',
            attrs: {'class': `enemy ${e.get('type')}`,
                    'data-hp': '50%'},
            props: {'innerText': `HP: ${e.get('hp')}`},
            style: {'--hp': `${100 - 100 * (dmg / e.get('hp'))}%`},
        }),
                                           dmgs)
    })));
    board2axs(st.get('board')).forEach(conform);
}

function update2(f) {
    state = f(state);
    render();
}

async function update(f) {
    let st1 = state;
    update2(f);
    if (!Immutable.is(st1, state)) {
        await sleep(500);
    }
}

async function turn() {
    update2(fill);
    await sleep(1);
    await update(fall);
    await update(match_and_merge);
    await update(fall);
}

async function turns() {
    while (empty_ps(state.get('board')).count()) {
        await turn();
    }
}

let acting = true;

async function u(f) {
    if (!acting) {
        acting = true
        let st1 = state;
        await update(f);
        let st2 = state;
        await turn();
        if (Immutable.is(st2, state)) {
            await update(_ => st1);
        } else {
            state = state.updateIn(['player', 'hp'], hp => hp - 1);
            render();
            if (state.getIn(['player', 'hp']) <= 0) {
                alert(`game over! XP: ${state.getIn(['player', 'xp'])}`);
            }
            await turns();
        }
        acting = false
    }
}

function add_buttons() {
    Right.append(...Immutable.Range(0, SIZE).map(i =>
        element(Immutable.fromJS({t: 'div',
                                  attrs: {'class': 'button'},
                                  style: {'grid-row': 2 + i},
                                  props: {innerText: ">"}, on: {click: () => {u(rotate_row(i, 1));}}}))
    ));

    Left.append(...Immutable.Range(0, SIZE).map(i =>
        element(Immutable.fromJS({t: 'div',
                                  attrs: {'class': 'button'},
                                  style: {'grid-row': 2 + i},
                                  props: {innerText: "<"}, on: {click: () => {u(rotate_row(i, -1));}}}))
    ));

    Bottom.append(...Immutable.Range(0, SIZE).map(i =>
        element(Immutable.fromJS({t: 'div',
                                  attrs: {'class': 'button'},
                                  style: {'grid-column': 2 + i},
                                  props: {innerText: "V"}, on: {click: () => {u(rotate_col(i, 1));}}}))
    ));

    Top.append(...Immutable.Range(0, SIZE).map(i =>
        element(Immutable.fromJS({t: 'div',
                                  attrs: {'class': 'button'},
                                  style: {'grid-column': 2 + i},
                                  props: {innerText: "A"}, on: {click: () => {u(rotate_col(i, -1));}}}))
    ));

}

async function init_board() {
    await turns();
    acting = false;
}

addEventListener('DOMContentLoaded', event => {
    add_buttons();
    Board.addEventListener('click', event => {
        let p = event.target.p;
        hover = null;
        if (p) {
            u(deploy(p));
        }
    });
    Board.addEventListener('mouseover', event => {
        let p = event.target.p;
        hover = p;
        render();
        if (p) {
            let stone = state.getIn(['board', p]);
            let skill = stone_data(stone);
            console.log(JSON.stringify(skill));
        }
    });
    Board.addEventListener('mouseout', event => {
        hover = null;
        render();
    });
    init_board();
});
