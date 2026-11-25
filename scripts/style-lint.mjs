#!/usr/bin/env node
// style-lint: checks the writing rules of CONVENTIONS.md in skills/**/*.md, templates/**/*.md,
// evals/**/*.md, README.md, CONVENTIONS.md and AGENTS.md.
//
// Each rule has a basis, printed with every finding:
//   - "STE <rule>": a rule from ASD-STE100 Issue 9, Part 1 (the writing rules).
//   - "house rule": our own rule. Most come from the owner's slop ban list.
// No tool can prove that text follows STE, and ASD endorses no checker. A clean run means only
// that these checks found nothing. The lint does not check the STE dictionary.
// Declared exception: we use `check` as a verb. STE approves `check` only as a noun.
//
// The house checks are a port of the CHECKS list in the owner's slop checker (slop_check.py),
// with the same patterns and flags, run on the whole file. Like that checker, they skip only
// inline code and fenced code (``` and also ~~~). So a file that passes these checks also passes
// slop_check.py. Two lint-only house checks are added: "not X but Y" and "it is worth noting".
// The STE checks also skip frontmatter keys, the `## Provenance` section, HTML comments, URLs and
// double-quoted text. The spelling check (STE 1.14) does run in the `## Provenance` section.
//
// Usage: node scripts/style-lint.mjs [root] [--json] [--max-warn N]
// Exit 0 clean (or only warnings within --max-warn), 1 errors or too many warnings, 2 usage error.

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_INSTRUCTION_WORDS = 20;
export const MAX_SENTENCE_WORDS = 25;

export const RULES = {
  "sentence-length": "error",
  "banned-modal": "error",
  contraction: "error",
  semicolon: "error",
  dash: "error",
  "not-x-but-y": "error",
  "present-perfect": "error",
  "is-being": "error",
  spelling: "error",
  "slop-word": "error",
  "slop-phrase": "error",
  "stiff-transition": "error",
  punctuation: "error",
  "bold-bullet": "error",
  "mid-sentence-bold": "error",
  "heading-case": "error",
  "instruction-length": "warning",
  "condition-last": "warning",
  passive: "warning",
  "word-choice": "warning",
  synonyms: "warning",
};

/** Where each rule comes from. "STE x.y" is a rule of ASD-STE100 Issue 9. Everything else is a house rule. */
export const BASIS = {
  "sentence-length": "STE 5.1, 6.3",
  "instruction-length": "STE 5.1",
  "banned-modal": "STE dictionary",
  contraction: "STE 4.2",
  semicolon: "STE 8.1",
  "present-perfect": "STE 3.2",
  "is-being": "STE 3.2",
  spelling: "STE 1.14",
  "condition-last": "STE 5.4",
  passive: "STE 3.6",
  "word-choice": "STE dictionary",
  synonyms: "STE 1.11",
  dash: "house rule",
  "not-x-but-y": "house rule",
  "slop-word": "house rule",
  "slop-phrase": "house rule",
  "stiff-transition": "house rule",
  punctuation: "house rule",
  "bold-bullet": "house rule",
  "mid-sentence-bold": "house rule",
  "heading-case": "house rule",
};

// ---------- house checks, ported from slop_check.py ----------

const TIER1 =
  "delve|delving|utili[sz]e|utili[sz]ation|leverag(?:e|es|ed|ing)|harness|foster|facilitat|empower|" +
  "elevat|embark|endeavo|encompass|elucidat|unleash|unlock|supercharg|turbocharg|streamlin|" +
  "spearhead|catapult|galvaniz|catalyz|revolutioniz|epitomiz|juxtapos|unravel|underscor|" +
  "showcas|bolster|reimagin|redefin|tapestr|testament|synerg|paradigm|realm|myriad|plethora|" +
  "multifaceted|holistic|meticulous|intricat|paramount|pivotal|transformative|groundbreaking|" +
  "game.?chang|cutting.?edge|bleeding.?edge|next.?generation|world.?class|best.?in.?class|" +
  "seamless|robust|ever.?evolving|fast.?paced|vibrant|bustling|nestled|breathtaking|" +
  "captivating|unparalleled|unprecedented|unwavering|indelible|camaraderie|commendable|" +
  "noteworthy|invaluable|bespoke";

const FILLERS =
  "genuinely|truly|deeply|fundamentally|essentially|basically|notably|importantly|crucially|" +
  "incredibly|remarkably|undoubtedly|undeniably|inherently|inevitably|honestly|frankly|" +
  "candidly|quietly|simply|literally|actually";

const METAPHORS =
  "load.?bearing|earns? (?:its|their) keep|earning (?:its|their) keep|heavy lifting|" +
  "carr(?:y|ies) the argument|belt.and.braces|\\bseams?\\b|sits at the intersection|" +
  "thread the needle|connective tissue|sharp edges|footgun|moves? the needle|north star|" +
  "\\blandscape\\b|\\bjourney\\b|\\bnavigat\\w*|\\becosystem\\b|\\bbeacon\\b|\\bsymphony\\b|" +
  "treasure trove|double.edged sword|silver bullet|secret sauce|holy grail|" +
  "pave the way|paving the way|set the stage|lay the groundwork|bridge the gap|" +
  "at the heart of|under the hood|at the forefront|level the playing field|" +
  "tip of the iceberg|perfect storm|sea change|next frontier|uncharted waters";

