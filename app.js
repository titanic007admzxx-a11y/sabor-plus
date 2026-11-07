/* SABOR+ — frontend (SPA com roteamento por hash). Sem dependências externas. */
(() => {
  'use strict';

  const app = document.getElementById('app');
  const state = {
    token: localStorage.getItem('sabor_token'),
    user: null,
    categories: [],
    loadedUser: false,
    searchTimer: null,
  };

  // ------------------------------------------------------------------ utilidades
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  function toast(msg, type = '') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  async function api(path, { method = 'GET', body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    let res;
    try {
      res = await fetch(`/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch {
      throw new Error('Sem conexão com o servidor.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && state.token) {
        setSession(null, null);
      }
      throw new Error(data.error || 'Algo deu errado. Tente novamente.');
    }
    return data;
  }

  function setSession(token, user) {
    state.token = token;
    state.user = user;
    if (token) localStorage.setItem('sabor_token', token);
    else localStorage.removeItem('sabor_token');
    document.body.classList.toggle('logged', !!user);
    const avatar = $('#topAvatar');
    if (avatar) avatar.innerHTML = user?.avatar ? `<img src="${esc(user.avatar)}" alt="">` : (user ? esc(user.name.charAt(0).toUpperCase()) : '👤');
    $$('[data-auth-only]').forEach((el) => { el.hidden = !user; });
  }

  async function loadSession() {
    if (state.token) {
      try {
        const { user } = await api('/me');
        setSession(state.token, user);
      } catch {
        setSession(null, null);
      }
    }
    state.loadedUser = true;
  }

  async function loadCategories() {
    if (!state.categories.length) state.categories = await api('/categories');
    return state.categories;
  }

  // Frações culinárias para quantidades (ex.: 0,5 -> ½).
  const FRAC = [[0, ''], [0.125, '⅛'], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾']];
  function fmtQty(q) {
    if (q === null || q === undefined || Number.isNaN(q)) return '';
    const whole = Math.floor(q + 1e-9);
    const frac = q - whole;
    const hit = FRAC.find(([v]) => Math.abs(frac - v) < 0.04);
    if (hit) {
      if (hit[1] === '') return String(whole);
      return whole ? `${whole} ${hit[1]}` : hit[1];
    }
    return (Math.round(q * 100) / 100).toString().replace('.', ',');
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function stars(avg, count) {
    if (!count) return '<span class="hint">Ainda sem avaliações</span>';
    const full = Math.round(avg);
    return `<span class="stars" aria-label="${avg} de 5 estrelas">${'★'.repeat(full)}${'☆'.repeat(5 - full)}</span>`;
  }

  function pantryBadge(p) {
    if (!p) return '';
    if (!p.missing.length) return '<span class="pantry-badge ok">✓ Você tem todos os ingredientes</span>';
    return `<span class="pantry-badge">Faltam ${p.missing.length}: ${esc(p.missing.slice(0, 3).join(', '))}${p.missing.length > 3 ? '…' : ''}</span>`;
  }

  function recipeCard(r) {
    return `<a class="card" href="#/receita/${r.id}">
      <div class="card-img"><img loading="lazy" decoding="async" src="${esc(r.image)}" alt="${esc(r.title)}"></div>
      <div class="card-body">
        <span class="tag">${esc(r.category?.emoji || '')} ${esc(r.category?.name || 'Receita')}</span>
        <h3>${esc(r.title)}</h3>
        <div class="meta">
          <span>⏱ ${r.totalMinutes} min</span>
          <span>${esc(r.difficultyLabel)}</span>
          <span class="rating">${r.rating.count ? '★ ' + r.rating.average.toFixed(1) : 'Novo'}</span>
        </div>
        ${pantryBadge(r.pantry)}
      </div>
    </a>`;
  }

  function emptyState(icon, title, text, action = '') {
    return `<div class="card-empty"><div class="big">${icon}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
  }

  function loading() { app.innerHTML = '<div class="loading"><span class="spinner"></span> Carregando…</div>'; }

  function requireLogin(msg = 'Entre na sua conta para usar este recurso.') {
    if (state.user) return true;
    toast(msg);
    location.hash = `#/entrar?next=${encodeURIComponent(location.hash.slice(1) || '/')}`;
    return false;
  }

  function openModal(html, onMount) {
    const root = $('#modalRoot');
    root.innerHTML = `<div class="modal-backdrop" data-close-modal><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
    root.firstElementChild.style.pointerEvents = 'auto';
    const backdrop = root.firstElementChild;
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
    onMount?.(backdrop.querySelector('.modal'));
    return backdrop;
  }
  function closeModal() { $('#modalRoot').innerHTML = ''; }

  function readFileAsDataUrl(file, { max = 1200, quality = 0.85 } = {}) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('Nenhum arquivo selecionado.'));
      if (!file.type.startsWith('image/')) return reject(new Error('Selecione um arquivo de imagem.'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler a imagem.')); };
      img.src = url;
    });
  }

  // ------------------------------------------------------------------ roteamento
  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [pathPart, qs = ''] = raw.split('?');
    return {
      parts: pathPart.split('/').filter(Boolean).map((p) => decodeURIComponent(p)),
      params: new URLSearchParams(qs),
    };
  }

  const routes = {
    '': viewHome,
    categorias: viewCategories,
    categoria: viewCategory,
    pesquisar: viewSearch,
    receita: viewRecipe,
    preparo: viewCookMode,
    favoritos: viewFavorites,
    planejador: viewPlanner,
    lista: viewShopping,
    ferramentas: viewTools,
    entrar: viewAuth,
    cadastro: viewAuth,
    perfil: viewProfile,
    'nova-receita': viewRecipeForm,
    editar: viewRecipeForm,
    admin: viewAdmin,
  };

  let renderToken = 0;
  async function render() {
    const token = ++renderToken;
    closeModal();
    document.querySelectorAll('.cook-mode').forEach((n) => n.remove());
    const { parts, params } = parseHash();
    const name = parts[0] || '';
    $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === name || (name === '' && a.dataset.nav === '')));
    document.querySelectorAll('.top-nav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === name && name !== ''));
    if (name === '' && document.querySelector('.top-nav a[data-nav=""]')) {
      document.querySelector('.top-nav a[data-nav=""]').classList.add('active');
    }
    const handler = routes[name] || viewNotFound;
    try {
      await handler(parts, params, token);
    } catch (err) {
      if (token !== renderToken) return;
      app.innerHTML = emptyState('⚠️', 'Não foi possível carregar', err.message,
        '<p style="margin-top:14px"><a class="btn btn-primary" href="#/">Voltar ao início</a></p>');
    }
    if (token === renderToken) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  // ------------------------------------------------------------------ Início
  async function viewHome(_p, _params, token) {
    loading();
    const [home] = await Promise.all([api('/home'), loadCategories()]);
    if (token !== renderToken) return;
    const collage = home.popular.slice(0, 3);
    app.innerHTML = `
      <section class="hero">
        <div class="hero-inner">
          <div>
            <p class="eyebrow">Receitas para todos os gostos</p>
            <h1>O que você quer cozinhar hoje?</h1>
            <div class="search-wrap" id="heroSearchWrap">
              <form class="search-box" data-form="search-go" role="search">
                <span class="icon" aria-hidden="true">🔎</span>
                <input name="q" type="search" autocomplete="off" placeholder="Nome, ingrediente, categoria ou tempo…" aria-label="Pesquisar receitas" data-suggest="hero">
                <button type="submit">Buscar</button>
              </form>
              <div class="suggest" id="suggest-hero" hidden></div>
            </div>
            <div class="hero-actions">
              <button class="btn btn-ghost" data-action="surprise">🎲 Receita surpresa</button>
              <a class="btn btn-ghost" href="#/ferramentas">🧮 Ferramentas</a>
            </div>
          </div>
          <div class="hero-collage" aria-hidden="true">
            ${collage.map((r) => `<a href="#/receita/${r.id}" tabindex="-1"><img src="${esc(r.image)}" alt=""></a>`).join('')}
          </div>
        </div>
      </section>

      ${section('Populares do momento', 'As receitas mais vistas da comunidade', home.popular, '#/pesquisar?sort=popular')}
      ${section('Mais bem avaliadas', 'Aprovadas por quem já cozinhou', home.topRated, '#/pesquisar?sort=rating')}
      ${section('Recomendadas para você', home.recommendedBasis, home.recommended, '#/pesquisar?sort=rating')}
      ${section('Adicionadas recentemente', 'Novidades no SABOR+', home.recent, '#/pesquisar?sort=recent')}

      <section class="section">
        <div class="section-head">
          <div><h2>Categorias</h2><p>Escolha por tipo de prato</p></div>
          <a class="link-more" href="#/categorias">Ver todas →</a>
        </div>
        <div class="cat-grid">${home.categories.slice(0, 8).map(catCard).join('')}</div>
      </section>`;
    bindSuggest();
  }

  function section(title, sub, items, moreHref) {
    if (!items.length) return '';
    return `<section class="section">
      <div class="section-head">
        <div><h2>${esc(title)}</h2><p>${esc(sub)}</p></div>
        <a class="link-more" href="${moreHref}">Ver mais →</a>
      </div>
      <div class="row">${items.map(recipeCard).join('')}</div>
    </section>`;
  }

  function catCard(c) {
    return `<a class="cat-card" href="#/categoria/${esc(c.slug)}" style="background:${esc(c.color)}">
      <img loading="lazy" src="/api/categories/${esc(c.slug)}/image" alt="">
      <span class="cat-label">${esc(c.name)}<small>${c.count} receita${c.count === 1 ? '' : 's'}</small></span>
    </a>`;
  }

  // ------------------------------------------------------------------ sugestões de busca
  function bindSuggest() {
    $$('[data-suggest]').forEach((input) => {
      const box = input.closest('form')?.parentElement?.querySelector('.suggest') || document.getElementById(`suggest-${input.dataset.suggest}`);
      if (!box) return;
      input.addEventListener('input', () => {
        clearTimeout(state.searchTimer);
        const term = input.value.trim();
        if (term.length < 2) { box.hidden = true; box.innerHTML = ''; return; }
        state.searchTimer = setTimeout(async () => {
          try {
            const list = await api(`/suggest?q=${encodeURIComponent(term)}`);
            if (input.value.trim() !== term) return;
            if (!list.length) {
              box.innerHTML = '<button type="button" disabled><span class="s-label">Nenhum resultado para "' + esc(term) + '"</span></button>';
            } else {
              box.innerHTML = list.map((s) => {
                if (s.type === 'recipe') return `<button type="button" data-go="#/receita/${s.id}"><span class="s-type">Receita</span><span class="s-label">${esc(s.label)}</span><span class="s-sub">${esc(s.sub)}</span></button>`;
                if (s.type === 'ingredient') return `<button type="button" data-go="#/pesquisar?ingredient=${encodeURIComponent(s.query)}"><span class="s-type">Ingrediente</span><span class="s-label">${esc(s.label)}</span><span class="s-sub">${esc(s.sub)}</span></button>`;
                return `<button type="button" data-go="#/categoria/${esc(s.slug)}"><span class="s-type">Categoria</span><span class="s-label">${esc(s.emoji)} ${esc(s.label)}</span><span class="s-sub">${esc(s.sub)}</span></button>`;
              }).join('') + `<button type="button" data-go="#/pesquisar?q=${encodeURIComponent(term)}"><span class="s-type">Buscar</span><span class="s-label">Ver todos os resultados para "${esc(term)}"</span></button>`;
            }
            box.hidden = false;
          } catch { box.hidden = true; }
        }, 180);
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { box.hidden = true; } });
      input.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 180));
    });
  }

  // ------------------------------------------------------------------ categorias
  async function viewCategories() {
    loading();
    const cats = await loadCategories();
    const counts = await api('/categories');
    app.innerHTML = `
      <h1 class="page-title">Categorias</h1>
      <p class="page-sub">Explore receitas por tipo de prato, ocasião ou objetivo.</p>
      <div class="cat-grid">${counts.map(catCard).join('')}</div>`;
    return cats;
  }

  async function viewCategory([, slug], _params, token) {
    loading();
    const cats = await loadCategories();
    const cat = cats.find((c) => c.slug === slug);
    if (!cat) throw new Error('Categoria não encontrada.');
    const data = await api(`/recipes?category=${encodeURIComponent(slug)}&sort=rating`);
    if (token !== renderToken) return;
    app.innerHTML = `
      <p class="crumb"><a href="#/categorias">Categorias</a> / ${esc(cat.name)}</p>
      <h1 class="page-title">${cat.emoji} ${esc(cat.name)}</h1>
      <p class="page-sub">${data.total} receita${data.total === 1 ? '' : 's'} nesta categoria</p>
      ${data.results.length
        ? `<div class="grid">${data.results.map(recipeCard).join('')}</div>`
        : emptyState('🍽️', 'Nenhuma receita ainda', 'Em breve esta categoria terá novas receitas.', '<p style="margin-top:14px"><a class="btn btn-primary" href="#/nova-receita">Cadastrar uma receita</a></p>')}`;
  }

  // ------------------------------------------------------------------ pesquisa
  async function viewSearch(_p, params, token) {
    const filters = {
      q: params.get('q') || '',
      category: params.get('category') || '',
      maxTime: params.get('maxTime') || '',
      difficulty: params.get('difficulty') || '',
      ingredient: params.get('ingredient') || '',
      pantry: params.get('pantry') || '',
      strict: params.get('strict') === '1',
      sort: params.get('sort') || 'relevance',
    };
    const cats = await loadCategories();
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v === '' || v === false) continue;
      qs.set(k, v === true ? '1' : v);
    }
    const hasQuery = [...qs.keys()].some((k) => k !== 'sort');

    app.innerHTML = `
      <h1 class="page-title">Pesquisar receitas</h1>
      <p class="page-sub">Busque por nome, ingrediente, tipo de comida ou tempo de preparo.</p>
      <form class="filters" data-form="search-filters">
        <div class="search-wrap">
          <div class="search-box" style="box-shadow:none;border:1.5px solid var(--line)">
            <span class="icon" aria-hidden="true">🔎</span>
            <input name="q" type="search" autocomplete="off" value="${esc(filters.q)}" placeholder="O que você quer cozinhar hoje?" data-suggest="page" aria-label="Pesquisar">
            <button type="submit">Pesquisar</button>
          </div>
          <div class="suggest" id="suggest-page" hidden></div>
        </div>
        <div class="filter-grid">
          <div class="field" style="margin:0"><label for="f-cat">Categoria</label>
            <select id="f-cat" name="category" class="select"><option value="">Todas</option>
              ${cats.map((c) => `<option value="${esc(c.slug)}" ${c.slug === filters.category ? 'selected' : ''}>${esc(c.emoji)} ${esc(c.name)}</option>`).join('')}
            </select></div>
          <div class="field" style="margin:0"><label for="f-time">Tempo total</label>
            <select id="f-time" name="maxTime" class="select">
              <option value="">Qualquer tempo</option>
              ${[15, 30, 60, 120].map((t) => `<option value="${t}" ${String(t) === filters.maxTime ? 'selected' : ''}>Até ${t} min</option>`).join('')}
            </select></div>
          <div class="field" style="margin:0"><label for="f-diff">Dificuldade</label>
            <select id="f-diff" name="difficulty" class="select">
              <option value="">Qualquer</option>
              <option value="facil" ${filters.difficulty === 'facil' ? 'selected' : ''}>Fácil</option>
              <option value="medio" ${filters.difficulty === 'medio' ? 'selected' : ''}>Médio</option>
              <option value="dificil" ${filters.difficulty === 'dificil' ? 'selected' : ''}>Difícil</option>
            </select></div>
          <div class="field" style="margin:0"><label for="f-sort">Ordenar por</label>
            <select id="f-sort" name="sort" class="select">
              <option value="relevance" ${filters.sort === 'relevance' ? 'selected' : ''}>Relevância</option>
              <option value="rating" ${filters.sort === 'rating' ? 'selected' : ''}>Melhor avaliadas</option>
              <option value="popular" ${filters.sort === 'popular' ? 'selected' : ''}>Mais populares</option>
              <option value="time" ${filters.sort === 'time' ? 'selected' : ''}>Mais rápidas</option>
              <option value="recent" ${filters.sort === 'recent' ? 'selected' : ''}>Mais recentes</option>
            </select></div>
        </div>
        <div class="field" style="margin:0"><label for="f-ing">Contém o ingrediente</label>
          <input id="f-ing" name="ingredient" class="input" value="${esc(filters.ingredient)}" placeholder="Ex.: frango, chocolate, banana"></div>
        <details class="pantry-box" ${filters.pantry || params.get('open') === 'pantry' ? 'open' : ''}>
          <summary>Tenho estes ingredientes em casa</summary>
          <div class="body">
            <div class="field" style="margin:0"><label for="f-pantry">Ingredientes disponíveis (separados por vírgula)</label>
              <input id="f-pantry" name="pantry" class="input" value="${esc(filters.pantry)}" placeholder="Ex.: ovos, farinha, leite, banana"></div>
            <label class="check"><input type="checkbox" name="strict" ${filters.strict ? 'checked' : ''}> Mostrar só receitas que consigo fazer agora</label>
          </div>
        </details>
        <div class="action-bar" style="margin:0">
          <button class="btn btn-primary" type="submit">Aplicar filtros</button>
          <button class="btn" type="button" data-action="clear-search">Limpar</button>
          <button class="btn" type="button" data-action="surprise">🎲 Surpreenda-me</button>
        </div>
      </form>
      <div id="results"><div class="loading"><span class="spinner"></span> Buscando…</div></div>`;
    bindSuggest();

    const data = await api(`/recipes?${qs.toString()}`);
    if (token !== renderToken) return;
    const label = hasQuery ? `${data.total} resultado${data.total === 1 ? '' : 's'} encontrado${data.total === 1 ? '' : 's'}` : `${data.total} receitas no SABOR+`;
    $('#results').innerHTML = data.results.length
      ? `<p class="results-count">${label}</p><div class="grid">${data.results.map(recipeCard).join('')}</div>`
      : emptyState('🥄', 'Nenhuma receita encontrada', 'Tente outro termo ou ajuste os filtros. Use a opção "Tenho estes ingredientes" para ver o que dá para fazer.');
  }

  function buildSearchFromForm(form) {
    const fd = new FormData(form);
    const qs = new URLSearchParams();
    for (const key of ['q', 'category', 'maxTime', 'difficulty', 'ingredient', 'pantry', 'sort']) {
      const v = String(fd.get(key) || '').trim();
      if (v && !(key === 'sort' && v === 'relevance')) qs.set(key, v);
    }
    if (fd.get('strict') && qs.get('pantry')) qs.set('strict', '1');
    return qs.toString();
  }

  // ------------------------------------------------------------------ receita (detalhe)
  async function viewRecipe([, idStr], _params, token) {
    loading();
    const r = await api(`/recipes/${Number(idStr)}`);
    if (token !== renderToken) return;
    const mine = state.user && (state.user.id === r.createdBy || state.user.role === 'admin');
    const isOwner = state.user && state.user.id === r.createdBy;
    let servings = r.servings;
    app.innerHTML = `
      <p class="crumb"><a href="#/">Início</a> / ${r.category ? `<a href="#/categoria/${esc(r.category.slug)}">${esc(r.category.name)}</a> / ` : ''}${esc(r.title)}</p>
      <div class="recipe-hero"><img src="${esc(r.image)}" alt="${esc(r.title)}"></div>

      <div class="recipe-layout">
        <div>
          <span class="tag">${esc(r.category?.emoji || '')} ${esc(r.category?.name || 'Receita')}</span>
          <h1 class="recipe-title">${esc(r.title)}</h1>
          <p class="recipe-desc">${esc(r.description)}</p>
          <div class="rating-summary" style="margin-bottom:6px">
            ${stars(r.rating.average, r.rating.count)}
            <span class="hint">${r.rating.count ? `${r.rating.average.toFixed(1)} · ${r.rating.count} avaliação${r.rating.count === 1 ? '' : 'ões'}` : ''}</span>
            <span class="hint">· por ${esc(r.author)}</span>
          </div>

          <div class="info-grid">
            <div class="info"><b>${r.prepMinutes} min</b><span>Preparo</span></div>
            <div class="info"><b>${r.cookMinutes} min</b><span>Cozimento</span></div>
            <div class="info"><b>${r.totalMinutes} min</b><span>Total</span></div>
            <div class="info"><b>${esc(r.difficultyLabel)}</b><span>Dificuldade</span></div>
          </div>

          <div class="action-bar">
            <button class="btn ${r.isFavorite ? 'btn-green' : 'btn-primary'}" data-action="fav-toggle" data-id="${r.id}" data-on="${r.isFavorite ? 1 : 0}">
              ${r.isFavorite ? '♥ Salva nos favoritos' : '♡ Salvar nos favoritos'}
            </button>
            <button class="btn" data-action="share" data-id="${r.id}" data-title="${esc(r.title)}">↗ Compartilhar</button>
            <a class="btn" href="#/preparo/${r.id}">👩‍🍳 Modo de preparo</a>
            <button class="btn" data-action="to-shopping" data-id="${r.id}">🛒 Lista de compras</button>
            <button class="btn" data-action="to-planner" data-id="${r.id}">📅 Planejar</button>
            ${mine ? `<a class="btn" href="#/editar/${r.id}">✏️ Editar</a><button class="btn btn-danger" data-action="delete-recipe" data-id="${r.id}">Excluir</button>` : ''}
          </div>

          <div class="panel">
            <h2>Ingredientes
              <span class="servings-ctl" aria-label="Ajustar porções">
                <button type="button" data-action="serv-minus" aria-label="Diminuir porções">−</button>
                <span id="servLabel">${servings} porç${servings === 1 ? 'ão' : 'ões'}</span>
                <button type="button" data-action="serv-plus" aria-label="Aumentar porções">+</button>
              </span>
            </h2>
            <ul class="ingredients" id="ingredientList"></ul>
            <p class="hint" style="margin-top:10px">Toque em um ingrediente para marcá-lo enquanto cozinha.</p>
          </div>

          <div class="panel">
            <h2>Modo de preparo</h2>
            <ol class="steps">
              ${r.steps.map((s, i) => `<li><span class="num">${i + 1}</span><p>${esc(s)}</p></li>`).join('')}
            </ol>
          </div>
        </div>

        <aside>
          ${r.nutrition ? `
          <div class="panel">
            <h2>Informações nutricionais</h2>
            <p class="hint" style="margin:-6px 0 10px">Valores aproximados por porção.</p>
            <table class="nutrition">
              ${r.nutrition.kcal != null ? `<tr><td>Calorias</td><td>${r.nutrition.kcal} kcal</td></tr>` : ''}
              ${r.nutrition.protein != null ? `<tr><td>Proteínas</td><td>${r.nutrition.protein} g</td></tr>` : ''}
              ${r.nutrition.carbs != null ? `<tr><td>Carboidratos</td><td>${r.nutrition.carbs} g</td></tr>` : ''}
              ${r.nutrition.fat != null ? `<tr><td>Gorduras</td><td>${r.nutrition.fat} g</td></tr>` : ''}
            </table>
          </div>` : ''}

          <div class="panel">
            <h2>Sua avaliação</h2>
            ${state.user ? `
              <div class="stars-input" id="starsInput" data-id="${r.id}">
                ${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-star="${n}" class="${r.myRating && n <= r.myRating ? 'on' : ''}" aria-label="${n} estrela${n > 1 ? 's' : ''}">★</button>`).join('')}
              </div>
              <p class="hint" style="margin-top:6px">${r.myRating ? `Você avaliou com ${r.myRating} estrela${r.myRating > 1 ? 's' : ''}.` : 'Toque nas estrelas para avaliar.'}</p>`
              : `<p class="hint">Entre na sua conta para avaliar esta receita.</p>
                 <p style="margin-top:10px"><a class="btn btn-primary btn-sm" href="#/entrar?next=${encodeURIComponent('/receita/' + r.id)}">Entrar</a></p>`}
          </div>

          <div class="panel" id="commentsPanel">
            <h2>Comentários <span class="hint">${r.comments.length}</span></h2>
            ${state.user ? `
              <form data-form="comment" data-id="${r.id}" style="margin-bottom:14px">
                <textarea class="input" name="body" maxlength="500" placeholder="Conte como foi cozinhar esta receita…" required minlength="2"></textarea>
                <div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn btn-primary btn-sm" type="submit">Publicar comentário</button></div>
              </form>` : ''}
            ${r.comments.length ? r.comments.map((c) => `
              <div class="comment">
                <div class="avatar-sm">${c.userAvatar ? `<img src="${esc(c.userAvatar)}" alt="">` : esc(c.userName.charAt(0))}</div>
                <div style="flex:1;min-width:0">
                  <div><span class="who">${esc(c.userName)}</span><span class="when">${fmtDate(c.createdAt)}</span></div>
                  <div class="body">${esc(c.body)}</div>
                  ${state.user && (state.user.id === c.userId || state.user.role === 'admin') ? `<button class="del" data-action="del-comment" data-id="${c.id}">Remover</button>` : ''}
                </div>
              </div>`).join('') : '<p class="hint">Seja o primeiro a comentar.</p>'}
          </div>
        </aside>
      </div>`;

    const state_ = { servings, base: r.servings, ingredients: r.ingredients, checked: new Set() };
    renderIngredients(state_);
    app.dataset.recipe = JSON.stringify({ id: r.id, title: r.title });
    app._recipeState = state_;
    app._recipe = r;
    void isOwner;
  }

  function renderIngredients(s) {
    const factor = s.servings / s.base;
    $('#ingredientList').innerHTML = s.ingredients.map((i) => {
      const qty = i.quantity === null ? '' : fmtQty(i.quantity * factor);
      const done = s.checked.has(i.id);
      return `<li><label class="check-row ${done ? 'done' : ''}" data-check="${i.id}">
        <input type="checkbox" hidden ${done ? 'checked' : ''}>
        <span class="qty">${esc(qty)} ${esc(i.unit)}</span><span>${esc(i.name)}</span>
      </label></li>`;
    }).join('');
    $('#servLabel').textContent = `${s.servings} porç${s.servings === 1 ? 'ão' : 'ões'}`;
  }

  // ------------------------------------------------------------------ modo preparo
  async function viewCookMode([, idStr], _params, token) {
    loading();
    const r = await api(`/recipes/${Number(idStr)}`);
    if (token !== renderToken) return;
    let idx = 0;
    let big = false;
    const total = r.steps.length;
    const wrap = document.createElement('div');
    wrap.className = 'cook-mode';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', `Modo de preparo: ${r.title}`);
    const draw = () => {
      wrap.innerHTML = `
        <div class="cook-top">
          <h2>${esc(r.title)}</h2>
          <div style="display:flex;gap:8px">
            <button class="btn btn-sm" data-cook="size" aria-label="Alternar tamanho do texto">${big ? 'A' : 'A+'}</button>
            <a class="btn btn-sm" href="#/receita/${r.id}" data-cook="close">✕ Sair</a>
          </div>
        </div>
        <div class="progress"><i style="width:${((idx + 1) / total) * 100}%"></i></div>
        <div class="cook-body">
          <span class="cook-step-no">Passo ${idx + 1} de ${total}</span>
          <p class="cook-text" style="font-size:${big ? 'clamp(1.8rem,5vw,2.8rem)' : ''}">${esc(r.steps[idx])}</p>
          <details class="cook-ingr"><summary>Ingredientes</summary>
            <ul>${r.ingredients.map((i) => `<li>${i.quantity !== null ? esc(fmtQty(i.quantity)) : ''} ${esc(i.unit)} ${esc(i.name)}</li>`).join('')}</ul>
          </details>
        </div>
        <div class="cook-nav">
          <button class="btn" data-cook="prev" ${idx === 0 ? 'disabled' : ''}>← Anterior</button>
          ${idx < total - 1
            ? '<button class="btn btn-primary" data-cook="next">Próximo →</button>'
            : `<a class="btn btn-green" href="#/receita/${r.id}" data-cook="done">Concluir 🎉</a>`}
        </div>`;
    };
    const onKey = (e) => {
      if (!wrap.isConnected) { document.removeEventListener('keydown', onKey); return; }
      if (e.key === 'ArrowRight' && idx < total - 1) { idx++; draw(); }
      if (e.key === 'ArrowLeft' && idx > 0) { idx--; draw(); }
      if (e.key === 'Escape') location.hash = `#/receita/${r.id}`;
    };
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cook]');
      if (!b) return;
      const act = b.dataset.cook;
      if (act === 'next') { idx++; draw(); }
      if (act === 'prev') { idx--; draw(); }
      if (act === 'size') { big = !big; draw(); }
      if (act === 'close' || act === 'done') { e.preventDefault(); wrap.remove(); document.removeEventListener('keydown', onKey); location.hash = `#/receita/${r.id}`; }
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    draw();
    app.innerHTML = '';
  }

  // ------------------------------------------------------------------ favoritos
  async function viewFavorites(_p, params, token) {
    if (!state.user) {
      app.innerHTML = emptyState('♥', 'Suas receitas favoritas', 'Entre na sua conta para salvar receitas e organizá-las aqui.',
        '<p style="margin-top:14px"><a class="btn btn-primary" href="#/entrar?next=%2Ffavoritos">Entrar ou criar conta</a></p>');
      return;
    }
    loading();
    const data = await api('/favorites');
    if (token !== renderToken) return;
    const active = params.get('col') || 'Todas';
    const items = active === 'Todas' ? data.items : data.items.filter((i) => i.collection === active);
    const cols = ['Todas', ...data.collections];
    app.innerHTML = `
      <h1 class="page-title">Meus favoritos</h1>
      <p class="page-sub">${data.items.length} receita${data.items.length === 1 ? '' : 's'} salva${data.items.length === 1 ? '' : 's'}. Organize em coleções.</p>
      <div class="chips-scroll" style="margin-bottom:18px">
        ${cols.map((c) => `<button class="chip ${c === active ? 'on' : ''}" data-action="fav-col" data-col="${esc(c)}">${esc(c)}</button>`).join('')}
        <button class="chip" data-action="fav-new-col">＋ Nova coleção</button>
      </div>
      ${items.length ? `<div class="grid">${items.map((i) => `
        <div class="card">
          <a href="#/receita/${i.recipe.id}"><div class="card-img"><img loading="lazy" src="${esc(i.recipe.image)}" alt="${esc(i.recipe.title)}"></div></a>
          <div class="card-body">
            <a href="#/receita/${i.recipe.id}"><h3>${esc(i.recipe.title)}</h3></a>
            <div class="meta"><span>⏱ ${i.recipe.totalMinutes} min</span><span>${esc(i.recipe.difficultyLabel)}</span></div>
            <div style="display:flex;gap:8px;align-items:center;margin-top:auto;flex-wrap:wrap">
              <select class="select" style="padding:8px 10px;font-size:.88rem;flex:1;min-width:120px" data-change="fav-move" data-id="${i.recipe.id}" aria-label="Coleção">
                ${data.collections.map((c) => `<option ${c === i.collection ? 'selected' : ''}>${esc(c)}</option>`).join('')}
                <option value="__new__">＋ Nova coleção…</option>
              </select>
              <button class="btn btn-sm btn-danger" data-action="fav-remove" data-id="${i.recipe.id}">Remover</button>
            </div>
          </div>
        </div>`).join('')}</div>`
        : emptyState('♡', 'Nada por aqui ainda', 'Toque em "Salvar nos favoritos" em qualquer receita para guardá-la aqui.',
          '<p style="margin-top:14px"><a class="btn btn-primary" href="#/">Explorar receitas</a></p>')}`;
  }

  // ------------------------------------------------------------------ planejador semanal
  const DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  const MEALS = [['cafe', 'Café da manhã'], ['almoco', 'Almoço'], ['jantar', 'Jantar'], ['lanche', 'Lanche']];

  async function viewPlanner(_p, _params, token) {
    if (!requireLogin('Entre para organizar sua semana.')) return;
    loading();
    const plan = await api('/plan');
    if (token !== renderToken) return;
    const get = (d, m) => plan.find((p) => p.day === d && p.meal === m);
    app.innerHTML = `
      <h1 class="page-title">Planejador semanal</h1>
      <p class="page-sub">Monte o cardápio da semana e gere a lista de compras automaticamente.</p>
      <div class="action-bar">
        <button class="btn btn-primary" data-action="plan-shopping">🛒 Gerar lista de compras da semana</button>
        <a class="btn" href="#/lista">Ver minha lista</a>
      </div>
      <div class="week">
        ${DAYS.map((dn, d) => `
          <div class="day"><h3>${dn}</h3>
            ${MEALS.map(([m, ml]) => {
              const p = get(d, m);
              return `<button class="slot ${p ? 'filled' : ''}" data-action="plan-slot" data-day="${d}" data-meal="${m}">
                <small>${ml}</small>${p ? esc(p.recipe.title) : '+ Escolher receita'}
              </button>`;
            }).join('')}
          </div>`).join('')}
      </div>`;
  }

  // ------------------------------------------------------------------ lista de compras
  async function viewShopping(_p, _params, token) {
    if (!requireLogin('Entre para usar sua lista de compras.')) return;
    loading();
    const items = await api('/shopping');
    if (token !== renderToken) return;
    const done = items.filter((i) => i.checked).length;
    app.innerHTML = `
      <h1 class="page-title">Lista de compras</h1>
      <p class="page-sub">${items.length} item${items.length === 1 ? '' : 'ns'} · ${done} marcado${done === 1 ? '' : 's'}</p>
      <form class="add-row" data-form="shop-add">
        <input class="input" name="name" placeholder="Adicionar item (ex.: 2 cebolas)" aria-label="Novo item" required>
        <button class="btn btn-primary" type="submit">Adicionar</button>
      </form>
      ${items.length ? `<div class="list">${items.map((i) => `
        <div class="list-item ${i.checked ? 'done' : ''}">
          <button class="check-circle" data-action="shop-toggle" data-id="${i.id}" data-on="${i.checked ? 1 : 0}" aria-label="Marcar item"></button>
          <div class="main"><b>${esc(i.name)}</b>${i.quantity !== null || i.unit ? `<small>${i.quantity !== null ? esc(fmtQty(i.quantity)) : ''} ${esc(i.unit)}</small>` : ''}</div>
          <button class="x" data-action="shop-remove" data-id="${i.id}" aria-label="Remover">✕</button>
        </div>`).join('')}</div>
        <div class="action-bar" style="margin-top:14px">
          <button class="btn" data-action="shop-clear-checked">Limpar marcados</button>
          <button class="btn btn-danger" data-action="shop-clear-all">Esvaziar lista</button>
        </div>`
        : emptyState('🛒', 'Sua lista está vazia', 'Adicione itens ou toque em "Lista de compras" em uma receita.', '<p style="margin-top:14px"><a class="btn btn-primary" href="#/pesquisar">Encontrar receitas</a></p>')}`;
  }

  // ------------------------------------------------------------------ ferramentas e conversor
  const UNITS = {
    ml: { label: 'mililitros (ml)', kind: 'vol', factor: 1 },
    l: { label: 'litros (l)', kind: 'vol', factor: 1000 },
    xic: { label: 'xícaras (xíc.)', kind: 'vol', factor: 240 },
    csp: { label: 'colheres de sopa', kind: 'vol', factor: 15 },
    csc: { label: 'colheres de chá', kind: 'vol', factor: 5 },
    copo: { label: 'copos (200 ml)', kind: 'vol', factor: 200 },
    g: { label: 'gramas (g)', kind: 'mass', factor: 1 },
    kg: { label: 'quilogramas (kg)', kind: 'mass', factor: 1000 },
  };
  // Densidade aproximada (g por ml) para converter entre volume e massa.
  const INGREDIENTS = {
    agua: { label: 'Água / caldos / leite (1 g ≈ 1 ml)', density: 1 },
    acucar: { label: 'Açúcar cristal', density: 0.85 },
    farinha: { label: 'Farinha de trigo', density: 0.5 },
    oleo: { label: 'Óleo', density: 0.92 },
    manteiga: { label: 'Manteiga', density: 0.91 },
    cacau: { label: 'Chocolate / cacau em pó', density: 0.5 },
  };

  function convert(value, from, to, ingKey) {
    const f = UNITS[from];
    const t = UNITS[to];
    if (!f || !t) return null;
    const density = INGREDIENTS[ingKey]?.density ?? 1;
    let grams;
    if (f.kind === 'vol') grams = value * f.factor * density;
    else grams = value * f.factor;
    if (t.kind === 'vol') return grams / density / t.factor;
    return grams / t.factor;
  }

  function viewTools() {
    const unitOptions = (sel) => Object.entries(UNITS).map(([k, u]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${u.label}</option>`).join('');
    const ingOptions = Object.entries(INGREDIENTS).map(([k, i]) => `<option value="${k}">${esc(i.label)}</option>`).join('');
    app.innerHTML = `
      <h1 class="page-title">Ferramentas</h1>
      <p class="page-sub">Organize sua cozinha com as ferramentas do SABOR+.</p>
      <div class="tools-grid">
        <a class="tool-card" href="#/planejador"><span class="ico">📅</span><h3>Planejador semanal</h3><p>Monte o cardápio de café, almoço, jantar e lanche da semana.</p></a>
        <a class="tool-card" href="#/lista"><span class="ico">🛒</span><h3>Lista de compras</h3><p>Ingredientes das receitas que você escolheu, prontos para levar ao mercado.</p></a>
        <a class="tool-card" href="#/pesquisar?open=pantry&sort=rating"><span class="ico">🥕</span><h3>O que posso cozinhar?</h3><p>Diga o que tem em casa e veja as receitas possíveis.</p></a>
        <button class="tool-card" data-action="surprise" style="text-align:left;border:0;font:inherit"><span class="ico">🎲</span><h3>Receita surpresa</h3><p>Não sabe o que fazer? Deixe o SABOR+ escolher por você.</p></button>
      </div>

      <section class="converter" aria-labelledby="conv-title">
        <h2 id="conv-title" style="font-size:1.25rem">Conversor de medidas</h2>
        <p class="hint" style="margin:4px 0 16px">Converta xícaras, colheres, gramas e mililitros. Para ingredientes sólidos ou gordurosos, escolha o tipo para uma conversão mais precisa.</p>
        <form data-form="convert" id="convForm">
          <div class="conv-row">
            <div class="field" style="margin:0"><label for="c-val">Valor</label><input id="c-val" name="value" class="input" type="number" min="0" step="any" value="1"></div>
            <div class="field" style="margin:0"><label for="c-from">De</label><select id="c-from" name="from" class="select">${unitOptions('xic')}</select></div>
            <div class="field" style="margin:0"><label for="c-to">Para</label><select id="c-to" name="to" class="select">${unitOptions('ml')}</select></div>
          </div>
          <div class="field" style="margin-top:14px"><label for="c-ing">Ingrediente</label><select id="c-ing" name="ing" class="select">${ingOptions}</select></div>
        </form>
        <div class="conv-result" id="convResult" aria-live="polite"></div>
        <table class="conv-table" id="convTable"><thead><tr><th>Medida</th><th>Equivale a</th></tr></thead><tbody></tbody></table>
        <p class="hint" style="margin-top:10px">Valores aproximados: 1 xícara = 240 ml; 1 colher de sopa = 15 ml; 1 colher de chá = 5 ml.</p>
      </section>`;
    updateConverter();
  }

  function updateConverter() {
    const form = $('#convForm');
    if (!form) return;
    const fd = new FormData(form);
    const value = Number(String(fd.get('value')).replace(',', '.'));
    const from = fd.get('from');
    const to = fd.get('to');
    const ing = fd.get('ing');
    const out = Number.isFinite(value) ? convert(value, from, to, ing) : null;
    $('#convResult').innerHTML = out === null
      ? '<span class="hint">Informe um valor válido.</span>'
      : `<span class="hint">${esc(fmtQty(value))} ${esc(UNITS[from].label)} equivalem a</span><br><b>${esc(fmtQty(Math.round(out * 10) / 10))} ${esc(UNITS[to].label)}</b>`;
    const sample = [1, 2, 3, 4];
    $('#convTable tbody').innerHTML = sample.map((n) => {
      const v = convert(n, from, to, ing);
      return `<tr><td>${n} ${esc(UNITS[from].label.split(' ')[0])}</td><td>${v === null ? '—' : esc(fmtQty(Math.round(v * 10) / 10))} ${esc(UNITS[to].label.split(' ')[0])}</td></tr>`;
    }).join('');
  }

  // ------------------------------------------------------------------ autenticação
  async function viewAuth([route], params) {
    if (state.user) { location.hash = '#/perfil'; return; }
    const next = params.get('next') || '/';
    const tab = route === 'cadastro' ? 'register' : 'login';
    app.innerHTML = `
      <div class="auth-card">
        <h1>Bem-vindo ao SABOR+</h1>
        <p class="hint">Salve receitas, crie as suas e organize sua cozinha.</p>
        <div class="tabs" role="tablist">
          <button role="tab" data-tab="login" class="${tab === 'login' ? 'on' : ''}">Entrar</button>
          <button role="tab" data-tab="register" class="${tab === 'register' ? 'on' : ''}">Criar conta</button>
        </div>
        <form data-form="login" data-next="${esc(next)}" ${tab === 'register' ? 'hidden' : ''}>
          <div class="field"><label for="l-email">E-mail</label><input id="l-email" class="input" name="email" type="email" required autocomplete="email"></div>
          <div class="field"><label for="l-pass">Senha</label><input id="l-pass" class="input" name="password" type="password" required autocomplete="current-password"></div>
          <p class="error" data-error></p>
          <button class="btn btn-primary btn-block" type="submit">Entrar</button>
        </form>
        <form data-form="register" data-next="${esc(next)}" ${tab === 'login' ? 'hidden' : ''}>
          <div class="field"><label for="r-name">Nome</label><input id="r-name" class="input" name="name" required minlength="2" autocomplete="name"></div>
          <div class="field"><label for="r-email">E-mail</label><input id="r-email" class="input" name="email" type="email" required autocomplete="email"></div>
          <div class="field"><label for="r-pass">Senha (mínimo 6 caracteres)</label><input id="r-pass" class="input" name="password" type="password" required minlength="6" autocomplete="new-password"></div>
          <p class="error" data-error></p>
          <button class="btn btn-primary btn-block" type="submit">Criar conta</button>
        </form>
      </div>`;
    $$('[data-tab]').forEach((b) => b.addEventListener('click', () => {
      const t = b.dataset.tab;
      $$('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
      $('form[data-form="login"]').hidden = t !== 'login';
      $('form[data-form="register"]').hidden = t !== 'register';
    }));
  }

  // ------------------------------------------------------------------ perfil
  async function viewProfile(_p, _params, token) {
    if (!state.user) {
      app.innerHTML = `<div class="auth-card" style="text-align:center">
        <div style="font-size:3rem">👤</div><h1 style="margin:10px 0">Seu perfil</h1>
        <p class="hint" style="margin-bottom:18px">Entre para ver seu histórico, suas receitas e preferências.</p>
        <a class="btn btn-primary btn-block" href="#/entrar?next=%2Fperfil">Entrar</a>
        <p style="margin-top:12px"><a class="btn btn-block" href="#/cadastro">Criar conta</a></p></div>`;
      return;
    }
    loading();
    const [{ user, stats }, history] = await Promise.all([api('/me'), api('/history')]);
    if (token !== renderToken) return;
    const prefs = user.preferences || {};
    app.innerHTML = `
      <h1 class="page-title">Meu perfil</h1>
      <div class="two-col">
        <div>
          <div class="panel">
            <div class="profile-head">
              <label class="avatar-lg" title="Trocar foto" aria-label="Trocar foto de perfil">
                ${user.avatar ? `<img src="${esc(user.avatar)}" alt="">` : esc(user.name.charAt(0).toUpperCase())}
                <input type="file" accept="image/*" hidden data-change="avatar">
              </label>
              <div><h2 style="font-size:1.4rem">${esc(user.name)}</h2><p class="hint">${esc(user.email)}</p>
                ${user.role === 'admin' ? '<span class="pill dark">Administrador</span>' : ''}</div>
            </div>
            <div class="stats">
              <div><b>${stats.favorites}</b><span>Favoritas</span></div>
              <div><b>${stats.recipes}</b><span>Receitas</span></div>
              <div><b>${stats.comments}</b><span>Comentários</span></div>
            </div>
          </div>

          <div class="panel">
            <h2>Dados e preferências</h2>
            <form data-form="profile">
              <div class="field"><label for="p-name">Nome</label><input id="p-name" class="input" name="name" value="${esc(user.name)}" required minlength="2"></div>
              <div class="field"><label for="p-units">Medidas preferidas no conversor</label>
                <select id="p-units" name="units" class="select">
                  <option value="ml" ${prefs.units === 'ml' ? 'selected' : ''}>Mililitros e gramas</option>
                  <option value="xic" ${prefs.units === 'xic' ? 'selected' : ''}>Xícaras e colheres</option>
                </select></div>
              <div class="field"><label class="label">Restrições alimentares</label>
                <div class="chips">
                  ${['Vegetariano', 'Vegano', 'Sem glúten', 'Sem lactose'].map((d) => `
                    <label class="chip ${(prefs.dietary || []).includes(d) ? 'on' : ''}" style="cursor:pointer">
                      <input type="checkbox" name="dietary" value="${d}" hidden ${(prefs.dietary || []).includes(d) ? 'checked' : ''}> ${d}</label>`).join('')}
                </div>
                <span class="hint">Usadas para destacar receitas compatíveis na sua página inicial.</span></div>
              <p class="error" data-error></p>
              <button class="btn btn-primary" type="submit">Salvar alterações</button>
            </form>
          </div>

          <div class="panel">
            <h2>Alterar senha</h2>
            <form data-form="password">
              <div class="field"><label for="pw-cur">Senha atual</label><input id="pw-cur" class="input" name="current" type="password" required></div>
              <div class="field"><label for="pw-new">Nova senha (mínimo 6 caracteres)</label><input id="pw-new" class="input" name="next" type="password" required minlength="6"></div>
              <p class="error" data-error></p>
              <button class="btn" type="submit">Atualizar senha</button>
            </form>
          </div>
        </div>

        <div>
          <div class="menu-list" style="margin-bottom:18px">
            <a href="#/nova-receita"><span>➕</span> Criar minha receita</a>
            <a href="#/minhas-receitas" data-action="my-recipes"><span>📚</span> Minhas receitas</a>
            <a href="#/favoritos"><span>♥</span> Favoritos<span>${stats.favorites}</span></a>
            <a href="#/planejador"><span>📅</span> Planejador semanal</a>
            <a href="#/lista"><span>🛒</span> Lista de compras</a>
            <a href="#/ferramentas"><span>🧮</span> Ferramentas e conversor</a>
            ${user.role === 'admin' ? '<a href="#/admin"><span>🛠️</span> Painel administrativo<span>→</span></a>' : ''}
          </div>

          <div class="panel">
            <h2>Histórico <button class="btn btn-sm" data-action="clear-history" ${history.length ? '' : 'disabled'}>Limpar</button></h2>
            ${history.length ? history.slice(0, 12).map((h) => `
              <div class="hist-item">
                <img src="${esc(h.recipe.image)}" alt="">
                <div><a href="#/receita/${h.recipe.id}">${esc(h.recipe.title)}</a><small>${fmtDate(h.viewedAt)}</small></div>
              </div>`).join('') : '<p class="hint">As receitas que você abrir aparecem aqui.</p>'}
          </div>

          <div class="panel">
            <button class="btn btn-block" data-action="logout">Sair da conta</button>
          </div>
        </div>
      </div>
      <div id="myRecipesBox"></div>`;
  }

  async function showMyRecipes() {
    const list = await api('/me/recipes');
    const box = $('#myRecipesBox');
    if (!box) return;
    box.innerHTML = `<div class="section"><div class="section-head"><div><h2>Minhas receitas</h2><p>Receitas que você cadastrou</p></div></div>
      ${list.length ? `<div class="grid">${list.map((r) => `<div>${recipeCard(r)}<div style="display:flex;gap:8px;margin-top:8px"><a class="btn btn-sm" href="#/editar/${r.id}">Editar</a><button class="btn btn-sm btn-danger" data-action="delete-recipe" data-id="${r.id}">Excluir</button></div></div>`).join('')}</div>`
        : emptyState('🥣', 'Você ainda não cadastrou receitas', 'Compartilhe seu prato favorito com a comunidade.', '<p style="margin-top:14px"><a class="btn btn-primary" href="#/nova-receita">Criar receita</a></p>')}</div>`;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ------------------------------------------------------------------ criar / editar receita
  async function viewRecipeForm([route, idStr], _params, token) {
    if (!requireLogin('Entre para cadastrar uma receita.')) return;
    const cats = await loadCategories();
    let recipe = null;
    if (route === 'editar') {
      recipe = await api(`/recipes/${Number(idStr)}`);
      if (token !== renderToken) return;
      const mine = state.user.id === recipe.createdBy || state.user.role === 'admin';
      if (!mine) throw new Error('Você não pode editar esta receita.');
    }
    const ings = recipe ? recipe.ingredients : [{ quantity: null, unit: 'g', name: '' }, { quantity: null, unit: 'xícara', name: '' }];
    const steps = recipe ? recipe.steps : [''];
    const n = recipe?.nutrition || {};
    app.innerHTML = `
      <p class="crumb"><a href="#/perfil">Perfil</a> / ${recipe ? 'Editar receita' : 'Nova receita'}</p>
      <h1 class="page-title">${recipe ? 'Editar receita' : 'Criar nova receita'}</h1>
      <p class="page-sub">Preencha os detalhes. Quanto mais completa, melhor para quem for cozinhar.</p>
      <form data-form="recipe" data-id="${recipe ? recipe.id : ''}">
        <div class="form-card">
          <h2>Informações básicas</h2>
          <div class="field"><label for="rf-title">Nome da receita</label><input id="rf-title" class="input" name="title" required minlength="3" maxlength="120" value="${esc(recipe?.title || '')}"></div>
          <div class="field"><label for="rf-desc">Descrição</label><textarea id="rf-desc" class="input" name="description" maxlength="1000" placeholder="Conte um pouco sobre o prato…">${esc(recipe?.description || '')}</textarea></div>
          <div class="form-row">
            <div class="field"><label for="rf-cat">Categoria</label><select id="rf-cat" name="categoryId" class="select">
              ${cats.map((c) => `<option value="${c.id}" ${recipe?.category?.slug === c.slug ? 'selected' : ''}>${esc(c.emoji)} ${esc(c.name)}</option>`).join('')}</select></div>
            <div class="field"><label for="rf-diff">Dificuldade</label><select id="rf-diff" name="difficulty" class="select">
              <option value="facil" ${recipe?.difficulty === 'facil' ? 'selected' : ''}>Fácil</option>
              <option value="medio" ${!recipe || recipe.difficulty === 'medio' ? 'selected' : ''}>Médio</option>
              <option value="dificil" ${recipe?.difficulty === 'dificil' ? 'selected' : ''}>Difícil</option></select></div>
            <div class="field"><label for="rf-serv">Porções</label><input id="rf-serv" class="input" name="servings" type="number" min="1" max="100" value="${recipe?.servings || 4}"></div>
            <div class="field"><label for="rf-prep">Preparo (min)</label><input id="rf-prep" class="input" name="prepMinutes" type="number" min="0" value="${recipe?.prepMinutes ?? 15}"></div>
            <div class="field"><label for="rf-cook">Cozimento (min)</label><input id="rf-cook" class="input" name="cookMinutes" type="number" min="0" value="${recipe?.cookMinutes ?? 20}"></div>
          </div>
          <div class="field"><label for="rf-tags">Palavras-chave (separadas por vírgula)</label><input id="rf-tags" class="input" name="tags" value="${esc(recipe?.tags?.join(', ') || '')}" placeholder="Ex.: rápido, família, festa"></div>
          <div class="field"><label class="label">Foto do prato</label>
            <label class="drop" id="dropImg">
              ${recipe?.image ? `<img id="imgPreview" src="${esc(recipe.image)}" alt="">` : '<img id="imgPreview" alt="" hidden>'}
              <span class="hint">Clique para escolher uma foto (JPG, PNG ou WEBP)</span>
              <input type="file" accept="image/*" hidden data-change="recipe-image">
            </label>
            <input type="hidden" name="image" value="">
          </div>
        </div>

        <div class="form-card" style="margin-top:16px">
          <h2>Ingredientes</h2>
          <p class="hint" style="margin:-6px 0 12px">Deixe a quantidade em branco para itens "a gosto".</p>
          <div id="ingList">${ings.map((i, idx) => ingRow(i, idx)).join('')}</div>
          <button type="button" class="btn btn-sm" data-action="add-ing">＋ Adicionar ingrediente</button>
        </div>

        <div class="form-card" style="margin-top:16px">
          <h2>Modo de preparo</h2>
          <div id="stepList">${steps.map((s, idx) => stepRow(s, idx)).join('')}</div>
          <button type="button" class="btn btn-sm" data-action="add-step">＋ Adicionar passo</button>
        </div>

        <div class="form-card" style="margin-top:16px">
          <h2>Informações nutricionais <span class="hint">(opcional, por porção)</span></h2>
          <div class="form-row">
            <div class="field"><label for="nu-kcal">Calorias (kcal)</label><input id="nu-kcal" class="input" name="kcal" type="number" min="0" value="${n.kcal ?? ''}"></div>
            <div class="field"><label for="nu-prot">Proteínas (g)</label><input id="nu-prot" class="input" name="protein" type="number" min="0" value="${n.protein ?? ''}"></div>
            <div class="field"><label for="nu-carb">Carboidratos (g)</label><input id="nu-carb" class="input" name="carbs" type="number" min="0" value="${n.carbs ?? ''}"></div>
            <div class="field"><label for="nu-fat">Gorduras (g)</label><input id="nu-fat" class="input" name="fat" type="number" min="0" value="${n.fat ?? ''}"></div>
          </div>
        </div>

        <p class="error" data-error style="margin-top:12px"></p>
        <div class="sticky-save">
          <a class="btn" href="${recipe ? '#/receita/' + recipe.id : '#/perfil'}">Cancelar</a>
          <button class="btn btn-primary" type="submit">${recipe ? 'Salvar alterações' : 'Publicar receita'}</button>
        </div>
      </form>`;
  }

  function ingRow(i, idx) {
    return `<div class="ing-row" data-ing>
      <input class="input qty-input" name="ing_qty" type="text" inputmode="decimal" placeholder="Qtd." value="${i.quantity ?? ''}" aria-label="Quantidade ${idx + 1}">
      <input class="input unit-input" name="ing_unit" placeholder="Unidade" value="${esc(i.unit || '')}" list="unitList" aria-label="Unidade ${idx + 1}">
      <input class="input name-input" name="ing_name" placeholder="Ingrediente" value="${esc(i.name || '')}" aria-label="Ingrediente ${idx + 1}">
      <button type="button" class="btn btn-icon btn-sm" data-action="rm-ing" aria-label="Remover ingrediente">✕</button>
    </div>`;
  }
  function stepRow(text, idx) {
    return `<div class="step-row" data-step>
      <span class="num">${idx + 1}</span>
      <textarea class="input" name="step" placeholder="Descreva este passo…" style="min-height:70px">${esc(text || '')}</textarea>
      <button type="button" class="btn btn-icon btn-sm" data-action="rm-step" aria-label="Remover passo">✕</button>
    </div>`;
  }

  function collectRecipeForm(form) {
    const fd = new FormData(form);
    const rows = $$('[data-ing]', form);
    const ingredients = rows.map((row) => ({
      quantity: row.querySelector('[name=ing_qty]').value.trim().replace(',', '.') || null,
      unit: row.querySelector('[name=ing_unit]').value,
      name: row.querySelector('[name=ing_name]').value,
    }));
    const steps = $$('[data-step] textarea', form).map((t) => t.value);
    const nut = {};
    for (const k of ['kcal', 'protein', 'carbs', 'fat']) {
      const v = fd.get(k);
      if (v !== null && String(v).trim() !== '') nut[k] = Number(v);
    }
    const imageInput = form.querySelector('input[name=image]');
    return {
      title: fd.get('title'),
      description: fd.get('description'),
      categoryId: Number(fd.get('categoryId')) || null,
      difficulty: fd.get('difficulty'),
      servings: Number(fd.get('servings')),
      prepMinutes: Number(fd.get('prepMinutes')),
      cookMinutes: Number(fd.get('cookMinutes')),
      tags: String(fd.get('tags') || '').split(',').map((t) => t.trim()).filter(Boolean),
      nutrition: Object.keys(nut).length ? nut : null,
      image: imageInput.value || undefined,
      ingredients,
      steps,
    };
  }

  // ------------------------------------------------------------------ painel administrativo
  async function viewAdmin(parts, params, token) {
    if (!requireLogin('Entre como administrador para acessar o painel.')) return;
    if (state.user.role !== 'admin') {
      app.innerHTML = emptyState('🔒', 'Acesso restrito', 'Esta área é exclusiva para administradores.', '<p style="margin-top:14px"><a class="btn" href="#/">Voltar ao início</a></p>');
      return;
    }
    const tab = params.get('tab') || 'overview';
    loading();
    const tabs = [['overview', '📊 Visão geral'], ['recipes', '🍳 Receitas'], ['categories', '🗂️ Categorias'], ['users', '👥 Usuários'], ['comments', '💬 Comentários'], ['ratings', '⭐ Avaliações']];
    const head = `<h1 class="page-title">Painel administrativo</h1>
      <div class="admin-tabs">${tabs.map(([k, l]) => `<a class="chip ${k === tab ? 'on' : ''}" href="#/admin?tab=${k}">${l}</a>`).join('')}</div>`;
    let body = '';
    if (tab === 'overview') {
      const s = await api('/admin/stats');
      if (token !== renderToken) return;
      body = `<div class="kpis">
        <div class="kpi"><b>${s.recipes}</b><span>Receitas</span></div>
        <div class="kpi"><b>${s.users}</b><span>Usuários</span></div>
        <div class="kpi"><b>${s.favorites}</b><span>Favoritos salvos</span></div>
        <div class="kpi"><b>${s.ratings}</b><span>Avaliações</span></div>
        <div class="kpi"><b>${s.comments}</b><span>Comentários</span></div>
        <div class="kpi"><b>${s.hiddenComments}</b><span>Comentários ocultos</span></div>
      </div>
      <div class="action-bar" style="margin-top:20px"><a class="btn btn-primary" href="#/nova-receita">+ Nova receita</a><a class="btn" href="#/admin?tab=comments">Moderar comentários</a></div>`;
    } else if (tab === 'recipes') {
      const data = await api('/recipes?sort=recent&limit=100');
      if (token !== renderToken) return;
      body = `<div class="action-bar"><a class="btn btn-primary" href="#/nova-receita">+ Nova receita</a></div>
        <div class="table-wrap"><table class="data"><thead><tr><th>Receita</th><th>Categoria</th><th>Avaliação</th><th>Visualizações</th><th></th></tr></thead><tbody>
        ${data.results.map((r) => `<tr>
          <td><a href="#/receita/${r.id}"><b>${esc(r.title)}</b></a><div class="hint">${esc(r.author)}</div></td>
          <td>${esc(r.category?.name || '—')}</td>
          <td>${r.rating.count ? `★ ${r.rating.average.toFixed(1)} (${r.rating.count})` : '—'}</td>
          <td>${r.views}</td>
          <td style="white-space:nowrap"><a class="btn btn-sm" href="#/editar/${r.id}">Editar</a> <button class="btn btn-sm btn-danger" data-action="delete-recipe" data-id="${r.id}">Excluir</button></td>
        </tr>`).join('')}
        </tbody></table></div>`;
    } else if (tab === 'categories') {
      const cats = await api('/categories');
      if (token !== renderToken) return;
      body = `<div class="two-col">
        <div class="form-card">
          <h2>Categorias existentes</h2>
          ${cats.map((c) => `
            <form class="cat-edit" data-form="cat-edit" data-id="${c.id}">
              <input class="input" name="emoji" value="${esc(c.emoji)}" maxlength="8" aria-label="Ícone">
              <input class="input" name="name" value="${esc(c.name)}" required aria-label="Nome">
              <input class="input" name="color" type="color" value="${esc(c.color)}" aria-label="Cor" style="padding:4px;height:46px">
              <div style="display:flex;gap:6px">
                <button class="btn btn-sm" type="submit">Salvar</button>
                <button class="btn btn-sm btn-danger" type="button" data-action="cat-delete" data-id="${c.id}" data-count="${c.count}">✕</button>
              </div>
            </form>`).join('')}
        </div>
        <div class="form-card">
          <h2>Nova categoria</h2>
          <form data-form="cat-new">
            <div class="field"><label for="cn-name">Nome</label><input id="cn-name" class="input" name="name" required minlength="2"></div>
            <div class="form-row">
              <div class="field"><label for="cn-emoji">Ícone (emoji)</label><input id="cn-emoji" class="input" name="emoji" value="🍽️" maxlength="8"></div>
              <div class="field"><label for="cn-color">Cor</label><input id="cn-color" class="input" name="color" type="color" value="#F97316" style="padding:4px;height:46px"></div>
            </div>
            <button class="btn btn-primary" type="submit">Criar categoria</button>
          </form>
        </div>
      </div>`;
    } else if (tab === 'users') {
      const users = await api('/admin/users');
      if (token !== renderToken) return;
      body = `<div class="table-wrap"><table class="data"><thead><tr><th>Nome</th><th>E-mail</th><th>Função</th><th>Favoritos</th><th>Receitas</th><th>Cadastro</th><th></th></tr></thead><tbody>
        ${users.map((u) => `<tr>
          <td><b>${esc(u.name)}</b></td><td>${esc(u.email)}</td>
          <td>${u.role === 'admin' ? '<span class="pill dark">Admin</span>' : '<span class="pill">Usuário</span>'}</td>
          <td>${u.favorites}</td><td>${u.recipes}</td><td>${fmtDate(u.createdAt)}</td>
          <td>${u.role === 'admin' ? '' : `<button class="btn btn-sm btn-danger" data-action="user-delete" data-id="${u.id}">Excluir</button>`}</td>
        </tr>`).join('')}
        </tbody></table></div>`;
    } else if (tab === 'comments') {
      const list = await api('/admin/comments');
      if (token !== renderToken) return;
      body = list.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Comentário</th><th>Receita</th><th>Autor</th><th>Status</th><th></th></tr></thead><tbody>
        ${list.map((c) => `<tr>
          <td style="max-width:320px">${esc(c.body)}<div class="hint">${fmtDate(c.createdAt)}</div></td>
          <td><a href="#/receita/${c.recipeId}">${esc(c.recipeTitle)}</a></td>
          <td>${esc(c.userName)}</td>
          <td>${c.hidden ? '<span class="pill warn">Oculto</span>' : '<span class="pill">Visível</span>'}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-sm" data-action="comment-hide" data-id="${c.id}" data-hidden="${c.hidden ? 0 : 1}">${c.hidden ? 'Mostrar' : 'Ocultar'}</button>
            <button class="btn btn-sm btn-danger" data-action="comment-delete" data-id="${c.id}">Excluir</button>
          </td></tr>`).join('')}
        </tbody></table></div>` : emptyState('💬', 'Nenhum comentário', 'Os comentários dos usuários aparecerão aqui para moderação.');
    } else if (tab === 'ratings') {
      const list = await api('/admin/ratings');
      if (token !== renderToken) return;
      body = list.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Avaliação</th><th>Receita</th><th>Usuário</th><th>Data</th><th></th></tr></thead><tbody>
        ${list.map((x) => `<tr>
          <td><span class="stars">${'★'.repeat(x.stars)}${'☆'.repeat(5 - x.stars)}</span></td>
          <td><a href="#/receita/${x.recipeId}">${esc(x.recipeTitle)}</a></td>
          <td>${esc(x.userName)}</td><td>${fmtDate(x.createdAt)}</td>
          <td><button class="btn btn-sm btn-danger" data-action="rating-delete" data-id="${x.id}">Remover</button></td>
        </tr>`).join('')}</tbody></table></div>` : emptyState('⭐', 'Nenhuma avaliação', 'As avaliações enviadas pelos usuários aparecerão aqui.');
    }
    if (token !== renderToken) return;
    app.innerHTML = head + body;
  }

  function viewNotFound() {
    app.innerHTML = emptyState('🥄', 'Página não encontrada', 'O endereço que você acessou não existe.', '<p style="margin-top:14px"><a class="btn btn-primary" href="#/">Voltar ao início</a></p>');
  }

  // ------------------------------------------------------------------ modais: planejador e listas
  async function openPlanPicker(day, meal) {
    const dayName = DAYS[day];
    const mealName = MEALS.find((m) => m[0] === meal)[1];
    openModal(`
      <div class="modal-head"><h3>${esc(mealName)} · ${esc(dayName)}</h3><button class="btn btn-icon btn-sm" data-close-modal aria-label="Fechar">✕</button></div>
      <input class="input" id="pickQ" placeholder="Buscar receita…" autocomplete="off" aria-label="Buscar receita">
      <div id="pickList" style="margin-top:12px;display:grid;gap:8px;max-height:52vh;overflow:auto"></div>
      <div class="action-bar" style="margin-top:12px"><button class="btn" data-plan-clear="${day}|${meal}">Remover desta refeição</button></div>`,
    (modal) => {
      const load = async (q) => {
        const data = await api(`/recipes?q=${encodeURIComponent(q)}&sort=rating&limit=30`);
        $('#pickList', modal).innerHTML = data.results.length ? data.results.map((r) => `
          <button class="list-item" style="border:0;background:#fff;text-align:left;border-radius:14px;box-shadow:var(--shadow);cursor:pointer" data-pick="${r.id}" data-day="${day}" data-meal="${meal}">
            <img class="thumb" src="${esc(r.image)}" alt="">
            <div class="main"><b>${esc(r.title)}</b><small>${r.totalMinutes} min · ${esc(r.difficultyLabel)}</small></div>
          </button>`).join('') : '<p class="hint">Nenhuma receita encontrada.</p>';
      };
      load('');
      let t;
      $('#pickQ', modal).addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => load(e.target.value.trim()), 200); });
    });
  }

  // ------------------------------------------------------------------ ações (delegação de cliques)
  const actions = {
    async surprise() {
      try {
        const { id } = await api('/recipes/random');
        location.hash = `#/receita/${id}`;
        toast('🎲 Que tal esta receita?', 'ok');
      } catch (e) { toast(e.message, 'err'); }
    },

    'clear-search'() { location.hash = '#/pesquisar'; },

    async 'fav-toggle'(el) {
      if (!requireLogin('Entre para salvar receitas nos favoritos.')) return;
      const id = Number(el.dataset.id);
      const on = el.dataset.on === '1';
      try {
        if (on) await api(`/favorites/${id}`, { method: 'DELETE' });
        else await api('/favorites', { method: 'POST', body: { recipeId: id } });
        toast(on ? 'Removida dos favoritos.' : 'Receita salva nos favoritos ♥', 'ok');
        render();
      } catch (e) { toast(e.message, 'err'); }
    },

    async share(el) {
      const url = `${location.origin}/#/receita/${el.dataset.id}`;
      const title = el.dataset.title;
      try {
        if (navigator.share) await navigator.share({ title: `${title} · SABOR+`, text: `Olha essa receita: ${title}`, url });
        else {
          await navigator.clipboard.writeText(url);
          toast('Link copiado para a área de transferência.', 'ok');
        }
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        toast('Não foi possível compartilhar.', 'err');
      }
    },

    async 'to-shopping'(el) {
      if (!requireLogin('Entre para usar a lista de compras.')) return;
      try {
        await api('/shopping/from-recipes', { method: 'POST', body: { recipeIds: [Number(el.dataset.id)] } });
        toast('Ingredientes adicionados à lista de compras 🛒', 'ok');
      } catch (e) { toast(e.message, 'err'); }
    },

    'to-planner'(el) {
      if (!requireLogin('Entre para usar o planejador.')) return;
      const id = Number(el.dataset.id);
      openModal(`
        <div class="modal-head"><h3>Adicionar ao planejador</h3><button class="btn btn-icon btn-sm" data-close-modal aria-label="Fechar">✕</button></div>
        <div class="field"><label for="pd">Dia</label><select id="pd" class="select">${DAYS.map((d, i) => `<option value="${i}">${d}</option>`).join('')}</select></div>
        <div class="field"><label for="pm">Refeição</label><select id="pm" class="select">${MEALS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
        <button class="btn btn-primary btn-block" data-plan-set="${id}">Adicionar ao planejador</button>`);
    },

    async 'plan-set'(el) {
      const modal = el.closest('.modal');
      const day = Number($('#pd', modal).value);
      const meal = $('#pm', modal).value;
      try {
        await api('/plan', { method: 'PUT', body: { day, meal, recipeId: Number(el.dataset.planSet) } });
        closeModal();
        toast('Adicionado ao planejador 📅', 'ok');
      } catch (e) { toast(e.message, 'err'); }
    },

    async 'delete-recipe'(el) {
      if (!confirm('Excluir esta receita? Essa ação não pode ser desfeita.')) return;
      try {
        await api(`/recipes/${el.dataset.id}`, { method: 'DELETE' });
        toast('Receita excluída.', 'ok');
        location.hash = '#/';
      } catch (e) { toast(e.message, 'err'); }
    },

    'serv-minus'() { adjustServings(-1); },
    'serv-plus'() { adjustServings(1); },

    async 'del-comment'(el) {
      if (!confirm('Remover este comentário?')) return;
      try {
        await api(`/comments/${el.dataset.id}`, { method: 'DELETE' });
        toast('Comentário removido.', 'ok');
        render();
      } catch (e) { toast(e.message, 'err'); }
    },

    'fav-col'(el) {
      const params = new URLSearchParams(location.hash.split('?')[1] || '');
      params.set('col', el.dataset.col);
      location.hash = `#/favoritos?${params.toString()}`;
    },

    'fav-new-col'() {
      const name = prompt('Nome da nova coleção (ex.: Jantares especiais):');
      if (name && name.trim()) {
        toast('Escolha a receita e mova para a coleção "' + name.trim() + '" pelo seletor.', 'ok');
        location.hash = `#/favoritos?col=${encodeURIComponent(name.trim())}`;
      }
    },

    async 'fav-remove'(el) {
      try {
        await api(`/favorites/${el.dataset.id}`, { method: 'DELETE' });
        toast('Removida dos favoritos.', 'ok');
        render();
      } catch (e) { toast(e.message, 'err'); }
    },

    'plan-slot'(el) {
      if (!requireLogin('Entre para organizar sua semana.')) return;
      openPlanPicker(Number(el.dataset.day), el.dataset.meal);
    },

    async 'plan-shopping'() {
      try {
        const res = await api('/shopping/from-recipes', { method: 'POST', body: { recipeIds: [], fromPlan: true } });
        toast(`Lista atualizada com ${res.added} ingrediente${res.added === 1 ? '' : 's'} 🛒`, 'ok');
        location.hash = '#/lista';
      } catch (e) { toast(e.message, 'err'); }
    },

    async 'shop-toggle'(el) {
      try {
        await api(`/shopping/${el.dataset.id}`, { method: 'PATCH', body: { checked: el.dataset.on !== '1' } });
        render();
      } catch (e) { toast(e.message, 'err'); }
    },

    async 'shop-remove'(el) {
      try { await api(`/shopping/${el.dataset.id}`, { method: 'DELETE' }); render(); } catch (e) { toast(e.message, 'err'); }
    },

    async 'shop-clear-checked'() {
      try { await api('/shopping?checked=1', { method: 'DELETE' }); toast('Itens marcados removidos.', 'ok'); render(); } catch (e) { toast(e.message, 'err'); }
    },

    async 'shop-clear-all'() {
      if (!confirm('Esvaziar toda a lista de compras?')) return;
      try { await api('/shopping', { method: 'DELETE' }); render(); } catch (e) { toast(e.message, 'err'); }
    },

    async logout() {
      try { await api('/auth/logout', { method: 'POST' }); } catch { /* sessão já encerrada */ }
      setSession(null, null);
      toast('Você saiu da conta.', 'ok');
      location.hash = '#/';
    },

    async 'clear-history'() {
      if (!confirm('Limpar todo o histórico de receitas visualizadas?')) return;
      try { await api('/history', { method: 'DELETE' }); toast('Histórico limpo.', 'ok'); render(); } catch (e) { toast(e.message, 'err'); }
    },

    'my-recipes'(el, ev) {
      ev?.preventDefault();
      showMyRecipes().catch((e) => toast(e.message, 'err'));
    },

    'add-ing'() {
      const list = $('#ingList');
      const idx = list.children.length;
      list.insertAdjacentHTML('beforeend', ingRow({ quantity: null, unit: '', name: '' }, idx));
    },
    'rm-ing'(el) {
      const list = $('#ingList');
      if (list.children.length <= 1) return toast('Mantenha ao menos um ingrediente.', 'err');
      el.closest('[data-ing]').remove();
    },
    'add-step'() {
      const list = $('#stepList');
      list.insertAdjacentHTML('beforeend', stepRow('', list.children.length));
      renumberSteps();
    },
    'rm-step'(el) {
      const list = $('#stepList');
      if (list.children.length <= 1) return toast('Mantenha ao menos um passo.', 'err');
      el.closest('[data-step]').remove();
      renumberSteps();
    },

    async 'user-delete'(el) {
      if (!confirm('Excluir este usuário e todos os seus dados?')) return;
      try { await api(`/admin/users/${el.dataset.id}`, { method: 'DELETE' }); toast('Usuário excluído.', 'ok'); render(); } catch (e) { toast(e.message, 'err'); }
    },
    async 'comment-hide'(el) {
      try {
        await api(`/admin/comments/${el.dataset.id}`, { method: 'PATCH', body: { hidden: el.dataset.hidden === '1' } });
        toast(el.dataset.hidden === '1' ? 'Comentário ocultado.' : 'Comentário visível novamente.', 'ok');
        render();
      } catch (e) { toast(e.message, 'err'); }
    },
    async 'comment-delete'(el) {
      if (!confirm('Excluir este comentário?')) return;
      try { await api(`/comments/${el.dataset.id}`, { method: 'DELETE' }); render(); } catch (e) { toast(e.message, 'err'); }
    },
    async 'rating-delete'(el) {
      if (!confirm('Remover esta avaliação?')) return;
      try { await api(`/admin/ratings/${el.dataset.id}`, { method: 'DELETE' }); render(); } catch (e) { toast(e.message, 'err'); }
    },
    async 'cat-delete'(el) {
      const count = Number(el.dataset.count);
      const msg = count ? `Esta categoria tem ${count} receita(s). Elas ficarão sem categoria. Excluir mesmo assim?` : 'Excluir esta categoria?';
      if (!confirm(msg)) return;
      try {
        await api(`/admin/categories/${el.dataset.id}`, { method: 'DELETE' });
        state.categories = [];
        toast('Categoria excluída.', 'ok');
        render();
      } catch (e) { toast(e.message, 'err'); }
    },
  };

  function renumberSteps() {
    $$('#stepList [data-step]').forEach((row, i) => { row.querySelector('.num').textContent = i + 1; });
  }

  function adjustServings(delta) {
    const s = app._recipeState;
    if (!s) return;
    const next = Math.min(100, Math.max(1, s.servings + delta));
    if (next === s.servings) return;
    s.servings = next;
    renderIngredients(s);
  }

  // Delegação de cliques
  document.addEventListener('click', (e) => {
    const modalClose = e.target.closest('[data-close-modal]');
    if (modalClose && (e.target === modalClose || modalClose.classList.contains('btn'))) {
      closeModal();
      return;
    }
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      e.preventDefault();
      api('/plan', { method: 'PUT', body: { day: Number(pick.dataset.day), meal: pick.dataset.meal, recipeId: Number(pick.dataset.pick) } })
        .then(() => { closeModal(); toast('Receita adicionada ao planejador 📅', 'ok'); render(); })
        .catch((err) => toast(err.message, 'err'));
      return;
    }
    const planSet = e.target.closest('[data-plan-set]');
    if (planSet) { actions['plan-set'](planSet); return; }
    const planClear = e.target.closest('[data-plan-clear]');
    if (planClear) {
      const [day, meal] = planClear.dataset.planClear.split('|');
      api('/plan', { method: 'PUT', body: { day: Number(day), meal, recipeId: null } })
        .then(() => { closeModal(); toast('Refeição removida do planejador.', 'ok'); render(); })
        .catch((err) => toast(err.message, 'err'));
      return;
    }
    const check = e.target.closest('[data-check]');
    if (check && app._recipeState) {
      const id = Number(check.dataset.check);
      const s = app._recipeState;
      s.checked.has(id) ? s.checked.delete(id) : s.checked.add(id);
      renderIngredients(s);
      return;
    }
    const star = e.target.closest('[data-star]');
    if (star && star.closest('#starsInput')) {
      if (!requireLogin('Entre para avaliar receitas.')) return;
      const id = Number(star.closest('#starsInput').dataset.id);
      api(`/recipes/${id}/rate`, { method: 'POST', body: { stars: Number(star.dataset.star) } })
        .then(() => { toast('Obrigado pela avaliação! ⭐', 'ok'); render(); })
        .catch((err) => toast(err.message, 'err'));
      return;
    }
    const go = e.target.closest('[data-go]');
    if (go) { location.hash = go.dataset.go; return; }
    const act = e.target.closest('[data-action]');
    if (act && actions[act.dataset.action]) {
      e.preventDefault();
      Promise.resolve(actions[act.dataset.action](act, e)).catch((err) => toast(err.message, 'err'));
    }
  });

  // Envio de formulários
  document.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const kind = form.dataset.form;
    const errEl = form.querySelector('[data-error]');
    if (errEl) errEl.textContent = '';
    const btn = form.querySelector('button[type=submit]');
    const setBusy = (busy) => { if (btn) { btn.disabled = busy; btn.dataset.label ||= btn.textContent; btn.textContent = busy ? 'Aguarde…' : btn.dataset.label; } };
    const fail = (err) => { if (errEl) errEl.textContent = err.message; else toast(err.message, 'err'); };

    const handlers = {
      'search-go'() {
        const qs = buildSearchFromForm(form);
        location.hash = `#/pesquisar${qs ? '?' + qs : ''}`;
      },
      'search-filters'() {
        const qs = buildSearchFromForm(form);
        location.hash = `#/pesquisar${qs ? '?' + qs : ''}`;
      },
      async login() {
        const fd = new FormData(form);
        setBusy(true);
        try {
          const { token, user } = await api('/auth/login', { method: 'POST', body: { email: fd.get('email'), password: fd.get('password') } });
          setSession(token, user);
          toast(`Bem-vindo de volta, ${user.name.split(' ')[0]}! 👋`, 'ok');
          location.hash = '#' + (form.dataset.next || '/perfil');
        } catch (err) { fail(err); } finally { setBusy(false); }
      },
      async register() {
        const fd = new FormData(form);
        setBusy(true);
        try {
          const { token, user } = await api('/auth/register', { method: 'POST', body: { name: fd.get('name'), email: fd.get('email'), password: fd.get('password') } });
          setSession(token, user);
          toast('Conta criada com sucesso! 🎉', 'ok');
          location.hash = '#' + (form.dataset.next || '/perfil');
        } catch (err) { fail(err); } finally { setBusy(false); }
      },
      async profile() {
        const fd = new FormData(form);
        const dietary = $$('input[name=dietary]:checked', form).map((i) => i.value);
        setBusy(true);
        try {
          const { user } = await api('/me', { method: 'PATCH', body: { name: fd.get('name'), preferences: { units: fd.get('units'), dietary } } });
          setSession(state.token, user);
          toast('Perfil atualizado ✔', 'ok');
          render();
        } catch (err) { fail(err); } finally { setBusy(false); }
      },
      async password() {
        const fd = new FormData(form);
        setBusy(true);
        try {
          await api('/me/password', { method: 'POST', body: { current: fd.get('current'), next: fd.get('next') } });
          form.reset();
          toast('Senha alterada com sucesso ✔', 'ok');
        } catch (err) { fail(err); } finally { setBusy(false); }
      },
      async comment() {
        const id = Number(form.dataset.id);
        const body = new FormData(form).get('body').trim();
        setBusy(true);
        try {
          await api(`/recipes/${id}/comments`, { method: 'POST', body: { body } });
          toast('Comentário publicado 💬', 'ok');
          render();
        } catch (err) { fail(err); } finally { setBusy(false); }
      },
      async 'shop-add'() {
        const name = new FormData(form).get('name').trim();
        if (!name) return;
        try {
          await api('/shopping', { method: 'POST', body: { name } });
          render();
        } catch (err) { fail(err); }
      },
      async convert() { updateConverter(); },
      async recipe() {
        const id = form.dataset.id;
        const data = collectRecipeForm(form);
        setBusy(true);
        try {
          const res = await api(id ? `/recipes/${id}` : '/recipes', { method: id ? 'PUT' : 'POST', body: data });
          toast(id ? 'Receita atualizada ✔' : 'Receita publicada! 🎉', 'ok');
          location.hash = `#/receita/${res.id}`;
        } catch (err) { fail(err); } finally { setBusy(false); }
      },
      async 'cat-edit'() {
        const id = form.dataset.id;
        const fd = new FormData(form);
        try {
          await api(`/admin/categories/${id}`, { method: 'PUT', body: { name: fd.get('name'), emoji: fd.get('emoji'), color: fd.get('color') } });
          state.categories = [];
          toast('Categoria salva ✔', 'ok');
        } catch (err) { toast(err.message, 'err'); }
      },
      async 'cat-new'() {
        const fd = new FormData(form);
        try {
          await api('/admin/categories', { method: 'POST', body: { name: fd.get('name'), emoji: fd.get('emoji'), color: fd.get('color') } });
          state.categories = [];
          toast('Categoria criada ✔', 'ok');
          render();
        } catch (err) { toast(err.message, 'err'); }
      },
    };

    const fn = handlers[kind];
    if (fn) Promise.resolve(fn()).catch(fail);
  });

  // Mudanças em selects e campos de arquivo
  document.addEventListener('input', (e) => {
    if (e.target.closest && e.target.closest('#convForm')) updateConverter();
  });

  document.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.closest && t.closest('#convForm')) { updateConverter(); return; }
    if (t.matches('[data-change="fav-move"]')) {
      let col = t.value;
      if (col === '__new__') {
        col = (prompt('Nome da nova coleção:') || '').trim();
        if (!col) { render(); return; }
      }
      try {
        await api(`/favorites/${t.dataset.id}`, { method: 'PATCH', body: { collection: col } });
        toast(`Movida para "${col}" ✔`, 'ok');
        render();
      } catch (err) { toast(err.message, 'err'); }
    }
    if (t.matches('[data-change="avatar"]')) {
      try {
        const dataUrl = await readFileAsDataUrl(t.files[0], { max: 256, quality: 0.9 });
        const { user } = await api('/me', { method: 'PATCH', body: { avatar: dataUrl } });
        setSession(state.token, user);
        toast('Foto de perfil atualizada 📸', 'ok');
        render();
      } catch (err) { toast(err.message, 'err'); }
    }
    if (t.matches('[data-change="recipe-image"]')) {
      try {
        const dataUrl = await readFileAsDataUrl(t.files[0], { max: 1200, quality: 0.85 });
        const form = t.closest('form');
        form.querySelector('input[name=image]').value = dataUrl;
        const img = $('#imgPreview');
        img.src = dataUrl;
        img.hidden = false;
        toast('Foto carregada. Lembre-se de salvar a receita.', 'ok');
      } catch (err) { toast(err.message, 'err'); }
    }
  });

  // Digitação: sugestões e busca em tempo real da barra da página
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-suggest]')) {
      const form = e.target.closest('form');
      if (form && form.dataset.form === 'search-go') return;
    }
  });

  // Atalho do cabeçalho: "+ Nova receita" pede login quando necessário
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href="#/nova-receita"]');
    if (link && !state.user) {
      e.preventDefault();
      requireLogin('Entre para cadastrar uma receita.');
    }
  });

  // ------------------------------------------------------------------ inicialização
  window.addEventListener('hashchange', () => { render(); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  (async () => {
    setSession(state.token, null);
    await loadSession();
    if (!location.hash) history.replaceState(null, '', '#/');
    render();
  })();
})();
