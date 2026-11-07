'use strict';

// Conteúdo inicial do SABOR+ (categorias e receitas de exemplo).
// Medidas: quantity = número (ou null para "a gosto"), unit = unidade.

const categories = [
  { slug: 'bolos', name: 'Bolos e tortas', emoji: '🍰', color: '#F472B6' },
  { slug: 'doces', name: 'Doces e sobremesas', emoji: '🍫', color: '#A16207' },
  { slug: 'massas', name: 'Pizzas e massas', emoji: '🍕', color: '#EF4444' },
  { slug: 'lanches', name: 'Hambúrgueres e lanches', emoji: '🍔', color: '#F59E0B' },
  { slug: 'carnes', name: 'Carnes e frangos', emoji: '🍗', color: '#D97706' },
  { slug: 'saladas', name: 'Saladas', emoji: '🥗', color: '#22C55E' },
  { slug: 'sopas', name: 'Sopas e caldos', emoji: '🍲', color: '#F97316' },
  { slug: 'cafe', name: 'Café da manhã', emoji: '🍳', color: '#FBBF24' },
  { slug: 'almoco', name: 'Almoço e jantar', emoji: '🍛', color: '#FB923C' },
  { slug: 'fitness', name: 'Receitas fitness', emoji: '💪', color: '#0EA5E9' },
  { slug: 'saudaveis', name: 'Receitas saudáveis', emoji: '🥑', color: '#65A30D' },
  { slug: 'economicas', name: 'Receitas econômicas', emoji: '💰', color: '#16A34A' },
  { slug: 'bebidas', name: 'Bebidas e sucos', emoji: '🥤', color: '#8B5CF6' },
  { slug: 'paes', name: 'Pães e salgados', emoji: '🍞', color: '#B45309' },
];

