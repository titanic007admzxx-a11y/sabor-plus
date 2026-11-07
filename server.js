'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const seed = require('./seed');

const PORT = Number(process.env.PORT) || 3000;
// Arquivos do site ficam na mesma pasta do servidor (projeto achatado para envio pelo celular).
// Somente estes arquivos são servidos publicamente; o código do servidor nunca é exposto.
const PUBLIC_DIR = __dirname;
const PUBLIC_FILES = new Set(['index.html', 'app.js', 'styles.css', 'icon.svg']);
const DATA_DIR = process.env.SABOR_DATA || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------------------------------------------------------------- banco de dados
const db = new DatabaseSync(path.join(DATA_DIR, 'sabor.db'));
db.exec('PRAGMA foreign_keys = ON;');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  avatar TEXT,
  preferences TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🍽️',
  color TEXT NOT NULL DEFAULT '#F97316'
);
CREATE TABLE IF NOT EXISTS recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  prep_minutes INTEGER NOT NULL DEFAULT 0,
  cook_minutes INTEGER NOT NULL DEFAULT 0,
  servings INTEGER NOT NULL DEFAULT 4,
  difficulty TEXT NOT NULL DEFAULT 'medio',
  tags TEXT NOT NULL DEFAULT '',
  nutrition TEXT,
  image TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  views INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  quantity REAL,
  unit TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  text TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  collection TEXT NOT NULL DEFAULT 'Geral',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, recipe_id)
);
CREATE TABLE IF NOT EXISTS ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, recipe_id)
);
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS history (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  viewed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, recipe_id)
);
CREATE TABLE IF NOT EXISTS meal_plan (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  meal TEXT NOT NULL,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, day, meal)
);
CREATE TABLE IF NOT EXISTS shopping_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity REAL,
  unit TEXT NOT NULL DEFAULT '',
  checked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);

// ---------------------------------------------------------------- utilidades
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => new HttpError(400, msg);

const norm = (s = '') => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const nowIso = () => new Date().toISOString();

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(pw, stored) {
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(pw, salt, 64);
  const ref = Buffer.from(hash, 'hex');
  return ref.length === test.length && crypto.timingSafeEqual(ref, test);
}

const DIFFICULTY = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' };

function parseJsonSafe(s, fallback) {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}

function publicUser(row) {
  return {
    id: row.id, name: row.name, email: row.email, role: row.role,
    avatar: row.avatar || null, preferences: parseJsonSafe(row.preferences, {}),
    createdAt: row.created_at,
  };
}

function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

// Ilustração gerada para receitas sem foto enviada.
function svgCard({ title, emoji, color }) {
  const from = color || '#F97316';
  const short = title.length > 28 ? title.slice(0, 27) + '…' : title;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="#FDBA74"/></linearGradient>
<radialGradient id="s" cx="0.75" cy="0.25" r="0.6"><stop offset="0" stop-color="#fff" stop-opacity=".4"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
</defs>
<rect width="800" height="600" fill="url(#g)"/>
<rect width="800" height="600" fill="url(#s)"/>
<circle cx="400" cy="270" r="165" fill="#fff" fill-opacity=".25"/>
<text x="400" y="320" font-size="180" text-anchor="middle" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">${escapeXml(emoji || '🍽️')}</text>
<text x="400" y="520" font-size="36" font-weight="700" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif">${escapeXml(short)}</text>
</svg>`;
}

// ---------------------------------------------------------------- seed inicial
function seedIfEmpty() {
  const count = one('SELECT COUNT(*) AS n FROM categories').n;
  if (count > 0) return;

  const catIds = {};
  for (const c of seed.categories) {
    const r = run('INSERT INTO categories (slug, name, emoji, color) VALUES (?,?,?,?)', c.slug, c.name, c.emoji, c.color);
    catIds[c.slug] = Number(r.lastInsertRowid);
  }

  // Administrador: se ADMIN_PASSWORD estiver definido, cria a conta agora.
  // Caso contrário, o primeiro cadastro feito no site vira administrador.
  let adminId = null;
  if (process.env.ADMIN_PASSWORD) {
    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@saborplus.app').toLowerCase();
    adminId = Number(run('INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)',
      'Administrador', adminEmail, hashPassword(process.env.ADMIN_PASSWORD), 'admin').lastInsertRowid);
  }

  const userIds = seed.demoUsers.map((u) => Number(run(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)',
    u.name, u.email, hashPassword(crypto.randomBytes(12).toString('hex')), 'user').lastInsertRowid));

  const recipeIds = seed.recipes.map((r) => {
    const res = run(`INSERT INTO recipes (title, description, category_id, prep_minutes, cook_minutes, servings,
      difficulty, tags, nutrition, created_by, views, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now', ?),datetime('now', ?))`,
    r.title, r.description, catIds[r.category], r.prep, r.cook, r.servings, r.difficulty, r.tags,
    JSON.stringify(r.nutrition), adminId, r.views, `-${r.daysAgo} days`, `-${r.daysAgo} days`);
    const id = Number(res.lastInsertRowid);
    r.ingredients.forEach(([qty, unit, name], i) => {
      run('INSERT INTO ingredients (recipe_id, position, quantity, unit, name) VALUES (?,?,?,?,?)', id, i, qty, unit, name);
    });
    r.steps.forEach((text, i) => run('INSERT INTO steps (recipe_id, position, text) VALUES (?,?,?)', id, i, text));
    return id;
  });

  for (const [ri, ui, stars, body] of seed.demoReviews) {
    run('INSERT INTO ratings (user_id, recipe_id, stars) VALUES (?,?,?)', userIds[ui], recipeIds[ri], stars);
    run('INSERT INTO comments (user_id, recipe_id, body) VALUES (?,?,?)', userIds[ui], recipeIds[ri], body);
  }
}

