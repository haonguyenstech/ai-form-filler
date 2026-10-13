// offline.js — locally generated form data. Two jobs:
//  1) a persona (one coherent fake person per fill) that the AI prompt is told to
//     use, so name / email / phone / address agree with each other and with the
//     locale, also across the retry and per-field regenerate calls;
//  2) a full fallback when the AI can't answer (daily free quota, model busy,
//     offline): every field still gets a sensible value instead of an error.
// Loaded into the service worker with importScripts; no DOM, no network.

const LOCALES = {
  "en-US": {
    country: "United States", family: false,
    first: { m: ["James", "Michael", "Daniel", "Ethan", "Ryan", "Noah", "Lucas", "Owen"], f: ["Emily", "Olivia", "Sophia", "Grace", "Chloe", "Hannah", "Ava", "Natalie"] },
    last: ["Carter", "Bennett", "Hughes", "Foster", "Reed", "Brooks", "Hayes", "Coleman", "Morgan", "Parker"],
    cities: [["Austin", "TX", "787"], ["Denver", "CO", "802"], ["Portland", "OR", "972"], ["Seattle", "WA", "981"], ["Chicago", "IL", "606"], ["Boston", "MA", "021"]],
    streets: ["Maple Avenue", "Oak Street", "Cedar Lane", "Park Road", "Lakeview Drive", "Pine Street"],
    street: (n, s) => `${n} ${s}`, zip: (p, r) => p + r.digits(2),
    phone: (r) => `(${r.pick(["512", "303", "503", "206", "312", "617"])}) 555-${r.digits(4)}`,
    companies: ["Northwind Labs", "Bluefield Systems", "Summit Analytics", "Brightpath Health", "Ironwood Logistics"],
    jobs: ["Software Engineer", "Product Manager", "Data Analyst", "UX Designer", "Marketing Specialist", "Accountant"],
    text: ["Looking forward to hearing from you.", "Please contact me by email if you need more details.", "I would like to learn more about your services."],
  },
  "vi-VN": {
    country: "Việt Nam", family: true,
    first: { m: ["Văn An", "Minh Khoa", "Quốc Bảo", "Đức Huy", "Hoàng Nam", "Gia Phúc", "Thành Long", "Tuấn Kiệt"], f: ["Thị Lan", "Ngọc Anh", "Thu Trang", "Minh Thư", "Khánh Linh", "Bảo Ngọc", "Thanh Hương", "Mai Phương"] },
    last: ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Võ", "Đặng", "Bùi", "Đỗ", "Huỳnh"],
    cities: [["Hà Nội", "Hà Nội", "100000"], ["TP. Hồ Chí Minh", "TP. Hồ Chí Minh", "700000"], ["Đà Nẵng", "Đà Nẵng", "550000"], ["Huế", "Thừa Thiên Huế", "530000"], ["Cần Thơ", "Cần Thơ", "900000"], ["Hải Phòng", "Hải Phòng", "180000"]],
    streets: ["Lê Lợi", "Trần Hưng Đạo", "Nguyễn Huệ", "Hai Bà Trưng", "Lý Thường Kiệt", "Phan Chu Trinh"],
    street: (n, s) => `${n} ${s}`, zip: (p) => p,
    phone: (r) => `0${r.pick(["90", "91", "93", "97", "98", "86"])}${r.digits(7)}`,
    companies: ["Công ty TNHH Sao Việt", "Công ty CP Công nghệ Phương Nam", "Công ty TNHH Thương mại Hòa Bình", "Công ty CP Giải pháp Số An Phát"],
    jobs: ["Kỹ sư phần mềm", "Chuyên viên kinh doanh", "Kế toán", "Nhân viên marketing", "Trưởng phòng dự án", "Chuyên viên phân tích dữ liệu"],
    text: ["Mong sớm nhận được phản hồi từ quý công ty.", "Vui lòng liên hệ với tôi qua email nếu cần thêm thông tin.", "Tôi muốn tìm hiểu thêm về dịch vụ của bên bạn."],
  },
  "ja-JP": {
    country: "日本", family: true, sep: " ",
    first: { m: ["翔太", "大輔", "健太", "拓也", "悠斗", "蓮"], f: ["さくら", "美咲", "結衣", "陽菜", "愛", "葵"] },
    last: ["佐藤", "鈴木", "高橋", "田中", "伊藤", "渡辺", "山本", "中村"],
    romaji: { "翔太": "shota", "大輔": "daisuke", "健太": "kenta", "拓也": "takuya", "悠斗": "yuto", "蓮": "ren", "さくら": "sakura", "美咲": "misaki", "結衣": "yui", "陽菜": "hina", "愛": "ai", "葵": "aoi", "佐藤": "sato", "鈴木": "suzuki", "高橋": "takahashi", "田中": "tanaka", "伊藤": "ito", "渡辺": "watanabe", "山本": "yamamoto", "中村": "nakamura" },
    cities: [["渋谷区", "東京都", "150-"], ["大阪市北区", "大阪府", "530-"], ["名古屋市中区", "愛知県", "460-"], ["福岡市中央区", "福岡県", "810-"], ["札幌市中央区", "北海道", "060-"]],
    streets: ["1-2-3", "2-5-8", "3-14-1", "4-7-2"],
    street: (n, s) => s, zip: (p, r) => p + r.digits(4),
    phone: (r) => `090-${r.digits(4)}-${r.digits(4)}`,
    companies: ["株式会社サクラテック", "株式会社アオイ商事", "株式会社ミライシステム"],
    jobs: ["ソフトウェアエンジニア", "営業担当", "経理", "デザイナー"],
    text: ["ご連絡をお待ちしております。", "詳細についてはメールでご連絡ください。"],
  },
  "fr-FR": {
    country: "France", family: false,
    first: { m: ["Lucas", "Hugo", "Louis", "Arthur", "Jules", "Paul"], f: ["Camille", "Léa", "Chloé", "Manon", "Inès", "Julie"] },
    last: ["Martin", "Bernard", "Dubois", "Moreau", "Laurent", "Girard", "Lefèvre", "Fontaine"],
    cities: [["Paris", "Île-de-France", "750"], ["Lyon", "Auvergne-Rhône-Alpes", "690"], ["Bordeaux", "Nouvelle-Aquitaine", "330"], ["Nantes", "Pays de la Loire", "440"], ["Lille", "Hauts-de-France", "590"]],
    streets: ["rue de la République", "avenue Victor Hugo", "rue des Lilas", "boulevard Voltaire"],
    street: (n, s) => `${n} ${s}`, zip: (p, r) => p + r.digits(2),
    phone: (r) => `06 ${r.digits(2)} ${r.digits(2)} ${r.digits(2)} ${r.digits(2)}`,
    companies: ["Atelier Lumière SARL", "Groupe Horizon", "Solutions Azur SAS"],
    jobs: ["Ingénieur logiciel", "Chef de projet", "Comptable", "Responsable marketing"],
    text: ["Dans l'attente de votre retour.", "N'hésitez pas à me contacter par e-mail pour plus de détails."],
  },
  "de-DE": {
    country: "Deutschland", family: false,
    first: { m: ["Lukas", "Jonas", "Felix", "Leon", "Paul", "Maximilian"], f: ["Anna", "Lena", "Laura", "Sophie", "Marie", "Julia"] },
    last: ["Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Wagner", "Becker", "Hoffmann"],
    cities: [["Berlin", "Berlin", "10"], ["München", "Bayern", "80"], ["Hamburg", "Hamburg", "20"], ["Köln", "Nordrhein-Westfalen", "50"], ["Frankfurt am Main", "Hessen", "60"]],
    streets: ["Hauptstraße", "Bahnhofstraße", "Gartenweg", "Schillerstraße", "Lindenallee"],
    street: (n, s) => `${s} ${n}`, zip: (p, r) => p + r.digits(3),
    phone: (r) => `0151 ${r.digits(8)}`,
    companies: ["Nordlicht GmbH", "Weber & Partner AG", "Alpenblick Software GmbH"],
    jobs: ["Softwareentwickler", "Projektleiter", "Buchhalter", "Marketingmanager"],
    text: ["Ich freue mich auf Ihre Rückmeldung.", "Bei Fragen erreichen Sie mich gerne per E-Mail."],
  },
  "es-ES": {
    country: "España", family: false,
    first: { m: ["Alejandro", "Pablo", "Daniel", "Javier", "Sergio", "Diego"], f: ["Lucía", "Paula", "María", "Carmen", "Elena", "Sara"] },
    last: ["García", "Fernández", "López", "Martínez", "Sánchez", "Romero", "Navarro", "Torres"],
    cities: [["Madrid", "Madrid", "280"], ["Barcelona", "Cataluña", "080"], ["Valencia", "Comunidad Valenciana", "460"], ["Sevilla", "Andalucía", "410"], ["Bilbao", "País Vasco", "480"]],
    streets: ["Calle Mayor", "Calle de Alcalá", "Avenida de la Constitución", "Calle Real"],
    street: (n, s) => `${s}, ${n}`, zip: (p, r) => p + r.digits(2),
    phone: (r) => `6${r.digits(2)} ${r.digits(3)} ${r.digits(3)}`,
    companies: ["Soluciones Iberia S.L.", "Grupo Mediterráneo S.A.", "Tecnologías Sol S.L."],
    jobs: ["Ingeniero de software", "Jefe de proyecto", "Contable", "Responsable de marketing"],
    text: ["Quedo a la espera de su respuesta.", "No dude en contactarme por correo si necesita más información."],
  },
};
const LOCALE_NAMES = Object.keys(LOCALES);

