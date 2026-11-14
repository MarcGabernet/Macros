// Every piece of text the app shows, in every language.
//
// TEXTS maps a key to its text in each language: { en: '…', ca: '…', es: '…' }.
// - {name} in a text is filled in from the values passed to t(key, { name }).
// - A text that depends on a count is an object { one, other }; pass { n }.
// - A language without a text for some key falls back to English.
// To add a language: add it to LANGUAGES and a text for it to each entry.

export const LANGUAGES = [
  { value: 'en', label: 'English', locale: 'en-GB' },
  { value: 'ca', label: 'Català', locale: 'ca-ES' },
  { value: 'es', label: 'Español', locale: 'es-ES' },
];

const KEY = 'macros.lang'; // chosen on each device, like the theme
const listeners = new Set();

function detect() {
  try {
    const saved = localStorage.getItem(KEY);
    if (LANGUAGES.some((l) => l.value === saved)) return saved;
  } catch { /* storage unavailable */ }
  for (const pref of navigator.languages || [navigator.language || '']) {
    const code = String(pref).slice(0, 2).toLowerCase();
    if (LANGUAGES.some((l) => l.value === code)) return code;
  }
  return 'en';
}

let lang = detect();
document.documentElement.lang = lang;

export const getLanguage = () => lang;

/** The locale for dates and numbers in the current language, e.g. 'es-ES'. */
export const locale = () => LANGUAGES.find((l) => l.value === lang).locale;

export function setLanguage(next) {
  if (!LANGUAGES.some((l) => l.value === next) || next === lang) return;
  lang = next;
  try { localStorage.setItem(KEY, next); } catch { /* still applies for this visit */ }
  document.documentElement.lang = next;
  for (const fn of [...listeners]) fn();
}

/** Call `fn` whenever the language changes (to redraw). */
export function onLanguageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The text for `key` in the current language, with {placeholders} filled from `vars`. */
export function t(key, vars = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    console.warn('Missing text:', key);
    return key;
  }
  let text = entry[lang] ?? entry.en;
  if (text && typeof text === 'object') text = vars.n === 1 ? text.one : text.other;
  return String(text).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}

// ---------------------------------------------------------------------------
// The texts, grouped by where they appear.