// ---------------------------------------------------------------- receitas
function loadRecipes({ withSteps = false } = {}) {
  const rows = all(`SELECT r.*, c.slug AS cat_slug, c.name AS cat_name, c.emoji AS cat_emoji, c.color AS cat_color,
      (SELECT ROUND(AVG(stars), 1) FROM ratings WHERE recipe_id = r.id) AS rating_avg,
      (SELECT COUNT(*) FROM ratings WHERE recipe_id = r.id) AS rating_count,
      (SELECT COUNT(*) FROM comments WHERE recipe_id = r.id AND hidden = 0) AS comment_count,
      u.name AS author_name
    FROM recipes r
    LEFT JOIN categories c ON c.id = r.category_id
    LEFT JOIN users u ON u.id = r.created_by
    ORDER BY r.id`);
  const map = new Map(rows.map((r) => [r.id, { row: r, ingredients: [], steps: [] }]));
  for (const i of all('SELECT * FROM ingredients ORDER BY recipe_id, position')) map.get(i.recipe_id)?.ingredients.push(i);
  if (withSteps) for (const s of all('SELECT * FROM steps ORDER BY recipe_id, position')) map.get(s.recipe_id)?.steps.push(s);
  return [...map.values()];
}

function presentRecipe({ row, ingredients, steps }) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.cat_slug ? { slug: row.cat_slug, name: row.cat_name, emoji: row.cat_emoji, color: row.cat_color } : null,
    prepMinutes: row.prep_minutes,
    cookMinutes: row.cook_minutes,
    totalMinutes: row.prep_minutes + row.cook_minutes,
    servings: row.servings,
    difficulty: row.difficulty,
    difficultyLabel: DIFFICULTY[row.difficulty] || row.difficulty,
    tags: row.tags ? row.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    nutrition: parseJsonSafe(row.nutrition, null),
    image: `/api/recipes/${row.id}/image?v=${encodeURIComponent(row.updated_at)}`,
    rating: { average: row.rating_avg || 0, count: row.rating_count || 0 },
    commentCount: row.comment_count || 0,
    views: row.views,
    author: row.author_name || 'SABOR+',
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ingredients: ingredients.map((i) => ({ id: i.id, quantity: i.quantity, unit: i.unit, name: i.name })),
    steps: steps ? steps.map((s) => s.text) : undefined,
  };
}

function matchesPantry(ingredientName, pantry) {
  const n = norm(ingredientName);
  return pantry.some((p) => n.includes(p) || p.includes(n));
}

function searchRecipes(params) {
  const tokens = norm(params.get('q') || '').split(/\s+/).filter(Boolean);
  const category = params.get('category');
  const maxTime = Number(params.get('maxTime')) || 0;
  const difficulty = params.get('difficulty');
  const ingredient = norm(params.get('ingredient') || '');
  const pantry = (params.get('pantry') || '').split(',').map(norm).filter(Boolean);
  const strict = params.get('strict') === '1';
  const sort = params.get('sort') || 'relevance';
  const limit = Math.min(Number(params.get('limit')) || 40, 100);

  let list = loadRecipes().map((entry) => {
    const r = entry.row;
    const title = norm(r.title);
    const catName = norm(r.cat_name || '');
    const tags = norm(r.tags || '');
    const ingNames = entry.ingredients.map((i) => norm(i.name));
    let score = 0;
    for (const t of tokens) {
      if (title.includes(t)) score += 3;
      if (catName.includes(t)) score += 2;
      if (ingNames.some((n) => n.includes(t))) score += 1;
      if (tags.includes(t)) score += 1;
    }
    let pantryInfo = null;
    if (pantry.length) {
      const missing = entry.ingredients.filter((i) => !matchesPantry(i.name, pantry)).map((i) => i.name);
      pantryInfo = { total: entry.ingredients.length, matched: entry.ingredients.length - missing.length, missing };
    }
    return { entry, score, pantryInfo, ingNames };
  });

  if (tokens.length) list = list.filter((x) => x.score > 0);
  if (category) list = list.filter((x) => x.entry.row.cat_slug === category);
  if (maxTime) list = list.filter((x) => x.entry.row.prep_minutes + x.entry.row.cook_minutes <= maxTime);
  if (difficulty) list = list.filter((x) => x.entry.row.difficulty === difficulty);
  if (ingredient) list = list.filter((x) => x.ingNames.some((n) => n.includes(ingredient)));
  if (pantry.length && strict) list = list.filter((x) => x.pantryInfo.missing.length === 0);

  const byRating = (a, b) => (b.entry.row.rating_avg || 0) - (a.entry.row.rating_avg || 0);
  const sorters = {
    relevance: (a, b) => (b.score - a.score) || (pantry.length ? a.pantryInfo.missing.length - b.pantryInfo.missing.length : 0) || byRating(a, b),
    rating: byRating,
    popular: (a, b) => b.entry.row.views - a.entry.row.views,
    recent: (a, b) => (b.entry.row.created_at > a.entry.row.created_at ? 1 : -1),
    time: (a, b) => (a.entry.row.prep_minutes + a.entry.row.cook_minutes) - (b.entry.row.prep_minutes + b.entry.row.cook_minutes),
  };
  list.sort(sorters[sort] || sorters.relevance);

  const total = list.length;
  const results = list.slice(0, limit).map((x) => {
    const p = presentRecipe(x.entry);
    if (x.pantryInfo) p.pantry = x.pantryInfo;
    return p;
  });
  return { total, results };
}