// "auto" follows the page's <html lang>, then the browser, then en-US.
function resolveLocale(setting, pageLang, browserLang) {
  if (setting && LOCALES[setting]) return setting;
  for (const l of [pageLang, browserLang]) {
    const base = String(l || "").toLowerCase().split(/[-_]/)[0];
    const hit = base && LOCALE_NAMES.find((k) => k.toLowerCase().startsWith(base + "-"));
    if (hit) return hit;
  }
  return "en-US";
}

// mulberry32 — seeded so a persona is reproducible from its seed
function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r = {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    digits: (n) => Array.from({ length: n }, () => Math.floor(next() * 10)).join(""),
  };
  return r;
}

// Strip diacritics so a Vietnamese/French/German name makes a valid email.
const ascii = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
  .replace(/ß/g, "ss").replace(/[^A-Za-z0-9]+/g, "").toLowerCase();
const pad2 = (n) => String(n).padStart(2, "0");
const isoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function makePersona(locale, seed) {
  const L = LOCALES[locale] || LOCALES["en-US"];
  seed = seed ?? Math.floor(Math.random() * 2 ** 31);
  const r = rng(seed);
  const gender = r.next() < 0.5 ? "male" : "female";
  const first = r.pick(L.first[gender === "male" ? "m" : "f"]);
  const last = r.pick(L.last);
  const fullName = L.family ? `${last}${L.sep ?? " "}${first}` : `${first} ${last}`;
  // romanised name parts for email/username (Japanese needs the lookup table)
  const rf = L.romaji ? L.romaji[first] : ascii(first.split(" ").pop());
  const rl = L.romaji ? L.romaji[last] : ascii(last);
  const age = r.int(24, 46);
  const now = new Date();
  const birth = new Date(now.getFullYear() - age, r.int(0, 11), r.int(1, 28));
  const [city, state, zipPrefix] = r.pick(L.cities);
  const yy = String(birth.getFullYear()).slice(2);
  return {
    seed, locale, gender, firstName: first, lastName: last, fullName,
    birthDate: isoDate(birth), age,
    email: `${rf}.${rl}${r.int(1, 99)}@example.com`,
    username: `${rf}${rl}${yy}`,
    phone: L.phone(r),
    street: L.street(r.int(3, 180), r.pick(L.streets)),
    city, state, postalCode: L.zip(zipPrefix, r), country: L.country,
    company: r.pick(L.companies), jobTitle: r.pick(L.jobs),
    website: `https://${rf}${rl}.example.com`,
  };
}

