/*
 * app.js — renders bus state. The view is a pure function of the bus.
 *
 * Choices are a real <form> with <input type="radio"> and <label>. This is not
 * an aesthetic preference: the previous UI had zero ARIA attributes and got its
 * entire screen-reader behaviour from native form semantics. Rendering choices
 * as <div onClick> would silently destroy that.
 *
 * The engine assigns keyboard shortcuts 1-9 to options, so the numeral shown
 * beside each choice names a real key, not a decoration.
 */

(function () {
  var html = htmPreact.html;
  var render = htmPreact.render;
  var useState = htmPreact.useState;
  var useEffect = htmPreact.useEffect;
  var useRef = htmPreact.useRef;

  /* --- blocks ------------------------------------------------------------ */

  function Block(props) {
    var b = props.block;
    if (b.kind === 'linebreak') return html`<span class="cs-linebreak"></span>`;
    if (b.kind === 'image') {
      var cls = 'cs-align-' + (b.alignment || 'none') + (b.invert ? ' cs-invert' : '');
      return html`<img src=${b.source} alt=${b.alt} class=${cls} />`;
    }
    if (b.kind === 'youtube') {
      return html`<iframe class="cs-youtube" width="560" height="315"
        src=${'https://www.youtube.com/embed/' + b.slug}
        title="Video" frameborder="0" allowfullscreen></iframe>`;
    }
    if (b.kind === 'link') {
      return html`<p><a href=${b.href} target="_blank" rel="noopener">${b.anchorText}</a></p>`;
    }
    if (b.kind === 'statchart') {
      return html`<${StatChart} rows=${b.rows} />`;
    }
    if (b.inline) {
      return html`<span dangerouslySetInnerHTML=${{ __html: b.html }} />`;
    }
    return html`<p dangerouslySetInnerHTML=${{ __html: b.html }} />`;
  }

  /* --- stat chart -------------------------------------------------------- */

  function StatChart(props) {
    return html`<div class="cs-statchart">
      ${(props.rows || []).map(function (row, i) {
        if (row.type === 'text') {
          var blank = !String(row.label).trim() && !String(row.value).trim();
          if (blank) return html`<div class="cs-stat-spacer" key=${i}></div>`;
          return html`<div class="cs-stat-row cs-stat-row-text" key=${i}>
            <div class="cs-stat-label">
              <span>${row.label}</span><span class="cs-stat-value">${row.value}</span>
            </div>
            ${row.definition
              ? html`<p class="cs-stat-definition">${row.definition}</p>` : null}
          </div>`;
        }
        var opposed = row.type === 'opposed_pair';
        var pct = Math.max(0, Math.min(100, Number(row.value) || 0));
        return html`<div class="cs-stat-row" key=${i}>
          <div class="cs-stat-label">
            <span>${row.label}${opposed ? '' : ''}</span>
            <span class="cs-stat-value">
              ${opposed ? pct + '% / ' + (100 - pct) + '%  ' + row.label2 : pct + '%'}
            </span>
          </div>
          <div class="cs-stat-track" role="meter"
               aria-label=${opposed ? row.label + ' versus ' + row.label2 : row.label}
               aria-valuenow=${pct} aria-valuemin="0" aria-valuemax="100"
               aria-valuetext=${opposed
                 ? pct + '% ' + row.label + ', ' + (100 - pct) + '% ' + row.label2
                 : pct + '%'}>
            <div class=${'cs-stat-fill' + (opposed ? ' cs-stat-fill-opposed' : '')}
                 style=${'width:' + pct + '%'}></div>
          </div>
          ${row.definition
            ? html`<p class="cs-stat-definition">${row.definition}</p>` : null}
        </div>`;
      })}
    </div>`;
  }

  /* --- choices ----------------------------------------------------------- */

  function Choices(props) {
    var pending = props.pending;
    var groups = pending.groups && pending.groups.length ? pending.groups : [''];
    var initial = {};
    groups.forEach(function (g, i) { initial[i] = null; });
    var state = useState(initial);
    var selected = state[0];
    var setSelected = state[1];
    var errState = useState(null);
    var error = errState[0];
    var setError = errState[1];

    function optionsFor(depth) {
      var opts = pending.options;
      for (var i = 0; i < depth; i++) {
        var chosen = selected[i];
        if (chosen === null || chosen === undefined) return null;
        opts = opts[chosen].suboptions;
        if (!opts) return null;
      }
      return opts;
    }

    function submit(e) {
      if (e && e.preventDefault) e.preventDefault();
      var opts = pending.options;
      var option = null;
      for (var i = 0; i < groups.length; i++) {
        var idx = selected[i];
        if (idx === null || idx === undefined) {
          var g = groups[i];
          setError(g
            ? 'Choose ' + (/^[aeiou]/i.test(g) ? 'an ' : 'a ') + g + ' first.'
            : 'Choose one of the options first.');
          return;
        }
        option = opts[idx];
        opts = option.suboptions;
      }
      if (option && option.unselectable) {
        setError('That combination is not allowed. Choose again.');
        return;
      }
      setError(null);
      pending.resume(option);
    }

    /* number keys 1-9 select, matching the engine's own shortcuts */
    useEffect(function () {
      function onKey(e) {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        var tag = (e.target && e.target.tagName) || '';
        if (/^(INPUT|TEXTAREA)$/.test(tag)) return;
        var n = parseInt(e.key, 10);
        var opts = optionsFor(groups.length - 1);
        if (!opts || isNaN(n) || n < 1 || n > opts.length) return;
        var opt = opts[n - 1];
        if (opt.unselectable) return;
        var next = {};
        for (var k in selected) next[k] = selected[k];
        next[groups.length - 1] = n - 1;
        setSelected(next);
      }
      document.addEventListener('keydown', onKey);
      return function () { document.removeEventListener('keydown', onKey); };
    });

    return html`<form class="cs-choices-form" onSubmit=${submit}>
      ${groups.map(function (group, depth) {
        var opts = optionsFor(depth);
        if (!opts) return null;
        return html`<fieldset class="cs-choices" key=${depth}>
          ${group ? html`<legend>Select ${group}</legend>` : null}
          <div class="choice">
            ${opts.map(function (option, i) {
              var id = 'cs-opt-' + depth + '-' + i;
              return html`<div class=${'cs-option' + (option.unselectable ? ' cs-option-disabled' : '')} key=${i}>
                <input type="radio" id=${id} name=${'group' + depth}
                  disabled=${!!option.unselectable}
                  checked=${selected[depth] === i}
                  onChange=${function () {
                    var next = {};
                    for (var k in selected) next[k] = selected[k];
                    next[depth] = i;
                    for (var d = depth + 1; d < groups.length; d++) next[d] = null;
                    setSelected(next);
                    setError(null);
                  }} />
                <label for=${id}>
                  ${depth === groups.length - 1 && i < 9
                    ? html`<span class="cs-option-key" aria-hidden="true">${i + 1}</span>`
                    : null}
                  <span dangerouslySetInnerHTML=${{ __html: option.name }} />
                </label>
              </div>`;
            })}
          </div>
        </fieldset>`;
      })}
      ${error ? html`<p class="cs-error" role="alert">${error}</p>` : null}
      <div class="cs-submit">
        <button type="submit" class="cs-btn cs-btn-primary">Next</button>
      </div>
    </form>`;
  }

  /* --- text input -------------------------------------------------------- */

  function TextInput(props) {
    var pending = props.pending;
    var state = useState('');
    var value = state[0];
    var setValue = state[1];
    var errState = useState(null);
    var inputRef = useRef(null);

    useEffect(function () {
      if (inputRef.current) inputRef.current.focus();
    }, []);

    function submit(e) {
      if (e && e.preventDefault) e.preventDefault();
      if (!value && !pending.allowBlank) {
        errState[1]('Type something first.');
        return;
      }
      pending.resume(value);
    }

    var common = {
      class: 'cs-input-field',
      value: value,
      autocomplete: 'off',
      ref: inputRef,
      onInput: function (e) { setValue(e.target.value); errState[1](null); },
    };

    return html`<form class="cs-input" onSubmit=${submit}>
      <label class="cs-visually-hidden" for="cs-input-field">Your answer</label>
      ${pending.long
        ? html`<textarea id="cs-input-field" rows="4" ...${common}></textarea>`
        : html`<input id="cs-input-field"
            type=${pending.numeric ? 'number' : 'text'}
            min=${pending.minimum} max=${pending.maximum} step=${pending.step}
            ...${common} />`}
      ${errState[0] ? html`<p class="cs-error" role="alert">${errState[0]}</p>` : null}
      <div class="cs-submit">
        <button type="submit" class="cs-btn cs-btn-primary">Next</button>
      </div>
    </form>`;
  }

  /* --- pending dispatch -------------------------------------------------- */

  function Pending(props) {
    var p = props.pending;
    if (!p) return null;
    if (p.kind === 'choice') return html`<${Choices} pending=${p} />`;
    if (p.kind === 'input') return html`<${TextInput} pending=${p} />`;
    if (p.kind === 'next') {
      return html`<div class="cs-next">
        <button class="cs-btn cs-btn-primary"
          onClick=${function () { p.resume(); }}>${p.name || 'Next'}</button>
      </div>`;
    }
    return null;
  }

  /* --- modal ------------------------------------------------------------- */

  function Modal(props) {
    var m = props.modal;
    if (!m) return null;
    return html`<div class="cs-modal-backdrop" role="dialog" aria-modal="true">
      <div class="cs-modal">
        <p>${m.message}</p>
        <div class="cs-modal-actions">
          ${m.kind === 'confirm'
            ? html`<button class="cs-btn"
                onClick=${function () { m.resume(false); }}>Cancel</button>`
            : null}
          <button class="cs-btn cs-btn-primary"
            onClick=${function () { m.resume(m.kind === 'confirm' ? true : undefined); }}>OK</button>
        </div>
      </div>
    </div>`;
  }

  /* --- screens ----------------------------------------------------------- */

  function BackBar(props) {
    return html`<div class="cs-backbar">
      <button class="cs-btn" onClick=${props.onBack}>${props.label || 'Back'}</button>
    </div>`;
  }

  function bb(text) {
    return String(text || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\[b\]/g, '<b>').replace(/\[\/b\]/g, '</b>')
      .replace(/\[i\]/g, '<i>').replace(/\[\/i\]/g, '</i>');
  }

  function AchievementsScreen() {
    var d = achievementsData();
    var noneYet = d.earned.length === 0;

    function Item(props) {
      var a = props.a;
      return html`<li class=${'cs-achievement' + (props.locked ? ' cs-achievement-locked' : '')}>
        <div class="cs-achievement-title">${a.title}</div>
        <div class="cs-achievement-desc"
             dangerouslySetInnerHTML=${{ __html: bb(a.description) }} />
        <div class="cs-achievement-points">${a.points} ${a.points === 1 ? 'point' : 'points'}</div>
      </li>`;
    }

    return html`<div class="cs-screen">
      <h2 class="cs-screen-title">Achievements</h2>
      <p class="cs-screen-summary">
        ${d.score} of ${d.totalScore} points · ${d.earned.length} of ${d.total} unlocked
        ${d.hiddenCount ? ' · ' + d.hiddenCount + ' hidden' : ''}
      </p>
      ${noneYet
        ? html`<p class="cs-empty">Nothing unlocked yet. Play on.</p>`
        : html`<ul class="cs-achievement-list">
            ${d.earned.map(function (a) { return html`<${Item} a=${a} key=${a.name} />`; })}
          </ul>`}
      ${d.locked.length
        ? html`<h3 class="cs-screen-subtitle">Still locked</h3>
          <ul class="cs-achievement-list">
            ${d.locked.map(function (a) {
              return html`<${Item} a=${a} locked=${true} key=${a.name} />`;
            })}
          </ul>`
        : null}
      <${BackBar} onBack=${function () { busSet({ screen: 'game' }); }} />
    </div>`;
  }

  function SavesScreen() {
    var st = useState(null);
    var saves = st[0];
    var setSaves = st[1];

    useEffect(function () {
      savesLoad(function (list) { setSaves(list); });
    }, []);

    return html`<div class="cs-screen">
      <h2 class="cs-screen-title">Saved games</h2>
      ${saves === null
        ? html`<p class="cs-loading">Loading…</p>`
        : saves.length === 0
          ? html`<p class="cs-empty">No saved games yet.</p>`
          : html`<ul class="cs-save-list">
              ${saves.map(function (save, i) {
                return html`<li class="cs-save" key=${i}>
                  <button class="cs-save-btn"
                    onClick=${function () { savesRestore(save); }}>
                    <span class="cs-save-name">${save.name || 'Untitled save'}</span>
                    <span class="cs-save-date">${savesFormatDate(save.timestamp)}</span>
                  </button>
                </li>`;
              })}
            </ul>`}
      <${BackBar} onBack=${function () { busSet({ screen: 'game' }); }} />
    </div>`;
  }

  function Radios(props) {
    return html`<fieldset class="cs-setting">
      <legend>${props.legend}</legend>
      <div class="cs-setting-options">
        ${props.options.map(function (o) {
          var id = 'cs-set-' + props.name + '-' + o.value;
          return html`<div class="cs-setting-option" key=${o.value}>
            <input type="radio" id=${id} name=${props.name}
              checked=${props.value === o.value}
              onChange=${function () { props.onChange(o.value); }} />
            <label for=${id}>${o.label}</label>
          </div>`;
        })}
      </div>
    </fieldset>`;
  }

  function SettingsScreen() {
    return html`<div class="cs-screen">
      <h2 class="cs-screen-title">Settings</h2>

      <${Radios} legend="Theme" name="bg" value=${settingsGetBackground()}
        onChange=${settingsSetBackground}
        options=${[
          { value: 'sepia', label: 'Paper' },
          { value: 'black', label: 'Dark' },
          { value: 'white', label: 'Plain white' },
        ]} />

      <${Radios} legend="Typeface" name="family" value=${settingsGetFamily()}
        onChange=${settingsSetFamily}
        options=${[
          { value: 'serif', label: 'Serif' },
          { value: 'sans', label: 'Sans' },
          { value: 'dyslexia', label: 'OpenDyslexic' },
        ]} />

      <fieldset class="cs-setting">
        <legend>Text size</legend>
        <div class="cs-setting-options">
          <button class="cs-btn" onClick=${function () { changeFontSize(false); }}
            aria-label="Smaller text">A−</button>
          <span class="cs-setting-readout">${Math.round(settingsGetZoom() * 100)}%</span>
          <button class="cs-btn" onClick=${function () { changeFontSize(true); }}
            aria-label="Larger text">A+</button>
        </div>
      </fieldset>

      <fieldset class="cs-setting">
        <legend>Page transitions</legend>
        <div class="cs-setting-options">
          <div class="cs-setting-option">
            <input type="checkbox" id="cs-set-anim"
              checked=${settingsGetAnimation()}
              onChange=${function (e) { settingsSetAnimation(e.target.checked); }} />
            <label for="cs-set-anim">Fade between screens</label>
          </div>
        </div>
      </fieldset>

      <${BackBar} onBack=${function () { busSet({ screen: 'game' }); }} />
    </div>`;
  }

  /* --- root -------------------------------------------------------------- */

  function App() {
    /*
     * Keying the pane on the screen index makes Preact replace the subtree on
     * every clearScreen, which restarts the entrance animation. This replaces
     * the old approach: clone container1.innerHTML into a second container,
     * translateY by pageYOffset, then scrollTo(0,1) to hide mobile URL bars.
     */
    if (bus.screen === 'achievements') return html`<${AchievementsScreen} />`;
    if (bus.screen === 'saves') return html`<${SavesScreen} />`;
    if (bus.screen === 'settings') return html`<${SettingsScreen} />`;

    var animate = window.animateEnabled !== false;
    return html`<div class=${'cs-pane' + (animate ? ' cs-pane-enter' : '')}
                     key=${bus.history.length}>
      ${bus.loading ? html`<p class="cs-loading">Loading…</p>` : null}
      <div id="text">
        ${bus.blocks.map(function (b, i) { return html`<${Block} block=${b} key=${i} />`; })}
      </div>
      <${Pending} pending=${bus.pending} />
      ${bus.screen === 'stats' && !bus.pending
        ? html`<${BackBar} label="Back to the story"
            onBack=${function () { returnFromStats(); }} />`
        : null}
      <${Modal} modal=${bus.modal} />
    </div>`;
  }

  /* --- mount ------------------------------------------------------------- */

  /*
   * The subscription lives outside the component lifecycle on purpose. Preact
   * defers useEffect until after paint, but the engine runs synchronously the
   * moment it is started — so a subscription registered inside a component
   * would miss every busNotify from the opening scene and the first screen
   * would render empty.
   */
  var mountRoot = null;

  var lastScreenIndex = -1;

  function appRender() {
    var screenChanged = bus.history.length !== lastScreenIndex;
    lastScreenIndex = bus.history.length;

    var paint = function () {
      render(html`<${App} />`, mountRoot);
      legacySetTextNode(document.getElementById('text'));
    };

    var animate = window.animateEnabled !== false &&
      !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    if (screenChanged && animate && document.startViewTransition) {
      document.startViewTransition(paint);
    } else {
      paint();
    }
    if (screenChanged) window.scrollTo(0, 0);
  }

  function appMount() {
    mountRoot = document.getElementById('main');
    if (!mountRoot) throw new Error('<div id="main"> is missing from index.html');
    mountRoot.innerHTML = '';
    busSubscribe(appRender);
    appRender();
  }

  function appFocusFirst() {
    var text = document.getElementById('text');
    if (text && text.firstElementChild) {
      var el = text.firstElementChild;
      el.setAttribute('tabindex', '-1');
      el.focus();
      requestAnimationFrame(function () {
        el.blur();
        el.removeAttribute('tabindex');
      });
    }
  }

  window.appMount = appMount;
  window.appFocusFirst = appFocusFirst;
})();