function suggest(q) {
  const term = norm(q);
  if (term.length < 2) return [];
  const out = [];
  const entries = loadRecipes();
  for (const e of entries) {
    if (norm(e.row.title).includes(term)) out.push({ type: 'recipe', id: e.row.id, label: e.row.title, sub: e.row.cat_name || 'Receita' });
    if (out.length >= 5) break;
  }
  const seen = new Set();
  for (const e of entries) {
    for (const i of e.ingredients) {
      const n = norm(i.name);
      if (n.includes(term) && !seen.has(n)) {
        seen.add(n);
        out.push({ type: 'ingredient', label: i.name, sub: 'Ingrediente', query: i.name });
      }
      if (seen.size >= 4) break;
    }
    if (seen.size >= 4) break;
  }
  for (const c of all('SELECT * FROM categories')) {
    if (norm(c.name).includes(term)) out.push({ type: 'category', slug: c.slug, label: c.name, sub: 'Categoria', emoji: c.emoji });
  }
  return out.slice(0, 10);
}

function parseRecipeInput(b) {
  const title = String(b.title || '').trim();
  if (title.length < 3 || title.length > 120) throw bad('O título deve ter entre 3 e 120 caracteres.');
  const ingredients = (Array.isArray(b.ingredients) ? b.ingredients : [])
    .map((i) => ({
      quantity: i.quantity === '' || i.quantity === null || i.quantity === undefined ? null : Number(String(i.quantity).replace(',', '.')),
      unit: String(i.unit || '').trim().slice(0, 30),
      name: String(i.name || '').trim().slice(0, 120),
    }))
    .filter((i) => i.name);
  if (!ingredients.length) throw bad('Adicione pelo menos um ingrediente.');
  if (ingredients.some((i) => i.quantity !== null && Number.isNaN(i.quantity))) throw bad('Quantidade inválida em um dos ingredientes.');
  const steps = (Array.isArray(b.steps) ? b.steps : []).map((s) => String(s).trim()).filter(Boolean);
  if (!steps.length) throw bad('Adicione pelo menos um passo ao modo de preparo.');
  const difficulty = ['facil', 'medio', 'dificil'].includes(b.difficulty) ? b.difficulty : 'medio';
  const nut = b.nutrition && typeof b.nutrition === 'object' ? b.nutrition : null;
  const nutrition = nut ? Object.fromEntries(['kcal', 'protein', 'carbs', 'fat'].filter((k) => nut[k] !== '' && nut[k] != null).map((k) => [k, Number(nut[k])])) : null;
  let image = null;
  if (typeof b.image === 'string' && b.image) {
    if (!/^data:image\/(png|jpeg|webp|gif);base64,/.test(b.image)) throw bad('Imagem inválida. Use PNG, JPG, WEBP ou GIF.');
    if (b.image.length > 2_500_000) throw bad('A imagem é grande demais (máximo de cerca de 1,8 MB).');
    image = b.image;
  }
  const categoryId = Number(b.categoryId) || null;
  if (categoryId && !one('SELECT id FROM categories WHERE id = ?', categoryId)) throw bad('Categoria inexistente.');
  return {
    title,
    description: String(b.description || '').trim().slice(0, 1000),
    categoryId,
    prep: Math.max(0, Math.round(Number(b.prepMinutes) || 0)),
    cook: Math.max(0, Math.round(Number(b.cookMinutes) || 0)),
    servings: Math.max(1, Math.round(Number(b.servings) || 1)),
    difficulty,
    tags: Array.isArray(b.tags) ? b.tags.map((t) => String(t).trim()).filter(Boolean).join(',') : String(b.tags || '').trim(),
    nutrition,
    image,
    ingredients,
    steps,
  };
}

function writeIngredientsAndSteps(id, data) {
  run('DELETE FROM ingredients WHERE recipe_id = ?', id);
  run('DELETE FROM steps WHERE recipe_id = ?', id);
  data.ingredients.forEach((i, idx) => run('INSERT INTO ingredients (recipe_id, position, quantity, unit, name) VALUES (?,?,?,?,?)', id, idx, i.quantity, i.unit, i.name));
  data.steps.forEach((s, idx) => run('INSERT INTO steps (recipe_id, position, text) VALUES (?,?,?)', id, idx, s));
}

function inTransaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function getRecipeOr404(id) {
  const entry = loadRecipes({ withSteps: true }).find((e) => e.row.id === id);
  if (!entry) throw new HttpError(404, 'Receita não encontrada.');
  return entry;
}

function aggregateIngredients(recipeIds) {
  const map = new Map();
  for (const id of recipeIds) {
    const entry = loadRecipes().find((e) => e.row.id === id);
    if (!entry) continue;
    for (const i of entry.ingredients) {
      const key = `${norm(i.name)}|${norm(i.unit)}`;
      const cur = map.get(key);
      if (cur) {
        if (cur.quantity !== null && i.quantity !== null) cur.quantity = Math.round((cur.quantity + i.quantity) * 100) / 100;
        else cur.quantity = null;
      } else {
        map.set(key, { name: i.name, quantity: i.quantity, unit: i.unit });
      }
    }
  }
  return [...map.values()];
}

