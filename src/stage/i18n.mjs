// Speech in acts is written in English; other languages map the same lines.
// World({ lang }) picks the language for say() and mark().

export const LINES = {
  ru: {
    "Hi!": "Привет!",
    "Hop!": "Хоп!",
    "Bye!": "Пока!",
    "Goal!": "Гол!",
    "Yum!": "Вкусно!",
    "nom": "ням",
    "ah..": "а..",
    "ah-ah..": "а-а..",
    "ACHOO!": "АПЧХИ!",
    "sniff": "шмыг",
    "Wheee!": "Уиии!",
    "oops": "ой",
    "brr": "брр",
  },
};

export const LANGS = ["en", ...Object.keys(LINES)];

export function tr(text, lang = "en") {
  return LINES[lang]?.[text] ?? text;
}