const recipes = [
  {
    title: 'Bolo de cenoura com cobertura de chocolate',
    description: 'Bolo fofinho e úmido, com a cobertura de chocolate brilhante que todo mundo ama.',
    category: 'bolos', prep: 20, cook: 40, servings: 10, difficulty: 'medio',
    tags: 'bolo,cenoura,chocolate,festa', nutrition: { kcal: 390, protein: 5, carbs: 52, fat: 18 }, views: 820, daysAgo: 30,
    ingredients: [
      [3, 'unidade', 'cenouras médias'], [3, 'unidade', 'ovos'], [240, 'ml', 'óleo'],
      [2, 'xícara', 'açúcar'], [2, 'xícara', 'farinha de trigo'], [1, 'colher de sopa', 'fermento em pó'],
      [3, 'colher de sopa', 'chocolate em pó'], [3, 'colher de sopa', 'açúcar (cobertura)'],
      [1, 'colher de sopa', 'manteiga'], [4, 'colher de sopa', 'água quente'],
    ],
    steps: [
      'No liquidificador, bata as cenouras, os ovos e o óleo até obter uma mistura homogênea.',
      'Acrescente o açúcar e bata por mais um minuto.',
      'Em uma tigela, misture a farinha e o fermento. Incorpore a mistura do liquidificador aos poucos, com movimentos delicados.',
      'Despeje em forma untada e enfarinhada e asse a 180 °C por cerca de 40 minutos, até que um palito saia seco.',
      'Para a cobertura, leve ao fogo baixo o chocolate, o açúcar, a manteiga e a água, mexendo até engrossar. Despeje sobre o bolo frio.',
    ],
  },
  {
    title: 'Brigadeiro de colher cremoso',
    description: 'O clássico brasileiro em versão de colher, perfeito para servir em festas.',
    category: 'doces', prep: 10, cook: 15, servings: 6, difficulty: 'facil',
    tags: 'brigadeiro,festa,chocolate', nutrition: { kcal: 180, protein: 2, carbs: 28, fat: 6 }, views: 640, daysAgo: 12,
    ingredients: [
      [1, 'lata', 'leite condensado'], [1, 'colher de sopa', 'manteiga'],
      [3, 'colher de sopa', 'chocolate em pó'], [50, 'g', 'chocolate granulado'],
    ],
    steps: [
      'Em uma panela antiaderente, misture o leite condensado, a manteiga e o chocolate em pó.',
      'Leve ao fogo médio, mexendo sem parar, até que a massa se solte do fundo da panela.',
      'Despeje em um prato untado e deixe esfriar completamente.',
      'Sirva em colheres pequenas e finalize com o chocolate granulado.',
    ],
  },
  {
    title: 'Espaguete à bolonhesa caseiro',
    description: 'Molho encorpado com carne moída, cebola e tomate, cozido em fogo baixo para ficar saboroso.',
    category: 'massas', prep: 15, cook: 40, servings: 4, difficulty: 'medio',
    tags: 'massa,carne,almoço,jantar', nutrition: { kcal: 520, protein: 28, carbs: 62, fat: 16 }, views: 910, daysAgo: 5,
    ingredients: [
      [500, 'g', 'espaguete'], [500, 'g', 'carne moída (patinho)'], [1, 'unidade', 'cebola média picada'],
      [2, 'dente', 'alho picado'], [400, 'g', 'molho de tomate pelado'], [2, 'colher de sopa', 'azeite'],
      [1, 'colher de chá', 'sal'], [null, '', 'manjericão a gosto'],
    ],
    steps: [
      'Ferva bastante água com sal e cozinhe o espaguete até ficar al dente. Reserve.',
      'Aqueça o azeite e refogue a cebola e o alho até ficarem macios.',
      'Adicione a carne moída e cozinhe até dourar, desfazendo os grumos.',
      'Acrescente o molho de tomate, tempere com sal e deixe cozinhar em fogo baixo por 25 minutos.',
      'Sirva o molho sobre o espaguete e finalize com manjericão.',
    ],
  },
  {
    title: 'Hambúrguer caseiro suculento',
    description: 'Hambúrguer feito em casa com carne bovina temperada na medida certa.',
    category: 'lanches', prep: 20, cook: 10, servings: 4, difficulty: 'facil',
    tags: 'hamburguer,lanche,carne', nutrition: { kcal: 610, protein: 34, carbs: 42, fat: 32 }, views: 760, daysAgo: 20,
    ingredients: [
      [500, 'g', 'carne bovina moída (acém)'], [1, 'unidade', 'cebola pequena ralada'], [2, 'dente', 'alho amassado'],
      [1, 'colher de chá', 'sal'], [1, 'pitada', 'pimenta-do-reino'], [4, 'unidade', 'pães de hambúrguer'],
      [4, 'fatia', 'queijo cheddar'], [null, '', 'folhas de alface e tomate a gosto'],
    ],
    steps: [
      'Misture a carne com a cebola, o alho, o sal e a pimenta, sem amassar demais.',
      'Modele 4 discos de mesmo tamanho, com cerca de 2 cm de espessura, e leve à geladeira por 15 minutos.',
      'Aqueça uma frigideira em fogo alto e grelhe os hambúrgueres por 3 a 4 minutos de cada lado.',
      'Coloque o queijo sobre a carne nos últimos 30 segundos de cozimento.',
      'Monte o lanche com o pão, a carne, a alface e o tomate.',
    ],
  },
  {
    title: 'Frango grelhado ao limão',
    description: 'Filé de frango macio e cítrico, pronto em pouco tempo e ótimo para o dia a dia.',
    category: 'carnes', prep: 15, cook: 15, servings: 4, difficulty: 'facil',
    tags: 'frango,limão,proteína,jantar', nutrition: { kcal: 230, protein: 38, carbs: 2, fat: 8 }, views: 530, daysAgo: 8,
    ingredients: [
      [4, 'unidade', 'filés de peito de frango'], [2, 'unidade', 'limões (suco)'], [2, 'dente', 'alho amassado'],
      [2, 'colher de sopa', 'azeite'], [1, 'colher de chá', 'sal'], [1, 'pitada', 'pimenta-do-reino'],
    ],
    steps: [
      'Tempere os filés com o suco de limão, o alho, o azeite, o sal e a pimenta.',
      'Deixe marinar por pelo menos 30 minutos na geladeira.',
      'Aqueça uma frigideira antiaderente com um fio de azeite.',
      'Grelhe os filés em fogo médio por 6 a 7 minutos de cada lado, até ficarem dourados e cozidos por dentro.',
    ],
  },
  {
    title: 'Salada de grão-de-bico com limão',
    description: 'Salada fresca e nutritiva, cheia de fibras e sabor, ideal para levar na marmita.',
    category: 'saladas', prep: 15, cook: 0, servings: 4, difficulty: 'facil',
    tags: 'salada,vegetariana,saudável,marmita', nutrition: { kcal: 260, protein: 11, carbs: 34, fat: 9 }, views: 410, daysAgo: 40,
    ingredients: [
      [400, 'g', 'grão-de-bico cozido'], [2, 'unidade', 'tomates'], [1, 'unidade', 'pepino japonês'],
      [1, 'unidade', 'cebola roxa pequena'], [1, 'maço', 'salsinha picada'], [3, 'colher de sopa', 'azeite'],
      [1, 'unidade', 'limão (suco)'], [1, 'pitada', 'sal'],
    ],
    steps: [
      'Escorra e lave o grão-de-bico.',
      'Pique o tomate, o pepino e a cebola roxa em cubos pequenos.',
      'Misture todos os ingredientes em uma tigela grande.',
      'Tempere com azeite, suco de limão e sal, e sirva imediatamente ou leve à geladeira.',
    ],
  },
  {
    title: 'Sopa de abóbora com gengibre',
    description: 'Creme aveludado e reconfortante, com toque picante de gengibre.',
    category: 'sopas', prep: 15, cook: 30, servings: 4, difficulty: 'facil',
    tags: 'sopa,abóbora,inverno,saudável', nutrition: { kcal: 150, protein: 3, carbs: 24, fat: 5 }, views: 380, daysAgo: 60,
    ingredients: [
      [800, 'g', 'abóbora japonesa'], [1, 'unidade', 'cebola média'], [2, 'dente', 'alho'],
      [1, 'colher de chá', 'gengibre ralado'], [1, 'l', 'caldo de legumes'], [2, 'colher de sopa', 'azeite'],
      [1, 'colher de chá', 'sal'],
    ],
    steps: [
      'Refogue a cebola e o alho no azeite até ficarem macios.',
      'Adicione a abóbora picada, o gengibre e o caldo de legumes.',
      'Cozinhe em fogo médio por cerca de 25 minutos, até a abóbora ficar bem macia.',
      'Bata no liquidificador até ficar cremoso, ajuste o sal e sirva quente.',
    ],
  },
  {
    title: 'Panqueca de banana e aveia',
    description: 'Café da manhã sem açúcar refinado, prático e cheio de energia.',
    category: 'cafe', prep: 5, cook: 15, servings: 2, difficulty: 'facil',
    tags: 'café da manhã,fitness,sem açúcar,banana', nutrition: { kcal: 280, protein: 12, carbs: 45, fat: 6 }, views: 690, daysAgo: 3,
    ingredients: [
      [2, 'unidade', 'bananas maduras'], [2, 'unidade', 'ovos'], [4, 'colher de sopa', 'aveia em flocos'],
      [1, 'pitada', 'canela em pó'],
    ],
    steps: [
      'Amasse as bananas com um garfo até formar um purê.',
      'Misture os ovos, a aveia e a canela até obter uma massa homogênea.',
      'Aqueça uma frigideira antiaderente untada com um pouco de óleo.',
      'Despeje porções pequenas da massa e cozinhe por 2 minutos de cada lado.',
    ],
  },
  {
    title: 'Arroz carreteiro econômico',
    description: 'Prato completo, rendoso e barato, com linguiça e tomate, feito em uma só panela.',
    category: 'economicas', prep: 15, cook: 30, servings: 4, difficulty: 'facil',
    tags: 'econômico,arroz,linguiça,família', nutrition: { kcal: 480, protein: 16, carbs: 70, fat: 14 }, views: 470, daysAgo: 45,
    ingredients: [
      [2, 'xícara', 'arroz'], [200, 'g', 'linguiça calabresa'], [1, 'unidade', 'cebola média'],
      [2, 'dente', 'alho'], [2, 'unidade', 'tomates'], [1, 'colher de sopa', 'óleo'], [4, 'xícara', 'água'],
      [1, 'colher de chá', 'sal'],
    ],
    steps: [
      'Corte a linguiça em rodelas e frite no óleo até dourar. Reserve.',
      'No mesmo óleo, refogue a cebola, o alho e o tomate picado.',
      'Lave o arroz, acrescente à panela e refogue por 1 minuto.',
      'Adicione a água, o sal e a linguiça, tampe e cozinhe em fogo baixo por 20 minutos.',
    ],
  },
  {
    title: 'Suco verde detox',
    description: 'Bebida refrescante, rica em vitaminas, para começar o dia com disposição.',
    category: 'bebidas', prep: 10, cook: 0, servings: 2, difficulty: 'facil',
    tags: 'suco,detox,verde,saudável', nutrition: { kcal: 90, protein: 2, carbs: 22, fat: 0 }, views: 300, daysAgo: 25,
    ingredients: [
      [2, 'unidade', 'folhas de couve'], [1, 'unidade', 'maçã verde'], [0.5, 'unidade', 'limão (suco)'],
      [200, 'ml', 'água de coco'], [1, 'colher de chá', 'mel'],
    ],
    steps: [
      'Lave bem a couve e a maçã, retirando as sementes da maçã.',
      'Bata todos os ingredientes no liquidificador por 1 minuto.',
      'Coe se preferir uma textura mais leve e sirva gelado.',
    ],
  },
  {
    title: 'Pão caseiro macio',
    description: 'Pão de forma simples, com miolo macio e crosta dourada.',
    category: 'paes', prep: 25, cook: 35, servings: 10, difficulty: 'medio',
    tags: 'pão,fermentação,café da manhã', nutrition: { kcal: 210, protein: 6, carbs: 42, fat: 2 }, views: 580, daysAgo: 15,
    ingredients: [
      [500, 'g', 'farinha de trigo'], [10, 'g', 'fermento biológico seco'], [300, 'ml', 'água morna'],
      [1, 'colher de chá', 'sal'], [2, 'colher de sopa', 'açúcar'], [1, 'colher de sopa', 'manteiga'],
    ],
    steps: [
      'Misture a farinha, o fermento, o açúcar e o sal em uma tigela.',
      'Acrescente a água morna aos poucos e a manteiga, sovando por cerca de 10 minutos até a massa ficar lisa.',
      'Cubra e deixe descansar por 1 hora, até dobrar de volume.',
      'Modele o pão, coloque em forma untada, deixe crescer por mais 30 minutos e asse a 180 °C por 35 minutos.',
    ],
  },
  {
    title: 'Pizza margherita de massa caseira',
    description: 'Pizza clássica com molho de tomate, mussarela e manjericão fresco.',
    category: 'massas', prep: 30, cook: 12, servings: 4, difficulty: 'dificil',
    tags: 'pizza,massa,queijo,jantar', nutrition: { kcal: 450, protein: 18, carbs: 58, fat: 16 }, views: 860, daysAgo: 2,
    ingredients: [
      [500, 'g', 'farinha de trigo'], [7, 'g', 'fermento biológico seco'], [300, 'ml', 'água morna'],
      [1, 'colher de chá', 'sal'], [2, 'colher de sopa', 'azeite'], [200, 'g', 'mussarela'],
      [150, 'g', 'molho de tomate'], [null, '', 'manjericão fresco a gosto'],
    ],
    steps: [
      'Misture a farinha, o fermento e a água morna. Acrescente o sal e o azeite e sove até a massa ficar lisa.',
      'Deixe descansar coberta por 1 hora, até dobrar de volume.',
      'Abra a massa em um disco fino sobre uma assadeira untada.',
      'Espalhe o molho de tomate, a mussarela em fatias e um fio de azeite.',
      'Asse em forno bem quente, a 250 °C, por cerca de 12 minutos, e finalize com manjericão.',
    ],
  },
];