// ---------------------------------------------------------------- sessão / autenticação
function currentUser(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  const row = one(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.created_at > datetime('now', '-30 days')`, h.slice(7));
  return row ? publicUser(row) : null;
}
function requireUser(ctx) {
  if (!ctx.user) throw new HttpError(401, 'Faça login para continuar.');
  return ctx.user;
}
function requireAdmin(ctx) {
  const u = requireUser(ctx);
  if (u.role !== 'admin') throw new HttpError(403, 'Acesso restrito ao administrador.');
  return u;
}

// ---------------------------------------------------------------- roteador
const routes = [];
function route(method, pattern, handler) {
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$');
  routes.push({ method, re, handler });
}

async function readBody(req, limit = 4_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Conteúdo muito grande.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw bad('JSON inválido.'); }
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

// --- Público: home, categorias, receitas, busca
route('GET', '/api/home', (ctx) => {
  const all_ = loadRecipes().map(presentRecipe);
  const popular = [...all_].sort((a, b) => b.views - a.views).slice(0, 8);
  const topRated = all_.filter((r) => r.rating.count > 0)
    .sort((a, b) => (b.rating.average - a.rating.average) || (b.rating.count - a.rating.count)).slice(0, 8);
  const recent = [...all_].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 8);

  let recommended;
  let basis = 'Em destaque para você';
  if (ctx.user) {
    const favCats = all(`SELECT DISTINCT c.slug FROM categories c JOIN recipes r ON r.category_id = c.id
      WHERE r.id IN (SELECT recipe_id FROM favorites WHERE user_id = ? UNION SELECT recipe_id FROM history WHERE user_id = ?)`,
    ctx.user.id, ctx.user.id).map((r) => r.slug);
    const seenIds = new Set(all('SELECT recipe_id FROM favorites WHERE user_id = ? UNION SELECT recipe_id FROM history WHERE user_id = ?', ctx.user.id, ctx.user.id).map((r) => r.recipe_id));
    recommended = all_.filter((r) => !seenIds.has(r.id) && (favCats.includes(r.category?.slug)))
      .sort((a, b) => b.rating.average - a.rating.average);
    if (recommended.length < 6) {
      const extra = all_.filter((r) => !recommended.includes(r) && !seenIds.has(r.id)).sort((a, b) => b.rating.average - a.rating.average);
      recommended = [...recommended, ...extra];
    }
    recommended = recommended.slice(0, 8);
    if (favCats.length) basis = 'Baseado nas suas receitas favoritas';
  } else {
    recommended = [...all_].sort((a, b) => b.rating.average - a.rating.average || b.views - a.views).slice(0, 8);
  }

  const categories = all(`SELECT c.*, (SELECT COUNT(*) FROM recipes r WHERE r.category_id = c.id) AS count FROM categories c ORDER BY c.id`)
    .map((c) => ({ id: c.id, slug: c.slug, name: c.name, emoji: c.emoji, color: c.color, count: c.count }));

  sendJson(ctx.res, 200, { popular, topRated, recommended, recommendedBasis: basis, recent, categories });
});

route('GET', '/api/categories', (ctx) => {
  const rows = all(`SELECT c.*, (SELECT COUNT(*) FROM recipes r WHERE r.category_id = c.id) AS count FROM categories c ORDER BY c.id`);
  sendJson(ctx.res, 200, rows.map((c) => ({ id: c.id, slug: c.slug, name: c.name, emoji: c.emoji, color: c.color, count: c.count })));
});

route('GET', '/api/recipes', (ctx) => {
  sendJson(ctx.res, 200, searchRecipes(ctx.params_q));
});

route('GET', '/api/suggest', (ctx) => {
  sendJson(ctx.res, 200, suggest(ctx.url.searchParams.get('q') || ''));
});

route('GET', '/api/recipes/random', (ctx) => {
  const list = loadRecipes();
  if (!list.length) throw new HttpError(404, 'Nenhuma receita cadastrada.');
  const pick = list[Math.floor(Math.random() * list.length)];
  sendJson(ctx.res, 200, { id: pick.row.id });
});

route('GET', '/api/recipes/:id', (ctx) => {
  const id = Number(ctx.params.id);
  getRecipeOr404(id);
  run('UPDATE recipes SET views = views + 1 WHERE id = ?', id);
  const entry = getRecipeOr404(id);
  const recipe = presentRecipe(entry);
  const comments = all(`SELECT c.id, c.body, c.created_at, c.user_id, u.name AS user_name, u.avatar AS user_avatar
    FROM comments c JOIN users u ON u.id = c.user_id WHERE c.recipe_id = ? AND c.hidden = 0 ORDER BY c.created_at DESC`, id)
    .map((c) => ({ id: c.id, body: c.body, createdAt: c.created_at, userId: c.user_id, userName: c.user_name, userAvatar: c.user_avatar }));
  const user = ctx.user;
  recipe.myRating = user ? (one('SELECT stars FROM ratings WHERE user_id = ? AND recipe_id = ?', user.id, id)?.stars ?? null) : null;
  recipe.isFavorite = user ? !!one('SELECT 1 FROM favorites WHERE user_id = ? AND recipe_id = ?', user.id, id) : false;
  if (user) {
    run('INSERT INTO history (user_id, recipe_id, viewed_at) VALUES (?,?,?) ON CONFLICT(user_id, recipe_id) DO UPDATE SET viewed_at = excluded.viewed_at',
      user.id, id, nowIso());
  }
  recipe.comments = comments;
  sendJson(ctx.res, 200, recipe);
});

route('GET', '/api/recipes/:id/image', (ctx) => {
  const id = Number(ctx.params.id);
  const row = one(`SELECT r.image, r.title, c.emoji, c.color FROM recipes r LEFT JOIN categories c ON c.id = r.category_id WHERE r.id = ?`, id);
  if (!row) throw new HttpError(404, 'Imagem não encontrada.');
  if (row.image) {
    const m = row.image.match(/^data:(image\/[a-z+]+);base64,(.*)$/);
    ctx.res.writeHead(200, { 'Content-Type': m[1], 'Cache-Control': 'public, max-age=86400' });
    return ctx.res.end(Buffer.from(m[2], 'base64'));
  }
  ctx.res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
  ctx.res.end(svgCard({ title: row.title, emoji: row.emoji, color: row.color }));
});

route('GET', '/api/categories/:slug/image', (ctx) => {
  const c = one('SELECT * FROM categories WHERE slug = ?', ctx.params.slug);
  if (!c) throw new HttpError(404, 'Categoria não encontrada.');
  ctx.res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
  ctx.res.end(svgCard({ title: c.name, emoji: c.emoji, color: c.color }));
});

route('POST', '/api/recipes/:id/rate', async (ctx) => {
  const user = requireUser(ctx);
  const id = Number(ctx.params.id);
  getRecipeOr404(id);
  const body = await readBody(ctx.req);
  const stars = Number(body.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw bad('Escolha de 1 a 5 estrelas.');
  run(`INSERT INTO ratings (user_id, recipe_id, stars) VALUES (?,?,?)
    ON CONFLICT(user_id, recipe_id) DO UPDATE SET stars = excluded.stars, created_at = datetime('now')`, user.id, id, stars);
  sendJson(ctx.res, 200, { ok: true });
});

route('POST', '/api/recipes/:id/comments', async (ctx) => {
  const user = requireUser(ctx);
  const id = Number(ctx.params.id);
  getRecipeOr404(id);
  const body = await readBody(ctx.req);
  const text = String(body.body || '').trim();
  if (text.length < 2 || text.length > 500) throw bad('O comentário deve ter entre 2 e 500 caracteres.');
  const res = run('INSERT INTO comments (user_id, recipe_id, body) VALUES (?,?,?)', user.id, id, text);
  sendJson(ctx.res, 201, { id: Number(res.lastInsertRowid) });
});

route('DELETE', '/api/comments/:id', (ctx) => {
  const user = requireUser(ctx);
  const c = one('SELECT * FROM comments WHERE id = ?', Number(ctx.params.id));
  if (!c) throw new HttpError(404, 'Comentário não encontrado.');
  if (c.user_id !== user.id && user.role !== 'admin') throw new HttpError(403, 'Você não pode remover este comentário.');
  run('DELETE FROM comments WHERE id = ?', c.id);
  sendJson(ctx.res, 200, { ok: true });
});

// --- Receitas criadas por usuários (e administrador)
route('POST', '/api/recipes', async (ctx) => {
  const user = requireUser(ctx);
  const data = parseRecipeInput(await readBody(ctx.req, 3_000_000));
  const id = inTransaction(() => {
    const r = run(`INSERT INTO recipes (title, description, category_id, prep_minutes, cook_minutes, servings, difficulty,
      tags, nutrition, image, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    data.title, data.description, data.categoryId, data.prep, data.cook, data.servings, data.difficulty,
    data.tags, data.nutrition ? JSON.stringify(data.nutrition) : null, data.image, user.id);
    const newId = Number(r.lastInsertRowid);
    writeIngredientsAndSteps(newId, data);
    return newId;
  });
  sendJson(ctx.res, 201, { id });
});