// What the prompt shows the model — internal bits (seed) left out.
function personaForPrompt(p) {
  const { seed, ...rest } = p;
  return rest;
}

// ---- regex → matching string (for HTML pattern="…") --------------------------
// Covers what form patterns use in practice: literals, escapes (\d \w \s),
// classes with ranges and negation, groups with alternation, and the usual
// quantifiers. Unsupported syntax returns null and the caller keeps its value.
function sampleRegex(src, r) {
  let i = 0;
  const PRINT = Array.from({ length: 94 }, (_, k) => String.fromCharCode(33 + k));
  const DIG = "0123456789".split(""), WORD = [..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", ...DIG, "_"];
  const esc = (c) => (c === "d" ? DIG : c === "w" ? WORD : c === "s" ? [" "] :
    c === "D" ? PRINT.filter((x) => !DIG.includes(x)) : c === "W" ? PRINT.filter((x) => !WORD.includes(x)) :
    c === "S" ? PRINT : c === "n" ? ["\n"] : c === "t" ? ["\t"] : [c]);
  const alt = () => {
    const branches = [seq()];
    while (src[i] === "|") { i++; branches.push(seq()); }
    return { t: "alt", branches };
  };
  const seq = () => {
    const items = [];
    while (i < src.length && src[i] !== "|" && src[i] !== ")") {
      let atom = parseAtom();
      if (atom === null) continue;
      atom = quant(atom);
      items.push(atom);
    }
    return { t: "seq", items };
  };
  const parseAtom = () => {
    const c = src[i++];
    if (c === "^" || c === "$") return null;
    if (c === "(") {
      if (src[i] === "?") { if (src[i + 1] === ":") i += 2; else throw new Error("lookaround"); }
      const g = alt();
      if (src[i++] !== ")") throw new Error("paren");
      return g;
    }
    if (c === "[") {
      let neg = false, set = [];
      if (src[i] === "^") { neg = true; i++; }
      let first = true;
      while (i < src.length && (src[i] !== "]" || first)) {
        first = false;
        let a = src[i++];
        let chars;
        if (a === "\\") { chars = esc(src[i++]); }
        else chars = [a];
        if (chars.length === 1 && src[i] === "-" && src[i + 1] && src[i + 1] !== "]") {
          i++;
          let b = src[i++];
          if (b === "\\") b = src[i++];
          for (let k = chars[0].charCodeAt(0); k <= b.charCodeAt(0); k++) set.push(String.fromCharCode(k));
        } else set.push(...chars);
      }
      i++; // ]
      if (neg) set = PRINT.filter((x) => !set.includes(x) && /[A-Za-z0-9]/.test(x));
      return { t: "set", set };
    }
    if (c === "\\") return { t: "set", set: esc(src[i++]) };
    if (c === ".") return { t: "set", set: WORD.filter((x) => x !== "_") };
    return { t: "set", set: [c] };
  };
  const quant = (atom) => {
    let lo = 1, hi = 1;
    const c = src[i];
    if (c === "*") { lo = 0; hi = 3; i++; }
    else if (c === "+") { lo = 1; hi = 4; i++; }
    else if (c === "?") { lo = 0; hi = 1; i++; }
    else if (c === "{") {
      const m = /^\{(\d*)(,?)(\d*)\}/.exec(src.slice(i));
      if (m) {
        i += m[0].length;
        lo = m[1] === "" ? 0 : +m[1];
        hi = m[2] ? (m[3] === "" ? lo + 3 : +m[3]) : lo;
      }
    } else return atom;
    if (src[i] === "?" || src[i] === "+") i++; // lazy / possessive markers
    return { t: "rep", atom, lo, hi };
  };
  const gen = (n) => {
    if (n.t === "alt") return gen(r.pick(n.branches));
    if (n.t === "seq") return n.items.map(gen).join("");
    if (n.t === "set") return n.set.length ? r.pick(n.set) : "";
    if (n.t === "rep") { let s = ""; const k = r.int(n.lo, n.hi); for (let j = 0; j < k; j++) s += gen(n.atom); return s; }
    return "";
  };
  try {
    const tree = alt();
    if (i < src.length) return null;
    const re = patternRegExp(src);
    for (let t = 0; t < 20; t++) { const s = gen(tree); if (!re || re.test(s)) return s; }
  } catch (e) {}
  return null;
}
// HTML pattern attributes are implicitly anchored and compiled with the v flag.
function patternRegExp(p) {
  for (const flags of ["v", "u", ""]) { try { return new RegExp(`^(?:${p})$`, flags); } catch (e) {} }
  return null;
}

// ---- per-field offline values ------------------------------------------------
const KIND = [
  ["skip", /pass(word)?|mật khẩu|otp|captcha|cvv|cvc/],
  ["email", /e-?mail|thư điện tử|メール|courriel|correo/],
  ["firstName", /first.?name|given.?name|fname|forename|^first$|tên riêng|prénom|vorname|nombre(?!.*apellido)|名(?!前)/],
  ["lastName", /last.?name|family.?name|surname|lname|họ(?!\s*(và\s*)?tên)|nom de famille|nachname|apellido|姓/],
  ["username", /user.?name|login|nick|handle|tài khoản|tên đăng nhập/],
  ["phone", /phone|mobile|\btel\b|cell|điện thoại|sđt|sdt|電話|téléphone|telefon|teléfono/],
  ["postalCode", /zip|postal|postcode|post.?code|mã bưu|郵便|code postal|plz|código postal/],
  ["city", /city|town|thành phố|tỉnh|市|ville|stadt|ciudad/],
  ["state", /\bstate\b|province|region|county|bang|都道府県|région|bundesland/],
  ["country", /country|quốc gia|nation|国|pays|\bland\b|país/],
  ["street", /address|street|addr|địa chỉ|住所|adresse|dirección/],
  ["company", /company|organi[sz]ation|employer|business|công ty|会社|entreprise|firma|empresa/],
  ["jobTitle", /job|title|position|occupation|\brole\b|chức vụ|nghề|職業|poste|beruf|puesto/],
  ["website", /website|homepage|url|site|web/],
  ["fullName", /full.?name|your.?name|^name$|contact.?name|họ (và )?tên|họ tên|\bname\b|^nom$|氏名|名前|tên/],
  ["code", /\bcode\b|\bid\b|referral|voucher|coupon|promo|mã|số hiệu|コード|código/],
  ["birthDate", /birth|dob|ngày sinh|生年月日|naissance|geburt|nacimiento/],
  ["age", /\bage\b|tuổi|年齢|âge|alter|edad/],
  ["gender", /gender|sex|giới tính|性別|genre|geschlecht|género/],
  ["text", /message|comment|note|bio|about|description|feedback|lời nhắn|ghi chú|mô tả|内容|message|nachricht|mensaje/],
];
const kindOf = (f) => {
  const hint = `${f.label || ""} ${f.name || ""} ${f.placeholder || ""}`.toLowerCase();
  const t = (f.type || "").toLowerCase();
  if (t === "email") return "email";
  if (t === "tel") return "phone";
  if (t === "url") return "website";
  for (const [k, re] of KIND) if (re.test(hint)) return k;
  return "";
};

const GENDER_WORDS = { male: /^(m|male|man|nam|mr\.?|男性?|homme|masculin|männlich|hombre|masculino)$/i, female: /^(f|female|woman|nữ|mrs\.?|ms\.?|女性?|femme|féminin|weiblich|mujer|femenino)$/i };

function pickOption(f, p, r) {
  const opts = (f.options || []).filter((o) => o != null && String(o).trim() !== "");
  if (!opts.length) return null;
  const k = kindOf(f);
  const find = (want) => opts.find((o) => String(o).toLowerCase() === String(want).toLowerCase()) ||
    opts.find((o) => String(o).toLowerCase().includes(String(want).toLowerCase()));
  if (k === "gender") { const g = opts.find((o) => GENDER_WORDS[p.gender].test(String(o).trim())); if (g) return g; }
  if (k === "country") { const c = find(p.country) || find(p.locale.split("-")[1]); if (c) return c; }
  if (k === "city") { const c = find(p.city); if (c) return c; }
  if (k === "state") { const c = find(p.state); if (c) return c; }
  return r.pick(opts);
}

function numberIn(f, r, fallbackLo, fallbackHi) {
  const step = Number(f.step) > 0 ? Number(f.step) : 1;
  const lo = f.min !== undefined && f.min !== null && f.min !== "" ? Number(f.min) : fallbackLo;
  const hi = f.max !== undefined && f.max !== null && f.max !== "" ? Number(f.max) : Math.max(lo, fallbackHi);
  const n = Math.floor((hi - lo) / step);
  const v = lo + r.int(0, Math.max(0, n)) * step;
  return String(Number(v.toFixed(6)));
}

function dateNear(r, f) {
  const d = new Date();
  d.setDate(d.getDate() + r.int(1, 60));
  let s = isoDate(d);
  if (f.min && s < f.min) s = f.min;
  if (f.max && s > f.max) s = f.max;
  return s;
}

function fitLength(v, f) {
  let s = String(v);
  if (f.maxLength && s.length > f.maxLength) s = s.slice(0, f.maxLength);
  if (f.minLength && s.length < f.minLength) s = s + "x".repeat(f.minLength - s.length);
  return s;
}

function offlineValue(f, p, r) {
  const t = (f.type || "").toLowerCase();
  const L = LOCALES[p.locale] || LOCALES["en-US"];
  if (f.kind === "combobox" || f.kind === "select" || t === "select" || t === "radio") return pickOption(f, p, r);
  if (t === "checkbox") return f.required ? true : r.next() < 0.5;
  const k = kindOf(f);
  if (k === "skip") return null;
  if (f.kind === "datepicker" || t === "date") return k === "birthDate" ? p.birthDate : dateNear(r, f);
  if (t === "time") return `${pad2(r.int(8, 17))}:${r.pick(["00", "15", "30", "45"])}`;
  if (t === "datetime-local") return `${dateNear(r, f)}T${pad2(r.int(8, 17))}:00`;
  if (t === "month") return p.birthDate.slice(0, 7);
  if (t === "week") return `${new Date().getFullYear()}-W${pad2(r.int(1, 52))}`;
  if (t === "color") return "#" + r.int(0, 0xffffff).toString(16).padStart(6, "0");
  if (t === "number" || t === "range") return k === "age" ? numberIn({ ...f, min: f.min ?? p.age, max: f.max ?? p.age }, r, p.age, p.age) : numberIn(f, r, 1, 100);
  let v;
  switch (k) {
    case "email": v = p.email; break;
    case "firstName": v = p.firstName; break;
    case "lastName": v = p.lastName; break;
    case "fullName": v = p.fullName; break;
    case "username": v = p.username; break;
    case "phone": v = p.phone; break;
    case "postalCode": v = p.postalCode; break;
    case "city": v = p.city; break;
    case "state": v = p.state; break;
    case "country": v = p.country; break;
    case "street": v = `${p.street}, ${p.city}`; break;
    case "company": v = p.company; break;
    case "jobTitle": v = p.jobTitle; break;
    case "website": v = p.website; break;
    case "birthDate": v = p.birthDate; break;
    case "age": v = String(p.age); break;
    case "gender": v = p.gender === "male" ? "Male" : "Female"; break;
    case "code": v = `${ascii(p.lastName).slice(0, 2).toUpperCase()}${r.digits(4)}`; break;
    case "text": v = r.pick(L.text); break;
    default: v = r.pick(L.text);
  }
  return conformValue(f, v, r);
}

// Bring a value inside the field's declared constraints. Used on AI answers too:
// clamping a number or trimming to maxLength is cheaper than a retry.
function conformValue(f, v, r) {
  if (v === null || v === undefined || typeof v === "boolean") return v;
  const t = (f.type || "").toLowerCase();
  if (t === "number" || t === "range") {
    const n = Number(v);
    if (!Number.isFinite(n)) return numberIn(f, r || rng(1), 1, 100);
    let x = n;
    if (f.min !== undefined && f.min !== null && f.min !== "" && x < Number(f.min)) x = Number(f.min);
    if (f.max !== undefined && f.max !== null && f.max !== "" && x > Number(f.max)) x = Number(f.max);
    return String(x);
  }
  let s = typeof v === "string" ? v : String(v);
  // same-format ISO strings compare correctly as text
  if (/^(date|time|month|week|datetime-local)$/.test(t)) {
    if (f.min && s < f.min) s = f.min;
    if (f.max && s > f.max) s = f.max;
    return s;
  }
  if (f.pattern) {
    const re = patternRegExp(f.pattern);
    if (re && !re.test(s)) {
      // digits-only patterns are usually phone/ID fields: keep the digits we have
      const digits = s.replace(/\D/g, "");
      if (digits && re.test(digits)) s = digits;
      else if (r) { const g = sampleRegex(f.pattern, r); if (g !== null) s = g; }
    }
  }
  return f.options ? s : fitLength(s, f);
}

function offlineValues(fields, persona, seed) {
  const r = rng(seed ?? (persona.seed ^ 0x5bd1e995));
  const out = {};
  for (const f of fields) {
    const v = offlineValue(f, persona, r);
    if (v !== null && v !== undefined) out[f.id] = v;
  }
  return out;
}