const demoUsers = [
  { name: 'Ana Clara', email: 'ana@exemplo.com' },
  { name: 'Bruno Lima', email: 'bruno@exemplo.com' },
  { name: 'Carla Souza', email: 'carla@exemplo.com' },
];

// Avaliações e comentários de exemplo: [recipeIndex, userIndex, stars, comment]
const demoReviews = [
  [0, 0, 5, 'Ficou fofinho e a cobertura é maravilhosa! Virou presença obrigatória nos aniversários.'],
  [0, 1, 4, 'Receita muito boa. Usei um pouco menos de açúcar e ficou ótimo.'],
  [1, 2, 5, 'Textura perfeita para o brigadeiro de colher. Todo mundo pediu a receita.'],
  [2, 0, 5, 'Molho saboroso e fácil de fazer. Deixar cozinhando em fogo baixo faz toda a diferença.'],
  [3, 1, 4, 'Hambúrguer suculento. Gelar os discos antes de grelhar ajuda muito.'],
  [4, 2, 4, 'Frango bem temperado e rápido. Ótimo para a semana corrida.'],
  [5, 0, 4, 'Salada leve e prática para a marmita. Adicionei tomate-cereja, ficou ainda melhor.'],
  [7, 2, 5, 'Adoro essa panqueca no café da manhã. Muito saciante!'],
  [8, 1, 5, 'Prato econômico e muito gostoso. Rende bastante para a família toda.'],
  [11, 0, 5, 'Massa leve e crocante na borda. Melhor pizza caseira que já fiz.'],
  [11, 2, 4, 'Deixei a massa descansar na geladeira por uma noite e ficou excelente.'],
  [6, 1, 3, 'Sopa boa, mas achei que precisava de um pouco mais de sal.'],
];

module.exports = { categories, recipes, demoUsers, demoReviews };