route('PUT', '/api/recipes/:id', async (ctx) => {
  const user = requireUser(ctx);
  const id = Number(ctx.params.id);
  const existing = one('SELECT * FROM recipes WHERE id = ?', id);
  if (!existing) throw new HttpError(404, 'Receita não encontrada.');
  if (existing.created_by !== user.id && user.role !== 'admin') throw new HttpError(403, 'Você não pode editar esta receita.');
  const body = await readBody(ctx.req, 3_000_000);
  const data = parseRecipeInput(body);
  inTransaction(() => {
    run(`UPDATE recipes SET title=?, description=?, category_id=?, prep_minutes=?, cook_minutes=?, servings=?, difficulty=?,
      tags=?, nutrition=?, image=COALESCE(?, image), updated_at=datetime('now') WHERE id=?`,
    data.title, data.description, data.categoryId, data.prep, data.cook, data.servings, data.difficulty, data.tags,
    data.nutrition ? JSON.stringify(data.nutrition) : null, data.image, id);
    writeIngredientsAndSteps(id, data);
  });
  sendJson(ctx.res, 200, { id });
});

route('DELETE', '/api/recipes/:id', (ctx) => {
  const user = requireUser(ctx);
  const id = Number(ctx.params.id);
  const existing = one('SELECT created_by FROM recipes WHERE id = ?', id);
  if (!existing) throw new HttpError(404, 'Receita não encontrada.');
  if (existing.created_by !== user.id && user.role !== 'admin') throw new HttpError(403, 'Você não pode excluir esta receita.');
  run('DELETE FROM recipes WHERE id = ?', id);
  sendJson(ctx.res, 200, { ok: true });
});

route('GET', '/api/me/recipes', (ctx) => {
  const user = requireUser(ctx);
  const ids = all('SELECT id FROM recipes WHERE created_by = ?', user.id).map((r) => r.id);
  const list = loadRecipes().filter((e) => ids.includes(e.row.id)).map(presentRecipe);
  sendJson(ctx.res, 200, list);
});

// --- Favoritos
route('GET', '/api/favorites', (ctx) => {
  const user = requireUser(ctx);
  const favs = all('SELECT recipe_id, collection, created_at FROM favorites WHERE user_id = ? ORDER BY created_at DESC', user.id);
  const map = new Map(loadRecipes().map((e) => [e.row.id, e]));
  const items = favs.filter((f) => map.has(f.recipe_id)).map((f) => ({
    collection: f.collection, savedAt: f.created_at, recipe: presentRecipe(map.get(f.recipe_id)),
  }));
  const collections = [...new Set(['Geral', ...items.map((i) => i.collection)])];
  sendJson(ctx.res, 200, { items, collections });
});

route('POST', '/api/favorites', async (ctx) => {
  const user = requireUser(ctx);
  const body = await readBody(ctx.req);
  const id = Number(body.recipeId);
  if (!one('SELECT id FROM recipes WHERE id = ?', id)) throw new HttpError(404, 'Receita não encontrada.');
  const collection = String(body.collection || 'Geral').trim().slice(0, 40) || 'Geral';
  run(`INSERT INTO favorites (user_id, recipe_id, collection) VALUES (?,?,?)
    ON CONFLICT(user_id, recipe_id) DO NOTHING`, user.id, id, collection);
  sendJson(ctx.res, 201, { ok: true });
});

route('PATCH', '/api/favorites/:recipeId', async (ctx) => {
  const user = requireUser(ctx);
  const body = await readBody(ctx.req);
  const collection = String(body.collection || 'Geral').trim().slice(0, 40) || 'Geral';
  run('UPDATE favorites SET collection = ? WHERE user_id = ? AND recipe_id = ?', collection, user.id, Number(ctx.params.recipeId));
  sendJson(ctx.res, 200, { ok: true });
});

