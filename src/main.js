// BOOMTOWN — boot, title showcase, game lifecycle.
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource/lilita-one";
import "@fontsource-variable/rubik";
import "@fontsource/secular-one";
import "./ui/styles.css";
import * as THREE from "three";
import { Stage } from "./render/stage.js";
import { Environment } from "./render/environment.js";
import { Board3D } from "./render/board3d.js";
import { Buildings } from "./render/buildings.js";
import { Effects } from "./render/effects.js";
import { CameraDirector } from "./render/camera.js";
import { Pawn, renderPortraits } from "./render/characters.js";
import { Dice } from "./render/dice.js";
import { TownLife } from "./render/life.js";
import { pawnSpot } from "./render/layout.js";
import { Labels } from "./ui/labels.js";
import { UI } from "./ui/ui.js";
import { Presenter } from "./presenter.js";
import { audio } from "./audio/audio.js";
import { clock, wait } from "./core/tween.js";
import { input } from "./core/input.js";
import { TILES, OWNABLE_INDICES } from "./game/board.js";
import { ROSTER } from "./game/roster.js";
import { createGame, saveGame, loadSave, clearSave } from "./game/state.js";
import { GameEngine } from "./game/engine.js";
import { HumanController, AIController } from "./game/controllers.js";
import { OnlineFlow } from "./net/online.js";

const SETTINGS_KEY = 'boomtown.settings';
const settings = (() => {
  const d = { music: true, sfx: true, quality: 'high', speed: 1 };
  try { return { ...d, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return d; }
})();
const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ } };

async function boot() {
  await Promise.race([
    Promise.all([
      document.fonts.load('400 40px "Lilita One"'),
      document.fonts.load('800 40px "Bricolage Grotesque Variable"'),
      document.fonts.load('700 40px "Bricolage Grotesque Variable"'),
      // Hebrew faces: board signs are drawn once onto canvases, so they must be ready first
      document.fonts.load('400 40px "Secular One"', 'בומטאון'),
      document.fonts.load('800 40px "Rubik Variable"', 'בומטאון'),
      document.fonts.load('700 40px "Rubik Variable"', 'בומטאון'),
    ]),
    new Promise((r) => setTimeout(r, 2500)),
  ]);

  const stage = new Stage(document.getElementById('gl'), { quality: settings.quality });
  const env = new Environment(stage);
  const board = new Board3D(stage.scene);
  const fx = new Effects(stage.scene, stage);
  const buildings = new Buildings(board, fx);
  const cam = new CameraDirector(stage.camera, stage.renderer.domElement);
  const dice = new Dice(stage.scene, board.bowl, fx, audio);
  const life = new TownLife(stage.scene, fx);
  const labels = new Labels(document.getElementById('labels'));
  labels.setCamera(stage.camera);
  const ui = new UI(document.getElementById('ui'));
  ui.portraits = renderPortraits(192);
  const presenter = new Presenter({ stage, env, board, buildings, fx, cam, dice, labels, ui });
  fx.setScale(stage.camera);
  window.addEventListener('resize', () => fx.setScale(stage.camera));

  audio.setMusic(settings.music);
  audio.setSfx(settings.sfx);
  const unlock = () => { audio.init(); audio.setMusic(settings.music); audio.setSfx(settings.sfx); };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  // ── frame loop
  let orbit = 0;
  stage.onUpdate((dt, t, realDt) => {
    env.update(dt, t);
    board.update(dt, t);
    buildings.night = env.nightFactor;
    buildings.update(dt, t);
    presenter.update(dt, t);
    life.update(dt);
    showcase?.update(dt, t);
    fx.update(dt);
    if (orbit) cam.goal.yaw += realDt * orbit;
    cam.update(dt, realDt);
    env.updateOccluders(realDt, stage.camera.position, cam.cur.target);
    labels.update(realDt);
    if (presenter.arena) {
      presenter.arena.update(dt, t, realDt);
      stage.bloom.strength = 0.22;
      stage.renderer.toneMappingExposure = 1.0;
    } else {
      stage.bloom.strength = env.bloomBase;
      stage.renderer.toneMappingExposure = env.exposure;
    }
  });
  stage.start();

  // ── title showcase: a lived-in demo town behind the menu
  let showcase = null;
  function startShowcase() {
    const demo = { tiles: {} };
    const colors = ROSTER.map((c) => c.color);
    OWNABLE_INDICES.forEach((i, k) => {
      const r = Math.sin(i * 91.7) * 0.5 + 0.5;
      const owned = r > 0.22;
      demo.tiles[i] = { owner: owned ? k % 4 : null, level: owned ? Math.min(5, Math.floor(r * 6.2)) : 0, mortgaged: false };
      buildings.sync(i, demo.tiles[i], owned ? colors[k % 4] : null);
    });
    env.setTime(1.55, true);
    const pawns = ROSTER.slice(0, 4).map((c, k) => {
      const p = new Pawn(c.id);
      const idx = [0, 12, 24, 33][k];
      p.userData = { idx, next: 1.5 + k * 0.7 };
      pawnSpot(idx, 0, p.root.position).setY(0.1);
      stage.scene.add(p.root);
      return p;
    });
    cam.shot({ target: new THREE.Vector3(0, 0, 0), yaw: Math.PI / 4, pitch: 0.72, dist: 40 }, 50);
    cam.userEnabled = false;
    orbit = 0.04;
    showcase = {
      pawns,
      update(dt, t) {
        for (const p of pawns) {
          p.update(dt, t, stage.camera);
          p.userData.next -= dt;
          if (p.userData.next <= 0 && !p.anim) {
            p.userData.next = 1.6 + Math.random() * 2;
            p.userData.idx = (p.userData.idx + 1) % 40;
            p.hopTo(pawnSpot(p.userData.idx, 0).setY(0.1), { height: 0.5, duration: 0.32 });
          }
        }
      },
      dispose() {
        pawns.forEach((p) => { stage.scene.remove(p.root); p.dispose(); });
        for (const i of OWNABLE_INDICES) buildings.sync(i, { owner: null, level: 0, mortgaged: false }, null);
        orbit = 0;
        cam.userEnabled = true;
      },
    };
  }

  // ── game lifecycle
  let engine = null;
  let lastConfig = null;

  async function startGame(state) {
    await ui.wipe(['#ff5d73', '#ffb31f', '#2fcf85', '#2fa8ff', '#8a63ff'], 'in');
    await ui.hideTitle();
    showcase?.dispose();
    showcase = null;
    presenter.attach(state);
    await ui.wipe([], 'out');
    presenter.onGameOverChoice = async (choice) => {
      clearSave();
      if (choice === 'again' && lastConfig) {
        await ui.wipe(['#ff5d73', '#ffb31f', '#2fcf85', '#2fa8ff', '#8a63ff'], 'in');
        presenter.detach();
        for (const i of OWNABLE_INDICES) buildings.sync(i, { owner: null, level: 0, mortgaged: false }, null);
        const s = createGame(lastConfig);
        presenter.attach(s);
        await ui.wipe([], 'out');
        runEngine(s);
      } else location.reload();
    };
    runEngine(state);
  }

  function runEngine(state) {
    const controllers = state.players.map((p) => (p.isAI ? new AIController(presenter) : new HumanController(presenter)));
    engine = new GameEngine(state, { presenter, controllers, onSave: (s) => { if (s.over) clearSave(); else saveGame(s); } });
    window.__game = { engine, presenter, state };
    if (!state.over) saveGame(state);
    engine.run().catch((err) => {
      console.error(err);
      ui.toast(`משהו נשבר: ${err.message}`, 'bad');
    });
  }

  const online = new OnlineFlow({
    ui, presenter,
    hooks: {
      beforeGame: async () => {
        await ui.wipe(['#ff5d73', '#ffb31f', '#2fcf85', '#2fa8ff', '#8a63ff'], 'in');
        await ui.hideTitle();
        showcase?.dispose();
        showcase = null;
        presenter.detach?.();
        for (const i of OWNABLE_INDICES) buildings.sync(i, { owner: null, level: 0, mortgaged: false }, null);
        ui.wipe([], 'out');
      },
      onMap: (id) => { if (board.mapId !== id) { board.setMap(id); buildings.refreshAll(); } },
    },
  });
  window.__online = online;

  function showTitle() {
    startShowcase();
    const roomCode = new URLSearchParams(location.search).get('room');
    // Dev shortcut: ?quick (1 human vs 2 CPUs) or ?quick=cpu (all CPU, spectate)
    const qp = new URLSearchParams(location.search);
    if (qp.has('duel')) {
      // Dev: ?duel=quickdraw|tug|sumo|stack[&human=1] — play one duel in isolation
      const s = createGame({ players: [{ charId: 'rex', isAI: !qp.has('human') }, { charId: 'tina', isAI: true }], settings: { cpuDuels: 'watch' } });
      showcase?.dispose(); showcase = null;
      presenter.attach(s);
      (async () => {
        for (;;) {
          const w = await presenter.runDuel({ a: s.players[0], b: s.players[1], game: qp.get('duel'), ctx: { reason: 'rent', stake: 120 } });
          ui.toast(`המנצח: ${s.players[w].name}`, 'good');
          await wait(2);
        }
      })();
      return;
    }
    if (qp.has('quick')) {
      const allCpu = qp.get('quick') === 'cpu';
      const cfg = {
        players: ['rex', 'tina', 'cap', 'pepper'].slice(0, +(qp.get('n') || 3)).map((id, i) => ({ charId: id, name: '', isAI: allCpu || i > 0, aiLevel: 'normal' })),
        settings: { roundLimit: +(qp.get('rounds') || 25), startingCash: +(qp.get('cash') || 1500), cpuDuels: qp.get('duels') || 'quick', speed: +(qp.get('speed') || 1), map: qp.get('map') || 'boomtown', noBuildFirstRound: qp.has('classic') ? 1 : 0 },
      };
      cfg.players.forEach((p) => { p.name = ROSTER.find((r) => r.id === p.charId).name; });
      lastConfig = cfg;
      startGame(createGame({ ...cfg, seed: qp.has('seed') ? +qp.get('seed') : undefined }));
      return;
    }
    const save = loadSave();
    ui.title({
      hasSave: !!save,
      onHelp: () => ui.howTo(),
      onPlay: (config) => {
        audio.init();
        config.settings.speed = config.settings.speed || settings.speed;
        settings.speed = config.settings.speed;
        saveSettings();
        lastConfig = config;
        clearSave();
        startGame(createGame(config));
      },
      onContinue: () => {
        audio.init();
        const s = loadSave()?.state;
        if (s) startGame(s);
      },
      onOnline: () => { audio.init(); online.openMenu(); },
      onMap: (id) => { board.setMap(id); buildings.refreshAll(); },
    });
    if (roomCode) online.joinFromLink(roomCode.toUpperCase());
  }

  // ── menus
  let paused = false;
  async function openPause() {
    if (paused || (!engine && !online.active)) return;
    paused = true;
    ui.paused = true;
    if (!online.active) clock.paused = true;
    const choice = await ui.pauseMenu({
      settings,
      online: online.active,
      onSetting: (k, v) => {
        settings[k] = v;
        saveSettings();
        if (k === 'music') audio.setMusic(v);
        if (k === 'sfx') audio.setSfx(v);
        if (k === 'quality') stage.setQuality(v);
        if (k === 'speed') { clock.scale = v; if (engine) engine.state.settings.speed = v; }
      },
    });
    clock.paused = false;
    ui.paused = false;
    paused = false;
    if (choice === 'help') ui.howTo();
    if (choice === 'quit') { if (online.active) online.leave(); else location.reload(); } // offline: the autosave from the last turn boundary is kept
  }
  ui.onMenu = (a, btn) => {
    if (a === 'help') ui.howTo();
    if (a === 'music') { settings.music = !settings.music; audio.setMusic(settings.music); btn.classList.toggle('off', !settings.music); saveSettings(); }
    if (a === 'sfx') { settings.sfx = !settings.sfx; audio.setSfx(settings.sfx); btn.classList.toggle('off', !settings.sfx); saveSettings(); }
    if (a === 'menu') openPause();
  };
  input.onKey((k) => {
    if (k === 'Escape' && presenter.mode !== 'build' && (engine || online.phase === 'game') && !document.querySelector('.overlay')) openPause();
  });

  document.getElementById('boot').classList.add('done');
  setTimeout(() => document.getElementById('boot')?.remove(), 900);
  window.__world = { stage, env, board, buildings, cam, dice, fx, labels, ui, presenter, THREE, TILES };
  showTitle();
}

boot().catch((err) => {
  console.error(err);
  const b = document.getElementById('boot');
  if (b) b.innerHTML = `<div class="boot-logo" style="font-size:28px;text-align:center">לא הצלחנו להפעיל את בומטאון<br><small style="font-size:16px">${err.message}</small></div>`;
});