/** [rule, name, regex, options]. Same order, patterns and flags as CHECKS in slop_check.py, plus two lint-only checks at the end. */
export const HOUSE_CHECKS = [
  ["dash", "em dash", /—/g],
  ["dash", "en dash", /–/g],
  ["dash", "spaced hyphen used as a dash", /\w - \w/g],
  ["semicolon", "semicolon", /;/g],
  ["punctuation", "curly quote", /[“”‘’]/g],
  ["punctuation", "exclamation mark", /\w!(?:\s|$)/g],
  ["punctuation", "unicode arrow", /[←-⇿⟰-⟿]/g],
  ["punctuation", "dramatic ellipsis", /\w(?:\.\.\.|…)/g],

  ["not-x-but-y", "negation reveal", /\b(?:it'?s|this is|that'?s|they'?re|it is|this isn'?t|it isn'?t)\s+(?:not\s+)?(?:just\s+)?(?:not\s+)?an?\s*\w+[^.\n]{0,40}[,.]\s*(?:it'?s|this is|that'?s|they'?re|it is)\b/gi],
  ["not-x-but-y", "not just / not only", /\bnot\s+(?:just|only|merely)\b/gi],
  ["not-x-but-y", "isn't about / isn't just", /\b(?:is ?n[o']t|wasn'?t)\s+(?:about|just|the)\b/gi],
  ["slop-phrase", "less X, more Y", /\bless\s+\w+,\s+more\s+\w+/gi],
  ["slop-phrase", "stop X. start Y.", /\bstop\s+\w+ing\.\s+start\s+\w+ing\b/gi],
  ["slop-phrase", "say goodbye / say hello", /\bsay (?:goodbye|hello) to\b/gi],
  ["not-x-but-y", "rather than", /\brather than\b/gi],
  ["not-x-but-y", "negative listing", /\bNot an? [\w ]{1,20}\.\s+Not an? [\w ]{1,20}\./g],

  ["slop-phrase", "colon reveal", /(?:^|\. )(?:The|Here'?s the)\s+(?:best|real|key|catch|kicker|trick|twist|secret|part|thing|problem|point|detail|upshot)[^:\n]{0,40}:\s/gim],
  ["slop-phrase", "self-answered question", /\b(?:The result|The answer|The catch|The fix|Why|The problem|The outcome|The verdict)\?\s/gi],
  ["slop-phrase", "rhetorical setup", /\b(?:What if I told you|Think about it|Sound familiar|Plot twist|Honestly\?)/gi],
  ["slop-phrase", "dramatic fragment", /(?:^|[.;,]\s*)(?:Full stop|Period|Let that sink in|That'?s it|Every\. Single\. Time)\./gim],
  ["slop-phrase", "trailing -ing analysis", /,\s+(?:highlighting|underscoring|emphasizing|reflecting|showcasing|demonstrating|illustrating|signaling|signalling|cementing|solidifying|paving|setting the stage|marking|contributing to)\b/gi],
  ["slop-phrase", "copula avoidance", /\b(?:serves|serving|stands|standing|acts|functions) as\b|\bboasts?\b/gi],
  ["slop-phrase", "importance puffery", /\b(?:testament to|pivotal moment|plays? an? (?:vital|crucial|key|pivotal) role|cornerstone of|cannot be overstated|more important than ever|watershed moment|sets a new standard)\b/gi],
  ["slop-phrase", "interpretive metadiscourse", /\b(?:the key (?:point|takeaway) is|as you can see|this distinction matters|this is where it gets interesting|here'?s why (?:that|this) matters|worth stating plainly|make no mistake|it bears repeating)\b/gi],
  ["slop-phrase", "faux-insight setup", /\b(?:what nobody tells you|what most people get wrong|the part everyone misses|the dirty secret|the uncomfortable truth|the real question is|the truth is|the reality is|here'?s the secret)\b/gi],
  ["slop-phrase", "whether-or frame", /\bwhether you'?re\b/gi],
  ["slop-phrase", "false range", /\bfrom \w+s? to \w+s?, \w+/gi],

  ["slop-word", "mannered metaphor", new RegExp(METAPHORS, "gi")],
  ["slop-word", "tier 1 word", new RegExp(`\\b(?:${TIER1})\\w*`, "gi")],
  ["slop-word", "filler adverb", new RegExp(`\\b(?:${FILLERS})\\b`, "gi")],
  ["stiff-transition", "stiff transition", /(?:^|[.!?]\s+)(?:Furthermore|Moreover|Additionally|Consequently|Nevertheless|Nonetheless|Subsequently|Thus|Hence|Accordingly|Interestingly|Overall|In essence)\b/gm],

  ["slop-phrase", "banned opener", /\b(?:Here'?s the (?:thing|deal)|Let me be (?:clear|honest)|I'?ll be honest|Let'?s (?:dive|unpack|break this down|explore)|In today'?s|In a world where|In an era of|Picture this|Ever wondered|Great question|Good question|It'?s no secret|It goes without saying|Needless to say|We'?ve all been there)/gi],
  ["slop-phrase", "throat-clearing", /\b(?:It'?s worth (?:noting|mentioning)|It'?s important to note|It should be noted|At its core|At the end of the day|The bottom line is|The fact of the matter|In terms of|With regard to|In order to|Due to the fact|Without further ado|That being said|With that said|Having said that|When it comes to|Moving forward|Going forward)\b/gi],
  ["slop-phrase", "weasel attribution", /\b(?:studies (?:show|suggest)|research (?:shows|suggests)|experts (?:agree|say)|many (?:argue|believe)|it is widely (?:believed|regarded)|industry reports suggest|critics say|observers note)\b/gi],
  ["slop-phrase", "business cliche", /\b(?:low.hanging fruit|best practices|next level|the possibilities are endless|think outside the box|win.win|value.add|table stakes|flywheel|mission.critical|actionable insights|data.driven decisions|drive (?:growth|value)|one.stop shop|all.in.one)\b/gi],
  ["slop-phrase", "banned ending", /\b(?:In conclusion|In summary|To summari[sz]e|To sum up|To wrap up|Wrapping up|All in all|Only time will tell|The future is (?:bright|here)|Happy (?:coding|building|writing)|Key takeaways)\b/gi],

  ["slop-phrase", "sycophancy", /\b(?:You'?re absolutely (?:right|correct)|Absolutely right|Great catch|Excellent (?:point|question)|Good catch|Spot on|You nailed it|Love this|I love this)\b|(?:^|\s)(?:Perfect|Exactly|Brilliant)!/gim],
  ["slop-phrase", "service phrase", /\b(?:I'?d be (?:happy|glad) to|Happy to help|I'?m happy to help|Here'?s a breakdown|Here'?s an overview|I hope this helps|Hope this helps|I hope this (?:message|email) finds you|Let me know if you (?:have|need|would|'d)|Feel free to|Don'?t hesitate to|Is there anything else|I (?:got|found|see) the issue|I apologi[sz]e for (?:any|the) confusion)\b/gi],
  ["slop-phrase", "AI self-reference", /\b(?:As an AI|As a language model|As of my (?:last update|knowledge cutoff)|I strive to be)\b/gi],
  ["slop-phrase", "Claude voice marker", /\b(?:honest take|A few things stand out|Worth flagging|One thing to flag|Quick note|Small note)\b/gi],
  ["slop-phrase", "placeholder", /\[(?:Your Name|Company Name|insert[^\]]*|Name)\]|\bLorem ipsum\b|\bTODO\b|\bXX%|turn\d+search\d+/gi],

  ["slop-phrase", "cute language", /\b(?:Tada|Ta-da|Voila|Boom|Like magic|superpowers?|on steroids|rocket fuel|level up|leveling up|life hack|Pro tip|Hot tip|Bonus tip|Spoiler alert|Plot twist|Buckle up|Strap in|Drumroll|ninja|rockstar|wizard|guru|nifty|awesome|delightful|yummy|juicy|snappy|zippy|buttery smooth|blazing fast|lightning fast|no.brainer|sweet spot|vibes|nerd out|geek out|rabbit hole|mind.blowing|jaw.dropping|chef'?s kiss|cherry on top|icing on the cake|You'?ve got this|Don'?t worry)\b/gi],
  ["punctuation", "emoji", /[\u{1F300}-\u{1FAFF}☀-➿⭐✅❌]/gu],
  ["slop-phrase", "marketing tagline", /\b(?:Unlock the power of|Take \w+ to the next level|Transform the way you|The future of \w+|Say hello to|Meet \w+[,.]|Built for \w+ who|Designed for the way you|Your all.in.one|The only \w+ you'?ll ever need|Work smarter,? not harder|Do more with less|Focus on what matters|With just one click|Simple yet powerful|Powerful yet simple)\b/gi],
  ["slop-phrase", "UI microcopy", /\b(?:Oops|Uh oh|Whoops|Hang tight|Sit tight|Almost there|You'?re all set|Woohoo|Yay)\b/gi],
  ["slop-phrase", "doc phrase", /\b(?:is responsible for|production.ready|enterprise.grade|battle.tested|simply (?:run|add)|just run|easily configure|out of the box|behind the scenes|it'?s that easy|that'?s all there is to it|follows best practices|plug and play)\b/gi],

  ["bold-bullet", "bold-first bullet", /^[ \t]*(?:[-*+]|\d+\.)[ \t]+\*\*[^*\n]+?(?::\*\*|\*\*:)/gm],
  ["mid-sentence-bold", "mid-sentence bold", /\w[ ,]\*\*[^*\n]+\*\*[ ,]\w/g],
  ["heading-case", "emoji or title case heading", /^#{1,6}\s+(?:.*[\u{1F300}-\u{1FAFF}☀-➿].*|(?:[A-Z][a-z]+\s+){2,}[A-Z][a-z]+\s*)$/gmu],

  // Lint-only house checks. slop_check.py does not have these. They skip double-quoted text,
  // so that a file can name a rule, such as "not X but Y".
  ["not-x-but-y", "not X but Y", /\bnot\s+(?:\w+\s+){0,3}\w+,?\s+but\s+(?!also\b)/gi, { skipQuotes: true }],
  ["slop-phrase", "throat-clearing", /\bit is (?:worth (?:noting|mentioning)|important to note)\b/gi, { skipQuotes: true }],
];

const HOUSE_FIX = {
  dash: "use a period, comma, colon or parentheses.",
  semicolon: "write two sentences.",
  "not-x-but-y": "state the positive claim directly.",
  "slop-word": "delete it or use a plain, literal word that states the fact.",
  "slop-phrase": "delete it or state the fact in plain words.",
  "stiff-transition": "delete the word, or use `and`, `but`, `then` or `as a result`.",
  punctuation: "use plain ASCII punctuation: straight quotes, a period, `->` for an arrow.",
  "bold-bullet": "write a plain sentence. Remove the bold label.",
  "mid-sentence-bold": "remove the bold. Put the important rule first, or in an `## Important` section.",
  "heading-case": "write the heading in sentence case, with no emoji.",
};

/** Blank out fenced and inline code the way slop_check.py does. Line numbers stay the same. */
export function stripCode(text) {
  let t = text.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, (m) => "\n".repeat((m.match(/\n/g) || []).length));
  t = t.replace(/`[^`\n]*`/g, (m) => " ".repeat(m.length));
  return t;
}

/** Run the house checks on a whole file. Returns [{ rule, name, line, offset, match }]. */
export function houseScan(text) {
  const clean = stripCode(text);
  const starts = [0];
  for (let i = 0; i < clean.length; i++) if (clean[i] === "\n") starts.push(i + 1);
  const lineOf = (pos) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  const unquoted = clean.replace(/"[^"\n]*"|“[^”\n]*”/g, (m) => " ".repeat(m.length));
  const hits = [];
  const seen = new Set();
  for (const [rule, name, re, opts] of HOUSE_CHECKS) {
    re.lastIndex = 0;
    for (const m of (opts?.skipQuotes ? unquoted : clean).matchAll(re)) {
      // A match that starts with whitespace (for example `(?:^|\s)Perfect!`) counts on the line of its first word.
      const lead = m[0].length - m[0].trimStart().length;
      const pos = m.index + lead;
      const key = `${rule}|${pos}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ rule, name, line: lineOf(pos), offset: pos, match: m[0].trim() });
    }
  }
  return hits;
}

// ---------- spelling (STE 1.14: American English) ----------

const ISE_STEMS =
  "organ|recogn|summar|priorit|normal|optim|minim|maxim|custom|initial|serial|util|real|categor|emphas|" +
  "apolog|author|standard|special|visual|synchron|final|general|local|sanit|token|memor|character|critic|" +
  "capital|central|stabil|parameter|modern|random|container|penal|legal|global|personal|harmon|digit|" +
  "formal|ideal|parallel|sympath|familiar";

/** [regex, function that gives the American form]. Common British forms only. */
const SPELLING = [
  [/\b(?:behavi|col|fav|hon|lab|neighb|flav|hum|rum|harb|vap|savo)our(?:s|ed|ing|able|ably|ite|ites|al|ally|less|ful|hood)?\b/gi, (m) => m.replace(/our/i, "or")],
  [/\blicences?\b/gi, (m) => m.replace(/licence/i, "license")],
  [/\b(?:cent|met|lit|fib|theat|sab|calib|spect)re[sd]?\b/gi, (m) => m.replace(/red$/i, "ered").replace(/re(s?)$/i, "er$1")],
  [/\b(?:defen|offen|preten)ces?\b/gi, (m) => m.replace(/ce(s?)$/i, "se$1")],
  [/\b(?:catalog|analog)ue[sd]?\b/gi, (m) => m.replace(/ued$/i, "ed").replace(/ue(s?)$/i, "$1")],
  [/\b(?:analy|paraly)s(?:e|ed|ing|er|ers)\b/gi, (m) => m.replace(/ys/i, "yz")],
  [/\b(?:judge|acknowledge)ments?\b/gi, (m) => m.replace(/ement/i, "ment")],
  [/\b(?:model|label|travel|cancel|signal|level|channel|fuel|tunnel|total|dial|equal)l(?:ed|ing|er|ers)\b/gi, (m) => m.replace(/ll/i, "l")],
  [/\bfulfil(?:s|ment|ments)?\b/gi, (m) => m.replace(/fulfil/i, "fulfill")],
  [/\benrol(?:s|ment|ments)?\b/gi, (m) => m.replace(/enrol/i, "enroll")],
  [/\binstalments?\b/gi, (m) => m.replace(/instal/i, "install")],
  [/\bartefacts?\b/gi, (m) => m.replace(/artefact/i, "artifact")],
  [/\bgrey(?:s|ed|ish)?\b/gi, (m) => m.replace(/grey/i, "gray")],
  [/\bprogrammes?\b/gi, (m) => m.replace(/programme/i, "program")],
  [/\bwhilst\b/gi, () => "while"],
  [/\bamongst\b/gi, () => "among"],
  [/\blearnt\b/gi, () => "learned"],
  [/\bspelt\b/gi, () => "spelled"],
  [/\bsceptic(?:s|al|ally|ism)?\b/gi, (m) => m.replace(/sceptic/i, "skeptic")],
  [/\bageing\b/gi, () => "aging"],
  [/\bfocuss(?:ed|ing|es)\b/gi, (m) => m.replace(/ss/i, "s")],
  [/\bpractis(?:e|es|ed|ing)\b/gi, (m) => m.replace(/practis/i, "practic")],
  [new RegExp(`\\b(?:de|re|un|over|under|pre)?(?:${ISE_STEMS})is(?:e|es|ed|ing|ation|ations|er|ers)\\b`, "gi"), (m) => m.replace(/is(e|es|ed|ing|ation|ations|er|ers)$/i, "iz$1")],
];

/** Find British spellings in one line of prose. Returns [{ match, american }]. */
export function britishSpellings(text) {
  const out = [];
  for (const [re, fix] of SPELLING) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) out.push({ match: m[0], american: fix(m[0]) });
  }
  return out;
}

// ---------- STE word lists ----------

// STE word choices. These are warnings, because the standard allows a few of them in some uses.
const WORD_CHOICE = [
  [/\bin order to\b/gi, "to", "STE dictionary"],
  [/\bprior to\b/gi, "before", "STE dictionary"],
  [/\bensure\w*\b/gi, "make sure that", "STE dictionary"],
  [/\bfunctionality\b/gi, "function or feature", "STE dictionary"],
  [/\b(?:enables?|allows?) you to\b/gi, "you can", "STE dictionary"],
  [/\be\.g\./gi, "for example", "STE GR-6"],
  [/\bi\.e\./gi, "that is", "STE GR-6"],
  [/\betc\./gi, "name the items", "STE GR-6"],
  [/\band\/or\b/gi, "pick one, or write X, or Y, or both", "house rule"],
  [/\bas (?:needed|necessary)\b/gi, "state the condition", "house rule"],
];

// `check` is a declared house exception, so it is the word to use in the check/verify/validate group.
const SYNONYM_GROUPS = [
  { name: "check/verify/validate", members: [["check", /\bcheck(?:s|ed|ing)?\b/i], ["verify", /\bverif(?:y|ies|ied|ying)\b/i], ["validate", /\bvalidat(?:e|es|ed|ing|ion)\b/i]] },
  { name: "config/settings", members: [["config", /\bconfig(?:uration)?s?\b/i], ["settings", /\bsettings?\b/i]] },
];

const IMPERATIVES = new Set(
  ("add answer append ask avoid build call change check choose clean close commit compare confirm copy count create decide define delete " +
    "describe do edit end ensure enter explain fix find follow get give go ignore import include install keep label link list load log look make " +
    "mark merge move name note open pass pick plan print pull push put read record refer remove rename replace report reply request reset " +
    "return review run save say search see select send set show skip sort split start stop store summarize take tell test treat try type " +
    "update use validate verify wait write").split(/\s+/),
);

const NOT_EDS = new Set(["need", "needed", "speed", "feed", "embed", "seed", "bleed", "proceed", "succeed", "exceed", "shed", "red", "bed", "indeed", "hundred", "sacred", "naked"]);
const IRREGULAR_PARTICIPLES = "been|done|made|taken|given|gone|seen|written|shown|found|become|begun|chosen|kept|held|sent|left|lost|built|got|gotten|run|set";
const PERFECT = new RegExp(`\\b(?:has|have)\\s+(?:(?:${IRREGULAR_PARTICIPLES})|([a-z]+ed))\\b`, "gi");

// ---------- text helpers ----------

/** Replace code, links, quotes and comments with one-word placeholders. Returns { text, escapes, comment }. */
export function cleanLine(raw, state = { inComment: false }) {
  let t = raw;
  const escapes = [];
  let escapeCount = 0;
  if (state.inComment) {
    const end = t.indexOf("-->");
    if (end === -1) return { text: "", escapes, escapeCount, skipped: true };
    state.inComment = false;
    t = t.slice(end + 3);
  }
  t = t.replace(/<!--\s*style-ok:\s*([^>]*?)-->/gi, (_, list) => {
    escapeCount++;
    for (const r of list.split(/[\s,]+/).filter(Boolean)) escapes.push(r);
    return "";
  });
  t = t.replace(/<!--.*?-->/g, "");
  const open = t.indexOf("<!--");
  if (open !== -1) {
    state.inComment = true;
    t = t.slice(0, open);
  }
  t = t.replace(/(`+)[^`]*?\1/g, "CODE");
  t = t.replace(/<https?:\/\/[^>]*>/g, "URL").replace(/https?:\/\/\S+/g, "URL");
  t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  t = t.replace(/&#?\w+;/g, "");
  t = t.replace(/"[^"]*"|“[^”]*”/g, "QUOTED");
  return { text: t, escapes, escapeCount, skipped: false };
}

function stripMarkup(t) {
  return t.replace(/\*\*|__/g, "").replace(/(^|\s)\*(\S)/g, "$1$2").replace(/(\S)\*(\s|$)/g, "$1$2");
}

const ABBREVIATIONS = new Set(["e.g", "i.e", "vs", "cf", "dr", "mr", "mrs", "ms", "approx", "no", "fig", "eq", "etc"]);

/** Split text into sentences. Returns [{ text, offset }]. */
export function splitWithOffsets(text) {
  const out = [];
  let start = 0;
  const re = /[.!?]+["')\]]*\s+(?=\S)/g;
  let m;
  while ((m = re.exec(text))) {
    const end = m.index + m[0].length;
    const next = text[end];
    const prior = (text.slice(start, m.index).split(/\s+/).pop() || "").replace(/^[("'[]+/, "").toLowerCase();
    if (/[a-z]/.test(next)) continue; // a lowercase word continues the sentence ("e.g. foo", "etc. and")
    if (m[0][0] === "." && /^[a-z]$/i.test(prior)) continue; // initials such as "J. Smith"
    if (m[0][0] === "." && ABBREVIATIONS.has(prior) && prior !== "etc") continue; // "etc." can end a sentence
    const s = text.slice(start, end).trim();
    if (s) out.push({ text: s, offset: start });
    start = end;
  }
  const tail = text.slice(start).trim();
  if (tail) out.push({ text: tail, offset: start });
  return out;
}

export function splitSentences(text) {
  return splitWithOffsets(text).map((s) => s.text);
}

/** Count words. Text in parentheses counts as one word. A code span (already `CODE`) counts as one word. */
export function countWords(sentence) {
  let t = sentence;
  let prev;
  do {
    prev = t;
    t = t.replace(/\([^()]*\)/g, " PAREN ");
  } while (t !== prev);
  return t.split(/\s+/).filter((w) => /[A-Za-z0-9À-￿]/.test(w)).length;
}

// ---------- checking one file ----------

const LIST_MARKER = /^(\s*)([-*+]|\d+[.)])\s+/;
const TABLE_SEPARATOR = /^\s*\|?[\s:|-]+\|?\s*$/;

export function checkText(text, path = "file.md") {
  const findings = [];
  let escapeComments = 0;
  const escapesByLine = new Map();

  const rawLines = text.split(/\r?\n/);
  if (rawLines.length && rawLines[rawLines.length - 1] === "") rawLines.pop();

  // Pass 0: collect the style-ok escapes on every line outside fenced code.
  {
    let fence = "";
    for (let i = 0; i < rawLines.length; i++) {
      const trimmed = rawLines[i].trim();
      if (/^(```|~~~)/.test(trimmed)) {
        if (!fence) fence = trimmed.slice(0, 3);
        else if (trimmed.startsWith(fence)) fence = "";
        continue;
      }
      if (fence) continue;
      for (const m of rawLines[i].matchAll(/<!--\s*style-ok:\s*([^>]*?)-->/gi)) {
        escapeComments++;
        const set = escapesByLine.get(i + 1) ?? new Set();
        for (const r of m[1].split(/[\s,]+/).filter(Boolean)) set.add(r);
        escapesByLine.set(i + 1, set);
      }
    }
  }

  // Pass 1: decide per line what to check, and produce cleaned text.
  const lines = []; // { n, text, desc, heading, prov }
  let fmEnd = -1;
  if (rawLines[0] === "---") fmEnd = rawLines.indexOf("---", 1);
  let inFence = false;
  let fenceMark = "";
  let inProvenance = false;
  let inRouter = false;
  const state = { inComment: false };

  for (let i = 0; i < rawLines.length; i++) {
    const n = i + 1;
    let raw = rawLines[i];
    const inFm = fmEnd !== -1 && i <= fmEnd;
    if (inFm) {
      if (i === 0 || i === fmEnd) continue;
      const m = raw.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
      if (!m || m[1] !== "description") continue; // keys and non-prose values are skipped
      let v = m[2].trim();
      if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1);
      const c = cleanLine(v, { inComment: false });
      lines.push({ n, text: stripMarkup(c.text), desc: true });
      continue;
    }
    const trimmed = raw.trim();
    if (!state.inComment && /^(```|~~~)/.test(trimmed)) {
      if (!inFence) {
        inFence = true;
        fenceMark = trimmed.slice(0, 3);
      } else if (trimmed.startsWith(fenceMark)) inFence = false;
      continue;
    }
    if (inFence) continue;
    if (/^<!--\s*skills:begin\s*-->$/.test(trimmed)) inRouter = true;
    else if (/^<!--\s*skills:end\s*-->$/.test(trimmed)) inRouter = false;
    if (inRouter && /^[^|]+\|[^|]+\|/.test(raw)) {
      // Router line `name | type | purpose`: check the purpose as its own description.
      const c = cleanLine(raw.split("|").slice(2).join("|"), { inComment: false });
      lines.push({ n, text: stripMarkup(c.text), desc: true });
      continue;
    }
    if (/^#{1,6}\s/.test(raw)) inProvenance = /^#{1,6}\s+Provenance\s*$/.test(trimmed);
    if (TABLE_SEPARATOR.test(raw) && raw.includes("-") && raw.includes("|")) continue;
    const c = cleanLine(raw, state);
    if (c.skipped) continue;
    // The Provenance section quotes sources, so only the spelling rule reads it.
    lines.push({ n, text: c.text, heading: /^#{1,6}\s/.test(raw), prov: inProvenance });
  }

  const suppressed = (nums, rule) => nums.some((n) => escapesByLine.get(n)?.has(rule));
  const add = (nums, rule, message, fix, basis = BASIS[rule]) => {
    if (suppressed(nums, rule)) return;
    findings.push({ path, line: nums[0], rule, level: RULES[rule], basis, message: `${message} [${basis}]`, fix });
  };

  // House rules: the slop_check.py port, on the whole file.
  for (const h of houseScan(text)) {
    add([h.line], h.rule, `${h.name}: \`${h.match.length > 60 ? `${h.match.slice(0, 57)}...` : h.match}\``, HOUSE_FIX[h.rule]);
  }

  // Pass 2: line-level STE rules.
  const prose = []; // lines used for synonym scan
  for (const l of lines) {
    const t = l.text.replace(/^\s*>+\s?/, "");
    const bare = stripMarkup(t);
    if (bare.trim() === "") continue;
    const at = [l.n];

    for (const s of britishSpellings(bare)) {
      add(at, "spelling", `British spelling \`${s.match}\``, `write \`${s.american}\`. Keep code, paths and quoted source text as they are.`);
    }
    if (l.prov) continue;
    prose.push({ n: l.n, text: bare });

    for (const m of bare.matchAll(/\b(should|may|might|could|would|shall|ought)\b/gi)) {
      add(at, "banned-modal", `modal \`${m[1]}\` is not allowed`, "use `can`, `will` or `must`, or rewrite the sentence in the imperative.");
    }
    for (const m of bare.matchAll(/\b(?:\w+n['’]t|\w+['’](?:re|ve|ll|d|m)|(?:it|that|there|here|what|let|he|she|who|where|how)['’]s)\b/gi)) {
      add(at, "contraction", `contraction \`${m[0]}\``, "write both words in full.");
    }
    PERFECT.lastIndex = 0;
    for (const m of bare.matchAll(PERFECT)) {
      if (m[1] && NOT_EDS.has(m[1].toLowerCase())) continue;
      add(at, "present-perfect", `present perfect \`${m[0]}\``, "use the simple past or simple present.");
    }
    for (const m of bare.matchAll(/\b(?:is|are|was|were)\s+being\b/gi)) {
      add(at, "is-being", `"is being" passive: \`${m[0]}\``, "use the active voice and a simple tense.");
    }
    for (const [re, use, basis] of WORD_CHOICE) {
      re.lastIndex = 0;
      for (const m of bare.matchAll(re)) add(at, "word-choice", `word \`${m[0]}\``, `write \`${use}\`.`, basis);
    }
  }

  // Pass 3: blocks and sentences.
  const blocks = [];
  let cur = null;
  const flush = () => {
    if (cur) blocks.push(cur);
    cur = null;
  };
  for (const l of lines) {
    if (l.heading || l.prov) {
      flush();
      continue;
    }
    let t = l.text.replace(/^\s*>+\s?/, "");
    if (l.desc) {
      flush();
      blocks.push({ kind: "desc", parts: [{ n: l.n, text: stripMarkup(t) }] });
      continue;
    }
    if (t.trim() === "") {
      flush();
      continue;
    }
    if (/^\s*\|/.test(t)) {
      flush();
      for (const cell of t.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|")) {
        const c = stripMarkup(cell).trim();
        if (c) blocks.push({ kind: "cell", parts: [{ n: l.n, text: c }] });
      }
      continue;
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(t)) {
      flush();
      continue;
    }
    const lm = t.match(LIST_MARKER);
    if (lm) {
      flush();
      const body = stripMarkup(t.slice(lm[0].length));
      const first = (body.match(/^[A-Za-z]+/) || [""])[0].toLowerCase();
      const numbered = /\d/.test(lm[2]);
      cur = { kind: numbered ? "step" : "bullet", imperativeStart: IMPERATIVES.has(first), parts: [{ n: l.n, text: body }] };
      continue;
    }
    if (cur) cur.parts.push({ n: l.n, text: stripMarkup(t).trim() });
    else cur = { kind: "para", parts: [{ n: l.n, text: stripMarkup(t).trim() }] };
  }
  flush();

  for (const b of blocks) {
    let joined = "";
    const starts = [];
    for (const p of b.parts) {
      starts.push([joined.length, p.n]);
      joined += (joined ? " " : "") + p.text;
    }
    const nums = b.parts.map((p) => p.n);
    const lineAt = (offset) => {
      let n = starts[0][1];
      for (const [o, ln] of starts) if (o <= offset) n = ln;
      return n;
    };
    const instruction = b.kind === "step" || (b.kind === "bullet" && b.imperativeStart);
    for (const s of splitWithOffsets(joined)) {
      const words = countWords(s.text);
      const line = lineAt(s.offset);
      const where = [line, ...nums.filter((x) => x !== line)];
      const preview = s.text.length > 60 ? `${s.text.slice(0, 57)}...` : s.text;
      if (words > MAX_SENTENCE_WORDS) {
        add(where, "sentence-length", `sentence has ${words} words (limit ${MAX_SENTENCE_WORDS}): "${preview}"`, "split it into shorter sentences, one instruction in each.");
      } else if (instruction && words > MAX_INSTRUCTION_WORDS) {
        add(where, "instruction-length", `instruction has ${words} words (limit ${MAX_INSTRUCTION_WORDS}): "${preview}"`, "split it so that each sentence has 20 words or fewer.");
      }
      const first = (s.text.match(/^[A-Za-z]+/) || [""])[0].toLowerCase();
      if (IMPERATIVES.has(first)) {
        const m = s.text.match(/^[A-Za-z]+\s+([^,]*?)\b(if|when|unless)\b(?!\s+to\b)/i);
        const reported = /^(?:check|ask|see|decide|tell|verify|confirm|test|note|find|record|report|state|list|say|name|explain|describe)\s+(?:\S+\s+){0,3}?(?:if|when)\b/i.test(s.text);
        if (m && m[1].trim() !== "" && !reported) {
          add(where, "condition-last", `condition \`${m[2]}\` comes after the command: "${preview}"`, "put the condition first: `If X, do Y.`");
        }
      }
      for (const m of s.text.matchAll(/\b(?:is|are|was|were|be|been)\s+(?:\w+ly\s+)?(?:\w+ed|built|written|run|shown|given|taken|made|done|found|kept|held|sent|read|set|chosen|known|seen)\s+by\b/gi)) {
        add(where, "passive", `likely passive: \`${m[0]}\``, "name the actor as the subject: write `X creates Y`.");
      }
    }
  }

  // Synonym pairs.
  for (const g of SYNONYM_GROUPS) {
    const firstSeen = new Map();
    for (const p of prose) {
      for (const [name, re] of g.members) if (!firstSeen.has(name) && re.test(p.text)) firstSeen.set(name, p.n);
    }
    if (firstSeen.size >= 2) {
      const entries = [...firstSeen.entries()].sort((a, b) => a[1] - b[1]);
      add([entries[1][1]], "synonyms", `${g.name}: the file uses ${entries.map(([k]) => `\`${k}\``).join(" and ")} for one concept`, `pick one word and use it everywhere in this file.`);
    }
  }

  findings.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
  return { findings, escapeComments };
}

// ---------- repo walk ----------

function walkMd(dir, out) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walkMd(p, out);
    else if (e.isFile() && e.name.endsWith(".md")) out.push(p);
  }
}

export function listFiles(root) {
  const files = [];
  walkMd(join(root, "skills"), files);
  walkMd(join(root, "templates"), files);
  walkMd(join(root, "evals"), files);
  for (const f of ["README.md", "CONVENTIONS.md", "AGENTS.md"]) {
    const p = join(root, f);
    if (existsSync(p) && statSync(p).isFile()) files.push(p);
  }
  return files;
}

export class StyleLintError extends Error {}

export function lintStyle(rootArg) {
  const root = resolve(rootArg ?? ".");
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new StyleLintError(`no directory at ${root}`);
  const files = listFiles(root);
  const findings = [];
  let escapes = 0;
  for (const f of files) {
    let text;
    try {
      text = readFileSync(f, "utf8");
    } catch (e) {
      throw new StyleLintError(`cannot read ${f}: ${e.message}`);
    }
    const r = checkText(text, relative(root, f));
    findings.push(...r.findings);
    escapes += r.escapeComments;
  }
  const errors = findings.filter((x) => x.level === "error").length;
  const warnings = findings.length - errors;
  const perRule = {};
  const perFile = {};
  for (const x of findings) {
    perRule[x.rule] = (perRule[x.rule] ?? 0) + 1;
    perFile[x.path] = (perFile[x.path] ?? 0) + 1;
  }
  return { root, files: files.length, findings, errors, warnings, escapes, perRule, perFile };
}

export function formatFinding(p) {
  const rule = p.level === "warning" ? `${p.rule}(warn)` : p.rule;
  return `${p.path}:${p.line}  ${rule}  ${p.message}  Fix: ${p.fix}`;
}

// ---------- CLI ----------

const USAGE = "Usage: node scripts/style-lint.mjs [root] [--json] [--max-warn N]";

function main(argv) {
  let json = false;
  let root;
  let maxWarn = Infinity;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") json = true;
    else if (a === "--max-warn" || a.startsWith("--max-warn=")) {
      const v = a.includes("=") ? a.split("=")[1] : argv[++i];
      if (v === undefined || !/^\d+$/.test(v)) {
        console.error(`style-lint: --max-warn needs a whole number\n${USAGE}`);
        return 2;
      }
      maxWarn = Number(v);
    } else if (a.startsWith("-")) {
      console.error(`style-lint: unknown option ${a}\n${USAGE}`);
      return 2;
    } else if (root === undefined) root = a;
    else {
      console.error(`style-lint: too many arguments\n${USAGE}`);
      return 2;
    }
  }
  let r;
  try {
    r = lintStyle(root);
  } catch (e) {
    console.error(`style-lint: ${e.message}`);
    return 2;
  }
  const failed = r.errors > 0 || r.warnings > maxWarn;
  if (json) {
    console.log(JSON.stringify({ ok: !failed, files: r.files, errors: r.errors, warnings: r.warnings, styleOk: r.escapes, perRule: r.perRule, perFile: r.perFile, findings: r.findings }, null, 2));
  } else {
    for (const x of r.findings) console.log(formatFinding(x));
    console.log(`${r.files} file(s) checked, ${r.errors} error(s), ${r.warnings} warning(s), ${r.escapes} style-ok escape(s).`);
    if (r.warnings > maxWarn) console.log(`Warnings are over the limit of ${maxWarn}.`);
  }
  return failed ? 1 : 0;
}

function isMain() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) process.exitCode = main(process.argv.slice(2));