route('DELETE', '/api/favorites/:recipeId', (ctx) => {
  const user = requireUser(ctx);
  run('DELETE FROM favorites WHERE user_id = ? AND recipe_id = ?', user.id, Number(ctx.params.recipeId));
  sendJson(ctx.res, 200, { ok: true });
});

// --- Histórico
route('GET', '/api/history', (ctx) => {
  const user = requireUser(ctx);
  const rows = all('SELECT recipe_id, viewed_at FROM history WHERE user_id = ? ORDER BY viewed_at DESC LIMIT 40', user.id);
  const map = new Map(loadRecipes().map((e) => [e.row.id, e]));
  sendJson(ctx.res, 200, rows.filter((r) => map.has(r.recipe_id)).map((r) => ({
    viewedAt: r.viewed_at, recipe: presentRecipe(map.get(r.recipe_id)),
  })));
});

route('DELETE', '/api/history', (ctx) => {
  const user = requireUser(ctx);
  run('DELETE FROM history WHERE user_id = ?', user.id);
  sendJson(ctx.res, 200, { ok: true });
});

// --- Planejador semanal
route('GET', '/api/plan', (ctx) => {
  const user = requireUser(ctx);
  const rows = all('SELECT day, meal, recipe_id FROM meal_plan WHERE user_id = ?', user.id);
  const map = new Map(loadRecipes().map((e) => [e.row.id, e]));
  sendJson(ctx.res, 200, rows.filter((r) => map.has(r.recipe_id)).map((r) => ({
    day: r.day, meal: r.meal, recipe: presentRecipe(map.get(r.recipe_id)),
  })));
});

route('PUT', '/api/plan', async (ctx) => {
  const user = requireUser(ctx);
  const body = await readBody(ctx.req);
  const day = Number(body.day);
  if (!Number.isInteger(day) || day < 0 || day > 6) throw bad('Dia inválido.');
  if (!['cafe', 'almoco', 'jantar', 'lanche'].includes(body.meal)) throw bad('Refeição inválida.');
  if (body.recipeId === null || body.recipeId === undefined) {
    run('DELETE FROM meal_plan WHERE user_id = ? AND day = ? AND meal = ?', user.id, day, body.meal);
  } else {
    const rid = Number(body.recipeId);
    if (!one('SELECT id FROM recipes WHERE id = ?', rid)) throw new HttpError(404, 'Receita não encontrada.');
    run(`INSERT INTO meal_plan (user_id, day, meal, recipe_id) VALUES (?,?,?,?)
      ON CONFLICT(user_id, day, meal) DO UPDATE SET recipe_id = excluded.recipe_id`, user.id, day, body.meal, rid);
  }
  sendJson(ctx.res, 200, { ok: true });
});

// --- Lista de compras
route('GET', '/api/shopping', (ctx) => {
  const user = requireUser(ctx);
  sendJson(ctx.res, 200, all('SELECT * FROM shopping_items WHERE user_id = ? ORDER BY checked, id', user.id)
    .map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, unit: i.unit, checked: !!i.checked })));
});

route('POST', '/api/shopping/from-recipes', async (ctx) => {
  const user = requireUser(ctx);
  const body = await readBody(ctx.req);
  let ids = Array.isArray(body.recipeIds) ? body.recipeIds.map(Number) : [];
  if (body.fromPlan) {
    ids = [...ids, ...all('SELECT recipe_id FROM meal_plan WHERE user_id = ?', user.id).map((r) => r.recipe_id)];
  }
  const items = aggregateIngredients([...new Set(ids)]);
  inTransaction(() => {
    for (const it of items) {
      const existing = all('SELECT id, quantity, unit FROM shopping_items WHERE user_id = ? AND lower(name) = lower(?) AND unit = ? AND checked = 0', user.id, it.name, it.unit);
      if (existing.length && existing[0].quantity !== null && it.quantity !== null) {
        run('UPDATE shopping_items SET quantity = ? WHERE id = ?', existing[0].quantity + it.quantity, existing[0].id);
      } else if (!existing.length) {
        run('INSERT INTO shopping_items (user_id, name, quantity, unit) VALUES (?,?,?,?)', user.id, it.name, it.quantity, it.unit);
      }
    }
  });
  sendJson(ctx.res, 201, { added: items.length });
});

route('POST', '/api/shopping', async (ctx) => {
  const user = requireUser(ctx);
  const body = await readBody(ctx.req);
  const name = String(body.name || '').trim().slice(0, 120);
  if (!name) throw bad('Informe o item.');
  const quantity = body.quantity === '' || body.quantity == null ? null : Number(body.quantity);
  run('INSERT INTO shopping_items (user_id, name, quantity, unit) VALUES (?,?,?,?)', user.id, name, quantity, String(body.unit || '').slice(0, 30));
  sendJson(ctx.res, 201, { ok: true });
});

route('PATCH', '/api/shopping/:id', async (ctx) => {
  const user = requireUser(ctx);
  const body = await readBody(ctx.req);
  const item = one('SELECT * FROM shopping_items WHERE id = ? AND user_id = ?', Number(ctx.params.id), user.id);
  if (!item) throw new HttpError(404, 'Item não encontrado.');
  run('UPDATE shopping_items SET checked = ?, name = ? WHERE id = ?',
    body.checked === undefined ? item.checked : (body.checked ? 1 : 0),
    body.name === undefined ? item.name : String(body.name).trim().slice(0, 120) || item.name,
    item.id);
  sendJson(ctx.res, 200, { ok: true });
});

route('DELETE', '/api/shopping/:id', (ctx) => {
  const user = requireUser(ctx);
  run('DELETE FROM shopping_items WHERE id = ? AND user_id = ?', Number(ctx.params.id), user.id);
  sendJson(ctx.res, 200, { ok: true });
});