const TEXTS = {
  // ------------------------------------------------------------ app & tabs
  'tab.day': { en: 'Day', ca: 'Dia', es: 'Día' },
  'tab.calendar': { en: 'Calendar', ca: 'Calendari', es: 'Calendario' },
  'tab.foods': { en: 'Foods', ca: 'Aliments', es: 'Alimentos' },
  'tab.settings': { en: 'Settings', ca: 'Configuració', es: 'Ajustes' },
  'tab.sections': { en: 'Sections', ca: 'Seccions', es: 'Secciones' },
  'tab.scan': { en: 'Scan a product', ca: 'Escaneja un producte', es: 'Escanear un producto' },
  'tab.addFood': { en: 'Add food', ca: 'Afegeix menjar', es: 'Añadir comida' },
  'banner.paused': { en: 'Drive sync is paused', ca: 'La sincronització amb Drive està en pausa', es: 'La sincronización con Drive está en pausa' },
  'banner.reconnect': { en: 'Reconnect', ca: 'Torna a connectar', es: 'Volver a conectar' },
  'banner.bothHaveData': { en: 'Drive and this device both have data', ca: 'Drive i aquest dispositiu tenen dades', es: 'Drive y este dispositivo tienen datos' },
  'banner.choose': { en: 'Choose', ca: 'Tria', es: 'Elegir' },

  // ---------------------------------------------------------------- common
  'common.close': { en: 'Close', ca: 'Tanca', es: 'Cerrar' },
  'common.cancel': { en: 'Cancel', ca: 'Cancel·la', es: 'Cancelar' },
  'common.delete': { en: 'Delete', ca: 'Elimina', es: 'Eliminar' },
  'common.save': { en: 'Save', ca: 'Desa', es: 'Guardar' },
  'common.add': { en: 'Add', ca: 'Afegeix', es: 'Añadir' },
  'common.remove': { en: 'Remove', ca: 'Treu', es: 'Quitar' },
  'common.search': { en: 'Search', ca: 'Cerca', es: 'Buscar' },
  'common.optional': { en: 'optional', ca: 'opcional', es: 'opcional' },
  'common.none': { en: 'none', ca: 'cap', es: 'ninguno' },
  'common.today': { en: 'Today', ca: 'Avui', es: 'Hoy' },
  'common.yesterday': { en: 'Yesterday', ca: 'Ahir', es: 'Ayer' },
  'common.tomorrow': { en: 'Tomorrow', ca: 'Demà', es: 'Mañana' },
  'common.todayLower': { en: 'today', ca: 'avui', es: 'hoy' },
  'common.nothingMatches': { en: 'Nothing matches', ca: 'No hi ha cap resultat', es: 'No hay resultados' },

  // ------------------------------------------------------------ theme
  'theme.light': { en: 'Light', ca: 'Clar', es: 'Claro' },
  'theme.dark': { en: 'Dark', ca: 'Fosc', es: 'Oscuro' },

  // -------------------------------------------- kinds of food (gendered sentences per kind)
  'kind.ingredient': { en: 'Ingredient', ca: 'Ingredient', es: 'Ingrediente' },
  'kind.ingredient.plural': { en: 'Ingredients', ca: 'Ingredients', es: 'Ingredientes' },
  'kind.ingredient.hint': { en: 'A single food with its own nutrition values', ca: 'Un aliment amb els seus propis valors nutricionals', es: 'Un alimento con sus propios valores nutricionales' },
  'kind.ingredient.piece': { en: 'unit', ca: 'unitat', es: 'unidad' },
  'kind.ingredient.whole': { en: 'whole ingredient', ca: 'ingredient sencer', es: 'ingrediente entero' },
  'kind.ingredient.new': { en: 'New ingredient', ca: 'Nou ingredient', es: 'Nuevo ingrediente' },
  'kind.ingredient.edit': { en: 'Edit ingredient', ca: 'Edita l’ingredient', es: 'Editar ingrediente' },
  'kind.ingredient.create': { en: 'Create ingredient', ca: 'Crea l’ingredient', es: 'Crear ingrediente' },
  'kind.ingredient.delete': { en: 'Delete ingredient', ca: 'Elimina l’ingredient', es: 'Eliminar ingrediente' },
  'kind.ingredient.none': { en: 'No ingredients yet', ca: 'Encara no hi ha ingredients', es: 'Aún no hay ingredientes' },
  'kind.ingredient.search': { en: 'Search ingredients', ca: 'Cerca ingredients', es: 'Buscar ingredientes' },
  'kind.ingredient.theWhole': { en: 'The whole ingredient', ca: 'L’ingredient sencer', es: 'El ingrediente entero' },

  'kind.dish': { en: 'Dish', ca: 'Plat', es: 'Plato' },
  'kind.dish.plural': { en: 'Dishes', ca: 'Plats', es: 'Platos' },
  'kind.dish.hint': { en: 'A recipe built from ingredients, or entered directly', ca: 'Una recepta feta amb ingredients, o introduïda directament', es: 'Una receta hecha con ingredientes, o introducida directamente' },
  'kind.dish.piece': { en: 'dish', ca: 'plat', es: 'plato' },
  'kind.dish.whole': { en: 'whole dish', ca: 'plat sencer', es: 'plato entero' },
  'kind.dish.new': { en: 'New dish', ca: 'Nou plat', es: 'Nuevo plato' },
  'kind.dish.edit': { en: 'Edit dish', ca: 'Edita el plat', es: 'Editar plato' },
  'kind.dish.create': { en: 'Create dish', ca: 'Crea el plat', es: 'Crear plato' },
  'kind.dish.delete': { en: 'Delete dish', ca: 'Elimina el plat', es: 'Eliminar plato' },
  'kind.dish.none': { en: 'No dishes yet', ca: 'Encara no hi ha plats', es: 'Aún no hay platos' },
  'kind.dish.search': { en: 'Search dishes', ca: 'Cerca plats', es: 'Buscar platos' },
  'kind.dish.theWhole': { en: 'The whole dish', ca: 'El plat sencer', es: 'El plato entero' },
  'kind.dish.needsParts': { en: 'A dish needs at least one ingredient', ca: 'Un plat necessita com a mínim un ingredient', es: 'Un plato necesita al menos un ingrediente' },

  'kind.meal': { en: 'Meal', ca: 'Àpat', es: 'Comida' },
  'kind.meal.plural': { en: 'Meals', ca: 'Àpats', es: 'Comidas' },
  'kind.meal.hint': { en: 'A combination of dishes and ingredients you eat together', ca: 'Una combinació de plats i ingredients que menges junts', es: 'Una combinación de platos e ingredientes que comes juntos' },
  'kind.meal.piece': { en: 'meal', ca: 'àpat', es: 'comida' },
  'kind.meal.whole': { en: 'whole meal', ca: 'àpat sencer', es: 'comida entera' },
  'kind.meal.new': { en: 'New meal', ca: 'Nou àpat', es: 'Nueva comida' },
  'kind.meal.edit': { en: 'Edit meal', ca: 'Edita l’àpat', es: 'Editar comida' },
  'kind.meal.create': { en: 'Create meal', ca: 'Crea l’àpat', es: 'Crear comida' },
  'kind.meal.delete': { en: 'Delete meal', ca: 'Elimina l’àpat', es: 'Eliminar comida' },
  'kind.meal.none': { en: 'No meals yet', ca: 'Encara no hi ha àpats', es: 'Aún no hay comidas' },
  'kind.meal.search': { en: 'Search meals', ca: 'Cerca àpats', es: 'Buscar comidas' },
  'kind.meal.theWhole': { en: 'The whole meal', ca: 'L’àpat sencer', es: 'La comida entera' },
  'kind.meal.needsParts': { en: 'A meal needs at least one ingredient or dish', ca: 'Un àpat necessita com a mínim un ingredient o un plat', es: 'Una comida necesita al menos un ingrediente o un plato' },

  // ------------------------------------------------------ units & amounts
  'unit.perGrams': { en: 'per {g} g', ca: 'per {g} g', es: 'por {g} g' },
  'unit.perPiece': { en: 'per {piece}', ca: 'per {piece}', es: 'por {piece}' },
  'amount.percentOf': { en: '{v}% of {piece}', ca: '{v}% de {piece}', es: '{v}% de {piece}' },

  // --------------------------------------------------- incomplete foods
  'issue.missingPart': { en: 'A part of this food no longer exists', ca: 'Una part d’aquest aliment ja no existeix', es: 'Una parte de este alimento ya no existe' },
  'issue.notAllowed': { en: '{name} can’t be part of this food', ca: '{name} no pot formar part d’aquest aliment', es: '{name} no puede formar parte de este alimento' },
  'issue.needsWeight': { en: '{name} needs a weight to be measured in grams', ca: '{name} necessita un pes per mesurar-lo en grams', es: '{name} necesita un peso para medirlo en gramos' },

  // ------------------------------------------------------------ nutrients
  'nutrient.kcal': { en: 'Calories', ca: 'Calories', es: 'Calorías' },
  'nutrient.fat': { en: 'Fat', ca: 'Greixos', es: 'Grasas' },
  'nutrient.saturates': { en: 'Saturates', ca: 'Saturats', es: 'Saturadas' },
  'nutrient.monounsaturates': { en: 'Monounsaturates', ca: 'Monoinsaturats', es: 'Monoinsaturadas' },
  'nutrient.monounsaturates.brief': { en: 'Monounsat.', ca: 'Monoinsat.', es: 'Monoinsat.' },
  'nutrient.polyunsaturates': { en: 'Polyunsaturates', ca: 'Poliinsaturats', es: 'Poliinsaturadas' },
  'nutrient.polyunsaturates.brief': { en: 'Polyunsat.', ca: 'Poliinsat.', es: 'Poliinsat.' },
  'nutrient.carbs': { en: 'Carbohydrate', ca: 'Hidrats de carboni', es: 'Hidratos de carbono' },
  'nutrient.sugars': { en: 'Sugars', ca: 'Sucres', es: 'Azúcares' },
  'nutrient.fibre': { en: 'Fibre', ca: 'Fibra', es: 'Fibra' },
  'nutrient.protein': { en: 'Protein', ca: 'Proteïnes', es: 'Proteínas' },
  'nutrient.salt': { en: 'Salt', ca: 'Sal', es: 'Sal' },
  'nutrient.potassium': { en: 'Potassium', ca: 'Potassi', es: 'Potasio' },
  'nutrient.calcium': { en: 'Calcium', ca: 'Calci', es: 'Calcio' },
  'nutrient.iron': { en: 'Iron', ca: 'Ferro', es: 'Hierro' },
  'nutrient.magnesium': { en: 'Magnesium', ca: 'Magnesi', es: 'Magnesio' },
  'nutrient.vitaminC': { en: 'Vitamin C', ca: 'Vitamina C', es: 'Vitamina C' },
  'nutrient.vitaminD': { en: 'Vitamin D', ca: 'Vitamina D', es: 'Vitamina D' },
  'nutrient.vitaminB12': { en: 'Vitamin B12', ca: 'Vitamina B12', es: 'Vitamina B12' },
  'group.macro': { en: 'Macros', ca: 'Macros', es: 'Macros' },
  'group.mineral': { en: 'Minerals', ca: 'Minerals', es: 'Minerales' },
  'group.vitamin': { en: 'Vitamins', ca: 'Vitamines', es: 'Vitaminas' },

  'nutrient.kcal.short': { en: 'kcal', ca: 'kcal', es: 'kcal' },
  'nutrient.fat.short': { en: 'F', ca: 'G', es: 'G' },
  'nutrient.saturates.short': { en: 'Sat', ca: 'Sat', es: 'Sat' },
  'nutrient.monounsaturates.short': { en: 'Mono', ca: 'Mono', es: 'Mono' },
  'nutrient.polyunsaturates.short': { en: 'Poly', ca: 'Poli', es: 'Poli' },
  'nutrient.carbs.short': { en: 'C', ca: 'HC', es: 'HC' },
  'nutrient.sugars.short': { en: 'Sug', ca: 'Suc', es: 'Azú' },
  'nutrient.fibre.short': { en: 'Fib', ca: 'Fib', es: 'Fib' },
  'nutrient.protein.short': { en: 'P', ca: 'P', es: 'P' },
  'nutrient.salt.short': { en: 'Salt', ca: 'Sal', es: 'Sal' },
  'nutrient.potassium.short': { en: 'K', ca: 'K', es: 'K' },
  'nutrient.calcium.short': { en: 'Ca', ca: 'Ca', es: 'Ca' },
  'nutrient.iron.short': { en: 'Fe', ca: 'Fe', es: 'Fe' },
  'nutrient.magnesium.short': { en: 'Mg', ca: 'Mg', es: 'Mg' },
  'nutrient.vitaminC.short': { en: 'C', ca: 'C', es: 'C' },
  'nutrient.vitaminD.short': { en: 'D', ca: 'D', es: 'D' },
  'nutrient.vitaminB12.short': { en: 'B12', ca: 'B12', es: 'B12' },
  // "of which ..." agrees with its parent nutrient (Spanish: de las cuales saturadas / de los cuales azúcares)
  'nutrient.fat.ofWhich': { en: 'of which {name}', ca: 'dels quals {name}', es: 'de las cuales {name}' },
  'nutrient.carbs.ofWhich': { en: 'of which {name}', ca: 'dels quals {name}', es: 'de los cuales {name}' },

  // ------------------------------------------------------------------- day
  'day.addTo': { en: 'Add to {when}', ca: 'Afegeix a {when}', es: 'Añadir a {when}' },
  'day.added': { en: '{name} added', ca: '{name} afegit', es: '{name} añadido' },
  'day.removed': { en: '{name} removed', ca: '{name} tret', es: '{name} quitado' },
  'day.unknownFood': { en: 'Unknown food', ca: 'Aliment desconegut', es: 'Alimento desconocido' },
  'day.previous': { en: 'Previous day', ca: 'Dia anterior', es: 'Día anterior' },
  'day.next': { en: 'Next day', ca: 'Dia següent', es: 'Día siguiente' },
  'day.eaten': { en: 'Eaten', ca: 'Menjat', es: 'Comido' },
  'day.items': { en: { one: '{n} item', other: '{n} items' }, ca: { one: '{n} element', other: '{n} elements' }, es: { one: '{n} elemento', other: '{n} elementos' } },
  'day.emptyTitle': { en: 'Nothing logged yet', ca: 'Encara no hi ha res', es: 'Aún no hay nada' },
  'day.emptyText': { en: 'Add what you ate and the totals appear above', ca: 'Afegeix el que has menjat i a dalt en veuràs els totals', es: 'Añade lo que has comido y arriba verás los totales' },

  // --------------------------------------------------------------- weight
  'weight.label': { en: 'Weight', ca: 'Pes', es: 'Peso' },
  'weight.current': { en: 'Current weight', ca: 'Pes actual', es: 'Peso actual' },
  'weight.removed': { en: 'Weigh-in removed', ca: 'Pesada eliminada', es: 'Pesaje eliminado' },
  'weight.invalid': { en: 'That weight isn’t valid', ca: 'Aquest pes no és vàlid', es: 'Ese peso no es válido' },
  'weight.saved': { en: 'Weight saved', ca: 'Pes desat', es: 'Peso guardado' },
  'weight.loggedToday': { en: 'Logged for this day', ca: 'Registrat per a aquest dia', es: 'Registrado para este día' },
  'weight.last': { en: 'Last: {value} on {date}', ca: 'Últim: {value} el {date}', es: 'Último: {value} el {date}' },
  'weight.prompt': { en: 'Weighed yourself? Add it here', ca: 'T’has pesat? Afegeix-ho aquí', es: '¿Te has pesado? Añádelo aquí' },

  // ----------------------------------------------------------------- foods
  'foods.tryAnother': { en: 'Try another name', ca: 'Prova un altre nom', es: 'Prueba otro nombre' },
  'foods.kind': { en: 'Kind of food', ca: 'Tipus d’aliment', es: 'Tipo de alimento' },

  // ---------------------------------------------------- goals & references
  'goal.aria': { en: '{value} of {goal}', ca: '{value} de {goal}', es: '{value} de {goal}' },
  'goal.ringAria': { en: '{value} of {goal} ({pct}%)', ca: '{value} de {goal} ({pct}%)', es: '{value} de {goal} ({pct}%)' },
  'goal.ringLimitAria': { en: '{value} of a limit of {goal} ({pct}%)', ca: '{value} d’un límit de {goal} ({pct}%)', es: '{value} de un límite de {goal} ({pct}%)' },
  'goal.targetOf': { en: 'of {value}', ca: 'de {value}', es: 'de {value}' },
  'goal.limitOf': { en: 'limit {value}', ca: 'límit {value}', es: 'límite {value}' },
  'goal.left': { en: '{value} left', ca: 'en queden {value}', es: 'quedan {value}' },
  'goal.overLimit': { en: '{value} over limit', ca: '{value} per sobre del límit', es: '{value} por encima del límite' },
  'goal.toGo': { en: '{value} to go', ca: 'en falten {value}', es: 'faltan {value}' },
  'goal.reached': { en: 'Target reached', ca: 'Objectiu assolit', es: 'Objetivo alcanzado' },
  'goal.max': { en: 'max', ca: 'màx.', es: 'máx.' },
  'goals.aria': { en: 'Goals', ca: 'Objectius', es: 'Objetivos' },
  'goals.today': { en: 'Goals today', ca: 'Objectius d’avui', es: 'Objetivos de hoy' },
  'goals.thisDay': { en: 'Goals this day', ca: 'Objectius d’aquest dia', es: 'Objetivos de este día' },
  'goals.met': { en: '{met} of {total} met', ca: '{met} de {total} assolits', es: '{met} de {total} cumplidos' },
  'goals.isMet': { en: 'met', ca: 'assolit', es: 'cumplido' },
  'goals.notMet': { en: 'not met', ca: 'no assolit', es: 'no cumplido' },
  'ref.short': { en: 'Ref {value}', ca: 'Ref. {value}', es: 'Ref. {value}' },
  'ref.share': { en: '{ref} · {pct}% of it', ca: '{ref} · {pct}% d’aquesta', es: '{ref} · {pct}% de esta' },

  // ------------------------------------------------- food picker & amounts
  'food.incomplete': { en: 'Some parts are incomplete', ca: 'Algunes parts estan incompletes', es: 'Algunas partes están incompletas' },
  'food.incompleteLow': { en: 'Some parts of this food are incomplete, so its numbers may be low', ca: 'Algunes parts d’aquest aliment estan incompletes, així que els valors poden ser baixos', es: 'Algunas partes de este alimento están incompletas, así que los valores pueden ser bajos' },
  'picker.title': { en: 'Choose a food', ca: 'Tria un aliment', es: 'Elige un alimento' },
  'picker.search': { en: 'Search foods', ca: 'Cerca aliments', es: 'Buscar alimentos' },
  'picker.emptyTitle': { en: 'Nothing here yet', ca: 'Encara no hi ha res', es: 'Aún no hay nada' },
  'picker.tryOrCreate': { en: 'Try another name, or create it below', ca: 'Prova un altre nom, o crea’l a sota', es: 'Prueba otro nombre, o créalo abajo' },
  'picker.createFirst': { en: 'Create your first one below', ca: 'Crea el primer a sota', es: 'Crea el primero abajo' },
  'picker.all': { en: 'All', ca: 'Tots', es: 'Todos' },
  'amount.label': { en: 'Amount', ca: 'Quantitat', es: 'Cantidad' },
  'amount.enter': { en: 'Enter an amount', ca: 'Introdueix una quantitat', es: 'Introduce una cantidad' },
  'amount.measureIn': { en: 'Measure in', ca: 'Mesura en', es: 'Medir en' },
  'amount.type.grams': { en: 'Grams', ca: 'Grams', es: 'Gramos' },
  'amount.type.units': { en: 'Units', ca: 'Unitats', es: 'Unidades' },
  'amount.type.percent': { en: 'Percent', ca: 'Percentatge', es: 'Porcentaje' },

  // ------------------------------------------------------------ food editor
  'kind.ingredient.example': { en: 'e.g. Egg', ca: 'p. ex. Ou', es: 'p. ej. Huevo' },
  'kind.dish.example': { en: 'e.g. Tomato pasta', ca: 'p. ex. Pasta amb tomàquet', es: 'p. ej. Pasta con tomate' },
  'kind.meal.example': { en: 'e.g. Usual breakfast', ca: 'p. ex. Esmorzar de sempre', es: 'p. ej. Desayuno habitual' },
  'kind.ingredient.needsParts': { en: 'An ingredient has no parts', ca: 'Un ingredient no té parts', es: 'Un ingrediente no tiene partes' },
  'kind.ingredient.addParts': { en: 'Add', ca: 'Afegeix', es: 'Añadir' },
  'kind.ingredient.buildFrom': { en: 'Type the values', ca: 'Escriu els valors', es: 'Escribir los valores' },
  'kind.dish.addParts': { en: 'Add ingredient', ca: 'Afegeix un ingredient', es: 'Añadir ingrediente' },
  'kind.dish.buildFrom': { en: 'Build from ingredients', ca: 'Fes-lo amb ingredients', es: 'Hacerlo con ingredientes' },
  'kind.meal.addParts': { en: 'Add ingredient or dish', ca: 'Afegeix un ingredient o un plat', es: 'Añadir ingrediente o plato' },
  'kind.meal.buildFrom': { en: 'Build from foods', ca: 'Fes-lo amb aliments', es: 'Hacerlo con alimentos' },
  'editor.needName': { en: 'Give it a name', ca: 'Posa-li un nom', es: 'Ponle un nombre' },
  'editor.needWeight': { en: 'Enter the weight the values are for', ca: 'Introdueix el pes al qual corresponen els valors', es: 'Introduce el peso al que corresponden los valores' },
  'editor.percentNeedsWeight': { en: 'Percentages need the weight of one unit', ca: 'Els percentatges necessiten el pes d’una unitat', es: 'Los porcentajes necesitan el peso de una unidad' },
  'editor.invalidNumber': { en: '{name} isn’t a valid number', ca: '{name} no és un nombre vàlid', es: '{name} no es un número válido' },
  'editor.subTooBig': { en: '{name} ({value}) can’t be more than {parent} ({parentValue})', ca: '{name} ({value}) no pot ser més que {parent} ({parentValue})', es: '{name} ({value}) no puede ser más que {parent} ({parentValue})' },
  'editor.gettingPhoto': { en: 'Getting the product photo…', ca: 'Obtenint la foto del producte…', es: 'Obteniendo la foto del producto…' },
  'editor.photoFromOff': { en: 'Photo from Open Food Facts', ca: 'Foto d’Open Food Facts', es: 'Foto de Open Food Facts' },
  'editor.picture': { en: 'Picture', ca: 'Imatge', es: 'Imagen' },
  'editor.name': { en: 'Name', ca: 'Nom', es: 'Nombre' },
  'editor.barcode': { en: 'Barcode', ca: 'Codi de barres', es: 'Código de barras' },
  'editor.barcodeHint': { en: 'Optional. Scanning this barcode later finds this ingredient', ca: 'Opcional. Si escanejes aquest codi més endavant, trobaràs aquest ingredient', es: 'Opcional. Si escaneas este código más adelante, encontrarás este ingrediente' },
  'editor.valuesFor': { en: 'Weight the values are for', ca: 'Pes al qual corresponen els valors', es: 'Peso al que corresponden los valores' },
  'editor.pieceExample': { en: 'e.g. egg, slice, can', ca: 'p. ex. ou, llesca, llauna', es: 'p. ej. huevo, rebanada, lata' },
  'editor.portionExample': { en: 'e.g. portion, bowl', ca: 'p. ex. ració, bol', es: 'p. ej. ración, bol' },
  'editor.pieceName': { en: 'Name of one unit', ca: 'Nom d’una unitat', es: 'Nombre de una unidad' },
  'editor.pieceWeight': { en: 'Weight of one unit', ca: 'Pes d’una unitat', es: 'Peso de una unidad' },
  'editor.oneUnitIs': { en: 'One unit is', ca: 'Una unitat és', es: 'Una unidad es' },
  'editor.aWeight': { en: 'A weight', ca: 'Un pes', es: 'Un peso' },
  'editor.onePiece': { en: 'One piece', ca: 'Una peça', es: 'Una pieza' },
  'editor.unit': { en: 'Unit', ca: 'Unitat', es: 'Unidad' },
  'editor.valuesBelowFor': { en: 'Values below are for', ca: 'Els valors de sota són per a', es: 'Los valores de abajo son para' },
  'editor.pieceCalled': { en: 'What one piece is called', ca: 'Com es diu una peça', es: 'Cómo se llama una pieza' },
  'editor.pieceWeightLabel': { en: 'Weight of one piece', ca: 'Pes d’una peça', es: 'Peso de una pieza' },
  'editor.pieceWeightHint': { en: 'Optional. With a weight you can also log it in grams and type values as %', ca: 'Opcional. Amb un pes també el pots registrar en grams i escriure valors en %', es: 'Opcional. Con un peso también puedes registrarlo en gramos y escribir valores en %' },
  'editor.amounts': { en: 'Amounts', ca: 'Quantitats', es: 'Cantidades' },
  'editor.percentOfUnit': { en: '% of unit', ca: '% de la unitat', es: '% de la unidad' },
  'editor.typeValuesAs': { en: 'Type values as', ca: 'Escriu els valors com a', es: 'Escribir los valores como' },
  'editor.nutritionInGrams': { en: 'Nutrition in {g} g', ca: 'Nutrició en {g} g', es: 'Nutrición en {g} g' },
  'editor.nutritionInUnit': { en: 'Nutrition in one unit', ca: 'Nutrició en una unitat', es: 'Nutrición en una unidad' },
  'editor.nutritionInPiece': { en: 'Nutrition in one {piece}', ca: 'Nutrició per {piece}', es: 'Nutrición por {piece}' },
  'editor.piece': { en: 'piece', ca: 'peça', es: 'pieza' },
  'editor.percentHint': { en: 'Percent of the unit’s {g} g. Calories stay as an amount', ca: 'Percentatge dels {g} g de la unitat. Les calories es mantenen com a quantitat', es: 'Porcentaje de los {g} g de la unidad. Las calorías se mantienen como cantidad' },
  'editor.percentNeedsWeightHint': { en: 'Set the weight of one unit to use percentages', ca: 'Indica el pes d’una unitat per fer servir percentatges', es: 'Indica el peso de una unidad para usar porcentajes' },
  'editor.giveWeightHint': { en: 'Give the unit a weight to type values as percentages', ca: 'Dona un pes a la unitat per escriure valors en percentatge', es: 'Da un peso a la unidad para escribir valores en porcentaje' },
  'editor.missingFood': { en: 'Missing food', ca: 'Aliment desaparegut', es: 'Alimento desaparecido' },
  'editor.deletedFromFoods': { en: 'deleted from your foods', ca: 'eliminat dels teus aliments', es: 'eliminado de tus alimentos' },
  'editor.foodRemoved': { en: 'This food was removed', ca: 'Aquest aliment s’ha eliminat', es: 'Este alimento se ha eliminado' },
  'editor.removePart': { en: 'Remove {name}', ca: 'Treu {name}', es: 'Quitar {name}' },
  'editor.sumOfParts': { en: '{g} (sum of parts)', ca: '{g} (suma de les parts)', es: '{g} (suma de las partes)' },
  'editor.totalWeight': { en: 'Total weight', ca: 'Pes total', es: 'Peso total' },
  'editor.totalWeightHint': { en: 'Optional: the finished weight if it differs from the sum of its parts (e.g. after cooking)', ca: 'Opcional: el pes final si és diferent de la suma de les parts (p. ex. després de cuinar)', es: 'Opcional: el peso final si es distinto de la suma de las partes (p. ej. después de cocinar)' },
  'editor.madeOf': { en: 'Made of', ca: 'Fet amb', es: 'Hecho con' },
  'editor.per100': { en: 'Per 100 g', ca: 'Per 100 g', es: 'Por 100 g' },
  'editor.typeValues': { en: 'Type the values', ca: 'Escriu els valors', es: 'Escribir los valores' },
  'editor.howToDefine': { en: 'How to define it', ca: 'Com definir-lo', es: 'Cómo definirlo' },
  'editor.deleteUsedIn': { en: { one: '. It is part of 1 other food, which keeps counting it', other: '. It is part of {n} other foods, which keep counting it' }, ca: { one: '. Forma part d’un altre aliment, que el continua comptant', other: '. Forma part de {n} aliments més, que el continuen comptant' }, es: { one: '. Forma parte de otro alimento, que lo sigue contando', other: '. Forma parte de {n} alimentos más, que lo siguen contando' } },
  'editor.deleteTitle': { en: 'Delete {name}?', ca: 'Vols eliminar {name}?', es: '¿Eliminar {name}?' },
  'editor.deleteMessage': { en: 'It disappears from your foods. Days already logged with it keep their numbers{note}', ca: 'Desapareix dels teus aliments. Els dies ja registrats amb aquest aliment conserven els seus valors{note}', es: 'Desaparece de tus alimentos. Los días ya registrados con él conservan sus valores{note}' },
  'editor.deleted': { en: '{name} deleted', ca: '{name} eliminat', es: '{name} eliminado' },

  // -------------------------------------------------------------- settings
  'settings.data': { en: 'Data', ca: 'Dades', es: 'Datos' },
  'settings.account': { en: 'Account', ca: 'Compte', es: 'Cuenta' },
  'settings.view': { en: 'View', ca: 'Visualització', es: 'Visualización' },
  'settings.language': { en: 'Language', ca: 'Idioma', es: 'Idioma' },
  'settings.theme': { en: 'Theme', ca: 'Tema', es: 'Tema' },
  'settings.thisDeviceOnly': { en: 'Saved on this device only', ca: 'Només es desa en aquest dispositiu', es: 'Solo se guarda en este dispositivo' },
  'settings.perKg': { en: '{g} g per kg of your weight', ca: '{g} g per kg del teu pes', es: '{g} g por kg de tu peso' },
  'settings.noReference': { en: 'No official daily reference for this one', ca: 'No té cap referència diària oficial', es: 'No tiene referencia diaria oficial' },
  'settings.dailyGoal': { en: 'Daily goal', ca: 'Objectiu diari', es: 'Objetivo diario' },
  'settings.goalHintRing': { en: 'With a goal you get a progress ring on each day', ca: 'Amb un objectiu tens un anell de progrés cada dia', es: 'Con un objetivo tienes un anillo de progreso cada día' },
  'settings.goalHintBar': { en: 'With a goal you get a progress bar on each day', ca: 'Amb un objectiu tens una barra de progrés cada dia', es: 'Con un objetivo tienes una barra de progreso cada día' },
  'settings.target': { en: 'Target', ca: 'Objectiu', es: 'Objetivo' },
  'settings.limit': { en: 'Limit', ca: 'Límit', es: 'Límite' },
  'settings.goalKind': { en: 'Kind of goal', ca: 'Tipus d’objectiu', es: 'Tipo de objetivo' },
  'settings.limitHint': { en: 'A limit is met while you stay at or under it', ca: 'Un límit es compleix mentre no el superes', es: 'Un límite se cumple mientras no lo superes' },
  'settings.targetHint': { en: 'A target is met once you reach it', ca: 'Un objectiu es compleix quan l’arribes', es: 'Un objetivo se cumple cuando lo alcanzas' },
  'settings.targetAboveZero': { en: 'The target must be a number above zero', ca: 'L’objectiu ha de ser un nombre més gran que zero', es: 'El objetivo debe ser un número mayor que cero' },
  'settings.limitAboveZero': { en: 'The limit must be a number above zero', ca: 'El límit ha de ser un nombre més gran que zero', es: 'El límite debe ser un número mayor que cero' },
  'settings.targetEnter': { en: 'Enter a target, or switch the goal off', ca: 'Introdueix un objectiu, o desactiva’l', es: 'Introduce un objetivo, o desactívalo' },
  'settings.limitEnter': { en: 'Enter a limit, or switch the goal off', ca: 'Introdueix un límit, o desactiva l’objectiu', es: 'Introduce un límite, o desactiva el objetivo' },
  'settings.showIn': { en: 'Show in', ca: 'Mostra en', es: 'Mostrar en' },
  'settings.convertsEnergy': { en: '1 kcal = 4.184 kJ. Everything already logged converts', ca: '1 kcal = 4,184 kJ. Tot el que ja has registrat es converteix', es: '1 kcal = 4,184 kJ. Todo lo registrado se convierte' },
  'settings.converts': { en: 'Everything already logged converts', ca: 'Tot el que ja has registrat es converteix', es: 'Todo lo registrado se convierte' },
  'settings.dailyReference': { en: 'Daily reference', ca: 'Referència diària', es: 'Referencia diaria' },
  'settings.targetValue': { en: 'Target {value}', ca: 'Objectiu {value}', es: 'Objetivo {value}' },
  'settings.limitValue': { en: 'Limit {value}', ca: 'Límit {value}', es: 'Límite {value}' },
  'settings.noGoal': { en: 'No goal', ca: 'Sense objectiu', es: 'Sin objetivo' },
  'settings.hiddenWith': { en: 'Hidden with {name}', ca: 'Amagat amb {name}', es: 'Oculto con {name}' },
  'settings.showNutrient': { en: 'Show {name}', ca: 'Mostra {name}', es: 'Mostrar {name}' },
  'settings.switchOffNote': { en: 'Switch a nutrient off to hide it everywhere. Values you already typed are kept', ca: 'Desactiva un nutrient per amagar-lo a tot arreu. Els valors que ja has escrit es conserven', es: 'Desactiva un nutriente para ocultarlo en todas partes. Los valores que ya escribiste se conservan' },
  'settings.references': { en: 'Daily references', ca: 'Referències diàries', es: 'Referencias diarias' },
  'settings.showReferences': { en: 'Show daily intake references', ca: 'Mostra les ingestes de referència diàries', es: 'Mostrar las ingestas de referencia diarias' },
  'settings.referencesSource': { en: 'The “Ref” values are the EU reference intakes for an average adult (Regulation (EU) No 1169/2011, Annex XIII). Fibre comes from EFSA, and protein from EFSA’s 0.83 g per kg of body weight', ca: 'Els valors “Ref.” són les ingestes de referència de la UE per a un adult mitjà (Reglament (UE) núm. 1169/2011, annex XIII). La fibra és de l’EFSA, i la proteïna, dels 0,83 g per kg de pes corporal de l’EFSA', es: 'Los valores “Ref.” son las ingestas de referencia de la UE para un adulto medio (Reglamento (UE) n.º 1169/2011, anexo XIII). La fibra procede de la EFSA, y la proteína, de los 0,83 g por kg de peso corporal de la EFSA' },
  'settings.notSet': { en: 'not set', ca: 'sense definir', es: 'sin definir' },
  'settings.yourWeight': { en: 'Your weight', ca: 'El teu pes', es: 'Tu peso' },
  'settings.weightUse': { en: 'Used for references that depend on body weight, like protein', ca: 'S’usa per a les referències que depenen del pes corporal, com la proteïna', es: 'Se usa para las referencias que dependen del peso corporal, como la proteína' },
  'settings.noWeighIns': { en: 'No weigh-ins yet', ca: 'Encara no hi ha pesades', es: 'Aún no hay pesajes' },
  'settings.latestWeighIn': { en: 'Latest weigh-in, {date}. Log new ones on the Day screen', ca: 'Última pesada, {date}. Registra’n de noves a la pantalla Dia', es: 'Último pesaje, {date}. Registra nuevos en la pantalla Día' },
  'settings.logOnDay': { en: 'Log your weight on the Day screen', ca: 'Registra el teu pes a la pantalla Dia', es: 'Registra tu peso en la pantalla Día' },
  'settings.bodyWeight': { en: 'Body weight', ca: 'Pes corporal', es: 'Peso corporal' },
  'settings.weighIns': { en: 'Daily weigh-ins', ca: 'Pesades diàries', es: 'Pesajes diarios' },
  'settings.weighInsHint': { en: 'Log your weight on the Day screen. For comparable numbers, weigh yourself at the same time of day each time, ideally in the morning before eating', ca: 'Registra el teu pes a la pantalla Dia. Per poder comparar, pesa’t sempre a la mateixa hora, millor al matí abans de menjar', es: 'Registra tu peso en la pantalla Día. Para poder comparar, pésate siempre a la misma hora, mejor por la mañana antes de comer' },
  'settings.weightUnit': { en: 'Weight unit', ca: 'Unitat de pes', es: 'Unidad de peso' },

  // ------------------------------------------------------------ Google Drive
  'sync.googleDrive': { en: 'Google Drive', ca: 'Google Drive', es: 'Google Drive' },
  'sync.notSetUp': { en: 'Not set up yet', ca: 'Encara no està configurat', es: 'Aún no está configurado' },
  'sync.notSetUpText': { en: 'Your data is saved on this device only. To keep it in your Google Drive and share it between devices, a Google client ID has to be added to the app once. The steps are in README.md', ca: 'Les dades només es desen en aquest dispositiu. Per guardar-les a Google Drive i compartir-les entre dispositius, cal afegir un cop un ID de client de Google a l’app. Els passos són a README.md', es: 'Los datos solo se guardan en este dispositivo. Para guardarlos en Google Drive y compartirlos entre dispositivos, hay que añadir una vez un ID de cliente de Google a la app. Los pasos están en README.md' },
  'sync.address': { en: 'Address to authorise in Google Cloud: {url}', ca: 'Adreça per autoritzar a Google Cloud: {url}', es: 'Dirección para autorizar en Google Cloud: {url}' },
  'sync.notConnected': { en: 'Not connected', ca: 'No connectat', es: 'No conectado' },
  'sync.notConnectedText': { en: 'Keep your data in a hidden app folder of your Google Drive, and use it from any device', ca: 'Guarda les dades en una carpeta oculta de Google Drive i fes-les servir des de qualsevol dispositiu', es: 'Guarda tus datos en una carpeta oculta de Google Drive y úsalos desde cualquier dispositivo' },
  'sync.connect': { en: 'Connect Google Drive', ca: 'Connecta Google Drive', es: 'Conectar Google Drive' },
  'sync.whichData': { en: 'Which data do you want to keep?', ca: 'Quines dades vols conservar?', es: '¿Qué datos quieres conservar?' },
  'sync.whichDataText': { en: 'Your Google Drive already has Macros data, and this device has its own. Choose one: the other is replaced', ca: 'El teu Google Drive ja té dades de Macros, i aquest dispositiu té les seves. Tria’n unes: les altres se substitueixen', es: 'Tu Google Drive ya tiene datos de Macros, y este dispositivo tiene los suyos. Elige unos: los otros se sustituyen' },
  'sync.driveHas': { en: 'Drive: {summary}', ca: 'Drive: {summary}', es: 'Drive: {summary}' },
  'sync.deviceHas': { en: 'This device: {summary}', ca: 'Aquest dispositiu: {summary}', es: 'Este dispositivo: {summary}' },
  'sync.keepDrive': { en: 'Keep Drive', ca: 'Conserva Drive', es: 'Conservar Drive' },
  'sync.keepDevice': { en: 'Keep this device', ca: 'Conserva aquest dispositiu', es: 'Conservar este dispositivo' },
  'sync.never': { en: 'never', ca: 'mai', es: 'nunca' },
  'sync.pending': { en: 'Changes waiting to upload', ca: 'Canvis pendents de pujar', es: 'Cambios pendientes de subir' },
  'sync.upToDate': { en: 'Up to date', ca: 'Al dia', es: 'Al día' },
  'sync.syncing': { en: 'Syncing…', ca: 'Sincronitzant…', es: 'Sincronizando…' },
  'sync.signInNeeded': { en: 'Sign-in needed', ca: 'Cal iniciar la sessió', es: 'Hay que iniciar sesión' },
  'sync.offline': { en: 'Offline. Will sync when the connection is back', ca: 'Sense connexió. Se sincronitzarà quan torni la connexió', es: 'Sin conexión. Se sincronizará cuando vuelva la conexión' },
  'sync.failed': { en: 'Sync failed', ca: 'La sincronització ha fallat', es: 'La sincronización ha fallado' },
  'sync.lastSynced': { en: 'Last synced: {when}', ca: 'Última sincronització: {when}', es: 'Última sincronización: {when}' },
  'sync.saveFailed': { en: 'The last change could not be saved on this device', ca: 'L’últim canvi no s’ha pogut desar en aquest dispositiu', es: 'El último cambio no se ha podido guardar en este dispositivo' },
  'sync.syncNow': { en: 'Sync now', ca: 'Sincronitza ara', es: 'Sincronizar ahora' },
  'sync.disconnectTitle': { en: 'Disconnect Google Drive?', ca: 'Vols desconnectar Google Drive?', es: '¿Desconectar Google Drive?' },
  'sync.disconnect': { en: 'Disconnect', ca: 'Desconnecta', es: 'Desconectar' },
  'sync.disconnectText': { en: 'This device stops syncing. Your data stays here and the copy in Drive stays there', ca: 'Aquest dispositiu deixa de sincronitzar. Les dades es queden aquí i la còpia de Drive, allà', es: 'Este dispositivo deja de sincronizar. Tus datos se quedan aquí y la copia de Drive, allí' },

  // -------------------------------------------------------------- calendar
  'cal.noWeighIns': { en: 'No weigh-ins in this period', ca: 'No hi ha pesades en aquest període', es: 'No hay pesajes en este periodo' },
  'cal.ref': { en: 'Ref', ca: 'Ref.', es: 'Ref.' },
  'cal.avg': { en: 'avg {value}', ca: 'mitjana {value}', es: 'media {value}' },
  'cal.graphs': { en: 'Graphs', ca: 'Gràfics', es: 'Gráficos' },
  'cal.daysLogged': { en: { one: '{n} day logged', other: '{n} days logged' }, ca: { one: '{n} dia registrat', other: '{n} dies registrats' }, es: { one: '{n} día registrado', other: '{n} días registrados' } },
  'cal.nothingLogged': { en: 'Nothing logged', ca: 'Res registrat', es: 'Nada registrado' },
  'cal.nothingLoggedLower': { en: 'nothing logged', ca: 'res registrat', es: 'nada registrado' },
  'cal.nutrient': { en: 'Nutrient', ca: 'Nutrient', es: 'Nutriente' },
  'cal.total': { en: 'Total', ca: 'Total', es: 'Total' },
  'cal.dailyAverage': { en: 'Daily average', ca: 'Mitjana diària', es: 'Media diaria' },
  'cal.averageNote': { en: 'The average counts only the days with something logged', ca: 'La mitjana només compta els dies amb alguna cosa registrada', es: 'La media solo cuenta los días con algo registrado' },
  'cal.open': { en: 'Open {day}', ca: 'Obre {day}', es: 'Abrir {day}' },
  'cal.addOn': { en: 'Add food on {day}', ca: 'Afegeix un aliment el {day}', es: 'Añadir alimento el {day}' },
  'cal.weekTotal': { en: 'Week total', ca: 'Total de la setmana', es: 'Total de la semana' },
  'cal.monthTotal': { en: 'Month total', ca: 'Total del mes', es: 'Total del mes' },
  'cal.monthNote': { en: 'Each day shows its {name} ({unit}). Tap a day to open it', ca: 'Cada dia mostra les seves {name} ({unit}). Toca un dia per obrir-lo', es: 'Cada día muestra sus {name} ({unit}). Toca un día para abrirlo' },
  'cal.weekByWeek': { en: 'Week by week', ca: 'Setmana a setmana', es: 'Semana a semana' },
  'cal.fullWeeks': { en: 'Full weeks', ca: 'Setmanes senceres', es: 'Semanas completas' },
  'cal.thisWeek': { en: 'This week', ca: 'Aquesta setmana', es: 'Esta semana' },
  'cal.thisMonth': { en: 'This month', ca: 'Aquest mes', es: 'Este mes' },
  'cal.prevWeek': { en: 'Previous week', ca: 'Setmana anterior', es: 'Semana anterior' },
  'cal.prevMonth': { en: 'Previous month', ca: 'Mes anterior', es: 'Mes anterior' },
  'cal.nextWeek': { en: 'Next week', ca: 'Setmana següent', es: 'Semana siguiente' },
  'cal.nextMonth': { en: 'Next month', ca: 'Mes següent', es: 'Mes siguiente' },
  'cal.week': { en: 'Week', ca: 'Setmana', es: 'Semana' },
  'cal.month': { en: 'Month', ca: 'Mes', es: 'Mes' },
  'cal.period': { en: 'Period', ca: 'Període', es: 'Periodo' },
  'chart.perDay': { en: '{title} per day', ca: '{title} per dia', es: '{title} por día' },

  // -------------------------------------------------------------- pictures
  'picture.chooseEmoji': { en: 'Choose an emoji', ca: 'Tria un emoji', es: 'Elige un emoji' },
  'picture.remove': { en: 'Remove picture', ca: 'Treu la imatge', es: 'Quitar la imagen' },
  'picture.preparing': { en: 'Preparing the photo…', ca: 'Preparant la foto…', es: 'Preparando la foto…' },
  'picture.failed': { en: 'That picture couldn’t be used', ca: 'No s’ha pogut fer servir aquesta imatge', es: 'No se ha podido usar esa imagen' },
  'picture.takePhoto': { en: 'Take a photo', ca: 'Fes una foto', es: 'Hacer una foto' },
  'picture.library': { en: 'Choose from library', ca: 'Tria de la galeria', es: 'Elegir de la galería' },

  // --------------------------------------------------------------- scanner
  'scan.loadFailed': { en: 'Barcode reader failed to load', ca: 'No s’ha pogut carregar el lector de codis', es: 'No se ha podido cargar el lector de códigos' },
  'scan.alreadyYours': { en: 'Already in your foods', ca: 'Ja és als teus aliments', es: 'Ya está en tus alimentos' },
  'scan.lookingUp': { en: 'Looking up {code}…', ca: 'Cercant {code}…', es: 'Buscando {code}…' },
  'scan.lookupFailed': { en: 'Something went wrong looking it up', ca: 'Alguna cosa ha fallat en cercar-lo', es: 'Algo ha fallado al buscarlo' },
  'scan.saved': { en: 'Saved to your ingredients', ca: 'Desat als teus ingredients', es: 'Guardado en tus ingredientes' },
  'scan.noValues': { en: 'Open Food Facts has barcode {code} but no nutrition values. Type them from the label', ca: 'Open Food Facts té el codi {code} però sense valors nutricionals. Escriu-los de l’etiqueta', es: 'Open Food Facts tiene el código {code} pero sin valores nutricionales. Escríbelos de la etiqueta' },
  'scan.notFound': { en: 'Barcode {code} isn’t in Open Food Facts yet. If it doesn’t match the number on the pack, close this and scan again; otherwise type the values from the label', ca: 'El codi {code} encara no és a Open Food Facts. Si no coincideix amb el número del paquet, tanca això i torna a escanejar; si no, escriu els valors de l’etiqueta', es: 'El código {code} aún no está en Open Food Facts. Si no coincide con el número del paquete, cierra esto y vuelve a escanear; si no, escribe los valores de la etiqueta' },
  'scan.filled': { en: 'Filled in from Open Food Facts, per 100 g. Check the values against the label before saving', ca: 'Omplert des d’Open Food Facts, per 100 g. Comprova els valors amb l’etiqueta abans de desar', es: 'Rellenado desde Open Food Facts, por 100 g. Comprueba los valores con la etiqueta antes de guardar' },
  'scan.filledPack': { en: 'Filled in from Open Food Facts, per 100 g (pack: {g} g). Check the values against the label before saving', ca: 'Omplert des d’Open Food Facts, per 100 g (paquet: {g} g). Comprova els valors amb l’etiqueta abans de desar', es: 'Rellenado desde Open Food Facts, por 100 g (paquete: {g} g). Comprueba los valores con la etiqueta antes de guardar' },
  'scan.photo': { en: 'Take a photo of the barcode', ca: 'Fes una foto del codi de barres', es: 'Hacer una foto del código de barras' },
  'scan.example': { en: 'e.g. 8410000000000', ca: 'p. ex. 8410000000000', es: 'p. ej. 8410000000000' },
  'scan.number': { en: 'Barcode number', ca: 'Número del codi de barres', es: 'Número del código de barras' },
  'scan.lookUp': { en: 'Look up', ca: 'Cerca', es: 'Buscar' },
  'scan.noLive': { en: 'Live scanning isn’t available here. Take a photo of the barcode or type it', ca: 'L’escaneig en directe no està disponible aquí. Fes una foto del codi o escriu-lo', es: 'El escaneo en directo no está disponible aquí. Haz una foto del código o escríbelo' },
  'scan.loading': { en: 'Loading the barcode reader…', ca: 'Carregant el lector de codis…', es: 'Cargando el lector de códigos…' },
  'scan.fit': { en: 'Fit the barcode inside the frame and hold still', ca: 'Posa el codi dins del marc i no et moguis', es: 'Pon el código dentro del marco y no te muevas' },
  'scan.reading': { en: 'Reading {code}… hold still', ca: 'Llegint {code}… no et moguis', es: 'Leyendo {code}… no te muevas' },
  'scan.denied': { en: 'Camera access was not allowed. Take a photo of the barcode or type it below', ca: 'No s’ha permès l’accés a la càmera. Fes una foto del codi o escriu-lo a sota', es: 'No se ha permitido el acceso a la cámara. Haz una foto del código o escríbelo abajo' },
  'scan.couldNotStart': { en: 'Live scanning couldn’t start. Take a photo of the barcode or type it below', ca: 'No s’ha pogut iniciar l’escaneig en directe. Fes una foto del codi o escriu-lo a sota', es: 'No se ha podido iniciar el escaneo en directo. Haz una foto del código o escríbelo abajo' },
  'scan.readingPhoto': { en: 'Reading the photo…', ca: 'Llegint la foto…', es: 'Leyendo la foto…' },
  'scan.noneInPhoto': { en: 'No barcode found in the photo. Try closer, with the barcode flat and well lit', ca: 'No s’ha trobat cap codi a la foto. Prova-ho més a prop, amb el codi pla i ben il·luminat', es: 'No se ha encontrado ningún código en la foto. Prueba más cerca, con el código plano y bien iluminado' },
  'scan.photoFailed': { en: 'That photo couldn’t be read', ca: 'No s’ha pogut llegir aquesta foto', es: 'No se ha podido leer esa foto' },
  'scan.digits': { en: 'A barcode has 8 to 14 digits', ca: 'Un codi de barres té entre 8 i 14 xifres', es: 'Un código de barras tiene entre 8 y 14 cifras' },
  'scan.badCheck': { en: 'That number doesn’t look right: check the digits', ca: 'Aquest número no sembla correcte: revisa les xifres', es: 'Ese número no parece correcto: revisa las cifras' },
  'scan.typeIt': { en: 'Or type the number under the barcode', ca: 'O escriu el número de sota el codi', es: 'O escribe el número de debajo del código' },
  'scan.credit': { en: 'Product data from Open Food Facts (openfoodfacts.org), shared under the Open Database License. Only the barcode number is sent', ca: 'Dades de producte d’Open Food Facts (openfoodfacts.org), compartides amb la llicència Open Database License. Només s’envia el número del codi de barres', es: 'Datos de producto de Open Food Facts (openfoodfacts.org), compartidos con la licencia Open Database License. Solo se envía el número del código de barras' },
  'scan.offline': { en: 'No connection: the product can’t be looked up right now', ca: 'Sense connexió: ara no es pot cercar el producte', es: 'Sin conexión: ahora no se puede buscar el producto' },
  'scan.offError': { en: 'Open Food Facts responded with an error ({status})', ca: 'Open Food Facts ha respost amb un error ({status})', es: 'Open Food Facts ha respondido con un error ({status})' },

  // ----------------------------------------------------- sync messages
  'sync.count.foods': { en: { one: '{n} food', other: '{n} foods' }, ca: { one: '{n} aliment', other: '{n} aliments' }, es: { one: '{n} alimento', other: '{n} alimentos' } },
  'sync.count.entries': { en: { one: '{n} logged item', other: '{n} logged items' }, ca: { one: '{n} element registrat', other: '{n} elements registrats' }, es: { one: '{n} elemento registrado', other: '{n} elementos registrados' } },
  'sync.count.weights': { en: { one: '{n} weigh-in', other: '{n} weigh-ins' }, ca: { one: '{n} pesada', other: '{n} pesades' }, es: { one: '{n} pesaje', other: '{n} pesajes' } },
  'sync.driveNotGranted': { en: 'Google Drive access was not allowed. Connect again and tick the Drive box on Google’s screen', ca: 'No s’ha permès l’accés a Google Drive. Torna a connectar i marca la casella de Drive a la pantalla de Google', es: 'No se ha permitido el acceso a Google Drive. Vuelve a conectar y marca la casilla de Drive en la pantalla de Google' },
  'sync.signInIncomplete': { en: 'Google sign-in was not completed', ca: 'No s’ha completat l’inici de sessió de Google', es: 'No se ha completado el inicio de sesión de Google' },
  'sync.noConnection': { en: 'No connection to Google Drive', ca: 'Sense connexió amb Google Drive', es: 'Sin conexión con Google Drive' },
  'sync.expired': { en: 'Your Google session has expired', ca: 'La teva sessió de Google ha caducat', es: 'Tu sesión de Google ha caducado' },
  'sync.notAllowed': { en: 'Macros was not allowed to use Google Drive. Reconnect and tick the Drive box', ca: 'Macros no té permís per fer servir Google Drive. Torna a connectar i marca la casella de Drive', es: 'Macros no tiene permiso para usar Google Drive. Vuelve a conectar y marca la casilla de Drive' },
  'sync.driveError': { en: 'Google Drive responded with an error ({status})', ca: 'Google Drive ha respost amb un error ({status})', es: 'Google Drive ha respondido con un error ({status})' },

  // --SECTIONS-- (more sections are added below by area)
};