route('DELETE', '/api/shopping', (ctx) => {
  const user = requireUser(ctx);
  if (ctx.url.searchParams.get('checked') === '1') run('DELETE FROM shopping_items WHERE user_id = ? AND checked = 1', user.id);
  else run('DELETE FROM shopping_items WHERE user_id = ?', user.id);
  sendJson(ctx.res, 200, { ok: true });
});

// --- Autenticação e perfil
route('POST', '/api/auth/register', async (ctx) => {
  const REG_WINDOW = 60 * 60 * 1000;
  if (rateLimited(ctx.req, 'register', 20, REG_WINDOW)) {
    throw new HttpError(429, 'Muitos cadastros deste endereço. Tente novamente mais tarde.');
  }
  recordAttempt(ctx.req, 'register', REG_WINDOW);
  const body = await readBody(ctx.req);
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (name.length < 2) throw bad('Informe seu nome.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('E-mail inválido.');
  if (password.length < 6) throw bad('A senha deve ter pelo menos 6 caracteres.');
  if (one('SELECT id FROM users WHERE email = ?', email)) throw bad('Já existe uma conta com este e-mail.');
  // Se ainda não existe administrador, o primeiro cadastro recebe essa função.
  const role = one("SELECT id FROM users WHERE role = 'admin'") ? 'user' : 'admin';
  const id = Number(run('INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)', name, email, hashPassword(password), role).lastInsertRowid);
  const token = createSession(id);
  sendJson(ctx.res, 201, { token, user: publicUser(one('SELECT * FROM users WHERE id = ?', id)) });
});

route('POST', '/api/auth/login', async (ctx) => {
  const LOGIN_WINDOW = 15 * 60 * 1000;
  if (rateLimited(ctx.req, 'login', 10, LOGIN_WINDOW)) {
    throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
  }
  const body = await readBody(ctx.req);
  const row = one('SELECT * FROM users WHERE email = ?', String(body.email || '').trim().toLowerCase());
  if (!row || !verifyPassword(String(body.password || ''), row.password_hash)) {
    recordAttempt(ctx.req, 'login', LOGIN_WINDOW);
    throw new HttpError(401, 'E-mail ou senha incorretos.');
  }
  sendJson(ctx.res, 200, { token: createSession(row.id), user: publicUser(row) });
});

route('POST', '/api/auth/logout', (ctx) => {
  const h = ctx.req.headers.authorization || '';
  if (h.startsWith('Bearer ')) run('DELETE FROM sessions WHERE token = ?', h.slice(7));
  sendJson(ctx.res, 200, { ok: true });
});

// Limite simples por IP: evita tentativas em massa de senha e cadastros automatizados.
const attempts = new Map();
function rateLimited(req, key, max, windowMs) {
  const ip = req.socket.remoteAddress || 'desconhecido';
  const now = Date.now();
  const k = `${key}:${ip}`;
  const entry = attempts.get(k) || { count: 0, start: now };
  if (now - entry.start > windowMs) { entry.count = 0; entry.start = now; }
  return entry.count >= max ? true : false;
}
function recordAttempt(req, key, windowMs) {
  const ip = req.socket.remoteAddress || 'desconhecido';
  const now = Date.now();
  const k = `${key}:${ip}`;
  const entry = attempts.get(k) || { count: 0, start: now };
  if (now - entry.start > windowMs) { entry.count = 0; entry.start = now; }
  entry.count += 1;
  attempts.set(k, entry);
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  run('INSERT INTO sessions (token, user_id) VALUES (?,?)', token, userId);
  return token;
}

route('GET', '/api/me', (ctx) => {
  if (!ctx.user) return sendJson(ctx.res, 200, { user: null });
  const stats = {
    favorites: one('SELECT COUNT(*) AS n FROM favorites WHERE user_id = ?', ctx.user.id).n,
    recipes: one('SELECT COUNT(*) AS n FROM recipes WHERE created_by = ?', ctx.user.id).n,
    comments: one('SELECT COUNT(*) AS n FROM comments WHERE user_id = ?', ctx.user.id).n,
  };
  sendJson(ctx.res, 200, { user: ctx.user, stats });
});

route('PATCH', '/api/me', async (ctx) => {
  const user = requireUser(ctx);
  const body = await readBody(ctx.req, 2_000_000);
  const name = body.name !== undefined ? String(body.name).trim() : user.name;
  if (name.length < 2) throw bad('Informe seu nome.');
  let avatar = user.avatar;
  if (body.avatar === null) avatar = null;
  else if (typeof body.avatar === 'string' && body.avatar) {
    if (!/^data:image\/(png|jpeg|webp|gif);base64,/.test(body.avatar)) throw bad('Foto inválida.');
    if (body.avatar.length > 1_500_000) throw bad('A foto é grande demais.');
    avatar = body.avatar;
  }
  const prefs = { ...user.preferences, ...(body.preferences && typeof body.preferences === 'object' ? body.preferences : {}) };
  run('UPDATE users SET name = ?, avatar = ?, preferences = ? WHERE id = ?', name, avatar, JSON.stringify(prefs), user.id);
  sendJson(ctx.res, 200, { user: publicUser(one('SELECT * FROM users WHERE id = ?', user.id)) });
});

route('POST', '/api/me/password', async (ctx) => {
  const user = requireUser(ctx);
  const body = await readBody(ctx.req);
  const row = one('SELECT * FROM users WHERE id = ?', user.id);
  if (!verifyPassword(String(body.current || ''), row.password_hash)) throw bad('Senha atual incorreta.');
  if (String(body.next || '').length < 6) throw bad('A nova senha deve ter pelo menos 6 caracteres.');
  run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(String(body.next)), user.id);
  sendJson(ctx.res, 200, { ok: true });
});

// --- Administração
route('GET', '/api/admin/stats', (ctx) => {
  requireAdmin(ctx);
  sendJson(ctx.res, 200, {
    recipes: one('SELECT COUNT(*) AS n FROM recipes').n,
    users: one('SELECT COUNT(*) AS n FROM users').n,
    comments: one('SELECT COUNT(*) AS n FROM comments').n,
    ratings: one('SELECT COUNT(*) AS n FROM ratings').n,
    favorites: one('SELECT COUNT(*) AS n FROM favorites').n,
    hiddenComments: one('SELECT COUNT(*) AS n FROM comments WHERE hidden = 1').n,
  });
});

route('GET', '/api/admin/users', (ctx) => {
  requireAdmin(ctx);
  sendJson(ctx.res, 200, all(`SELECT u.id, u.name, u.email, u.role, u.created_at,
    (SELECT COUNT(*) FROM favorites WHERE user_id = u.id) AS favorites,
    (SELECT COUNT(*) FROM recipes WHERE created_by = u.id) AS recipes
    FROM users u ORDER BY u.id`).map((u) => ({
    id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.created_at, favorites: u.favorites, recipes: u.recipes,
  })));
});

route('DELETE', '/api/admin/users/:id', (ctx) => {
  const admin = requireAdmin(ctx);
  const id = Number(ctx.params.id);
  if (id === admin.id) throw bad('Você não pode excluir a própria conta de administrador.');
  run('DELETE FROM users WHERE id = ?', id);
  sendJson(ctx.res, 200, { ok: true });
});

route('GET', '/api/admin/comments', (ctx) => {
  requireAdmin(ctx);
  sendJson(ctx.res, 200, all(`SELECT c.id, c.body, c.hidden, c.created_at, u.name AS user_name, r.title AS recipe_title, r.id AS recipe_id
    FROM comments c JOIN users u ON u.id = c.user_id JOIN recipes r ON r.id = c.recipe_id ORDER BY c.created_at DESC`)
    .map((c) => ({ id: c.id, body: c.body, hidden: !!c.hidden, createdAt: c.created_at, userName: c.user_name, recipeTitle: c.recipe_title, recipeId: c.recipe_id })));
});

route('PATCH', '/api/admin/comments/:id', async (ctx) => {
  requireAdmin(ctx);
  const body = await readBody(ctx.req);
  run('UPDATE comments SET hidden = ? WHERE id = ?', body.hidden ? 1 : 0, Number(ctx.params.id));
  sendJson(ctx.res, 200, { ok: true });
});

route('GET', '/api/admin/ratings', (ctx) => {
  requireAdmin(ctx);
  sendJson(ctx.res, 200, all(`SELECT rt.id, rt.stars, rt.created_at, u.name AS user_name, r.title AS recipe_title, r.id AS recipe_id
    FROM ratings rt JOIN users u ON u.id = rt.user_id JOIN recipes r ON r.id = rt.recipe_id ORDER BY rt.created_at DESC`)
    .map((x) => ({ id: x.id, stars: x.stars, createdAt: x.created_at, userName: x.user_name, recipeTitle: x.recipe_title, recipeId: x.recipe_id })));
});

route('DELETE', '/api/admin/ratings/:id', (ctx) => {
  requireAdmin(ctx);
  run('DELETE FROM ratings WHERE id = ?', Number(ctx.params.id));
  sendJson(ctx.res, 200, { ok: true });
});

route('POST', '/api/admin/categories', async (ctx) => {
  requireAdmin(ctx);
  const body = await readBody(ctx.req, 2_000_000);
  const name = String(body.name || '').trim();
  if (name.length < 2) throw bad('Informe o nome da categoria.');
  const slug = norm(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'categoria';
  if (one('SELECT id FROM categories WHERE slug = ?', slug)) throw bad('Já existe uma categoria com esse nome.');
  const r = run('INSERT INTO categories (slug, name, emoji, color) VALUES (?,?,?,?)', slug, name,
    String(body.emoji || '🍽️').slice(0, 8), /^#[0-9a-fA-F]{6}$/.test(body.color) ? body.color : '#F97316');
  sendJson(ctx.res, 201, { id: Number(r.lastInsertRowid) });
});

route('PUT', '/api/admin/categories/:id', async (ctx) => {
  requireAdmin(ctx);
  const body = await readBody(ctx.req);
  const name = String(body.name || '').trim();
  if (name.length < 2) throw bad('Informe o nome da categoria.');
  run('UPDATE categories SET name = ?, emoji = ?, color = ? WHERE id = ?', name, String(body.emoji || '🍽️').slice(0, 8),
    /^#[0-9a-fA-F]{6}$/.test(body.color) ? body.color : '#F97316', Number(ctx.params.id));
  sendJson(ctx.res, 200, { ok: true });
});

route('DELETE', '/api/admin/categories/:id', (ctx) => {
  requireAdmin(ctx);
  run('DELETE FROM categories WHERE id = ?', Number(ctx.params.id));
  sendJson(ctx.res, 200, { ok: true });
});

// ---------------------------------------------------------------- servidor
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.webp': 'image/webp',
};

function serveStatic(req, res, pathname) {
  const name = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = PUBLIC_FILES.has(name) ? path.join(PUBLIC_DIR, name) : path.join(PUBLIC_DIR, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  try {
    if (!url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
      return serveStatic(req, res, url.pathname);
    }
    const match = routes.map((r) => ({ r, m: r.re.exec(url.pathname) })).find((x) => x.m && x.r.method === req.method);
    if (!match) {
      const other = routes.some((r) => r.re.test(url.pathname));
      return sendJson(res, other ? 405 : 404, { error: other ? 'Método não permitido.' : 'Rota não encontrada.' });
    }
    const ctx = {
      req, res, url, user: currentUser(req),
      params: match.m.groups || {},
      params_q: url.searchParams,
    };
    await match.r.handler(ctx);
  } catch (err) {
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: 'Erro interno no servidor.' });
  }
});

seedIfEmpty();

// Para testes automatizados: exporta o servidor sem iniciar automaticamente.
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`SABOR+ rodando em http://localhost:${PORT}`);
  });
}

module.exports = { server };
