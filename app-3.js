'use strict';
/* =====================================================================
   私たちの歴史 ～1貫6年4組歴史実践の軌跡～   app.js
   画面：GitHub Pages ／ API：Google Apps Script ／ 記録：スプレッドシート
   config.js の GAS_URL が空のときは「デモモード」（この端末だけで動く）
   ===================================================================== */

const CFG = Object.assign({ GAS_URL: '', TEACHER_NAME: '八幡', CLASS_SIZE: 17, APP_TITLE: '私たちの歴史', APP_SUB: '～1貫6年4組歴史実践の軌跡～' }, window.APP_CONFIG || {});
const DEMO = !CFG.GAS_URL || /[?&]demo=1(&|$)/.test(location.search);
const KEY = DEMO ? 'rl-demo' : 'rl';

/* ---------- 小さな道具 ---------- */
// append / prepend に null や false が混ざっても「null」と表示されないようにする
['append', 'prepend'].forEach(fn => {
  const orig = Element.prototype[fn];
  Element.prototype[fn] = function (...a) { return orig.apply(this, a.flat(Infinity).filter(x => x != null && x !== false)); };
});
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { } }
};
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}
function kanji(n) {
  n = Number(n); if (!n || n < 0) return '';
  const d = '〇一二三四五六七八九';
  if (n < 10) return d[n];
  if (n < 100) { const t = Math.floor(n / 10), o = n % 10; return (t > 1 ? d[t] : '') + '十' + (o ? d[o] : ''); }
  return String(n);
}
function fmtTime(ms) {
  const d = new Date(Number(ms)); if (isNaN(d)) return '';
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
const clone = o => JSON.parse(JSON.stringify(o));

/* ---------- 定数 ---------- */
const TYPES = { '答': { label: '問いへの答え' } };
const BIG_QS = ['我々はどこから来たのか', '我々は何者か', '我々はどこへ行くのか'];
const STAGE_LABEL = { idle: '待機', present: '発表中', response: '問いの時間', lottery: '順番の発表', finale: '終章' };
const DEFAULT_STATE = { stage: 'idle', currentId: '', startedAt: 0, doneIds: [], orderDecided: false, lotteryAt: 0, mode: 'class', showNames: false, talkSec: 180, teacherLast: true, finaleStep: 0 };
const FIN_STEPS = ['intro', 'gauguin', 'weave', 'q1', 'q2', 'q3', 'ai', 'end'];

/* 歴史上の人物の言葉（人物・言葉・出典・タグ）。訳は抄訳・意訳を含む。
   本番ではスプレッドシート「歴史の言葉」が使われ、そこで直したり足したりできる */
const QUOTES = [
  ["マルク・ブロック", "パパ、歴史が何の役に立つのか説明してよ。", "『歴史のための弁明』冒頭", "役に立つ 意味 学ぶ 子ども 勉強"],
  ["マルク・ブロック", "現在への無理解は、過去への無知から宿命的に生まれる。だが、現在について何も知らずに過去を理解しようと力を尽くすことも、同じくらい空しいのかもしれない。", "『歴史のための弁明』", "現在 過去 今 理解 知る 無知"],
  ["マルク・ブロック", "よい歴史家は伝説の食人鬼に似ている。人間の肉のにおいがするところに、自分の獲物があると知っている。", "『歴史のための弁明』", "人間 探す 調べる 興味 歴史家"],
  ["マルク・ブロック", "歴史とは、時間のなかにおける人間たちの学である。", "『歴史のための弁明』", "時間 人間 学"],
  ["保苅実", "歴史する（doing history）", "『ラディカル・オーラル・ヒストリー』——日々の暮らしのなかで人びとが過去とかかわる実践を、こう呼んだ", "実践 日常 暮らし 身近 自分たち 歌 音楽"],
  ["E.H.カー", "歴史とは、現在と過去とのあいだの尽きることのない対話である。", "『歴史とは何か』（1961）", "現在 過去 対話 今 向き合う"],
  ["ヘロドトス", "人間のなしたことが、時とともに忘れ去られることのないように。", "『歴史』冒頭", "記録 残す 残る 忘れ 記憶 伝える 書く 消える"],
  ["トゥキュディデス", "これは一時の喝采のためではなく、永遠の財産として書かれた。", "『戦史』第1巻", "残す 書く 記録 永遠 未来 伝える 財産"],
  ["司馬遷", "天と人との際を究め、古今の変に通じ、一家の言を成さんと欲す。", "「任少卿に報ずるの書」", "天 自然 人間 変化 昔 今 自分の言葉"],
  ["孔子", "故きを温めて新しきを知る、以て師と為るべし。", "『論語』為政篇", "過去 新しい 学ぶ 古い 未来 昔"],
  ["鴨長明", "ゆく河の流れは絶えずして、しかももとの水にあらず。", "『方丈記』", "変化 変わる 川 水 時間 流れ 雨 同じ"],
  ["『平家物語』", "祇園精舎の鐘の声、諸行無常の響きあり。", "冒頭", "無常 終わり 権力 滅び 栄え 永遠"],
  ["ヘラクレイトス", "同じ川に二度入ることはできない。", "断片として伝わる言葉", "変化 変わる 川 同じ 時間 二度"],
  ["アウグスティヌス", "では、時間とは何か。誰も私に問わなければ、私は知っている。問う人に説明しようとすると、私は知らない。", "『告白』第11巻", "時間 時計 時 知る 説明 わからない"],
  ["キケロ", "歴史は時代の証人、真実の光、記憶の生命、人生の教師、古き時代の使者である。", "『弁論家について』", "記憶 真実 教え 教師 学ぶ 証人"],
  ["ランケ", "それが本来いかにあったかを示そうとするだけである。", "『ローマ的・ゲルマン的諸民族の歴史』序文（1824）", "事実 真実 本当 ありのまま 写す 正しい"],
  ["カール・マルクス", "人間は自分自身の歴史をつくる。しかし、自分の好きなようにつくるのではない。自分で選んだのではない、過去から受け継いだ状況のもとでつくるのである。", "『ルイ・ボナパルトのブリュメール18日』（1852）", "つくる 動かす 状況 選ぶ 受け継ぐ"],
  ["ベネデット・クローチェ", "すべての真の歴史は現代史である。", "『歴史の理論と歴史』", "現代 今 現在 教科書 未来の"],
  ["ジョージ・サンタヤナ", "過去を思い出すことのできない者は、それを繰り返すよう運命づけられている。", "『理性の生命』（1905）", "繰り返す 忘れ 記憶 過去 思い出す 教訓"],
  ["リヒャルト・フォン・ヴァイツゼッカー", "過去に目を閉ざす者は、現在にも盲目となる。", "連邦議会での演説（1985年5月8日）", "過去 見る 責任 戦争 記憶 向き合う 忘れ"],
  ["ヴァルター・ベンヤミン", "私たちが進歩と呼んでいるもの、それがこの嵐なのだ。", "『歴史の概念について』（1940）", "進歩 技術 発展 便利 未来 スマホ 画面"],
  ["魯迅", "もともと地上に道はない。歩く人が多くなれば、それが道になるのだ。", "『故郷』（1921）", "道 希望 未来 歩く 始まり 誰か"],
  ["福沢諭吉", "天は人の上に人を造らず人の下に人を造らずと云えり。", "『学問のすゝめ』", "平等 差別 上下 身分 学問"],
  ["杜甫", "国破れて山河在り、城春にして草木深し。", "「春望」", "戦争 国 自然 山 川 残る 滅び"],
  ["ブレーズ・パスカル", "人間はひとくきの葦にすぎない。自然のなかで最も弱いものである。だが、それは考える葦である。", "『パンセ』", "人間 考える 弱い 自然 命 強さ"],
  ["ソクラテス", "吟味されない生は、人間にとって生きるに値しない。", "プラトン『ソクラテスの弁明』", "生き 生き方 問う 考える 意味 人生 信じ"],
  ["宮沢賢治", "世界がぜんたい幸福にならないうちは個人の幸福はあり得ない。", "『農民芸術概論綱要』", "幸福 幸せ 世界 みんな 個人 願 つながって 祈"],
  ["世阿弥", "初心忘るべからず。", "『花鏡』", "初心 始まり 忘れ 学校 成長 はじめ"],
  ["アイザック・ニュートン", "私がより遠くを見渡せたのだとすれば、それは巨人たちの肩の上に立っていたからです。", "ロバート・フックへの手紙", "先人 受け継ぐ 学ぶ 科学 遠く 過去の人"],
  ["イマヌエル・カント", "啓蒙とは、人間が自ら招いた未成年状態から抜け出ることである。あえて賢くあれ（Sapere aude）。", "「啓蒙とは何か」（1784）", "自分で 考える 自由 大人 賢く 学ぶ"],
  ["ジャン＝ジャック・ルソー", "人間は自由なものとして生まれた。しかも、いたるところで鎖につながれている。", "『社会契約論』（1762）", "自由 鎖 束縛 生まれ 社会 権力 管理"],
  ["オランプ・ド・グージュ", "女性は自由なものとして生まれ、権利において男性と平等なものとして存在する。", "『女性および女性市民の権利宣言』第1条（1791）", "女性 平等 権利 自由 男女 ジェンダー"],
  ["与謝野晶子", "あゝをとうとよ、君を泣く、君死にたまふことなかれ。", "「君死にたまふことなかれ」（1904）", "戦争 家族 命 死 弟 手紙 言葉"],
  ["平塚らいてう", "元始、女性は実に太陽であった。", "『青鞜』発刊の辞（1911）", "女性 太陽 自分 生き方 自立 声"],
  ["孫文", "革命いまだ成らず、同志なお須らく努力すべし。", "遺嘱（1925）", "革命 努力 続く 終わらない 変える 仲間"],
  ["ホー・チ・ミン", "独立と自由ほど尊いものはない。", "1966年の呼びかけ", "独立 自由 国 戦争 尊い 国境"],
  ["チャールズ・ダーウィン", "これほど単純な始まりから、限りなく美しく、限りなく素晴らしい生物の形が進化してきたし、いまも進化しつつある。", "『種の起源』結び", "生命 進化 始まり 自然 生き物 どこから"],
  ["『法句経』（ダンマパダ）", "怨みは怨みによって止むことはない。怨みを捨ててこそ止む。これは永遠の真理である。", "第5偈", "怒り 争い 平和 許す 憎しみ 戦争 怨み"],
  ["世界人権宣言", "すべての人間は、生まれながらにして自由であり、かつ、尊厳と権利とについて平等である。", "第1条（1948）", "人権 自由 平等 尊厳 権利 生まれ 名前"],
  ["ユネスコ憲章", "戦争は人の心の中で生れるものであるから、人の心の中に平和のとりでを築かなければならない。", "前文（1945）", "戦争 平和 心 争い 教育 学校"],
  ["デルフォイの神殿の銘", "汝自身を知れ。", "古代ギリシア", "自分 知る 何者 私 自分自身"],
  ["アリストテレス", "すべての人間は、生まれつき知ることを欲する。", "『形而上学』冒頭", "知る 学ぶ 好奇心 知識 知りたい"],
  ["アリストテレス", "人間は本性上、ポリス的動物である。", "『政治学』", "人間 社会 共同体 国家 つながり 一人"],
  ["ルネ・デカルト", "我思う、ゆえに我あり。", "『方法序説』（1637）", "自分 私 考える 存在 疑う"],
  ["フランシス・ベーコン", "知は力なり。", "『聖なる瞑想』", "知識 力 学ぶ 技術 情報"],
  ["老子", "足るを知る者は富む。", "『老子』第33章", "富 お金 欲 豊か 満足 幸せ 足りる"],
  ["孟子", "天の時は地の利に如かず、地の利は人の和に如かず。", "『孟子』公孫丑篇", "和 協力 仲間 つながり 土地"],
  ["孔子", "己の欲せざる所は人に施すこと勿れ。", "『論語』衛霊公篇", "他者 思いやり やさしさ 相手 向こう側"],
  ["孔子", "学びて思わざれば則ち罔し、思いて学ばざれば則ち殆し。", "『論語』為政篇", "学ぶ 考える 学校 勉強 思う 教育"],
  ["孔子", "朝に道を聞かば、夕べに死すとも可なり。", "『論語』里仁篇", "道 生き 死 意味 真理"],
  ["『旧約聖書』「コヘレトの言葉」", "日の下に新しいものは何ひとつない。", "第1章", "新しい 繰り返す 同じ くりかえし"],
  ["聖徳太子", "和を以て貴しと為す。", "「十七条憲法」", "和 協力 争い 仲間 平和 日本"],
  ["坂本龍馬", "日本を今一度せんたくいたし申候。", "姉・乙女への手紙（1863）", "日本 変える 改革 新しい 未来 手紙"],
  ["田中正造", "真の文明は山を荒らさず、川を荒らさず、村を破らず、人を殺さざるべし。", "日記（1912）", "文明 自然 環境 川 山 公害 開発 進歩 雨"],
  ["ニッコロ・マキャヴェリ", "愛されるよりも恐れられるほうが、はるかに安全である。", "『君主論』", "権力 支配 恐れ 愛 リーダー 政治 管理"],
  ["トマス・ホッブズ", "万人の万人に対する闘争", "『リヴァイアサン』", "争い 戦争 国家 社会 安全 ルール"],
  ["アダム・スミス", "見えざる手", "『国富論』（1776）", "お金 市場 経済 富 交換 商品 貿易 食卓 砂糖"],
  ["フリードリヒ・ニーチェ", "神は死んだ。", "『悦ばしき知識』", "神 信じ 宗教 祈り 価値"],
  ["エイブラハム・リンカーン", "人民の、人民による、人民のための政治を、地上から決して絶やさない。", "ゲティスバーグ演説（1863）", "民主主義 政治 人民 国 みんな"],
  ["アメリカ独立宣言", "すべての人間は平等につくられ、生命、自由、そして幸福の追求をふくむ、奪うことのできない権利を与えられている。", "1776年", "平等 権利 自由 幸福 独立 生命"],
  ["フランス人権宣言", "人は、自由かつ権利において平等なものとして生まれ、生存する。", "第1条（1789）", "自由 平等 権利 革命 生まれ"],
  ["フランクリン・ローズヴェルト", "私たちが恐れなければならない唯一のものは、恐れそのものである。", "大統領就任演説（1933）", "恐れ 不安 勇気 危機 怖い"],
  ["ジョン・F・ケネディ", "国があなたのために何ができるかを問うのではなく、あなたが国のために何ができるかを問うてほしい。", "大統領就任演説（1961）", "国 できること 問う 社会 責任 自分に"],
  ["アルベルト・アインシュタイン", "想像力は知識よりも大切だ。", "1929年のインタビュー", "想像 知識 夢 未来 創造 向こう側"],
  ["日本国憲法", "すべて国民は、個人として尊重される。", "第13条", "個人 尊重 一人ひとり 幸福 名前 自分"],
  ["ハンムラビ法典", "目には目を、歯には歯を。", "紀元前18世紀ごろ", "法 正義 罰 復讐 ルール 公平"],
  ["ユリウス・カエサル", "賽は投げられた。", "ルビコン川を渡るときに言ったと伝えられる", "決断 選ぶ 始まり 後戻り 選択 動かす"],
  ["松尾芭蕉", "月日は百代の過客にして、行きかふ年もまた旅人なり。", "『おくのほそ道』冒頭", "時間 旅 年月 人生 旅人 時"],
  ["夏目漱石", "智に働けば角が立つ。情に棹させば流される。意地を通せば窮屈だ。とかくに人の世は住みにくい。", "『草枕』冒頭", "生き 人の世 社会 人間関係 悩み"],
];

/* 問いに響く言葉をえらぶ（AIを使わないときのしくみ：タグと言葉の重なりで点数をつける。サーバーと同じ規則） */
function quoteScore(q, qText, ctx) {
  let s = 0;
  String(q.tags || '').split(/[\s　,、]+/).filter(Boolean).forEach(t => {
    if (qText.includes(t)) s += 3 + t.length; else if (ctx.includes(t)) s += 1 + t.length * 0.5;
  });
  const bg = str => { const z = String(str || '').replace(/[\s、。，．！？!?「」『』（）()…・〜]/g, ''); const set = new Set(); for (let i = 0; i < z.length - 1; i++) { const g = z.slice(i, i + 2); if (/[^\u3040-\u309f]/.test(g)) set.add(g); } return set; };  // ひらがなだけの組（「のか」など）は数えない
  const A = bg(qText), B = bg(q.text); let ov = 0; A.forEach(x => { if (B.has(x)) ov++; });
  return s + ov * 1.5;
}
function matchQuote(x, quotes, used, { exclude = -1, random = true } = {}) {
  if (!quotes.length) return -1;
  const t = x.text || {};
  const qText = String(x.question || ''), ctx = [x.theme, x.subtitle, t.body, (t.keywords || []).join(' '), t.era].join(' ');
  const scored = quotes.map((q, i) => ({ i, s: i === exclude ? -1e9 : quoteScore(q, qText, ctx) - 4 * ((used || {})[q.person + '|' + q.text] || 0) + (random ? Math.random() * 0.9 : 0) })).sort((a, b) => b.s - a.s);
  const best = scored[0].s;
  const top = scored.filter(y => y.s > -1e8 && y.s >= best - (best > 2 ? 1.5 : 6)).slice(0, best > 2 ? 3 : 10);
  if (!top.length) return scored[0].i;
  return (random ? top[Math.floor(Math.random() * top.length)] : top[0]).i;
}

/* ---------- テーマの整え方（サーバーと同じ規則） ---------- */
function cleanTheme(t) {
  t = String(t || '').normalize('NFKC').replace(/[\s　]+/g, ' ').trim();
  t = t.replace(/(の歴史|歴史|史)$/, '').trim();
  return t;
}
function themeKey(t) {
  return cleanTheme(t).toLowerCase()
    .replace(/[\s・･.,、。!！?？「」『』（）()\[\]【】〜~"'`]/g, '')
    .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
}
const makeTitle = (display, theme) => `${display}の${theme}史`;
/* 名簿（学籍番号＋氏名）。Excelやスプレッドシートからの貼りつけ（タブ区切り）をそのまま読む */
const surnameOf = name => String(name || '').trim().split(/[\s　]+/)[0];
const sortRoster = list => (list || []).slice().sort((a, b) => String(a.no).localeCompare(String(b.no), 'ja', { numeric: true }));
function checkRosterRows(rows) {
  const out = [], errors = [], seen = {};
  (rows || []).forEach(r => {
    const no = String(r.no || '').normalize('NFKC').trim(), name = String(r.name || '').replace(/[ \t]+/g, ' ').trim(), display = String(r.display || '').trim();
    if (!/^[0-9A-Za-z_-]{1,20}$/.test(no)) { errors.push(`学籍番号が読めません：「${no}」`); return; }
    if (!name) { errors.push(`${no} の氏名がありません`); return; }
    if (seen[no]) { errors.push(`学籍番号が重なっています：${no}`); return; }
    seen[no] = true; out.push({ no, name: name.slice(0, 30), display: display.slice(0, 12) });
  });
  return { rows: out, errors };
}
function parseRosterText(text) {
  const rows = [], errors = [];
  String(text || '').split(/\r?\n/).forEach((line, i) => {
    const raw = line.replace(/\u00a0/g, ' ').trim(); if (!raw) return;
    let cols;
    if (raw.includes('\t')) cols = raw.split('\t').map(x => x.trim());
    else if (/[,，]/.test(raw)) cols = raw.split(/[,，]/).map(x => x.trim());
    else { const m = /^(\S+)[\s　]+(.+)$/.exec(raw); cols = m ? [m[1], m[2]] : [raw]; }
    cols = cols.filter((c, j) => j < 2 || c);
    const no = String(cols[0] || '').normalize('NFKC').trim();
    if (!/[0-9]/.test(no)) { if (i === 0) return; errors.push(`${i + 1}行目：学籍番号が読めません（${raw}）`); return; }
    rows.push({ no, name: cols[1] || '', display: cols[2] || '' });
  });
  const chk = checkRosterRows(rows);
  return { rows: chk.rows, errors: errors.concat(chk.errors) };
}
function applyPatch(st, p) {
  const s = Object.assign({}, DEFAULT_STATE, st, { doneIds: [...(st.doneIds || [])] });
  for (const k of ['stage', 'currentId', 'mode', 'showNames', 'talkSec', 'teacherLast', 'finaleStep']) if (p[k] !== undefined) s[k] = p[k];
  if (p.stage === 'present') s.startedAt = Date.now();
  if (p.doneAdd && !s.doneIds.includes(p.doneAdd)) s.doneIds.push(p.doneAdd);
  if (p.doneRemove) s.doneIds = s.doneIds.filter(x => x !== p.doneRemove);
  return s;
}

/* =====================================================================
   デモ用の仮サーバー（GAS_URL が空のとき。データはこのブラウザの中だけ）
   ===================================================================== */
const DEMO_ROSTER = [['佐藤 葵', '佐藤'], ['鈴木 蓮', '鈴木'], ['高橋 結衣', '高橋'], ['田中 陽翔', '田中'], ['伊藤 凛', '伊藤'], ['渡辺 湊', '渡辺'], ['山本 紬', '山本'], ['中村 悠真', '中村'], ['小林 澪', '小林'], ['加藤 樹', '加藤'], ['吉田 芽依', '吉田'], ['山田 朝陽', '山田'], ['佐々木 心春', '佐々木'], ['山口 蒼', '山口'], ['松本 陽菜', '松本'], ['井上 律', '井上'], ['森 遥', '森']];
const DEMO_THEMES = [
  ['塩', '生きるために欠かせないものは、いつも権力と抵抗の焦点になった', '紀元前 → 現代', ['塩の専売', '塩の行進（1930）', 'salaryの語源説'], 'ローマ兵の給料と塩を結びつける語源説、中国歴代王朝の塩の専売、そしてガンディーの塩の行進。生きるのに欠かせないものほど、国家は管理しようとし、人びとはそれに抗ってきた。', 'いま、私たちの「塩」にあたるものは何か？'],
  ['紙', '記録が残るから、歴史が残る', '2世紀 → 現代', ['蔡倫', 'タラス河畔の戦い（751）', '活版印刷'], '後漢の蔡倫が改良したとされる紙は、タラス河畔の戦いを機にイスラーム世界へ伝わったといわれ、やがてヨーロッパの印刷革命を支えた。紙がなければ、私たちが読む史料の多くは残らなかった。', '画面だけの時代、記録はどう残るのか？'],
  ['時計', '時間は、だれのものになったのか', '古代 → 19世紀 → 現代', ['日時計', '機械時計', '鉄道と標準時'], '太陽とともにあった時間は、修道院の鐘や機械時計で刻まれるようになり、19世紀には鉄道の運行のために標準時が定められた。時間はいつのまにか、みんなで合わせるものになった。', '私の時間は、私のものだろうか？'],
  ['砂糖', '甘さの陰にいた人びと', '16世紀 → 19世紀', ['サトウキビ', 'プランテーション', '大西洋三角貿易'], 'ヨーロッパの紅茶と砂糖の食卓の向こうには、カリブ海のプランテーションで働かされたアフリカ出身の奴隷の人びとがいた。砂糖は、大西洋をめぐる三角貿易と深く結びついていた。', '私の食卓は、世界のどこにつながっているのか？'],
  ['感染症', '私たちも、教科書に載る出来事のなかにいた', '14世紀 → 2020年', ['黒死病', '天然痘', 'COVID-19'], '14世紀の黒死病はヨーロッパの人口を大きく減らし、16世紀にはヨーロッパから持ち込まれた天然痘がアメリカ大陸の人びとを襲った。そして2020年、私たちも休校とマスクの日々を生きた。', '未来の教科書に、私たちの2020年はどう書かれるのか？'],
  ['音楽', '音楽は時代の気分を運んできた', '中世 → 現代', ['グレゴリオ聖歌', 'レコードとラジオ', 'ストリーミング'], '教会で歌われた聖歌、宮廷の音楽、レコードとラジオ、そしてストリーミングへ。音楽は、聴く場所と聴く人を変えながら、それぞれの時代の気分を運んできた。', '100年後、私たちの歌は何を伝えるだろう？'],
  ['地図', '地図は、世界をありのままには写さない', '2世紀 → 現代', ['プトレマイオス', 'メルカトル図法', 'Googleマップ'], '地図は世界をそのまま写したものではなく、描いた人の世界の見方を写している。何を中心に置き、何を大きく描くかで、世界の見え方は変わる。', '私の心の地図の中心には、何があるか？'],
  ['名前', '名前を呼ばれることの重さ', '古代 → 現代', ['姓の成り立ち', '創氏改名', '名前と国家'], '名前は家族の記憶を受けつぐものであり、ときに国家が管理し、変えさせるものでもあった。植民地支配の下で行われた創氏改名も、その一つである。', '名前を呼ばれることは、なぜ大切なのか？'],
  ['写真', '一瞬を残す技術', '1839年 → 現代', ['ダゲレオタイプ', '報道写真', 'スマートフォン'], '1839年に公表された写真術は、一瞬を残すことを可能にした。戦場の写真は人びとの心を動かし、いま私たちは毎日のように何枚も撮っている。', '残すために撮るのか、忘れるために撮るのか？'],
  ['手紙', '書いた人が消えたあとも残る声', '古代 → 現代', ['使者と飛脚', '近代郵便制度', '電子メール'], '遠く離れた誰かに思いを届けたいという願いは、使者や飛脚、郵便制度、電信、そしてメールへと形を変えてきた。手紙は、書いた人がいなくなったあとも残る声である。', '私は誰に、どんな言葉を残すだろう？'],
  ['パン', '空腹は、歴史を動かしたのか', '新石器時代 → 18世紀', ['麦の栽培', 'パンとサーカス', 'フランス革命'], '麦を育ててパンを焼くことは、定住と文明の始まりと結びついていた。ローマでは「パンとサーカス」が語られ、パンの値上がりは、ときに民衆の怒りに火をつけた。', '空腹は、歴史を動かすのか？'],
  ['国境', '線は自然にあるのではない', '17世紀 → 現代', ['主権国家体制', '植民地の境界線', 'ベルリンの壁'], '地図に引かれた一本の線が、家族を分け、言葉を分け、人の運命を分けてきた。国境は自然にあるものではなく、人が引いたものだ。', '線の向こう側の人を、私はどう想像できるか？'],
  ['学校', '学校は、私に何を残したか', '江戸時代 → 現代', ['寺子屋', '学制（1872）', '義務教育'], '1872年の学制によって、日本の子どもたちは「学校に行く」ことになった。学校は国民をつくる場であり、一人ひとりが世界と出会う場でもあった。', '学校は、私に何を残したか？'],
  ['雨', '恵みであり、災いでもあった', '古代 → 現代', ['治水', '雨乞い', '気候変動'], '雨は恵みであり、災いでもあった。人びとは堤を築き、雨乞いをし、暦をつくってきた。そしていま、雨の降り方そのものが変わりつつある。', '自然の歴史と人間の歴史は、分けられるのか？'],
  ['お金', 'みんなが信じることで成り立つ約束', '古代 → 現代', ['貝貨', '交子（宋の紙幣）', 'キャッシュレス'], '貝や金属から、宋代の紙幣「交子」、そしてデジタルの数字へ。お金は、みんなが価値を信じることで成り立つ、不思議な約束である。', '私たちは、何を信じて生きているのか？'],
  ['祈り', '人が何を恐れ、何を願ってきたか', '古代 → 現代', ['神殿', '巡礼', '慰霊'], '人は昔から、自分の力を超えたものに祈ってきた。神殿で、巡礼の道で、そして慰霊の場で。祈りの歴史は、人が何を恐れ、何を願ってきたかの歴史でもある。', '私は何を願って生きているのだろう？'],
  ['鉄道', '線路は、遠い町と町を一日でつないだ', '1825年 → 現代', ['蒸気機関車', '新橋―横浜（1872）', '新幹線'], '1825年、イギリスで蒸気機関車が引く公共の鉄道が開業した。日本でも1872年に新橋と横浜のあいだを汽車が走った。鉄道は人と物だけでなく、時間の感じ方まで変えていった。', '速くなった世界で、私たちは何を得て、何を失ったのか？'],
];
const DEMO_ORDER = [1, 4, 6, 0, 9, 3, 12, 7, 14, 2, 10, 5, 13, 8, 16, 11, 15];
// デモの先生の歴史（最終話）。本番では先生が準備タブで自分のテーマを決めます
const DEMO_TEACHER = ['教室', 'この教室で、私たちは歴史をしてきた', '最初の授業 → 最後の授業', ['Doing History', '問い', '対話'], 'この教室では、毎時間だれかが語り、だれかが問い、みんなが答えてきた。教科書のなかの歴史と、私たちの歴史は、ここで出会っていた。', 'この教室で過ごした時間は、あなたの歴史のどこに残るだろう？'];
// [問いを出した歴史, 答えた人, 答え, つながる歴史]
const DEMO_COMMENTS = [
  [1, 0, 'クラウドに残しても、読む人がいなければ消えたのと同じだと思う'],
  [1, 2, '残るかどうかより、何を残したいかを先に決めることが大事なのでは'],
  [1, 7, '地図だって紙に描かれたから残った。画面の記録は、誰が守るのだろう', 6],
  [4, 5, '「休校」の一行で終わってほしくない。あのとき感じたことも書いてほしい'],
  [4, 8, 'たぶん、私たち自身が書く側になる'],
  [4, 13, '感染の広がりを地図で追ったジョン・スノウのように、データで語られると思う', 6],
  [4, 11, '国境で止まらなかったウイルスと、国ごとに分かれた対策が書かれると思う', 11],
  [6, 10, '家族と、毎朝通るこの学校'],
  [6, 14, 'まだ白いところが多い。これから描きこんでいきたい'],
  [6, 3, '紙の地図も心の地図も、描いた人の見方がうつる', 1],
  [6, 9, '中心はたぶん自分ではなく、会いたい人のいる場所'],
];
const DEMO_ANSWERS = [
  [1, 3, '海の向こうから来た紙や塩や砂糖が、私の暮らしをつくっている。私はたくさんの場所から来た'],
  [1, 6, 'ばらばらの歴史が交わるところから'],
  [2, 1, '問いつづける人'],
  [2, 9, '記録を残し、それを読む人'],
  [3, 15, 'まだ誰も書いていない、次の「〇〇史」へ'],
];

const Mock = (() => {
  const DBKEY = 'rl-demo-db-v2';
  let db = null;
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  function usedMap(d, exceptId) { const u = {}; d.histories.forEach(y => { if (y.id !== exceptId && y.qText) { const k = y.qPerson + '|' + y.qText; u[k] = (u[k] || 0) + 1; } }); return u; }
  function setQuote(d, x, i, by) { const q = d.quotes[i]; if (!q) return; Object.assign(x, { qPerson: q.person, qText: q.text, qSource: q.source || '', qReason: '', qBy: by }); }
  function assign(d, x, opt = {}) {
    const cur = d.quotes.findIndex(q => q.text === x.qText);
    setQuote(d, x, matchQuote(x, d.quotes, usedMap(d, x.id), { exclude: opt.reroll ? cur : -1, random: opt.random !== false }), 'auto');
  }
  function fresh(sample) {
    const d = {
      roster: DEMO_ROSTER.map((r, i) => ({ id: 'S' + (60401 + i), no: String(60401 + i), name: r[0], display: r[1] })),
      histories: [], comments: [], answers: [],
      quotes: QUOTES.map(q => ({ person: q[0], text: q[1], source: q[2], tags: q[3] })),
      images: {}, state: Object.assign({}, DEFAULT_STATE, { doneIds: [] }),
      revs: { h: 1, c: 1, a: 1, q: 1, s: 1, r: 1 }, finaleText: ''
    };
    if (sample) seed(d);
    return d;
  }
  function seed(d) {
    const t0 = Date.now() - 1000 * 60 * 60 * 24 * 3;
    const ids = [];
    DEMO_THEMES.forEach((s, i) => {
      const r = d.roster[i], id = 'Hdemo' + (i + 1); ids[i] = id;
      d.histories.push({ id, studentId: r.id, name: r.name, display: r.display, theme: s[0], themeKey: themeKey(s[0]), title: makeTitle(r.display, s[0]), subtitle: s[1], order: DEMO_ORDER.indexOf(i) + 1, kind: 'text', fileId: '', imgUrl: '', thumb: '', text: { era: s[2], keywords: s[3], body: s[4], quote: '', quotePerson: '' }, question: s[5], qPerson: '', qText: '', qSource: '', qReason: '', qBy: '', extra: false, createdAt: t0 + i * 60000, updatedAt: t0 + i * 60000 });
    });
    { const s = DEMO_TEACHER, t1 = t0 + 20 * 60000;
      d.histories.push({ id: 'Hdemo-teacher', studentId: 'TEACHER', name: CFG.TEACHER_NAME + '先生', display: CFG.TEACHER_NAME, theme: s[0], themeKey: themeKey(s[0]), title: makeTitle(CFG.TEACHER_NAME, s[0]), subtitle: s[1], order: DEMO_ORDER.length + 1, kind: 'text', fileId: '', imgUrl: '', thumb: '', text: { era: s[2], keywords: s[3], body: s[4], quote: '', quotePerson: '' }, question: s[5], qPerson: '', qText: '', qSource: '', qReason: '', qBy: '', extra: false, createdAt: t1, updatedAt: t1 }); }
    d.histories.forEach(x => assign(d, x, { random: false }));
    d.state.orderDecided = true;
    d.state.doneIds = [ids[1], ids[4], ids[6]];
    DEMO_COMMENTS.forEach(([hi, ri, body, li], k) => d.comments.push({ id: 'Cdemo' + k, historyId: ids[hi], authorId: d.roster[ri].id, author: d.roster[ri].name, type: '答', body, person: '', source: '', linkTo: li != null ? ids[li] : '', createdAt: t0 + 86400000 + k * 90000, deleted: false }));
    DEMO_ANSWERS.forEach(([q, ri, body], k) => d.answers.push({ id: 'Ademo' + k, q, authorId: d.roster[ri].id, author: d.roster[ri].name, body, createdAt: t0 + 90000000 + k * 60000, deleted: false }));
  }
  // 別のタブ（先生卓と生徒画面）でも同じデモデータを見られるよう、毎回ブラウザの保存領域から読み直す
  function load() {
    const saved = LS.get(DBKEY);
    if (saved && saved.roster) { const imgs = db ? db.images : {}; db = saved; db.images = Object.assign({}, saved.images || {}, imgs); }
    else if (!db) { db = fresh(true); save(); }
    return db;
  }
  function save() { if (!LS.set(DBKEY, db)) { const lite = Object.assign({}, db, { images: {} }); LS.set(DBKEY, lite); } }
  function bump(...k) { k.forEach(x => db.revs[x] = (db.revs[x] || 0) + 1); save(); }
  function fail(msg, extra) { return Object.assign({ ok: false, error: msg }, extra || {}); }
  function who(token) {
    const t = String(token || ''); const id = t.slice(0, t.lastIndexOf('.'));
    if (id === 'TEACHER') return { id, name: CFG.TEACHER_NAME + '先生', display: CFG.TEACHER_NAME, teacher: true };
    if (id === 'TEST') return { id, name: 'テスト生徒', display: 'テスト', test: true };
    const r = db.roster.find(x => x.id === id);
    if (!r) { const e = new Error('ログインしなおしてください'); e.relogin = true; throw e; }
    return { id: r.id, name: r.name, display: r.display };
  }
  const findH = id => db.histories.find(x => x.id === id);
  const own = (u, x) => u.teacher || x.studentId === u.id;
  const pubRoster = () => sortRoster(db.roster).map(r => ({ id: r.id, no: r.no, name: r.name, display: r.display }));
  const G = {
    init: () => ({ ok: true, roster: pubRoster(), needCode: false, aiEnabled: false, state: db.state, revs: db.revs, teacherName: CFG.TEACHER_NAME }),
    poll: () => ({ ok: true, revs: db.revs, state: db.state, finaleText: db.state.stage === 'finale' ? db.finaleText : '' }),
    roster: () => ({ ok: true, rev: db.revs.r, items: pubRoster() }),
    histories: () => ({ ok: true, rev: db.revs.h, items: db.histories }),
    comments: () => ({ ok: true, rev: db.revs.c, items: db.comments.filter(c => !c.deleted) }),
    answers: () => ({ ok: true, rev: db.revs.a, items: db.answers.filter(a => !a.deleted) }),
    quotes: () => ({ ok: true, rev: db.revs.q, items: db.quotes }),
    image: p => ({ ok: true, data: db.images[p.id] || '' }),
  };
  const P = {
    login(b) {
      const r = db.roster.find(x => x.id === b.id); if (!r) return fail('学籍番号と名前をえらんでください');
      return { ok: true, token: r.id + '.demo', user: { id: r.id, name: r.name, display: r.display } };
    },
    teacherLogin(b) {
      if (String(b.pass || '') !== 'demo') return fail('パスワードがちがいます（デモでは demo）');
      return { ok: true, token: 'TEACHER.demo', testToken: 'TEST.demo', user: { id: 'TEACHER', name: CFG.TEACHER_NAME + '先生', display: CFG.TEACHER_NAME }, aiEnabled: false };
    },
    setTheme(b) {
      const u = who(b.token);
      const theme = cleanTheme(b.theme);
      if (!theme) return fail('テーマを入力してください');
      if (theme.length > 24) return fail('テーマは24字以内にしてください');
      const key = themeKey(theme), sub = String(b.subtitle || '').trim().slice(0, 60);
      let target = b.historyId ? findH(b.historyId) : null;
      if (b.historyId && !target) return fail('その歴史が見つかりません');
      if (target && !own(u, target)) return fail('自分の歴史だけ変えられます');
      if (!target && !b.extra) target = db.histories.find(x => x.studentId === u.id && !x.extra) || null;
      const dup = db.histories.find(x => x.themeKey === key && (!target || x.id !== target.id) && (u.id === 'TEST' || x.studentId !== 'TEST'));
      if (dup) return fail(`「${theme}」は ${dup.display} さんがすでに選んでいます。別のテーマにしよう`, { dup: true });
      if (b.extra && db.state.mode !== 'free' && !u.teacher) return fail('番外の歴史は「自由モード」になってから足せます');
      const now = Date.now();
      if (target) {
        if (db.state.doneIds.includes(target.id) && !u.teacher) return fail('発表が終わった歴史のテーマは変えられません');
        Object.assign(target, { theme, themeKey: key, title: makeTitle(target.display, theme), subtitle: sub, updatedAt: now });
      } else {
        target = { id: uid('H'), studentId: u.id, name: u.name, display: u.display, theme, themeKey: key, title: makeTitle(u.display, theme), subtitle: sub, order: '', kind: '', fileId: '', imgUrl: '', thumb: '', text: null, question: '', qPerson: '', qText: '', qSource: '', qReason: '', qBy: '', extra: !!b.extra, createdAt: now, updatedAt: now };
        if (u.id !== 'TEST' && (db.state.orderDecided || target.extra)) {
          const live = db.histories.filter(x => x.studentId !== 'TEST');
          const t = live.find(x => x.studentId === 'TEACHER' && !x.extra && Number(x.order));
          const maxO = Math.max(0, ...live.map(x => Number(x.order) || 0));
          if (!target.extra && u.id !== 'TEACHER' && db.state.teacherLast && t && Number(t.order) === maxO) { target.order = Number(t.order); t.order = Number(t.order) + 1; }
          else target.order = maxO + 1;
        }
        db.histories.push(target);
      }
      bump('h');
      return { ok: true, item: target };
    },
    submitSlide(b) {
      const u = who(b.token);
      const x = findH(b.historyId); if (!x) return fail('その歴史が見つかりません');
      if (!own(u, x)) return fail('自分の歴史だけ出せます');
      const question = String(b.question || '').trim().slice(0, 80);
      if (!question) return fail('みんなへの問いを書いてください');
      const kind = b.kind === 'text' ? 'text' : 'image';
      if (b.image) { const id = uid('F'); db.images[id] = b.image; if (x.fileId) delete db.images[x.fileId]; x.fileId = id; x.imgUrl = ''; x.thumb = String(b.thumb || '').slice(0, 45000); }
      else if (b.removeImage) { if (x.fileId) delete db.images[x.fileId]; x.fileId = ''; x.imgUrl = ''; x.thumb = ''; }
      if (kind === 'text') {
        const t = b.text || {}; const sl = (v, n) => String(v || '').trim().slice(0, n);
        x.text = { era: sl(t.era, 40), keywords: (t.keywords || []).slice(0, 3).map(k => sl(k, 16)), body: sl(t.body, 220), quote: sl(t.quote, 80), quotePerson: sl(t.quotePerson, 30) };
      } else { x.text = null; if (!x.fileId) return fail('画像を選んでください'); }
      const changed = question !== x.question;
      x.question = question; x.kind = kind; x.updatedAt = Date.now();
      if (changed || !x.qText) assign(db, x);
      bump('h');
      return { ok: true, item: x };
    },
    rerollQuote(b) {
      const u = who(b.token); const x = findH(b.historyId); if (!x) return fail('その歴史が見つかりません');
      if (!own(u, x)) return fail('自分の歴史だけ変えられます');
      if (!x.question) return fail('先に、みんなへの問いを出してください');
      assign(db, x, { reroll: true }); x.updatedAt = Date.now(); bump('h');
      return { ok: true, item: x };
    },
    pickQuote(b) {
      const u = who(b.token); const x = findH(b.historyId); if (!x) return fail('その歴史が見つかりません');
      if (!own(u, x)) return fail('自分の歴史だけ変えられます');
      const i = Number(b.index); if (!db.quotes[i]) return fail('その言葉が見つかりません');
      setQuote(db, x, i, 'pick'); x.updatedAt = Date.now(); bump('h');
      return { ok: true, item: x };
    },
    comment(b) {
      const u = who(b.token);
      const body = String(b.body || '').trim().slice(0, 400); if (!body) return fail('答えを書いてください');
      const hid = String(b.historyId || '');
      if (!hid || !findH(hid)) return fail('どの歴史の問いへの答えかをえらんでください');
      const linkTo = String(b.linkTo || '');
      if (linkTo && (linkTo === hid || !findH(linkTo))) return fail('つながる歴史をえらびなおしてください');
      const item = { id: uid('C'), historyId: hid, authorId: u.id, author: u.name, type: '答', body, person: '', source: '', linkTo, createdAt: Date.now(), deleted: false };
      db.comments.push(item); bump('c');
      return { ok: true, item };
    },
    deleteComment(b) {
      const u = who(b.token); const c = db.comments.find(x => x.id === b.id); if (!c) return fail('見つかりません');
      if (!(u.teacher || c.authorId === u.id)) return fail('自分の答えだけ消せます');
      c.deleted = true; bump('c'); return { ok: true };
    },
    answer(b) {
      const u = who(b.token); const q = Number(b.q); if (![1, 2, 3].includes(q)) return fail('問いをえらんでください');
      const body = String(b.body || '').trim().slice(0, 300); if (!body) return fail('答えを書いてください');
      const item = { id: uid('A'), q, authorId: u.id, author: u.name, body, createdAt: Date.now(), deleted: false };
      db.answers.push(item); bump('a'); return { ok: true, item };
    },
    deleteAnswer(b) {
      const u = who(b.token); const a = db.answers.find(x => x.id === b.id); if (!a) return fail('見つかりません');
      if (!(u.teacher || a.authorId === u.id)) return fail('自分の答えだけ消せます');
      a.deleted = true; bump('a'); return { ok: true };
    },
    decideOrder(b) {
      const u = who(b.token); if (!u.teacher) return fail('先生だけができます');
      const live = db.histories.filter(x => x.studentId !== 'TEST');
      const main = live.filter(x => !x.extra && x.studentId !== 'TEACHER');
      const have = new Set(main.map(x => x.studentId));
      const missing = db.roster.filter(r => !have.has(r.id)).map(r => r.name);
      if (missing.length && !b.force) return fail('まだテーマを決めていない人がいます：' + missing.join('、'), { missing });
      const teacherH = live.find(x => !x.extra && x.studentId === 'TEACHER');
      const list = main.slice();
      if (teacherH && !db.state.teacherLast) list.push(teacherH);
      shuffle(list);
      list.forEach((x, i) => x.order = i + 1);
      let next = list.length + 1;
      if (teacherH && db.state.teacherLast) teacherH.order = next++;
      live.filter(x => x.extra).sort((a, c) => a.createdAt - c.createdAt).forEach(x => x.order = next++);
      db.state = applyPatch(db.state, { stage: 'lottery', currentId: '' });
      Object.assign(db.state, { orderDecided: true, lotteryAt: Date.now(), doneIds: [] });
      bump('h', 's');
      return { ok: true, state: db.state };
    },
    resetOrder(b) {
      const u = who(b.token); if (!u.teacher) return fail('先生だけができます');
      db.histories.forEach(x => { if (!x.extra) x.order = ''; });
      Object.assign(db.state, { orderDecided: false, doneIds: [], currentId: '', stage: 'idle', lotteryAt: 0 });
      bump('h', 's'); return { ok: true, state: db.state };
    },
    setState(b) {
      const u = who(b.token); if (!u.teacher) return fail('先生だけができます');
      db.state = applyPatch(db.state, b.patch || {}); bump('s');
      return { ok: true, state: db.state };
    },
    setRoster(b) {
      const u = who(b.token); if (!u.teacher) return fail('先生だけができます');
      const { rows, errors } = checkRosterRows(b.rows);
      if (errors.length) return fail(errors[0]);
      if (!rows.length) return fail('名簿が空です');
      db.roster = rows.map(r => ({ id: 'S' + r.no, no: r.no, name: r.name, display: r.display || surnameOf(r.name) }));
      bump('r'); return { ok: true, count: rows.length };
    },
    deleteHistory(b) {
      const u = who(b.token); if (!u.teacher) return fail('先生だけができます');
      const x = findH(b.id); if (x && x.fileId) delete db.images[x.fileId];
      db.histories = db.histories.filter(y => y.id !== b.id);
      db.state.doneIds = db.state.doneIds.filter(y => y !== b.id);
      if (db.state.currentId === b.id) db.state.currentId = '';
      bump('h', 's'); return { ok: true };
    },
    clearTest(b) {
      const u = who(b.token); if (!u.teacher) return fail('先生だけができます');
      db.histories = db.histories.filter(x => x.studentId !== 'TEST');
      db.comments = db.comments.filter(x => x.authorId !== 'TEST');
      db.answers = db.answers.filter(x => x.authorId !== 'TEST');
      bump('h', 'c', 'a'); return { ok: true };
    },
    aiFinale() { return fail('デモモードではAIは使えません'); },
  };
  return {
    async get(action, params) { load(); await sleep(40); const f = G[action]; if (!f) return fail('unknown: ' + action); return clone(f(params || {})); },
    async post(action, body) {
      load(); await sleep(90); const f = P[action]; if (!f) return fail('unknown: ' + action);
      try { return clone(f(body || {})); } catch (e) { return fail(e.message, { relogin: !!e.relogin }); }
    },
    reset(sample) { db = fresh(sample); save(); },
  };
})();
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* =====================================================================
   通信
   ===================================================================== */
async function apiGet(action, params = {}) {
  let j;
  if (DEMO) j = await Mock.get(action, params);
  else {
    const u = new URL(CFG.GAS_URL);
    u.searchParams.set('action', action);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    u.searchParams.set('_', Date.now());
    const r = await fetch(u.toString(), { cache: 'no-store' });
    j = await r.json();
  }
  if (!j.ok) throw new Error(j.error || '読み込みに失敗しました');
  return j;
}
async function apiPost(action, body = {}) {
  const payload = Object.assign({ action, token: S.token }, body);
  let j;
  if (DEMO) j = await Mock.post(action, payload);
  else {
    const r = await fetch(CFG.GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
    j = await r.json();
  }
  if (!j.ok) {
    if (j.relogin) { logout('もう一度ログインしてください'); }
    const e = new Error(j.error || '送信に失敗しました'); e.data = j; throw e;
  }
  return j;
}

/* =====================================================================
   アプリの状態と同期
   ===================================================================== */
const S = {
  token: null, user: null, role: null, teacherToken: null, testToken: null,
  roster: [], needCode: false, aiEnabled: false,
  histories: [], comments: [], answers: [], quotes: [],
  state: Object.assign({}, DEFAULT_STATE), finaleText: '', revs: {},
  view: null, viewObj: null, modals: [], arrived: new Map(), firstLoadDone: false,
  stateSeq: 0, stateLock: 0, syncing: false, syncAgain: false, pollN: 0,
};
// デモではタブごとに別の人として入れるよう sessionStorage、本番は localStorage にログインを覚える
const SESS = {
  store() { try { return DEMO ? window.sessionStorage : window.localStorage; } catch (e) { return null; } },
  get() { try { const s = this.store(); const v = s && s.getItem(KEY + '-session'); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
  set(v) { try { const s = this.store(); s && s.setItem(KEY + '-session', JSON.stringify(v)); } catch (e) { } },
  del() { try { const s = this.store(); s && s.removeItem(KEY + '-session'); } catch (e) { } },
};
function saveSession() { SESS.set({ token: S.token, user: S.user, role: S.role, teacherToken: S.teacherToken, testToken: S.testToken }); }
function setNet(ok) { const n = $('#net'); if (n) n.classList.toggle('off', !ok); }

async function loadColl(name) {
  const r = await apiGet(name);
  if (name === 'comments') {
    const t = S.firstLoadDone ? Date.now() : 0;
    r.items.forEach(c => { if (!S.arrived.has(c.id)) S.arrived.set(c.id, t); });
  }
  if (name === 'answers') {
    const t = S.firstLoadDone ? Date.now() : 0;
    r.items.forEach(c => { if (!S.arrived.has(c.id)) S.arrived.set(c.id, t); });
  }
  if (name === 'roster') S.roster = r.items; else S[name] = r.items;
}
async function sync(force = false) {
  if (S.syncing) { S.syncAgain = true; return; }
  S.syncing = true;
  try {
    const seq0 = S.stateSeq;
    const r = await apiGet('poll');
    setNet(true);
    const R = r.revs || {};
    const jobs = [];
    if (force || R.h !== S.revs.h) jobs.push(loadColl('histories'));
    if (force || R.c !== S.revs.c) jobs.push(loadColl('comments'));
    if (force || R.a !== S.revs.a) jobs.push(loadColl('answers'));
    if (force || R.q !== S.revs.q) jobs.push(loadColl('quotes'));
    if (force || R.r !== S.revs.r) jobs.push(loadColl('roster'));
    await Promise.all(jobs);
    S.revs = R;
    let stChanged = false;
    if (S.stateSeq === seq0 && !S.stateLock) {
      stChanged = JSON.stringify(r.state) !== JSON.stringify(S.state) || (r.finaleText || '') !== (S.finaleText || '');
      S.state = Object.assign({}, DEFAULT_STATE, r.state); S.finaleText = r.finaleText || '';
    }
    if (jobs.length || stChanged) refresh();
  } catch (e) { setNet(false); console.warn(e); }
  S.syncing = false;
  if (S.syncAgain) { S.syncAgain = false; sync(); }
}
function startPolling() {
  clearTimeout(S.pollTimer);
  const tick = async () => {
    S.pollN++;
    if (!(document.hidden && S.role !== 'teacher')) await sync(S.pollN % 100 === 0);
    S.pollTimer = setTimeout(tick, S.role === 'teacher' ? 2500 : 4000);
  };
  S.pollTimer = setTimeout(tick, 1500);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.token) sync(); });

function refresh() {
  if (S.viewObj && S.viewObj.update) { try { S.viewObj.update(); } catch (e) { console.error(e); } }
  S.modals.forEach(m => { if (m.update) try { m.update(); } catch (e) { console.error(e); } });
}

/* 先生の操作（すぐ画面に反映してからサーバーへ） */
async function stageAct(patch) {
  const prev = S.state;
  S.stateSeq++; S.stateLock++;
  S.state = applyPatch(S.state, patch);
  refresh();
  try { const r = await apiPost('setState', { patch }); S.state = Object.assign({}, DEFAULT_STATE, r.state); }
  catch (e) { toast(e.message); S.state = prev; refresh(); }
  S.stateLock--; S.stateSeq++;
}

/* ---------- データの見方 ---------- */
const byId = id => S.histories.find(x => x.id === id) || null;
const showTest = () => S.role === 'test';
function visibleHistories() { return S.histories.filter(x => x.studentId !== 'TEST' || showTest()); }
function sortedHistories() {
  return visibleHistories().slice().sort((a, b) => (Number(a.order) || 9999) - (Number(b.order) || 9999) || Number(a.createdAt) - Number(b.createdAt));
}
function activeComments() {
  const ids = new Set(visibleHistories().map(x => x.id));
  return S.comments.filter(c => !c.deleted && (c.authorId !== 'TEST' || showTest()) && (!c.historyId || ids.has(c.historyId)));
}
function activeAnswers(q) { return S.answers.filter(a => !a.deleted && (a.authorId !== 'TEST' || showTest()) && (!q || Number(a.q) === q)).sort((a, b) => a.createdAt - b.createdAt); }
function commentsFor(id, withLinks) { return activeComments().filter(c => c.historyId === id || (withLinks && c.linkTo === id)).sort((a, b) => b.createdAt - a.createdAt); }
function enabledQuotes() { return (S.quotes || []).filter(q => q && q.text && q.enabled !== false && String(q.enabled).toUpperCase() !== 'FALSE'); }
function statusOf(x) {
  if (S.state.currentId === x.id && (S.state.stage === 'present' || S.state.stage === 'response')) return 'current';
  if ((S.state.doneIds || []).includes(x.id) || x.extra) return 'done';
  return 'upcoming';
}
function nextHist() { const done = S.state.doneIds || []; return sortedHistories().find(x => Number(x.order) && !done.includes(x.id) && x.id !== S.state.currentId) || null; }
function histNo(x) { if (!x) return ''; if (Number(x.order)) return (x.extra ? '番外　' : '') + `第${kanji(x.order)}話`; return x.extra ? '番外' : '順番はまだ'; }
function titleEl(x) { return h('span', {}, h('small', {}, `${x.display}の`), `${x.theme}史`); }
function histHue(x) {
  if (Number(x.order)) return (Number(x.order) * 137.508 + 18) % 360;
  let s = 0; for (const ch of String(x.id)) s = (s * 31 + ch.charCodeAt(0)) % 3600; return s / 10;
}
const histColor = (x, a = 1) => `hsla(${histHue(x).toFixed(1)}, 46%, 63%, ${a})`;
function isFresh(c) { const t = S.arrived.get(c.id); return !!t && Date.now() - t < 15000; }
function myHistories() { return S.user ? S.histories.filter(x => x.studentId === S.user.id).sort((a, b) => (a.extra - b.extra) || a.createdAt - b.createdAt) : []; }
function finaleQ() { if (S.state.stage !== 'finale') return -1; const id = FIN_STEPS[S.state.finaleStep || 0]; return ['q1', 'q2', 'q3'].indexOf(id); }
/* 「十七人の生徒と先生の、十八の歴史」のような言い方（先生の歴史があるときは先生も数える） */
function taleCount() {
  const hs = visibleHistories().filter(x => !x.extra);
  const t = hs.some(x => x.studentId === 'TEACHER'), n = hs.length;
  return t ? `${kanji(n - 1)}人の生徒と先生の、${kanji(n)}の歴史` : `${kanji(n)}の歴史`;
}
function mainCount() { return S.histories.filter(x => !x.extra && x.studentId !== 'TEST' && x.studentId !== 'TEACHER').length; }

/* =====================================================================
   画面の骨組みとログイン
   ===================================================================== */
const Views = {};
function tabsForRole() { return S.role === 'teacher' ? ['prep', 'stage', 'now', 'strata', 'tapestry', 'finale'] : ['now', 'mine', 'tapestry', 'strata', 'questions']; }
const tabLabel = (t, short) => (S.role === 'teacher' && t === 'now') ? '答える' : (short ? (Views[t].short || Views[t].label) : Views[t].label);
function renderShell() {
  closeAllModals();
  const app = $('#app'); app.innerHTML = '';
  const nav = h('nav', { class: 'tabs' }, tabsForRole().map(t => h('button', { class: 'tab', 'data-v': t, onclick: () => go(t) }, h('span', { class: 'l' }, tabLabel(t)), h('span', { class: 's' }, tabLabel(t, true)))));
  const name = S.role === 'teacher' ? `${CFG.TEACHER_NAME}先生` : S.role === 'test' ? 'テスト生徒' : (S.user && S.user.name);
  const who = h('div', { class: 'who' }, h('span', { class: 'net', id: 'net', title: '通信状態' }), h('span', {}, name),
    S.role === 'test' ? h('button', { onclick: backToTeacher }, '先生卓へ戻る') : null,
    h('button', { onclick: async () => { if (await ask('ログアウトしますか？')) logout(); } }, 'ログアウト'));
  const top = h('header', { class: 'topbar', id: 'topbar' },
    h('div', { class: 'brand' }, h('span', { class: 'b1' }, CFG.APP_TITLE), h('span', { class: 'b3' }, CFG.APP_SUB)), nav, who);
  const zone = h('div', { class: 'peek-zone', onmouseenter: () => top.classList.add('peek') });
  top.addEventListener('mouseleave', () => top.classList.remove('peek'));
  app.append(zone, top, h('main', { id: 'main' }));
  if (DEMO && !$('.demo-flag')) document.body.append(h('div', { class: 'demo-flag' }, 'デモモード：データはこの端末のブラウザの中だけ'));
}
function go(name) {
  if (!Views[name]) name = tabsForRole()[0];
  if (S.viewObj && S.viewObj.unmount) try { S.viewObj.unmount(); } catch (e) { }
  closeAllModals();
  S.view = name; LS.set(KEY + '-view-' + S.role, name);
  const main = $('#main'); main.innerHTML = '';
  document.body.classList.toggle('proj', !!(Views[name].proj && S.role === 'teacher'));
  $$('.tab').forEach(b => b.classList.toggle('on', b.dataset.v === name));
  S.viewObj = Views[name].mount(main) || {};
  if (S.viewObj.update) S.viewObj.update();
  window.scrollTo(0, 0);
}
/* ゴーギャンの絵（パブリックドメイン。gauguin.jpg がなければ表示しない） */
const GAUGUIN_CAP = 'ポール・ゴーギャン《我々はどこから来たのか　我々は何者か　我々はどこへ行くのか》1897–98年　ボストン美術館';
function gauguinImg(cls) { return h('img', { class: cls || '', src: 'gauguin.jpg', alt: GAUGUIN_CAP, onerror: e => { const f = e.target.closest('figure') || e.target; f.style.display = 'none'; } }); }
function renderLogin(msg) {
  document.body.classList.remove('proj');
  const app = $('#app'); app.innerHTML = '';
  const sel = h('select', {}, h('option', { value: '' }, '学籍番号と名前をえらぶ'), sortRoster(S.roster).map(r => h('option', { value: r.id }, `${r.no}　${r.name}`)));
  const code = S.needCode ? h('input', { type: 'text', placeholder: '合言葉（先生から聞いたもの）' }) : null;
  const hint = h('div', { class: 'login-who' });
  const err = h('div', { class: 'err' }, msg || '');
  sel.onchange = () => {
    const r = S.roster.find(x => x.id === sel.value);
    hint.innerHTML = ''; if (r) hint.append(h('span', { class: 'no' }, r.no), h('b', {}, r.name), ' さんとして入ります');
  };
  const doLogin = async (id, extra = {}) => {
    err.textContent = '';
    if (!id) { err.textContent = '学籍番号と名前をえらんでください'; return; }
    try {
      const r = await apiPost('login', Object.assign({ id, code: code ? code.value.trim() : '' }, extra));
      Object.assign(S, { token: r.token, user: r.user, role: 'student', teacherToken: null, testToken: null });
      saveSession(); enterApp();
    } catch (e) { err.textContent = e.message; }
  };
  const btn = h('button', { class: 'btn primary', style: { width: '100%', marginTop: '14px' }, onclick: () => doLogin(sel.value) }, 'はいる');
  if (code) code.addEventListener('keydown', e => { if (e.key === 'Enter') btn.click(); });
  const tp = h('input', { type: 'password', placeholder: '先生のパスワード' });
  const terr = h('div', { class: 'err' });
  const tLogin = async (pass) => {
    terr.textContent = '';
    try {
      const r = await apiPost('teacherLogin', { pass });
      Object.assign(S, { token: r.token, user: r.user, role: 'teacher', teacherToken: r.token, testToken: r.testToken });
      if (r.aiEnabled != null) S.aiEnabled = r.aiEnabled;
      saveSession(); enterApp();
    } catch (e) { terr.textContent = e.message; }
  };
  const tbtn = h('button', { class: 'btn', onclick: () => tLogin(tp.value) }, '先生卓へ');
  tp.addEventListener('keydown', e => { if (e.key === 'Enter') tbtn.click(); });
  const first = sortRoster(S.roster)[0] || {};
  const demoBox = DEMO ? h('section', { class: 'card' },
    h('h2', {}, 'デモで試す'),
    h('p', { class: 'lead' }, 'いまは設定前の「デモモード」です。サンプルの17人と先生、あわせて18の歴史が入っています（先生の歴史は最終話）。データはこのブラウザの中だけに保存されます。'),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', onclick: () => tLogin('demo') }, '先生として入る'),
      h('button', { class: 'btn', onclick: () => doLogin(first.id) }, `生徒（${first.name || ''}）として入る`))) : null;
  app.append(h('div', { class: 'login' },
    h('figure', { class: 'login-art' }, gauguinImg()),
    h('p', { class: 't2' }, CFG.APP_TITLE), h('p', { class: 't3' }, CFG.APP_SUB),
    demoBox,
    h('section', { class: 'card' },
      h('label', { class: 'lab' }, '学籍番号・なまえ'), sel, hint,
      code ? [h('label', { class: 'lab' }, '合言葉'), code] : null,
      btn, err),
    h('details', { class: 'card' }, h('summary', { class: 'small mute', style: { cursor: 'pointer' } }, '先生はこちら'),
      h('div', { class: 'row', style: { marginTop: '10px' } }, h('div', { class: 'grow' }, tp), tbtn), terr),
    h('div', { class: 'qs' }, BIG_QS.map(q => h('div', {}, q)), h('div', { class: 'cap' }, GAUGUIN_CAP))));
}
async function enterApp() {
  renderShell();
  S.firstLoadDone = false; S.arrived = new Map();
  await sync(true);
  S.firstLoadDone = true;
  go(LS.get(KEY + '-view-' + S.role) || tabsForRole()[0]);
  startPolling();
  if (S.role === 'teacher' || S.role === 'test') BGM.init();
}
function logout(msg) {
  clearTimeout(S.pollTimer);
  if (S.viewObj && S.viewObj.unmount) try { S.viewObj.unmount(); } catch (e) { }
  S.viewObj = null; BGM.stop(300);
  Object.assign(S, { token: null, user: null, role: null, teacherToken: null, testToken: null });
  SESS.del();
  renderLogin(typeof msg === 'string' ? msg : '');
}
function asTest() {
  if (S.viewObj && S.viewObj.unmount) try { S.viewObj.unmount(); } catch (e) { }
  BGM.stop(300);
  Object.assign(S, { token: S.testToken, user: { id: 'TEST', name: 'テスト生徒', display: 'テスト' }, role: 'test' });
  saveSession(); renderShell(); go('now');
}
function backToTeacher() {
  if (S.viewObj && S.viewObj.unmount) try { S.viewObj.unmount(); } catch (e) { }
  Object.assign(S, { token: S.teacherToken, user: { id: 'TEACHER', name: CFG.TEACHER_NAME + '先生', display: CFG.TEACHER_NAME }, role: 'teacher' });
  saveSession(); renderShell(); go('prep');
}

/* =====================================================================
   共通の部品
   ===================================================================== */
function openModal(content) {
  const box = h('div', { class: 'modal-box' }, h('button', { class: 'modal-x', 'aria-label': '閉じる', onclick: () => closeModal(m) }, '×'), content);
  const el = h('div', { class: 'modal', onclick: e => { if (e.target === el) closeModal(m); } }, box);
  const m = { el, update: null };
  document.body.append(el); S.modals.push(m);
  return m;
}
function closeModal(m) { m = m || S.modals[S.modals.length - 1]; if (!m) return; m.el.remove(); S.modals = S.modals.filter(x => x !== m); if (m.onClose) { const f = m.onClose; m.onClose = null; f(); } }
function closeAllModals() { S.modals.forEach(m => m.el.remove()); S.modals = []; }
// ブラウザの確認ダイアログの代わり（プロジェクタでも見やすく、どの環境でも動く）
function ask(msg, { ok = 'はい', cancel = 'やめる', input = null } = {}) {
  return new Promise(res => {
    const inp = input != null ? h('input', { type: 'text', value: input }) : null;
    const done = v => { m.onClose = null; closeModal(m); res(v); };
    const okBtn = h('button', { class: 'btn primary', onclick: () => done(inp ? inp.value : true) }, ok);
    const m = openModal(h('div', { style: { padding: '8px 4px' } },
      h('p', { style: { fontSize: '16px', lineHeight: '1.8', margin: '6px 30px 14px 0' } }, msg), inp,
      h('div', { class: 'row', style: { marginTop: '16px', justifyContent: 'flex-end' } },
        h('button', { class: 'btn ghost', onclick: () => done(inp ? null : false) }, cancel), okBtn)));
    m.onClose = () => res(inp ? null : false);
    m.el.style.alignItems = 'center';
    m.el.querySelector('.modal-box').style.width = 'min(520px,100%)';
    if (inp) { inp.focus(); inp.select(); inp.addEventListener('keydown', e => { if (e.key === 'Enter') okBtn.click(); }); } else okBtn.focus();
  });
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.modals.length) closeModal(); });

/* スライド（1枚） */
const imgCache = new Map();
async function getImage(fileId) {
  if (imgCache.has(fileId)) return imgCache.get(fileId);
  try { const r = await apiGet('image', { id: fileId }); if (r.data) imgCache.set(fileId, r.data); return r.data; } catch (e) { return null; }
}
function tryLoad(src) { return new Promise(res => { const i = new Image(); const t = setTimeout(() => res(false), 7000); i.onload = () => { clearTimeout(t); res(true); }; i.onerror = () => { clearTimeout(t); res(false); }; i.src = src; }); }
async function setSlideImage(img, x, full) {
  if (x._local) { img.src = x._local; return; }
  if (x.thumb) img.src = x.thumb;
  if (!full) return;
  if (x.imgUrl && await tryLoad(x.imgUrl)) { img.src = x.imgUrl; return; }
  if (x.fileId) { const d = await getImage(x.fileId); if (d) img.src = d; }
}
function slideEl(x, { full = false } = {}) {
  const box = h('div', { class: 'slide' });
  if (!x) return box;
  const hasPic = !!(x.fileId || x.thumb || x._local);
  if (x.kind === 'image' && hasPic) {
    const img = h('img', { alt: x.title || 'スライド' }); box.append(img); setSlideImage(img, x, full);
  } else if (x.kind === 'text' && x.text) {
    const t = x.text;
    const pic = hasPic ? h('div', { class: 'ts-pic' }, (() => { const i = h('img', { alt: '' }); setSlideImage(i, x, full); return i; })()) : null;
    box.append(h('div', { class: 'ts' + (hasPic ? ' has-pic' : '') },
      h('div', { class: 'ts-main' },
        h('div', { class: 'ts-no' }, Number(x.order) ? histNo(x) : '　'),
        h('div', { class: 'ts-title' }, h('small', {}, `${x.display || ''}の`), `${x.theme || '〇〇'}史`),
        t.era ? h('div', { class: 'ts-era' }, t.era) : null,
        (t.keywords || []).some(Boolean) ? h('div', { class: 'ts-kws' }, (t.keywords || []).filter(Boolean).map(k => h('span', { class: 'ts-kw' }, k))) : null,
        h('div', { class: 'ts-body' }, t.body || ''),
        t.quote ? h('div', { class: 'ts-quote' }, `「${t.quote}」`, t.quotePerson ? h('span', {}, `　—— ${t.quotePerson}`) : null) : null,
        (x.question || t.question) ? h('div', { class: 'ts-q' }, h('span', {}, '問い'), x.question || t.question) : null),
      pic,
      h('div', { class: 'ts-by' }, `語り手　${x.name || x.display || ''}`)));
  } else {
    box.append(h('div', { class: 'slide-empty' }, h('div', { class: 'mincho' }, x.title || ''), h('div', {}, 'スライドはまだ提出されていません')));
  }
  return box;
}
function openSlideBig(x) { openModal(h('div', {}, slideEl(x, { full: true }), h('div', { class: 'now-big' }, titleEl(x)))); }

function historySelect(selected, { exclude = '', onlyQ = false } = {}) {
  const sel = h('select');
  sortedHistories().filter(x => x.id !== exclude && (!onlyQ || x.question)).forEach(x => sel.append(h('option', { value: x.id }, `${histNo(x)}　${x.title}`)));
  if (selected) sel.value = selected;
  return sel;
}
function openQuotePicker(cb) {
  const list = h('div', { class: 'quote-pick' }, enabledQuotes().map((q, i) => h('button', { type: 'button', onclick: () => { closeModal(m); cb(q, i); } }, `「${q.text}」`, h('span', { class: 'who' }, `${q.person}${q.source ? '　' + q.source : ''}`))));
  const m = openModal(h('div', {}, h('h2', { class: 'h2' }, '歴史の言葉コレクション'), h('p', { class: 'lead small' }, 'あなたの問いに響く言葉をえらびましょう。'), list));
}
const askerOf = x => x.studentId === 'TEACHER' ? `${x.display}先生` : `${x.display}さん`;
/* 問いと、それに響く歴史上の人物の言葉 */
function questionCard(x, { size = '' } = {}) {
  if (!x || !x.question) return h('p', { class: 'mute small' }, 'この歴史の問いは、まだ出されていません。');
  return h('div', { class: 'qcard ' + size },
    h('div', { class: 'qc-l' }, `${askerOf(x)}から、みんなへの問い`),
    h('div', { class: 'qc-q' }, x.question),
    x.qText ? h('div', { class: 'qc-quote' }, h('div', { class: 'qc-ql' }, 'この問いに響く言葉'), `「${x.qText}」`,
      h('span', { class: 'who' }, `—— ${x.qPerson}${x.qSource ? '　' + x.qSource : ''}`),
      x.qReason ? h('div', { class: 'qc-r' }, x.qReason) : null) : null);
}
/* 問いに答えるフォーム（答えは、その歴史の場面の織り目になる） */
function answerBox({ target = '', selectable = false } = {}) {
  const tsel = selectable ? historySelect(target, { onlyQ: true }) : null;
  if (tsel && !tsel.options.length) return h('p', { class: 'mute' }, 'まだ問いは出されていません。');
  const qShow = h('div');
  const ta = h('textarea', { rows: 3, maxlength: 400, placeholder: 'この問いへの、あなたの答え' });
  const linkOn = h('input', { type: 'checkbox' });
  const linkSel = h('select', { style: { display: 'none', marginTop: '6px' } });
  const err = h('div', { class: 'err' });
  const send = h('button', { class: 'btn primary', type: 'button' }, '答えを置く');
  const cur = () => tsel ? tsel.value : target;
  function fill() {
    const x = byId(cur());
    qShow.innerHTML = '';
    if (tsel && x) qShow.append(questionCard(x, { size: 'small' }));
    const v = linkSel.value; linkSel.innerHTML = '';
    linkSel.append(h('option', { value: '' }, 'つながる歴史をえらぶ'));
    sortedHistories().filter(y => y.id !== cur()).forEach(y => linkSel.append(h('option', { value: y.id }, `${histNo(y)}　${y.title}`)));
    linkSel.value = v;
  }
  linkOn.onchange = () => { linkSel.style.display = linkOn.checked ? '' : 'none'; if (linkOn.checked) fill(); };
  if (tsel) tsel.onchange = fill;
  send.onclick = async () => {
    err.textContent = '';
    const body = ta.value.trim(), historyId = cur();
    if (!historyId) { err.textContent = 'どの歴史の問いに答えるか、えらんでください'; return; }
    if (!body) { err.textContent = '答えを書いてください'; return; }
    if (linkOn.checked && !linkSel.value) { err.textContent = 'つながる歴史をえらんでください（なければチェックをはずす）'; return; }
    send.disabled = true;
    try {
      const linked = linkOn.checked ? linkSel.value : '';
      await apiPost('comment', { historyId, type: '答', body, linkTo: linked });
      ta.value = ''; linkOn.checked = false; linkSel.value = ''; linkSel.style.display = 'none';
      toast(linked ? '答えが横糸になって結ばれました' : '答えが絵巻物に織りこまれました');
      sync();
    } catch (e) { err.textContent = e.message; }
    send.disabled = false;
  };
  fill();
  return h('div', { class: 'cform' },
    tsel ? [h('label', { class: 'lab' }, 'どの歴史の問いに答える？'), tsel] : null, qShow, ta,
    h('label', { class: 'small', style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px', color: 'var(--paper2)', lineHeight: '1.6' } }, linkOn, 'この答えは、ほかの誰かの歴史ともつながっている（絵巻物に長い横糸が結ばれます）'),
    linkSel, h('div', { class: 'row', style: { marginTop: '10px' } }, send), err);
}
function commentItem(c, ctxId, showHist) {
  const canDel = (S.user && c.authorId === S.user.id) || S.role === 'teacher';
  const del = canDel ? h('button', { class: 'del', onclick: async () => { if (!await ask('この答えを消しますか？')) return; try { await apiPost('deleteComment', { id: c.id }); sync(); } catch (e) { toast(e.message); } } }, '消す') : null;
  const a = byId(c.historyId), b = c.linkTo ? byId(c.linkTo) : null;
  let tag = null;
  if (b && ctxId === c.historyId) tag = h('div', { class: 'link' }, `〰 ${b.title} とつながる`);
  else if (b && ctxId === c.linkTo) tag = h('div', { class: 'link' }, `〰 ${a ? a.title : ''} の問いへの答えから結ばれた糸`);
  else if (showHist && a) tag = h('div', { class: 'link' }, `「${a.question || a.title}」への答え${b ? '　〰 ' + b.title : ''}`);
  return h('div', { class: 'cm' + (b ? ' t-糸' : '') }, h('div', { class: 'meta' }, h('b', {}, c.author), h('span', {}, fmtTime(c.createdAt)), del), tag, h('div', {}, c.body));
}
function renderCommentList(el, list, ctxId, empty = 'まだ答えは届いていません。', showHist = false) {
  el.innerHTML = '';
  if (!list.length) { el.append(h('p', { class: 'mute small' }, empty)); return; }
  list.forEach(c => el.append(commentItem(c, ctxId, showHist)));
}
/* 発表者本人と先生は、響く言葉を変えられる */
function quoteButtons(x) {
  if (!x.question || !x.qText || !(S.role === 'teacher' || (S.user && x.studentId === S.user.id))) return null;
  const again = h('button', { class: 'btn small', onclick: async () => {
    again.disabled = true; again.textContent = 'さがしています…';
    try { await apiPost('rerollQuote', { historyId: x.id }); await sync(); toast('ほかの言葉をえらびました'); } catch (e) { toast(e.message); }
    again.disabled = false; again.textContent = 'ほかの言葉にする';
  } }, 'ほかの言葉にする');
  const pick = h('button', { class: 'btn small ghost', onclick: () => openQuotePicker(async (q, i) => { try { await apiPost('pickQuote', { historyId: x.id, index: i }); await sync(); } catch (e) { toast(e.message); } }) }, 'コレクションから選ぶ');
  return h('div', { class: 'row', style: { margin: '8px 0 4px' } }, again, pick);
}
function openDetail(id) {
  const x = byId(id); if (!x) return;
  const list = h('div', { class: 'clist' }), qWrap = h('div');
  const content = h('div', {},
    slideEl(x, { full: true }),
    h('div', { class: 'now-no' }, histNo(x), '　', h('span', { class: 'badge' + (statusOf(x) === 'current' ? ' ember' : '') }, { current: '発表中', done: '語られた歴史', upcoming: 'これから' }[statusOf(x)])),
    h('div', { class: 'now-big' }, titleEl(x)),
    x.subtitle ? h('p', { class: 'lead' }, x.subtitle) : null,
    h('div', { class: 'small mute', style: { marginBottom: '12px' } }, `語り手　${x.name}`),
    qWrap,
    x.question ? [h('h3', {}, 'この問いに答える'), answerBox({ target: id })] : null,
    h('h3', {}, 'この問いへの答え・結ばれた糸'), list);
  const m = openModal(content);
  let qk = null;
  m.update = () => {
    const y = byId(id); if (!y) return;
    const k = [y.question, y.qText].join('|');
    if (k !== qk) { qk = k; qWrap.innerHTML = ''; qWrap.append(questionCard(y), quoteButtons(y)); }
    renderCommentList(list, commentsFor(id, true), id);
  };
  m.update();
}
function answerForm(q) {
  const ta = h('textarea', { rows: 2, maxlength: 300, placeholder: 'あなたの答え（何度でも書きたせます）' });
  const err = h('div', { class: 'err' });
  const btn = h('button', { class: 'btn primary', onclick: async () => {
    err.textContent = ''; const body = ta.value.trim(); if (!body) { err.textContent = '答えを書いてください'; return; }
    btn.disabled = true;
    try { await apiPost('answer', { q, body }); ta.value = ''; toast('答えを置きました'); sync(); } catch (e) { err.textContent = e.message; }
    btn.disabled = false;
  } }, '答えを置く');
  return h('div', {}, ta, h('div', { class: 'row', style: { marginTop: '8px' } }, btn), err);
}
function renderAnswers(el, q) {
  el.innerHTML = '';
  const list = activeAnswers(q).slice().reverse();
  if (!list.length) { el.append(h('p', { class: 'mute small' }, 'まだ答えはありません。最初の一人になろう。')); return; }
  list.forEach(a => {
    const canDel = (S.user && a.authorId === S.user.id) || S.role === 'teacher';
    el.append(h('div', { class: 'ans' }, a.body, h('span', { class: 'by' }, a.author),
      canDel ? h('button', { class: 'del', style: { background: 'none', border: 0, color: 'var(--mute)', cursor: 'pointer', fontSize: '11px' }, onclick: async () => { if (!await ask('この答えを消しますか？')) return; try { await apiPost('deleteAnswer', { id: a.id }); sync(); } catch (e) { toast(e.message); } } }, '消す') : null));
  });
}

/* 画像の準備（端末の中で縮小してから送る） */
function scaleTo(img, mw, mh, q) {
  const r = Math.min(1, mw / img.naturalWidth, mh / img.naturalHeight);
  const w = Math.max(1, Math.round(img.naturalWidth * r)), hh = Math.max(1, Math.round(img.naturalHeight * r));
  const c = document.createElement('canvas'); c.width = w; c.height = hh;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, w, hh); g.drawImage(img, 0, 0, w, hh);
  return c.toDataURL('image/jpeg', q);
}
async function prepImage(file) {
  if (file.type && !/^image\//.test(file.type)) throw new Error('画像ファイル（PNGかJPEG）を選んでください');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('この画像は読み込めません。PNGかJPEGで書き出してから選んでください')); i.src = url; });
    let full = scaleTo(img, 1920, 1080, 0.86);
    if (full.length > 3500000) full = scaleTo(img, 1600, 900, 0.75);
    let thumb = '';
    for (const [w, hh, q] of [[480, 270, .62], [480, 270, .5], [400, 225, .45], [320, 180, .4]]) { thumb = scaleTo(img, w, hh, q); if (thumb.length < 40000) break; }
    return { full, thumb };
  } finally { URL.revokeObjectURL(url); }
}

/* テーマとスライドの編集（生徒の「わたしの歴史」と、先生の準備タブで共用） */
function historyEditor(themeBox, slideBox, getList, opt = {}) {
  let selId = null, themeKeyStr = null, slideFor = undefined, editing = false, qInput = null, qBoxEl = null, qKey = null;
  const ownerDisplay = () => S.role === 'teacher' ? CFG.TEACHER_NAME : (S.user ? S.user.display : '');
  const api = {
    select(id) { selId = id; themeKeyStr = null; slideFor = undefined; editing = false; api.update(); },
    update() {
      const list = getList();
      if (!selId || !list.find(x => x.id === selId)) selId = ((list.find(x => !x.extra) || list[0]) || {}).id || null;
      const x = list.find(y => y.id === selId) || null;
      const key = [selId, x && x.updatedAt, x && x.order, x && statusOf(x), editing, list.length, S.state.orderDecided].join('|');
      if (key !== themeKeyStr && !themeBox.contains(document.activeElement)) { themeKeyStr = key; renderTheme(x, list); }
      if (slideFor !== selId) { slideFor = selId; renderSlide(x); }
      else if (x) {
        const st = $('.slide-status', slideBox); if (st) st.replaceWith(slideStatus(x));
        const k = [x.question, x.qText].join('|'); if (k !== qKey && qBoxEl) renderQuoteBox(qBoxEl, x);
      }
    }
  };
  function renderTheme(x, list) {
    themeBox.innerHTML = '';
    themeBox.append(h('h2', {}, opt.title || 'わたしの歴史'));
    if (list.length > 1) {
      const sel = h('select', { onchange: () => api.select(sel.value) }, list.map(y => h('option', { value: y.id }, `${y.extra ? '番外　' : ''}${y.title}`)));
      sel.value = selId; themeBox.append(h('label', { class: 'lab' }, 'どの歴史を編集する？'), sel);
    }
    if (!x || editing) {
      if (!x) themeBox.append(h('p', { class: 'lead' }, opt.intro || ('「〇〇の歴史」のテーマを自由に決めよう。全員ちがうテーマになります（同じテーマは登録できません）。タイトルは「' + ownerDisplay() + 'の〇〇史」になります。')));
      const inp = h('input', { type: 'text', maxlength: 30, placeholder: '例：コーヒー、名前、雨、国境、推し…', value: x ? x.theme : '' });
      const sub = h('input', { type: 'text', maxlength: 60, placeholder: '（任意）この歴史で語りたいことを一言で', value: x ? x.subtitle || '' : '' });
      const pv = h('div', { class: 'now-big', style: { marginTop: '12px' } });
      const upd = () => { pv.innerHTML = ''; pv.append(h('small', { style: { fontSize: '.6em', color: 'var(--paper2)' } }, `${ownerDisplay()}の`), `${cleanTheme(inp.value) || '〇〇'}史`); };
      inp.oninput = upd; upd();
      const err = h('div', { class: 'err' });
      const save = h('button', { class: 'btn primary', onclick: async () => {
        err.textContent = ''; save.disabled = true;
        try {
          const r = await apiPost('setTheme', { historyId: x ? x.id : '', theme: inp.value, subtitle: sub.value });
          editing = false; selId = r.item.id; themeKeyStr = null; slideFor = undefined;
          toast('テーマが決まりました'); document.activeElement && document.activeElement.blur(); await sync(); api.update();
        } catch (e) { err.textContent = e.message; }
        save.disabled = false;
      } }, x ? 'このテーマに変える' : 'このテーマに決める');
      themeBox.append(h('label', { class: 'lab' }, 'テーマ（〇〇の部分）'), h('div', { class: 'row' }, h('div', { class: 'grow' }, inp), h('span', { class: 'mincho', style: { fontSize: '20px' } }, '史')),
        h('label', { class: 'lab' }, 'ひとこと'), sub, pv,
        h('div', { class: 'row', style: { marginTop: '12px' } }, save, x ? h('button', { class: 'btn ghost', onclick: () => { editing = false; themeKeyStr = null; api.update(); } }, 'やめる') : null), err);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') save.click(); });
      return;
    }
    const s = statusOf(x);
    themeBox.append(
      h('div', { class: 'now-no' }, histNo(x)),
      h('div', { class: 'now-big' }, titleEl(x)),
      x.subtitle ? h('p', { class: 'lead', style: { marginTop: '6px' } }, x.subtitle) : null,
      Number(x.order) && !x.extra && S.role !== 'teacher' ? h('p', { class: 'lead' }, `あなたの発表は第${kanji(x.order)}話です。`) : null,
      h('div', { class: 'row', style: { marginTop: '10px' } },
        s === 'upcoming' || S.role === 'teacher' ? h('button', { class: 'btn small', onclick: () => { editing = true; themeKeyStr = null; api.update(); } }, 'テーマを変える') : h('span', { class: 'badge green' }, s === 'current' ? 'いま発表中' : '語られた歴史')));
  }
  function slideStatus(x) {
    return h('div', { class: 'slide-status small', style: { margin: '6px 0 10px' } },
      x.kind ? h('span', { class: 'ok' }, `✓ 提出ずみ（${x.kind === 'image' ? '画像' : 'アプリで作成'}・${fmtTime(x.updatedAt)}）`) : h('span', { class: 'err' }, 'まだ提出していません'));
  }
  function renderQuoteBox(box, x) {
    qKey = [x.question, x.qText].join('|');
    box.innerHTML = '';
    if (!x.question) return;
    box.append(questionCard(x), x.qText ? quoteButtons(x) : h('p', { class: 'small mute' }, '言葉をえらんでいます…（少し待ってから再読み込み）'));
  }
  function renderSlide(x) {
    slideBox.innerHTML = ''; qBoxEl = null; qKey = null;
    slideBox.append(h('h2', {}, 'スライド1枚と、みんなへの問い'));
    if (!x) { slideBox.append(h('p', { class: 'mute' }, 'まずテーマを決めよう。そのあとスライドと問いを出せます。')); return; }
    slideBox.append(h('p', { class: 'lead' }, '発表は1枚のスライドで完結させます。そして最後に、聞いている人みんなへ問いをひとつ投げかけます。問いを出すと、その問いに響く歴史上の人物の言葉が自動でえらばれ、発表のあとスクリーンに映ります。'));
    if (x.kind) slideBox.append(h('div', { class: 'small mute' }, 'いま提出されているスライド'), h('div', { style: { maxWidth: '560px' } }, slideEl(x, { full: true })));
    slideBox.append(slideStatus(x));
    qBoxEl = h('div', { style: { maxWidth: '640px' } }); slideBox.append(qBoxEl); renderQuoteBox(qBoxEl, x);
    qInput = h('textarea', { rows: 2, maxlength: 80, placeholder: '例：いま、私たちの「塩」にあたるものは何か？' }, x.question || '');
    slideBox.append(h('label', { class: 'lab', style: { marginTop: '14px', fontSize: '15px', color: 'var(--paper)' } }, 'みんなへの問い（必須・80字まで）'), qInput,
      h('p', { class: 'small mute', style: { margin: '4px 0 14px', lineHeight: '1.7' } }, '答えがひとつに決まらない問いがおすすめです。聞いた人みんな（先生も）がこの問いに答え、その答えが歴史の絵巻物に織りこまれていきます。'));
    let mode = x.kind === 'text' ? 'text' : 'image';
    const seg = h('div', { class: 'seg' });
    const panel = h('div');
    const setMode = m => { mode = m; $$('.seg-b', seg).forEach(b => b.classList.toggle('on', b.dataset.k === m)); panel.innerHTML = ''; panel.append(m === 'image' ? imagePanel(x) : textPanel(x)); };
    seg.append(h('button', { class: 'seg-b', 'data-k': 'image', onclick: () => setMode('image') }, h('b', {}, '画'), 'スライドを画像で出す'), h('button', { class: 'seg-b', 'data-k': 'text', onclick: () => setMode('text') }, h('b', {}, '作'), 'アプリで作る'));
    slideBox.append(seg, panel); setMode(mode);
  }
  async function submit(x, payload, btn, err) {
    err.textContent = '';
    const question = qInput.value.trim();
    if (!question) { err.textContent = 'みんなへの問いを書いてください'; qInput.focus(); return; }
    btn.disabled = true; const old = btn.textContent; btn.textContent = '送信中…';
    try { await apiPost('submitSlide', Object.assign({ historyId: x.id, question }, payload)); toast('スライドと問いを提出しました'); slideFor = undefined; await sync(); api.update(); }
    catch (e) { err.textContent = e.message; btn.disabled = false; btn.textContent = old; }
  }
  function imagePanel(x) {
    let prepared = null;
    const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/*' });
    const pv = h('div', { style: { maxWidth: '560px', marginTop: '10px' } });
    const err = h('div', { class: 'err' });
    const label = () => prepared ? 'この画像と問いで提出' : (x.kind === 'image' ? '問いだけ出しなおす' : 'この画像と問いで提出');
    const btn = h('button', { class: 'btn primary', onclick: () => {
      if (prepared) submit(x, { kind: 'image', image: prepared.full, thumb: prepared.thumb }, btn, err);
      else if (x.kind === 'image') submit(x, { kind: 'image' }, btn, err);
      else err.textContent = '画像を選んでください';
    } }, label());
    file.onchange = async () => {
      err.textContent = ''; const f = file.files[0]; if (!f) return;
      try { prepared = await prepImage(f); pv.innerHTML = ''; pv.append(slideEl({ kind: 'image', _local: prepared.full, title: '' })); btn.textContent = label(); }
      catch (e) { err.textContent = e.message; prepared = null; btn.textContent = label(); }
    };
    return h('div', {},
      h('p', { class: 'small mute', style: { lineHeight: '1.8' } }, 'Googleスライドなら、1枚作ったあと［ファイル］→［ダウンロード］→［PNG画像（.png、現在のスライド）］で画像になります。Canva・Keynote・PowerPointでも、画像（PNG・JPEG）として書き出してください。16:9がおすすめです。'),
      file, pv, h('div', { class: 'row', style: { marginTop: '10px' } }, btn), err);
  }
  function textPanel(x) {
    const t = x.text || {};
    const f = {
      era: h('input', { type: 'text', maxlength: 40, placeholder: '時代（例：16世紀 → 現代）', value: t.era || '' }),
      k1: h('input', { type: 'text', maxlength: 16, placeholder: 'キーワード1', value: (t.keywords || [])[0] || '' }),
      k2: h('input', { type: 'text', maxlength: 16, placeholder: 'キーワード2', value: (t.keywords || [])[1] || '' }),
      k3: h('input', { type: 'text', maxlength: 16, placeholder: 'キーワード3', value: (t.keywords || [])[2] || '' }),
      body: h('textarea', { rows: 4, maxlength: 220, placeholder: 'この歴史で伝えたいこと（220字まで）' }, t.body || ''),
      quote: h('input', { type: 'text', maxlength: 80, placeholder: '（任意）スライドに引用したい言葉', value: t.quote || '' }),
      quotePerson: h('input', { type: 'text', maxlength: 30, placeholder: '（任意）だれの言葉？', value: t.quotePerson || '' }),
      pic: h('input', { type: 'file', accept: 'image/*' }),
    };
    let newPic = null, removed = false;
    const keepPic = () => x.kind === 'text' && x.fileId && !removed;
    const pv = h('div', { style: { maxWidth: '640px', marginTop: '12px' } });
    const draft = () => ({ era: f.era.value, keywords: [f.k1.value, f.k2.value, f.k3.value], body: f.body.value, quote: f.quote.value, quotePerson: f.quotePerson.value });
    const preview = () => {
      pv.innerHTML = '';
      const fake = Object.assign({}, x, { kind: 'text', text: draft(), question: qInput ? qInput.value : x.question });
      if (newPic) Object.assign(fake, { _local: newPic.full });
      else if (!keepPic()) Object.assign(fake, { fileId: '', thumb: '', imgUrl: '' });
      pv.append(slideEl(fake, { full: true }));
    };
    const later = () => { clearTimeout(preview._t); preview._t = setTimeout(preview, 250); };
    Object.values(f).forEach(el => el.addEventListener('input', later));
    if (qInput) qInput.addEventListener('input', later);
    const err = h('div', { class: 'err' });
    const rm = h('button', { class: 'btn small ghost', type: 'button', onclick: () => { removed = true; newPic = null; f.pic.value = ''; preview(); } }, '写真をはずす');
    f.pic.onchange = async () => { err.textContent = ''; const file = f.pic.files[0]; if (!file) return; try { newPic = await prepImage(file); removed = false; preview(); } catch (e) { err.textContent = e.message; } };
    const pickQ = h('button', { class: 'btn small ghost', type: 'button', onclick: () => openQuotePicker(q => { f.quote.value = q.text.slice(0, 80); f.quotePerson.value = q.person.slice(0, 30); preview(); }) }, 'コレクションから選ぶ');
    const btn = h('button', { class: 'btn primary', onclick: () => {
      if (!f.body.value.trim()) { err.textContent = '本文を書いてください'; return; }
      const payload = { kind: 'text', text: draft() };
      if (newPic) Object.assign(payload, { image: newPic.full, thumb: newPic.thumb });
      else if (x.kind === 'image' || removed) payload.removeImage = true;
      submit(x, payload, btn, err);
    } }, 'このスライドと問いで提出');
    preview();
    return h('div', {},
      h('div', { class: 'grid2' },
        h('div', {}, h('label', { class: 'lab' }, '時代・年代'), f.era,
          h('label', { class: 'lab' }, 'キーワード（3つまで）'), h('div', { class: 'row' }, h('div', { class: 'grow' }, f.k1), h('div', { class: 'grow' }, f.k2), h('div', { class: 'grow' }, f.k3)),
          h('label', { class: 'lab' }, '本文'), f.body),
        h('div', {},
          h('label', { class: 'lab' }, 'スライドに入れる引用（任意）'), f.quote, f.quotePerson, h('div', { style: { marginTop: '6px' } }, pickQ),
          h('label', { class: 'lab' }, '写真・資料画像（任意）'), f.pic, h('div', { style: { marginTop: '6px' } }, rm))),
      h('div', { class: 'small mute', style: { marginTop: '12px' } }, 'プレビュー（みんなへの問いは、スライドのいちばん下に入ります）'), pv,
      h('div', { class: 'row', style: { marginTop: '10px' } }, btn), err);
  }
  return api;
}

/* =====================================================================
   生徒（と先生）の画面
   ===================================================================== */
Views.now = {
  short: 'いま', label: 'いま',
  mount(root) {
    const head = h('section', { class: 'card' }), formBox = h('section', { class: 'card' }), listBox = h('section', { class: 'card' });
    root.append(head, formBox, listBox);
    let formKey = null, headKey = null;
    return {
      update() {
        const st = S.state, fq = finaleQ(), isT = S.role === 'teacher';
        const cur = (st.stage === 'present' || st.stage === 'response') ? byId(st.currentId) : null;
        const presenting = cur && st.stage === 'present';
        const mine = myHistories().find(x => !x.extra);
        const hk = [st.stage, cur && cur.id, cur && cur.updatedAt, fq, st.orderDecided, st.mode, mine && mine.order, mine && mine.kind, S.histories.length, (st.doneIds || []).length].join('|');
        if (hk !== headKey) {
          headKey = hk; head.innerHTML = '';
          if (st.stage === 'finale') {
            head.append(h('span', { class: 'stagepill' }, '終章'));
            if (fq >= 0) head.append(h('div', { class: 'now-no' }, `問い ${kanji(fq + 1)}`), h('div', { class: 'bigq' }, BIG_QS[fq]), h('p', { class: 'lead' }, 'いまスクリーンに映っている問いです。あなたの答えを置いてください。置いた言葉は、すぐにスクリーンにあらわれます。'));
            else head.append(h('div', { class: 'now-big' }, '三つの問いへ'), h('p', { class: 'lead' }, 'スクリーンを見てください。一人ひとりの歴史が、一枚の織物になろうとしています。'));
          } else if (presenting) {
            head.append(h('span', { class: 'stagepill' }, '発表中'),
              h('div', { class: 'now-no' }, histNo(cur)), h('div', { class: 'now-big' }, titleEl(cur)),
              cur.subtitle ? h('p', { class: 'lead', style: { margin: '4px 0' } }, cur.subtitle) : null,
              h('div', { class: 'small mute' }, `語り手　${cur.name}`),
              S.user && cur.studentId === S.user.id ? h('p', { class: 'lead', style: { color: '#ffcfae', marginTop: '8px' } }, 'あなたの番です。あなたの歴史を語ってください。') : null,
              h('button', { class: 'thumbbtn', title: 'スライドを大きく見る', onclick: () => openSlideBig(cur) }, slideEl(cur)),
              h('p', { class: 'lead', style: { marginTop: '12px' } }, '語りに耳をかたむけよう。語り終わると、みんなへの問いがここに届きます。'));
          } else if (cur) {
            head.append(h('span', { class: 'stagepill' }, '問いの時間'),
              h('div', { class: 'now-no' }, histNo(cur)), h('div', { class: 'now-big', style: { fontSize: '20px' } }, titleEl(cur)),
              h('div', { class: 'small mute', style: { marginBottom: '12px' } }, `語り手　${cur.name}`),
              questionCard(cur, { size: 'big' }));
          } else {
            head.append(h('span', { class: 'stagepill idle' }, st.mode === 'free' ? '自由モード' : STAGE_LABEL[st.stage] || '待機'));
            if (st.mode === 'free') head.append(h('div', { class: 'now-big' }, '授業は終わりました。歴史実践は続きます。'), h('p', { class: 'lead' }, 'いつでも、だれの問いにも答えられます。「わたし」から番外の歴史を足すこともできます。絵巻物は、これからも織りつづけられます。'));
            else if (!st.orderDecided) {
              const n = mainCount(), N = S.roster.length || CFG.CLASS_SIZE;
              head.append(h('div', { class: 'now-big' }, isT ? 'テーマを集めています' : 'テーマを決めて、スライドと問いを出そう'), h('p', { class: 'lead' }, `いま ${n} / ${N} 人がテーマを決めました。全員がそろったら、発表の順番が抽選で決まります。`),
                isT ? null : h('button', { class: 'btn primary', onclick: () => go('mine') }, mine ? 'わたしの歴史をひらく' : 'テーマを決める'));
            } else {
              const nx = nextHist();
              if (st.stage === 'lottery') head.append(h('div', { class: 'now-big' }, '発表の順番が決まりました'));
              if (!isT && mine && Number(mine.order)) head.append(h('p', { class: 'lead', style: { color: '#ffcfae' } }, `あなたは 第${kanji(mine.order)}話 です。`, mine.kind ? '' : '　スライドと問いをまだ出していません。'));
              if (nx) head.append(h('div', { class: 'now-no', style: { marginTop: '10px' } }, `つぎ　${histNo(nx)}`), h('div', { class: 'now-big' }, titleEl(nx)), h('div', { class: 'small mute' }, `語り手　${nx.name}`));
              else head.append(h('div', { class: 'now-big' }, 'すべての歴史が語られました'));
              if (st.stage === 'lottery') head.append(h('div', { style: { marginTop: '12px' } }, sortedHistories().filter(x => Number(x.order)).map(x => h('span', { class: 'chip' + (S.user && x.studentId === S.user.id ? ' me' : '') }, `${histNo(x)} ${x.title}`))));
            }
          }
        }
        let fk, build;
        if (st.stage === 'finale' && fq >= 0) { fk = 'ans' + fq; build = () => [h('h2', {}, '答えを置く'), answerForm(fq + 1)]; }
        else if (presenting) { fk = 'wait' + cur.id; build = () => [h('h2', {}, '問いを待っています'), h('p', { class: 'lead small', style: { margin: 0 } }, '発表が終わると、ここに答える欄があらわれます。')]; }
        else if (cur) { fk = 'a' + cur.id; build = () => [h('h2', {}, isT ? '先生も答える' : '問いに答える'), answerBox({ target: cur.id })]; }
        else { const last = sortedHistories().filter(x => (st.doneIds || []).includes(x.id) && x.question).pop(); fk = 'free'; build = () => [h('h2', {}, '問いに答える'), h('p', { class: 'lead small' }, '語られた歴史の問いに、いつでも答えられます。'), answerBox({ target: last ? last.id : '', selectable: true })]; }
        if (fk !== formKey && !formBox.contains(document.activeElement)) { formKey = fk; formBox.innerHTML = ''; formBox.append(...build()); }
        listBox.innerHTML = '';
        listBox.style.display = presenting ? 'none' : '';
        if (st.stage === 'finale' && fq >= 0) { const l = h('div', { class: 'ans-list' }); listBox.append(h('h2', {}, 'みんなの答え'), l); renderAnswers(l, fq + 1); }
        else if (cur && !presenting) { const l = h('div', { class: 'clist' }); listBox.append(h('h2', {}, 'この問いへの答え'), l); renderCommentList(l, commentsFor(cur.id, true), cur.id); }
        else if (!presenting) { const l = h('div', { class: 'clist' }); listBox.append(h('h2', {}, '最近置かれた答え'), l); renderCommentList(l, activeComments().sort((a, b) => b.createdAt - a.createdAt).slice(0, 30), null, 'まだ答えは置かれていません。', true); }
      }
    };
  }
};

Views.mine = {
  short: 'わたし', label: 'わたしの歴史',
  mount(root) {
    const themeBox = h('section', { class: 'card' }), slideBox = h('section', { class: 'card' }), takenBox = h('section', { class: 'card' }), extraBox = h('section', { class: 'card' });
    root.append(themeBox, slideBox, takenBox, extraBox);
    const ed = historyEditor(themeBox, slideBox, myHistories);
    let extraKey = null;
    return {
      update() {
        ed.update();
        takenBox.innerHTML = '';
        const hs = sortedHistories().filter(x => !x.extra);
        takenBox.append(h('h2', {}, 'みんなのテーマ'), h('p', { class: 'lead small' }, `${mainCount()} / ${S.roster.length || CFG.CLASS_SIZE} 人が決めました。同じテーマは選べません。`),
          h('div', {}, hs.length ? hs.map(x => h('span', { class: 'chip' + (S.user && x.studentId === S.user.id ? ' me' : '') }, x.title)) : h('span', { class: 'mute small' }, 'まだだれも決めていません。')));
        const ek = [S.state.mode, myHistories().length].join('|');
        if (ek !== extraKey && !extraBox.contains(document.activeElement)) {
          extraKey = ek; extraBox.innerHTML = '';
          extraBox.append(h('h2', {}, '番外の歴史を足す'));
          if (S.state.mode !== 'free') { extraBox.append(h('p', { class: 'lead small', style: { margin: 0 } }, '授業が終わって先生が「自由モード」にすると、新しい「〇〇史」をいくつでも足せるようになります。歴史実践は、授業のあとも続きます。')); return; }
          const inp = h('input', { type: 'text', maxlength: 30, placeholder: '新しいテーマ（〇〇の部分）' });
          const sub = h('input', { type: 'text', maxlength: 60, placeholder: '（任意）ひとこと' });
          const err = h('div', { class: 'err' });
          const btn = h('button', { class: 'btn primary', onclick: async () => {
            err.textContent = ''; btn.disabled = true;
            try { const r = await apiPost('setTheme', { theme: inp.value, subtitle: sub.value, extra: true }); toast('番外の歴史が加わりました'); inp.value = ''; sub.value = ''; await sync(); ed.select(r.item.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }
            catch (e) { err.textContent = e.message; }
            btn.disabled = false;
          } }, '番外の歴史を足す');
          extraBox.append(h('p', { class: 'lead small' }, '授業が終わっても、歴史実践は続きます。気になった「〇〇史」を、いくつでも足して絵巻物に織りこもう。'), inp, h('div', { style: { height: '8px' } }), sub, h('div', { class: 'row', style: { marginTop: '10px' } }, btn), err);
        }
      }
    };
  }
};

Views.questions = {
  short: '問い', label: '三つの問い',
  mount(root) {
    const lists = [];
    root.append(h('section', { class: 'card' }, h('p', { class: 'lead', style: { margin: 0 } }, 'ポール・ゴーギャンが1897〜98年に描いた大作の題名は、三つの問いでできています。一人ひとりの「〇〇史」を聞いたいま、あなたならどう答えますか。何度でも書きたしてかまいません。')));
    BIG_QS.forEach((q, i) => {
      const l = h('div', { class: 'ans-list' }); lists.push(l);
      root.append(h('section', { class: 'card' }, h('div', { class: 'now-no' }, `問い ${kanji(i + 1)}`), h('div', { class: 'bigq' }, q), answerForm(i + 1), l));
    });
    return { update() { lists.forEach((l, i) => renderAnswers(l, i + 1)); } };
  }
};

function histCard(x) {
  const cs = commentsFor(x.id, true);
  const s = statusOf(x);
  return h('div', { class: 'hcard', onclick: () => openDetail(x.id) },
    h('div', { class: 'bar', style: { background: histColor(x) } }), slideEl(x),
    h('div', { class: 'hc-b' }, h('div', { class: 'hc-no' }, histNo(x)), h('div', { class: 'hc-t' }, x.title),
      x.question && s !== 'upcoming' ? h('div', { class: 'hc-q' }, `問い　${x.question}`) : null,
      x.qText && s !== 'upcoming' ? h('div', { class: 'hc-qq' }, `◆ ${x.qPerson}`) : null,
      h('div', { class: 'hc-m' }, h('span', {}, `答え ${cs.filter(c => c.historyId === x.id).length}`), h('span', {}, `糸 ${cs.filter(c => c.linkTo).length}`), h('span', {}, { current: '● 発表中', done: '語られた', upcoming: 'これから' }[s]))));
}

/* =====================================================================
   歴史の絵巻物 —— ゴーギャンの絵のように、右から左へ読む一枚の織物
   一話＝一場面（題・問い・スライド・響いた言葉）、下の帯＝問いへの答えの織り目
   （色は答えた人ごと）、長い横糸＝ほかの歴史とつながった答え
   ===================================================================== */
const SC = { PW: 250, H: 640, END: 340 };
const AUTHOR_COLORS = ['#e2bb4f', '#d9603d', '#4fa39a', '#7aa85a', '#c98f9b', '#86b8cc', '#efe0b8', '#b8653f', '#93a7dc', '#f0c27a', '#6fb5a3', '#c0566b', '#d8a6c9', '#a3c26b', '#e6875a', '#5d8fc4'];
function authorColor(id) { if (id === 'TEACHER') return '#ffe07a'; let s = 7; for (const ch of String(id)) s = (s * 31 + ch.charCodeAt(0)) >>> 0; return AUTHOR_COLORS[s % AUTHOR_COLORS.length]; }
function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
let scrollSeq = 0;
function buildScroll({ reveal = false, allDone = false } = {}) {
  const { PW, H, END } = SC;
  const hs = sortedHistories();
  const n = hs.length, W = END * 2 + Math.max(n, 1) * PW;
  const xOf = i => W - END - (i + 1) * PW;            // 第一話がいちばん右。右から左へ読む
  const idx = new Map(hs.map((x, i) => [x.id, i]));
  const cs = activeComments().filter(c => idx.has(c.historyId));
  const P = 'sc' + (++scrollSeq), f1 = v => v.toFixed(1);
  const stOf = x => allDone ? 'done' : statusOf(x);
  let defs = `<linearGradient id="${P}gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6dc74"/><stop offset=".55" stop-color="#e2b648"/><stop offset="1" stop-color="#c3922c"/></linearGradient><filter id="${P}soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="18"/></filter>`;
  let body = '';
  const r = seeded(1897);
  // 遠くの山と海（左上に山、海の光）
  let d = `M0,${f1(H * 0.2)}`;
  for (let x = 0; x < W; x += 140) d += ` Q${f1(x + 70)},${f1(H * (0.07 + r() * 0.1))} ${f1(x + 140)},${f1(H * (0.15 + r() * 0.07))}`;
  body += `<path d="${d} L${W},${f1(H * 0.27)} L0,${f1(H * 0.27)} Z" fill="#1a3346" opacity=".8"/>`;
  body += `<rect x="0" y="${f1(H * 0.262)}" width="${W}" height="3" fill="#a9d3e0" opacity=".28"/>`;
  // 色の溜まり（薄紅の衣・黄土の光・青緑の影）
  for (let k = 0; k < Math.max(4, n); k++) {
    const cx = r() * W, cy = H * (0.4 + r() * 0.45), rx = 60 + r() * 120, ry = 40 + r() * 80;
    const col = ['#c98f9b', '#e2bb4f', '#3f8f88', '#c9573a', '#6d7fb8'][k % 5];
    body += `<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="${col}" opacity=".16" filter="url(#${P}soft)"/>`;
  }
  // 青くねじれた木（場面のさかいめ）
  const tree = (x, rr) => {
    let dd = `M${f1(x)},${H}`, px = x, y = H;
    for (let s2 = 0; s2 < 4; s2++) {
      const ny = y - (H + 30) / 4, nx = x + (rr() - 0.5) * 28;
      dd += ` C${f1(px + (rr() - 0.5) * 40)},${f1(y - (H / 4) * 0.4)} ${f1(nx + (rr() - 0.5) * 40)},${f1(ny + (H / 4) * 0.4)} ${f1(nx)},${f1(ny)}`;
      px = nx; y = ny;
    }
    const by = H * (0.3 + rr() * 0.2), dir = rr() > 0.5 ? 1 : -1;
    const br = `M${f1(x + (rr() - 0.5) * 20)},${f1(by)} C${f1(x + dir * 40)},${f1(by - 50)} ${f1(x + dir * 70)},${f1(by - 10)} ${f1(x + dir * 105)},${f1(by - 70)}`;
    return [dd, br].map((pp, j) => `<g opacity="${j ? 0.42 : 0.9}"><path d="${pp}" fill="none" stroke="#0c2433" stroke-width="${j ? 10 : 17}" stroke-linecap="round"/><path d="${pp}" fill="none" stroke="#2f7aa0" stroke-width="${j ? 5 : 11}" stroke-linecap="round"/><path d="${pp}" fill="none" stroke="#86c6dc" stroke-width="2.2" stroke-linecap="round" opacity=".6"/></g>`).join('')
      + `<circle cx="${f1(x + dir * 70 + (rr() - 0.5) * 20)}" cy="${f1(by - 46)}" r="7" fill="#d9603d" opacity=".9"/>`;
  };
  for (let k = 0; k <= Math.max(n, 1); k++) body += tree(W - END - k * SC.PW, seeded(97 + k * 13));
  // 金色の角（左上：三つの問い、右上：私たちの歴史）
  const CW = 320, CH = 190;
  body += `<path class="sc-goldp" d="M0,0 L${CW},0 C${CW * 0.9},${CH * 0.55} ${CW * 0.55},${CH * 0.98} 0,${CH} Z" fill="url(#${P}gold)" stroke="#9c7522" stroke-width="1.5"/>`;
  body += `<path class="sc-goldp" d="M${W},0 L${W - CW},0 C${W - CW * 0.9},${CH * 0.55} ${W - CW * 0.55},${CH * 0.98} ${W},${CH} Z" fill="url(#${P}gold)" stroke="#9c7522" stroke-width="1.5"/>`;
  // 横糸：ほかの歴史とつながった答え
  let weft = '';
  const top = H * 0.8, bot = H - 22;
  cs.filter(c => c.linkTo && idx.has(c.linkTo)).forEach((c, k) => {
    const xa = xOf(idx.get(c.historyId)) + PW / 2, xb = xOf(idx.get(c.linkTo)) + PW / 2;
    const y = top + ((k * 17) % (bot - top)), amp = 8 + Math.min(18, Math.abs(xb - xa) * 0.01), dx = xb - xa;
    weft += `<path d="M${f1(xa)},${f1(y)} C${f1(xa + dx * 0.3)},${f1(y - amp)} ${f1(xa + dx * 0.7)},${f1(y + amp)} ${f1(xb)},${f1(y)}" fill="none" stroke="#0b1a22" stroke-width="5" opacity=".6"/><path d="M${f1(xa)},${f1(y)} C${f1(xa + dx * 0.3)},${f1(y - amp)} ${f1(xa + dx * 0.7)},${f1(y + amp)} ${f1(xb)},${f1(y)}" fill="none" stroke="${authorColor(c.authorId)}" stroke-width="2.8"><title>${esc(`${hs[idx.get(c.historyId)].title} ⇄ ${hs[idx.get(c.linkTo)].title}\n${c.body}（${c.author}）`)}</title></path>`;
  });
  const svg = `<svg class="sc-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs>${body}<g class="sc-weft">${weft}</g></svg>`;
  const el = h('div', { class: 'scroll' + (reveal ? ' reveal' : ''), style: { width: W + 'px', height: H + 'px' }, html: svg });
  const year = (() => { const t = Math.min(...S.histories.map(x => Number(x.createdAt) || Infinity)); return isFinite(t) ? new Date(t).getFullYear() : new Date().getFullYear(); })();
  el.append(
    h('div', { class: 'sc-gold left' }, h('div', { class: 'fr' }, "D'où Venons Nous"), h('div', { class: 'fr' }, 'Que Sommes Nous'), h('div', { class: 'fr' }, 'Où Allons Nous'), h('div', { class: 'ja' }, '我々はどこから来たのか', h('br'), '我々は何者か　我々はどこへ行くのか')),
    h('div', { class: 'sc-gold right' }, h('div', { class: 'jt' }, CFG.APP_TITLE), h('div', { class: 'ja' }, CFG.APP_SUB.replace(/^[～〜~]|[～〜~]$/g, '')), h('div', { class: 'fr' }, String(year))),
    h('div', { class: 'sc-end', style: { right: (END / 2 - 18) + 'px' } }, '我々はどこから来たのか'),
    h('div', { class: 'sc-end', style: { left: (END / 2 - 18) + 'px' } }, '我々はどこへ行くのか'),
    h('div', { class: 'sc-mid', style: { left: (W / 2) + 'px' } }, '我々は何者か'));
  const panels = [];
  hs.forEach((x, i) => {
    const st = stOf(x), open = st !== 'upcoming';
    const ans = cs.filter(c => c.historyId === x.id).sort((a, b) => a.createdAt - b.createdAt);
    const pe = h('div', { class: `sc-panel ${st}`, 'data-id': x.id, title: x.title, style: { left: xOf(i) + 'px', width: PW + 'px' } },
      h('div', { class: 'sc-title' }, h('span', { class: 'no' }, histNo(x)), x.title),
      open && x.question ? h('div', { class: 'sc-q' }, x.question) : null,
      open ? h('div', { class: 'sc-pic' }, slideEl(x)) : h('div', { class: 'sc-wait' }, 'まだ織られていない'),
      open && x.qText ? h('div', { class: 'sc-quote' }, `「${x.qText}」`, h('span', { class: 'who' }, `　—— ${x.qPerson}`)) : null,
      h('div', { class: 'sc-weave' }, ans.map(c => h('span', { class: 'sc-st' + (isFresh(c) ? ' new' : ''), title: `${c.author}：${c.body}`, style: { width: Math.round(16 + Math.min(52, c.body.length * 0.9)) + 'px', background: authorColor(c.authorId) } }))));
    el.append(pe);
    panels.push({ el: pe, cx: xOf(i) + PW / 2 });
  });
  if (!n) el.append(h('div', { class: 'sc-empty' }, 'まだ一枚も織られていません'));
  return { el, W, H, panels, n };
}
function renderScroll(wrap, o = {}) {
  const sc = buildScroll(o);
  const availH = o.height || 520;
  let s = availH / sc.H;
  if (o.fit) s = Math.min(s, Math.max(200, (wrap.clientWidth || innerWidth) - 4) / sc.W);
  const sizer = h('div', { class: 'scroll-sizer', style: { width: f2(sc.W * s) + 'px', height: f2(sc.H * s) + 'px', margin: o.fit ? '0 auto' : '0' } });
  sc.el.style.transform = `scale(${s})`;
  sizer.append(sc.el);
  const first = !wrap.dataset.drawn;
  const fromRight = wrap.scrollWidth - wrap.scrollLeft;
  wrap.innerHTML = ''; wrap.append(sizer);
  wrap.style.overflowX = o.fit ? 'hidden' : 'auto';
  if (!o.fit) wrap.scrollLeft = first ? wrap.scrollWidth : Math.max(0, wrap.scrollWidth - fromRight);
  wrap.dataset.drawn = '1';
  if (o.onSelect) sc.el.onclick = e => { const t = e.target.closest('[data-id]'); if (t) o.onSelect(t.dataset.id); };
  return { s, sc };
}
function f2(v) { return Math.round(v * 100) / 100; }
/* 終章：絵巻を右から左へたどりながら一場面ずつ織りあげ、最後に一枚の織物として全体を見せる */
function playScrollFinale(box, cap, timers) {
  box.innerHTML = '';
  const sc = buildScroll({ reveal: true, allDone: true });
  box.append(sc.el);
  const vw = innerWidth, vh = innerHeight;
  const s1 = Math.min(1.25, vh * 0.8 / sc.H);
  const fitS = Math.min(vw * 0.94 / sc.W, vh * 0.66 / sc.H);
  const ty = (vh - sc.H * s1) / 2;
  const set = (tx, y, s, dur, ease) => { sc.el.style.transition = dur ? `transform ${dur}s ${ease || 'linear'}` : 'none'; sc.el.style.transform = `translate(${f2(tx)}px, ${f2(y)}px) scale(${s})`; };
  let D;
  if (sc.W * s1 > vw * 1.05) {
    const tx0 = vw - sc.W * s1, tx1 = 0;
    D = Math.max(12, sc.n * 1.7);
    set(tx0, ty, s1, 0);
    void sc.el.offsetWidth;
    timers.push(setTimeout(() => set(tx1, ty, s1, D, 'linear'), 60));
    sc.panels.forEach(p => {
      const t = (vw * 0.7 - tx0 - p.cx * s1) / ((tx1 - tx0) / D);
      p.el.style.setProperty('--d', Math.max(0.3, Math.min(D, t)).toFixed(2) + 's'); p.el.classList.add('woven');
    });
  } else {
    D = sc.n * 0.8 + 1.5;
    set((vw - sc.W * s1) / 2, ty, s1, 0);
    sc.panels.forEach((p, i) => { p.el.style.setProperty('--d', (0.5 + i * 0.8).toFixed(2) + 's'); p.el.classList.add('woven'); });
  }
  timers.push(setTimeout(() => set((vw - sc.W * fitS) / 2, (vh - sc.H * fitS) / 2 - vh * 0.07, fitS, 3.4, 'ease-in-out'), (D + 1.2) * 1000));
  timers.push(setTimeout(() => { sc.el.classList.add('complete'); cap.classList.add('on'); }, (D + 4.6) * 1000));
}
Views.tapestry = {
  label: 'タペストリー', proj: true,
  mount(root) {
    const proj = S.role === 'teacher';
    let fit = false;
    const counter = h('div', { class: 'counter' });
    const wrap = h('div', { class: 'scroll-wrap' });
    const list = h('div', { class: 'tap-list' });
    const tog = h('button', { class: 'btn small', onclick: () => { fit = !fit; tog.textContent = fit ? '絵巻を読む' : '全体を見る'; wrap.dataset.drawn = ''; draw(); } }, '全体を見る');
    root.append(h('div', { class: 'tap-view' },
      h('div', { class: 'tap-head' }, h('div', { class: 'h2' }, '歴史の絵巻物'), counter, h('div', { style: { marginLeft: 'auto' } }, tog)),
      h('div', { class: 'sc-legend' },
        h('span', {}, '右から左へ読む一枚の織物。一場面が一人の「〇〇史」'),
        h('span', {}, h('i', { style: { background: 'linear-gradient(90deg,#e2bb4f,#d9603d,#4fa39a,#c98f9b)' } }), '下の織り目＝問いへの答え（色は答えた人ごと）'),
        h('span', {}, h('i', { style: { height: '3px', background: '#86b8cc' } }), '長い横糸＝ほかの歴史とつながった答え')),
      wrap, list));
    const draw = () => renderScroll(wrap, { fit, height: proj ? Math.max(380, innerHeight - 150) : (innerWidth < 640 ? 430 : 540), onSelect: openDetail });
    let rt; const onR = () => { clearTimeout(rt); rt = setTimeout(draw, 200); };
    addEventListener('resize', onR);
    return {
      update() {
        draw();
        const cs = activeComments();
        counter.innerHTML = ''; counter.append('場面', h('b', {}, sortedHistories().length), '　織り目', h('b', {}, cs.length), '　横糸', h('b', {}, cs.filter(c => c.linkTo).length));
        list.innerHTML = ''; sortedHistories().forEach(x => list.append(histCard(x)));
      },
      unmount() { removeEventListener('resize', onR); }
    };
  }
};

/* =====================================================================
   言葉の地層（新しく言葉が積もった歴史ほど上の層）
   ===================================================================== */
function fragEl(c, proj) {
  const showBy = !proj || S.state.showNames;
  const el = h('span', { class: 'frag' + (isFresh(c) ? ' fresh' : ''), title: c.author });
  if (c.linkTo) { const o = byId(c.linkTo); if (o) el.append(h('span', { class: 'to' }, `〰 ${o.title}　`)); }
  el.append(c.body);
  if (showBy) el.append(h('span', { class: 'by' }, c.author));
  return el;
}
function renderStrata(v) {
  const proj = S.role === 'teacher';
  const cs = activeComments();
  const groups = new Map();
  cs.forEach(c => { if (!groups.has(c.historyId)) groups.set(c.historyId, []); groups.get(c.historyId).push(c); });
  const curId = S.state.stage === 'response' ? S.state.currentId : '';
  if (curId && byId(curId) && !groups.has(curId)) groups.set(curId, []);
  const layers = [...groups.entries()].filter(([k]) => byId(k)).map(([k, list]) => ({ k, list: list.sort((a, b) => a.createdAt - b.createdAt), last: k === curId ? Infinity : Math.max(0, ...list.map(c => Number(c.createdAt))) })).sort((a, b) => b.last - a.last);
  v.innerHTML = '';
  v.append(h('div', { class: 'strata-head' }, h('div', { class: 'h2' }, '言葉の地層'),
    h('div', { class: 'counter' }, '問い', h('b', {}, layers.length), '　積もった答え', h('b', {}, cs.length), '　結ばれた横糸', h('b', {}, cs.filter(c => c.linkTo).length))));
  if (!proj) v.append(h('p', { class: 'lead small' }, '一人ひとりの問いと、それに響いた歴史上の人物の言葉、そしてみんなの答えが、ここに層になって積み重なっていきます。新しく答えが積もった問いほど上の層になります。'));
  const box = h('div', { class: 'strata' });
  layers.forEach((L, i) => {
    const x = byId(L.k);
    const scale = i === 0 ? 1.2 : i < 3 ? 1.03 : i < 6 ? 0.94 : 0.86;
    const head = h('div', { class: 's-h', style: { cursor: 'pointer' }, onclick: () => openDetail(x.id) }, h('i', { style: { background: histColor(x) } }), `${histNo(x)}　${x.title}`, h('span', { class: 'mute' }, `答え ${L.list.length}`));
    box.append(h('div', { class: 'stratum', style: { fontSize: scale + 'em', background: `linear-gradient(90deg, ${histColor(x, 0.09)}, transparent 70%)` } },
      head,
      x.question ? h('div', { class: 's-q' }, x.question) : null,
      x.qText ? h('div', { class: 's-quote' }, `「${x.qText}」`, h('span', { class: 'who' }, `—— ${x.qPerson}`)) : null,
      h('div', { class: 's-b' }, L.list.length ? L.list.map(c => fragEl(c, proj)) : h('span', { class: 'mute' }, '答えを待っています…'))));
  });
  if (!layers.length) {
    const q = enabledQuotes()[0];
    box.append(h('div', { class: 'inscr' }, 'まだ答えは積もっていません。最初の問いを待っています。'), q ? h('div', { class: 'inscr' }, `「${q.text}」`, h('span', { class: 'who' }, q.person)) : null);
  }
  v.append(box);
}
function autoScroll(el) {
  let raf, pos = el.scrollTop, pausedUntil = Date.now() + 6000, alive = true;
  const user = () => { pausedUntil = Date.now() + 15000; pos = el.scrollTop; };
  el.addEventListener('wheel', user, { passive: true }); el.addEventListener('touchstart', user, { passive: true }); el.addEventListener('keydown', user);
  const tick = () => {
    if (!alive) return;
    const now = Date.now();
    if (now > pausedUntil && el.scrollHeight > el.clientHeight + 10) {
      pos += 0.4; el.scrollTop = Math.floor(pos);
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
        pausedUntil = now + 11000;
        setTimeout(() => { if (alive) { el.scrollTo({ top: 0, behavior: 'smooth' }); pos = 0; } }, 5000);
      }
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return { stop() { alive = false; cancelAnimationFrame(raf); el.removeEventListener('wheel', user); el.removeEventListener('touchstart', user); el.removeEventListener('keydown', user); }, top() { el.scrollTo({ top: 0, behavior: 'smooth' }); pos = 0; pausedUntil = Date.now() + 10000; } };
}
Views.strata = {
  short: '地層', label: '言葉の地層', proj: true,
  mount(root) {
    const v = h('div', { class: 'strata-view', tabindex: '0' });
    root.append(v);
    const sc = S.role === 'teacher' ? autoScroll(v) : null;
    let n0 = -1;
    return {
      update() {
        renderStrata(v);
        const n = activeComments().length;
        if (sc && n0 >= 0 && n > n0) sc.top();
        n0 = n;
      },
      unmount() { sc && sc.stop(); }
    };
  }
};

/* =====================================================================
   BGM「パリは燃えているか」（音源はこのパソコンのブラウザ内にだけ保存）
   ===================================================================== */
function idb() { return new Promise((res, rej) => { const r = indexedDB.open('rekishi-last', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function idbGet(k) { try { const db = await idb(); return await new Promise((res, rej) => { const q = db.transaction('kv', 'readonly').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); } catch (e) { return null; } }
async function idbSet(k, v) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
const BGM = {
  audio: null, url: null, name: '', ready: false, fadeT: null, duckT: null, inited: false,
  cfg: Object.assign({ volIntro: 0.8, volTalk: 0.18, introSec: 20, keepResp: true, fromStart: true }, LS.get('rl-bgm-cfg', {})),
  saveCfg() { LS.set('rl-bgm-cfg', this.cfg); },
  async init() {
    if (this.inited) return; this.inited = true;
    this.audio = new Audio(); this.audio.loop = true; this.audio.preload = 'auto';
    const blob = await idbGet('bgm');
    if (blob) this.setBlob(blob, blob.name || LS.get('rl-bgm-name', '保存された曲'));
    refresh();
  },
  setBlob(blob, name) { if (this.url) URL.revokeObjectURL(this.url); this.url = URL.createObjectURL(blob); this.audio.src = this.url; this.name = name; this.ready = true; },
  async load(file) { if (!this.audio) await this.init(); this.setBlob(file, file.name); LS.set('rl-bgm-name', file.name); try { await idbSet('bgm', file); } catch (e) { toast('曲を保存できませんでした（このときだけ使えます）'); } },
  playing() { return !!(this.audio && !this.audio.paused); },
  fadeTo(v, ms = 1500, then) {
    if (!this.audio) return; clearInterval(this.fadeT);
    const a = this.audio, from = a.volume, steps = Math.max(1, Math.round(ms / 50)); let k = 0;
    this.fadeT = setInterval(() => { k++; a.volume = Math.min(1, Math.max(0, from + (v - from) * k / steps)); if (k >= steps) { clearInterval(this.fadeT); then && then(); } }, 50);
  },
  start({ duck = true } = {}) {
    if (!this.ready || !this.audio) return;
    clearTimeout(this.duckT);
    if (this.cfg.fromStart || this.audio.paused) { if (this.cfg.fromStart) try { this.audio.currentTime = 0; } catch (e) { } }
    if (this.audio.paused) this.audio.volume = 0;
    const p = this.audio.play(); if (p && p.catch) p.catch(() => toast('BGMを再生できませんでした。画面を一度クリックしてからもう一度。'));
    this.fadeTo(this.cfg.volIntro, 2000);
    if (duck) this.duckT = setTimeout(() => this.fadeTo(this.cfg.volTalk, 3500), this.cfg.introSec * 1000);
  },
  duck() { clearTimeout(this.duckT); if (this.playing()) this.fadeTo(this.cfg.volTalk, 1500); },
  stop(ms = 2500) { clearTimeout(this.duckT); if (this.playing()) this.fadeTo(0, ms, () => this.audio.pause()); },
  toggle() { if (this.playing()) this.stop(1200); else if (this.ready) { const p = this.audio.play(); if (p && p.catch) p.catch(() => { }); this.audio.volume = 0; this.fadeTo(this.cfg.volTalk, 1200); } else toast('準備タブでBGMの曲ファイルを選んでください'); },
};

/* =====================================================================
   先生：準備
   ===================================================================== */
Views.prep = {
  label: '準備',
  mount(root) {
    const ov = h('section', { class: 'card' }), regBox = h('section', { class: 'card' }), rosterBox = h('section', { class: 'card' }), tTheme = h('section', { class: 'card' }), tSlide = h('section', { class: 'card' }), bgmBox = h('section', { class: 'card' }), setBox = h('section', { class: 'card' }), dataBox = h('section', { class: 'card' });
    root.append(ov, regBox, rosterBox, setBox, bgmBox, tTheme, tSlide, dataBox);
    const reg = buildRosterReg(regBox);
    const ed = historyEditor(tTheme, tSlide, () => S.histories.filter(x => x.studentId === 'TEACHER'), { title: '先生の歴史（任意）', intro: `先生も「${CFG.TEACHER_NAME}の〇〇史」で語れます。設定で「最終話にする」を選ぶと、生徒全員のあとの最後の話になります。` });
    buildBgm(bgmBox); buildData(dataBox);
    let setKey = null;
    return {
      update() {
        renderOverview(ov); reg.update(); renderRoster(rosterBox); ed.update();
        const k = JSON.stringify([S.state.mode, S.state.showNames, S.state.talkSec, S.state.teacherLast]);
        if (k !== setKey && !setBox.contains(document.activeElement)) { setKey = k; renderSettings(setBox); }
      }
    };
  }
};
function renderOverview(ov) {
  ov.innerHTML = '';
  const st = S.state, N = S.roster.length;
  const mains = S.histories.filter(x => !x.extra && x.studentId !== 'TEST' && x.studentId !== 'TEACHER');
  const have = new Set(mains.map(x => x.studentId));
  const missing = S.roster.filter(r => !have.has(r.id));
  const slides = mains.filter(x => x.kind).length;
  const done = (st.doneIds || []).length;
  ov.append(h('h2', {}, '進行'),
    h('div', { class: 'counter', style: { marginBottom: '10px' } }, 'テーマ', h('b', {}, `${mains.length}/${N}`), '　スライド', h('b', {}, `${slides}/${N}`), '　語られた歴史', h('b', {}, `${done}`)),
    h('p', { class: 'lead small' }, `いまの舞台：${STAGE_LABEL[st.stage] || st.stage}${byId(st.currentId) ? '（' + byId(st.currentId).title + '）' : ''}　／　モード：${st.mode === 'free' ? '自由モード' : '授業モード'}`));
  if (!st.orderDecided) {
    ov.append(h('p', { class: 'lead' }, '全員がテーマを入力したら、抽選で発表の順番を決めます。抽選は「舞台」に映ります。'));
    let force = null;
    if (missing.length) {
      ov.append(h('p', { class: 'err' }, `まだテーマを決めていない人：${missing.map(r => r.name).join('、')}`));
      force = h('input', { type: 'checkbox' });
      ov.append(h('label', { class: 'small', style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' } }, force, '未入力の人がいても決める（あとから入力した人は最後に加わります）'));
    }
    const btn = h('button', { class: 'btn primary', disabled: !mains.length, onclick: async () => {
      if (missing.length && !(force && force.checked)) { toast('全員のテーマがそろっていません'); return; }
      if (!await ask('発表の順番を抽選で決めます。舞台に抽選が映ります。よろしいですか？')) return;
      try { S.stateSeq++; const r = await apiPost('decideOrder', { force: !!(force && force.checked) }); S.state = Object.assign({}, DEFAULT_STATE, r.state); S.stateSeq++; await sync(); go('stage'); } catch (e) { toast(e.message); }
    } }, '順番を決める（抽選して舞台へ）');
    ov.append(h('div', { class: 'row' }, btn));
  } else {
    ov.append(h('div', { style: { margin: '6px 0 12px' } }, sortedHistories().filter(x => Number(x.order)).map(x => h('span', { class: 'chip' }, `${(st.doneIds || []).includes(x.id) ? '✓ ' : ''}${histNo(x)} ${x.title}`))));
    ov.append(h('div', { class: 'row' },
      h('button', { class: 'btn primary', onclick: () => go('stage') }, '舞台へ'),
      h('button', { class: 'btn ghost small', onclick: async () => { if (!await ask('順番を白紙に戻します（発表済みの記録も消えます。言葉は残ります）。よろしいですか？')) return; try { await apiPost('resetOrder'); await sync(); } catch (e) { toast(e.message); } } }, '順番をやり直す')));
  }
}
function buildRosterReg(box) {
  let dirty = false, lastKey = null;
  const ta = h('textarea', { rows: 10, spellcheck: 'false', placeholder: '60401\t阿部 宏樹\n60402\t（氏名）\n…', style: { fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '14px', lineHeight: '1.6' } });
  const pv = h('div', { class: 'tbl-wrap', style: { marginTop: '10px' } });
  const info = h('div', { class: 'small', style: { marginTop: '8px' } });
  const err = h('div', { class: 'err' });
  const btn = h('button', { class: 'btn primary' }, 'この名簿で登録する');
  const reset = h('button', { class: 'btn ghost small', onclick: () => { dirty = false; lastKey = null; api.update(true); } }, 'いまの名簿に戻す');
  const det = h('details', {},
    h('summary', { style: { cursor: 'pointer', fontFamily: 'var(--mincho)', fontSize: '20px', letterSpacing: '.08em', fontWeight: 600 } }, '名簿の登録（学籍番号と氏名）'),
    h('p', { class: 'lead small', style: { marginTop: '10px' } }, '学籍番号と氏名の一覧を、1行に1人ずつ貼りつけてください。Excelやスプレッドシートで2列（学籍番号・氏名）をコピーして貼ると、「60401（タブ）阿部 宏樹」の形でそのまま読めます。3列目に表示名（「〇〇の〇〇史」の最初の〇〇）を入れることもできます。空なら姓が使われます。生徒はログイン画面で、この一覧から自分をえらびます。'),
    ta, pv, info, h('div', { class: 'row', style: { marginTop: '10px' } }, btn, reset), err);
  box.append(det);
  const fromRoster = () => sortRoster(S.roster).map(r => [r.no, r.name].concat(r.display && r.display !== surnameOf(r.name) ? [r.display] : []).join('\t')).join('\n');
  function preview() {
    const { rows, errors } = parseRosterText(ta.value);
    const cur = {}; S.roster.forEach(r => cur[r.no] = r);
    const keep = new Set(rows.map(r => r.no));
    const gone = S.roster.filter(r => !keep.has(String(r.no)));
    pv.innerHTML = '';
    if (rows.length) pv.append(h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['学籍番号', '氏名', '表示名', ''].map(t => h('th', {}, t)))),
      h('tbody', {}, rows.map(r => h('tr', {}, h('td', {}, r.no), h('td', {}, r.name), h('td', { class: 'mincho' }, `${r.display || surnameOf(r.name)}の〇〇史`),
        h('td', { class: 'small' }, cur[r.no] ? h('span', { class: 'mute' }, '登録ずみ') : h('span', { class: 'ok' }, '新しく追加')))))));
    info.innerHTML = '';
    info.append(h('span', {}, `${rows.length}人`), gone.length ? h('span', { class: 'err', style: { marginLeft: '12px' } }, `名簿から外れる人：${gone.map(r => r.no + ' ' + r.name).join('、')}`) : null);
    err.textContent = errors.join(' ／ ');
    btn.disabled = !rows.length || errors.length > 0;
    return { rows, errors, gone };
  }
  ta.addEventListener('input', () => { dirty = true; preview(); });
  btn.onclick = async () => {
    const { rows, errors, gone } = preview();
    if (errors.length || !rows.length) return;
    const withHist = gone.filter(r => S.histories.some(x => x.studentId === r.id));
    let msg = `${rows.length}人の名簿を登録します。`;
    if (gone.length) msg += `　名簿から外れる人が${gone.length}人います。`;
    if (withHist.length) msg += `　そのうち${withHist.map(r => r.name).join('、')}さんはすでに歴史を登録しています（学籍番号を変えると、その歴史とつながらなくなります）。`;
    if (!await ask(msg + '　よろしいですか？', { ok: '登録する' })) return;
    btn.disabled = true;
    try { await apiPost('setRoster', { rows }); dirty = false; lastKey = null; toast(`${rows.length}人の名簿を登録しました`); await sync(); api.update(true); }
    catch (e) { err.textContent = e.message; }
    btn.disabled = false;
  };
  const api = {
    update(force) {
      if (!force && (dirty || document.activeElement === ta)) return;
      const k = JSON.stringify(S.roster.map(r => [r.no, r.name, r.display]));
      if (k === lastKey && !force) return;
      lastKey = k; ta.value = fromRoster(); preview();
      if (!S.roster.length) det.open = true;
    }
  };
  return api;
}
function renderRoster(box) {
  box.innerHTML = '';
  const tb = h('tbody');
  sortRoster(S.roster).forEach(r => {
    const x = S.histories.find(y => y.studentId === r.id && !y.extra);
    const extras = S.histories.filter(y => y.studentId === r.id && y.extra).length;
    tb.append(h('tr', {},
      h('td', { class: 'small mute' }, r.no),
      h('td', {}, r.name),
      h('td', { class: 'mincho' }, x ? h('a', { href: '#', onclick: e => { e.preventDefault(); openDetail(x.id); } }, x.title) : h('span', { class: 'mute' }, '—'), extras ? h('span', { class: 'badge', style: { marginLeft: '6px' } }, `番外${extras}`) : null),
      h('td', {}, x && x.kind ? h('span', { class: 'ok' }, '✓') : h('span', { class: 'mute' }, '—')),
      h('td', {}, x && Number(x.order) ? `第${kanji(x.order)}話` : ''),
      h('td', {}, x ? h('button', { class: 'btn small ghost', onclick: async () => {
        const nv = await ask(`${r.name} さんのテーマを変更します（〇〇の部分）`, { input: x.theme, ok: '変更する' }); if (nv == null) return;
        try { await apiPost('setTheme', { historyId: x.id, theme: nv, subtitle: x.subtitle }); sync(); } catch (e) { toast(e.message); }
      } }, '変更') : null, x ? h('button', { class: 'btn small ghost', onclick: async () => {
        if (!await ask(`「${x.title}」を削除します（スライドも消えます）。よろしいですか？`)) return;
        try { await apiPost('deleteHistory', { id: x.id }); sync(); } catch (e) { toast(e.message); }
      } }, '削除') : null)));
  });
  box.append(h('h2', {}, '名簿とテーマ'),
    S.roster.length ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['学籍番号', '氏名', 'テーマ', 'スライド', '順番', ''].map(t => h('th', {}, t)))), tb))
      : h('p', { class: 'err' }, '名簿が空です。上の「名簿の登録」に、学籍番号と氏名の一覧を貼りつけてください。'));
}
function renderSettings(box) {
  box.innerHTML = '';
  const st = S.state;
  const talk = h('select', { onchange: () => stageAct({ talkSec: Number(talk.value) }) }, [1, 2, 3, 4, 5, 6, 7, 8, 10].map(m => h('option', { value: m * 60 }, `${m}分`)));
  talk.value = String(st.talkSec || 180);
  const names = h('input', { type: 'checkbox', onchange: () => stageAct({ showNames: names.checked }) }); names.checked = !!st.showNames;
  const tlast = h('input', { type: 'checkbox', onchange: () => stageAct({ teacherLast: tlast.checked }) }); tlast.checked = st.teacherLast !== false;
  const mode = h('div', { class: 'seg' }, [['class', '授業モード'], ['free', '自由モード（授業のあとも歴史実践を続ける）']].map(([k, l]) => h('button', { class: 'seg-b' + (st.mode === k ? ' on' : ''), onclick: async () => { if (k === 'free' && !await ask('自由モードにすると、生徒が番外の歴史を自由に足せるようになります。よろしいですか？')) return; stageAct({ mode: k }); } }, l)));
  const lab = (el, t) => h('label', { class: 'small', style: { display: 'flex', gap: '8px', alignItems: 'center', margin: '8px 0' } }, el, t);
  box.append(h('h2', {}, '設定'),
    h('div', { class: 'grid2' },
      h('div', {}, h('label', { class: 'lab' }, '発表時間（舞台の下にうすく時間の帯が出ます）'), talk,
        lab(names, '舞台・言葉の地層で、言葉を置いた人の名前を表示する'),
        lab(tlast, '先生の歴史を最終話にする（抽選に混ぜない）')),
      h('div', {}, h('label', { class: 'lab' }, 'モード'), mode,
        h('label', { class: 'lab' }, '生徒の画面を確かめる'),
        h('button', { class: 'btn small', onclick: asTest }, 'テスト生徒として生徒画面をひらく'),
        h('p', { class: 'small mute' }, 'テスト生徒の歴史や答えは、舞台や絵巻物には出ません。'))));
}
function buildBgm(box) {
  const file = h('input', { type: 'file', accept: 'audio/*' });
  const name = h('span', { class: 'small' });
  const playBtn = h('button', { class: 'btn small' });
  const showName = () => { name.textContent = BGM.ready ? `♪ ${BGM.name}` : '未設定'; name.className = BGM.ready ? 'small ok' : 'small err'; playBtn.textContent = BGM.playing() ? '■ 止める' : '▶ 試しに流す'; };
  file.onchange = async () => { const f = file.files[0]; if (!f) return; await BGM.load(f); showName(); toast('BGMを設定しました'); };
  playBtn.onclick = () => { if (BGM.playing()) BGM.stop(800); else BGM.start({ duck: false }); setTimeout(showName, 900); };
  const rng = (k, min, max, step, fmt) => { const r = h('input', { type: 'range', min, max, step, value: BGM.cfg[k] }); const v = h('span', { class: 'small mute' }, fmt(BGM.cfg[k])); r.oninput = () => { BGM.cfg[k] = Number(r.value); v.textContent = fmt(BGM.cfg[k]); BGM.saveCfg(); if (BGM.playing() && k !== 'introSec') BGM.audio.volume = BGM.cfg[k]; }; return h('div', { class: 'row' }, h('div', { class: 'grow' }, r), v); };
  const chk = (k, t) => { const c = h('input', { type: 'checkbox', onchange: () => { BGM.cfg[k] = c.checked; BGM.saveCfg(); } }); c.checked = !!BGM.cfg[k]; return h('label', { class: 'small', style: { display: 'flex', gap: '8px', alignItems: 'center', margin: '6px 0' } }, c, t); };
  box.append(h('h2', {}, 'BGM「パリは燃えているか」'),
    h('p', { class: 'lead small' }, '加古隆「パリは燃えているか」の音源ファイル（mp3・m4aなど）を選んでください。曲はこのパソコンのブラウザの中にだけ保存され、次回からは自動で読み込まれます。著作権のため、曲ファイルはGitHubには置かないでください。'),
    h('div', { class: 'row' }, file, name, playBtn),
    h('div', { class: 'grid2', style: { marginTop: '10px' } },
      h('div', {}, h('label', { class: 'lab' }, '開幕のときの音量'), rng('volIntro', 0, 1, 0.05, v => Math.round(v * 100) + '%'),
        h('label', { class: 'lab' }, '語りはじめてからの音量'), rng('volTalk', 0, 1, 0.05, v => Math.round(v * 100) + '%'),
        h('label', { class: 'lab' }, '音量を下げるまでの時間'), rng('introSec', 3, 90, 1, v => v + '秒')),
      h('div', {}, h('label', { class: 'lab' }, '流し方'), chk('fromStart', '毎回、曲のはじめから流す'), chk('keepResp', '「問いの時間」も小さく流しつづける'),
        h('p', { class: 'small mute', style: { lineHeight: '1.7' } }, '舞台で「開幕」すると曲が流れはじめ、決めた秒数がたつと語りのじゃまにならない音量まで下がります。舞台では B キーでBGMの入／切ができます。'))));
  showName();
  setInterval(showName, 3000);
}
function buildData(box) {
  box.append(h('h2', {}, '記録とデータ'),
    h('p', { class: 'lead small' }, '記録集は、すべての「〇〇史」と問い、響いた言葉、みんなの答え、三つの問いへの答えを一冊にまとめたものです。ブラウザの印刷から「PDFに保存」できます。'),
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: printRecord }, '記録集をひらく（印刷・PDF）'),
      h('button', { class: 'btn', onclick: exportJSON }, 'JSONで書き出す'),
      h('button', { class: 'btn ghost small', onclick: async () => { if (!await ask('テスト生徒の歴史・言葉・答えをすべて消します。')) return; try { await apiPost('clearTest'); toast('消しました'); sync(); } catch (e) { toast(e.message); } } }, 'テスト生徒のデータを消す')),
    DEMO ? h('div', { class: 'row', style: { marginTop: '12px' } },
      h('span', { class: 'small mute' }, 'デモ：'),
      h('button', { class: 'btn small ghost', onclick: async () => { if (await ask('デモをサンプル入りの状態に戻します')) { Mock.reset(true); location.reload(); } } }, 'サンプル入りに戻す'),
      h('button', { class: 'btn small ghost', onclick: async () => { if (await ask('デモを空の状態（テーマ未入力）にします')) { Mock.reset(false); location.reload(); } } }, '空の状態から試す')) : null);
}

/* =====================================================================
   先生：舞台（プロジェクタに映す画面）
   ===================================================================== */
Views.stage = {
  label: '舞台', proj: true,
  mount(root) {
    const idle = h('div', { class: 'layer st-idle' }), pres = h('div', { class: 'layer st-present' }), resp = h('div', { class: 'layer st-resp' }), lot = h('div', { class: 'layer lot' }), opening = h('div', { class: 'opening' });
    const stage = h('div', { class: 'stage' }, idle, pres, resp, lot, opening);
    const ctrl = h('div', { class: 'ctrl' });
    root.append(stage, ctrl);
    let last = { stage: null, id: null, lotteryAt: null }, idleKey = null, ctrlKey = null, feedSeen = new Set(), presStart = 0, timerBar = null, cntEl = null, feedEl = null, capEl = null, timers = [];
    const qEls = [];
    const every = (fn, ms) => { const t = setInterval(fn, ms); timers.push(t); return t; };
    function quoteBox() { const el = h('div', { class: 'st-quote' }); qEls.push(el); setQuote(el); return el; }
    function setQuote(el) { const qs = enabledQuotes(); if (!qs.length) return; const q = qs[Math.floor(Math.random() * qs.length)]; el.style.opacity = 0; setTimeout(() => { el.innerHTML = ''; el.append(`「${q.text}」`, h('span', { class: 'who' }, `${q.person}${q.source ? '　' + q.source : ''}`)); el.style.opacity = 1; }, 900); }
    every(() => qEls.forEach(el => el.isConnected && setQuote(el)), 20000);
    every(() => {
      if (!timerBar || !presStart) return;
      const sec = (Date.now() - presStart) / 1000, lim = S.state.talkSec || 180;
      timerBar.style.width = Math.min(100, sec / lim * 100) + '%';
      timerBar.classList.toggle('over', sec > lim);
    }, 1000);
    const cur = () => byId(S.state.currentId);
    function stageName() {
      const st = S.state;
      if ((st.stage === 'present' || st.stage === 'response') && !cur()) return 'idle';
      if (st.stage === 'finale') return 'idle';
      return st.stage || 'idle';
    }
    function primary() {
      const sn = stageName(), c = cur();
      if (sn === 'idle') { const nx = nextHist(); if (nx) openH(nx.id); else if (S.state.orderDecided) go('finale'); }
      else if (sn === 'present') stageAct({ stage: 'response' });
      else if (sn === 'response') stageAct({ stage: 'idle', currentId: '', doneAdd: c && c.id });
      else if (sn === 'lottery') stageAct({ stage: 'idle' });
    }
    function primaryLabel() {
      const sn = stageName();
      if (sn === 'idle') return nextHist() ? '開幕 ▶' : (S.state.orderDecided ? '終章へ ▶' : '—');
      if (sn === 'present') return '問いへ ▶';
      if (sn === 'response') return '語り終える ▶';
      if (sn === 'lottery') return '順番を確認した ▶';
      return '▶';
    }
    function openH(id) { stageAct({ stage: 'present', currentId: id }); }
    function renderCtrl(force) {
      const k = [stageName(), S.state.currentId, (S.state.doneIds || []).length, S.histories.length, BGM.playing(), BGM.ready].join('|');
      if (k === ctrlKey && !force) return; ctrlKey = k;
      if (ctrl.contains(document.activeElement)) return;
      ctrl.innerHTML = '';
      const sel = h('select', { title: '歴史をえらんで開幕' }, h('option', { value: '' }, '歴史をえらんで開幕…'), sortedHistories().map(x => h('option', { value: x.id }, `${(S.state.doneIds || []).includes(x.id) ? '✓ ' : ''}${histNo(x)} ${x.title}`)));
      sel.onchange = () => { if (sel.value) { const v = sel.value; sel.blur(); openH(v); } };
      const sn = stageName();
      ctrl.append(sel,
        sn === 'present' ? h('button', { class: 'btn', onclick: () => stageAct({ stage: 'idle', currentId: '' }) }, '◀ 待機へ') : null,
        sn === 'response' ? h('button', { class: 'btn', onclick: () => stageAct({ stage: 'present' }) }, '◀ スライドへ') : null,
        h('button', { class: 'btn primary', onclick: primary }, primaryLabel()),
        h('span', { class: 'sep' }),
        h('button', { class: 'btn', onclick: () => { BGM.toggle(); setTimeout(() => renderCtrl(true), 1300); } }, BGM.ready ? (BGM.playing() ? '♪ BGMを止める' : '♪ BGMを流す') : '♪ BGM未設定'),
        h('button', { class: 'btn', onclick: toggleFS }, '全画面'));
    }
    function renderIdle() {
      const nx = nextHist();
      const k = [nx && nx.id, nx && nx.updatedAt, S.state.orderDecided, S.histories.length, (S.state.doneIds || []).length, activeComments().length].join('|');
      if (k === idleKey) return; idleKey = k;
      idle.innerHTML = ''; qEls.length = 0;
      const bg = h('div', { class: 'bgtap' });
      idle.append(bg, h('div', { class: 'app' }, `${CFG.APP_TITLE}　${CFG.APP_SUB}`));
      if (!S.state.orderDecided) idle.append(h('div', { class: 'next-l' }, '発表の順番は、まだ決まっていません'), h('div', { class: 'next-t' }, `${mainCount()} / ${S.roster.length}`), h('div', { class: 'next-by' }, '人がテーマを決めました'), h('div', { class: 'hint' }, '全員がそろったら、準備タブから抽選します'));
      else if (nx) idle.append(h('div', { class: 'next-l' }, 'つぎの歴史'), h('div', { class: 'next-no' }, histNo(nx)), h('div', { class: 'next-t' }, titleEl(nx)), h('div', { class: 'next-by' }, `語り手　${nx.name}`), h('div', { class: 'hint' }, 'Space で開幕'));
      else idle.append(h('div', { class: 'next-l' }, 'すべての歴史が語られました'), h('div', { class: 'next-t' }, '終章へ'), h('div', { class: 'hint' }, 'Space で終章へ'));
      idle.append(quoteBox());
      requestAnimationFrame(() => { const w = h('div', { class: 'scroll-wrap' }); bg.append(w); renderScroll(w, { fit: true, height: Math.round(innerHeight * 0.42) }); });
    }
    function buildPresent(c) {
      pres.innerHTML = '';
      timerBar = h('div', { class: 'st-timer', style: { width: '0%' } });
      cntEl = h('span', { class: 'cnt' });
      pres.append(h('div', { class: 'fit' }, slideEl(c, { full: true })), timerBar,
        h('div', { class: 'st-foot' }, h('span', { class: 'no' }, histNo(c)), h('span', { class: 't' }, titleEl(c)), h('span', { class: 'cnt' }, `語り手　${c.name}`), cntEl));
      updateCount();
    }
    function updateCount() { const c = cur(); if (!cntEl || !c) return; cntEl.innerHTML = ''; cntEl.append('届いた答え', h('b', {}, commentsFor(c.id, true).length)); }
    function buildResp(c) {
      resp.innerHTML = ''; qEls.length = 0;
      feedSeen = new Set(); feedEl = h('div', { class: 'feed' }); capEl = h('div', { class: 'cap' });
      const q = c.question || '（問いはまだ出されていません）';
      const qDelay = 0.4 + q.length * 0.07;
      resp.append(
        h('div', { class: 'left' },
          h('div', { class: 'no' }, histNo(c) + '　問いの時間'),
          h('div', { class: 't' }, titleEl(c), h('span', { class: 'by' }, `語り手　${c.name}`)),
          h('div', { class: 'qwrap' },
            h('div', { class: 'ql' }, `${askerOf(c)}から、みんなへの問い`),
            h('div', { class: 'qbig' }, [...q].map((ch, i) => h('span', { style: { animationDelay: (0.4 + i * 0.07).toFixed(2) + 's' } }, ch))),
            c.qText ? h('div', { class: 'squote', style: { animationDelay: (qDelay + 1.2).toFixed(2) + 's' } },
              h('div', { class: 'sql' }, 'この問いに響く言葉'), `「${c.qText}」`,
              h('span', { class: 'who' }, `—— ${c.qPerson}${c.qSource ? '　' + c.qSource : ''}`),
              c.qReason ? h('span', { class: 'why' }, c.qReason) : null) : null)),
        h('div', { class: 'right' }, capEl, feedEl));
      commentsFor(c.id, true).forEach(x => feedSeen.add(x.id));
      updateFeed(true);
    }
    function updateFeed(initial) {
      const c = cur(); if (!c || !feedEl) return;
      const all = commentsFor(c.id, true), list = all.slice(0, 16);
      capEl.innerHTML = ''; capEl.append('この問いに届いた答え', h('b', {}, all.length));
      feedEl.innerHTML = '';
      if (!list.length) feedEl.append(h('div', { class: 'fd' }, h('span', { class: 'k' }, 'まだ答えは届いていません'), 'あなたの端末の「いま」から、この問いに答えてください。'));
      list.forEach(x => {
        const isNew = !feedSeen.has(x.id) && !initial; feedSeen.add(x.id);
        const other = x.linkTo ? byId(x.historyId === c.id ? x.linkTo : x.historyId) : null;
        const k = [other ? (x.linkTo === c.id ? `〰 ${other.title}の問いへの答えから` : `〰 ${other.title}とつながる`) : '', S.state.showNames ? x.author : ''].filter(Boolean).join('　');
        feedEl.append(h('div', { class: 'fd' + (isNew ? ' new' : '') + (other ? ' t-糸' : '') }, k ? h('span', { class: 'k' }, k) : null, x.body));
      });
    }
    function update() {
      const sn = stageName(), c = cur();
      const changed = sn !== last.stage || (c && c.id) !== last.id || S.state.lotteryAt !== last.lotteryAt;
      if (changed) {
        const prev = last.stage;
        [idle, pres, resp, lot].forEach(l => l.classList.remove('on'));
        ({ idle, present: pres, response: resp, lottery: lot })[sn].classList.add('on');
        if (sn === 'present') {
          if (prev !== 'present' || c.id !== last.id) { buildPresent(c); if (prev !== null && prev !== 'response') { presStart = Date.now(); playOpening(opening, c); BGM.start(); } else if (!presStart) presStart = Date.now(); }
        } else { timerBar = null; }
        if (sn !== 'present' && sn !== 'response') presStart = 0;
        if (sn === 'response') { buildResp(c); if (BGM.cfg.keepResp) BGM.duck(); else BGM.stop(); }
        if (sn === 'idle') { idleKey = null; if (prev === 'present' || prev === 'response') BGM.stop(); }
        if (sn === 'lottery') {
          const fresh = S.state.lotteryAt && S.lotteryPlayed !== S.state.lotteryAt && Math.abs(Date.now() - S.state.lotteryAt) < 120000;
          playLottery(lot, !!fresh); S.lotteryPlayed = S.state.lotteryAt;
        }
        last = { stage: sn, id: c && c.id, lotteryAt: S.state.lotteryAt };
      }
      if (sn === 'idle') renderIdle();
      if (sn === 'present') updateCount();
      if (sn === 'response') updateFeed(false);
      renderCtrl();
    }
    function onKey(e) {
      if (S.modals.length) return;
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); if (opening.classList.contains('show')) { opening.classList.remove('show'); return; } primary(); }
      else if (e.key === 'b' || e.key === 'B') { BGM.toggle(); setTimeout(() => renderCtrl(true), 1300); }
      else if (e.key === 'f' || e.key === 'F') toggleFS();
    }
    let peekT; const onMove = () => { ctrl.classList.add('peek'); clearTimeout(peekT); peekT = setTimeout(() => ctrl.classList.remove('peek'), 2200); };
    document.addEventListener('keydown', onKey); document.addEventListener('mousemove', onMove);
    return {
      update,
      unmount() { document.removeEventListener('keydown', onKey); document.removeEventListener('mousemove', onMove); timers.forEach(clearInterval); clearTimeout(S.lotTimer); clearTimeout(S.opTimer); }
    };
  }
};
function playOpening(ov, x) {
  ov.innerHTML = '';
  const theme = `${x.theme}史`, base = 1.5;
  ov.append(
    h('div', { class: 'op-no' }, histNo(x)),
    h('div', { class: 'op-who' }, `${x.display}の`),
    h('div', { class: 'op-title' }, [...theme].map((ch, i) => h('span', { style: { animationDelay: (base + i * 0.16).toFixed(2) + 's' } }, ch))),
    x.subtitle ? h('div', { class: 'op-sub', style: { animationDelay: (base + theme.length * 0.16 + 0.6).toFixed(2) + 's' } }, x.subtitle) : null,
    h('div', { class: 'op-by', style: { animationDelay: (base + theme.length * 0.16 + 1.2).toFixed(2) + 's' } }, `語り手　${x.name}`));
  void ov.offsetWidth;
  ov.classList.add('show');
  clearTimeout(S.opTimer);
  S.opTimer = setTimeout(() => ov.classList.remove('show'), Math.max(7500, (base + theme.length * 0.16 + 4.5) * 1000));
  ov.onclick = () => ov.classList.remove('show');
}
function playLottery(layer, animate) {
  clearTimeout(S.lotTimer); clearInterval(S.lotScatter);
  layer.innerHTML = '';
  const hs = sortedHistories().filter(x => Number(x.order));
  const board = h('div', { class: 'lot-board' });
  layer.append(h('div', { class: 'ttl' }, '発表の順番'), board);
  const n = hs.length, cols = n > 12 ? 4 : n > 6 ? 3 : 2, rows = Math.max(1, Math.ceil(n / cols));
  const cards = hs.map(x => { const c = h('div', { class: 'lcard' }, h('span', { class: 'n' }, histNo(x)), h('span', { class: 't' }, x.title)); c.style.width = (100 / cols - 1.4) + '%'; board.append(c); return c; });
  const place = (c, i) => { c.style.left = ((i % cols) * (100 / cols) + 0.7) + '%'; c.style.top = (Math.floor(i / cols) * (96 / rows)) + '%'; c.style.transform = 'none'; c.classList.add('fixed'); };
  if (!animate) { cards.forEach(place); return; }
  const scatter = () => cards.forEach(c => { if (c.classList.contains('fixed')) return; c.style.left = (Math.random() * (100 - 100 / cols)) + '%'; c.style.top = (Math.random() * 88) + '%'; c.style.transform = `rotate(${(Math.random() * 14 - 7).toFixed(1)}deg)`; });
  scatter(); S.lotScatter = setInterval(scatter, 450);
  let k = 0;
  S.lotTimer = setTimeout(function step() {
    if (k === 0) { clearInterval(S.lotScatter); }
    if (k >= cards.length) return;
    place(cards[k], k); k++;
    S.lotTimer = setTimeout(step, 700);
  }, 3600);
}
function toggleFS() { if (!document.fullscreenElement) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => { }); else document.exitFullscreen && document.exitFullscreen(); }

/* =====================================================================
   先生：終章
   ===================================================================== */
Views.finale = {
  label: '終章', proj: true,
  mount(root) {
    const fin = h('div', { class: 'finale' });
    const ctrl = h('div', { class: 'ctrl' });
    root.append(fin, h('div', { class: 'fin-hint' }, '→ / Space：すすむ　← ：もどる　B：BGM'), ctrl);
    let shown = null, curEl = null, ansSeen = new Set();
    const timers = [];
    const clearTimers = () => { timers.forEach(clearTimeout); timers.length = 0; };
    const N = () => sortedHistories().filter(x => !x.extra).length;
    const inFinale = () => S.state.stage === 'finale';
    const stepId = () => FIN_STEPS[S.state.finaleStep || 0];
    const skipAI = () => !S.aiEnabled && !S.finaleText;
    function go2(i) {
      if (i < 0) return;
      if (i >= FIN_STEPS.length) return;
      if (FIN_STEPS[i] === 'ai' && skipAI()) i += (i > (S.state.finaleStep || 0) ? 1 : -1);
      stageAct({ stage: 'finale', finaleStep: i });
    }
    function start() { BGM.start({ duck: false }); stageAct({ stage: 'finale', finaleStep: 0 }); }
    function render(id) {
      const el = h('div', { class: 'fin-step' });
      ansSeen = new Set();
      if (id === 'cover') {
        el.append(h('div', { class: 'fin-line', style: { animationDelay: '.2s' } }, '終章'), h('div', { class: 'fin-cap', style: { animationDelay: '1s', opacity: 1 } }, 'Space で終章をはじめる（BGMが流れます）'));
      } else if (id === 'intro') {
        const nAns = activeComments().length;
        const lines = [`${taleCount()}が語られた。`, 'ひとつの歴史には、ひとつの問いがあった。', `問いに置かれた答えは、${nAns}になった。`, '答えは織り目になり、糸は結ばれ、', 'いま、一枚の織物になる。'];
        lines.forEach((t, i) => el.append(h('div', { class: 'fin-line', style: { animationDelay: (0.6 + i * 2.2) + 's' } }, t)));
      } else if (id === 'gauguin') {
        el.append(h('div', { class: 'fin-line', style: { animationDelay: '.3s', fontSize: 'clamp(16px,1.7vw,30px)' } }, '1897年から98年にかけて、タヒチ。ゴーギャンは一枚の絵に、三つの問いを書きこんだ。'),
          h('figure', { class: 'fin-art' }, gauguinImg()),
          h('div', { class: 'fin-three sm' }, BIG_QS.map((q, i) => h('div', { style: { animationDelay: (4.2 + i * 1.5) + 's' } }, q))),
          h('div', { class: 'fin-cap' }, GAUGUIN_CAP));
      } else if (id === 'weave') {
        const box = h('div', { class: 'fin-scroll' });
        const cap = h('div', { class: 'fin-cap2' }, `${taleCount()}が、一枚の織物になった。`, h('small', {}, `${CFG.APP_TITLE}　${CFG.APP_SUB}`));
        el.append(box, cap);
        requestAnimationFrame(() => playScrollFinale(box, cap, timers));
      } else if (id === 'q1' || id === 'q2' || id === 'q3') {
        const q = Number(id[1]);
        const box = h('div', { class: 'fin-ans' });
        el.append(h('div', { class: 'fin-qno' }, `問い ${kanji(q)}`), h('div', { class: 'fin-q' }, BIG_QS[q - 1]), box);
        el._ans = { box, q };
        fillAnswers(el, true);
      } else if (id === 'ai') {
        if (S.finaleText) el.append(h('div', { class: 'fin-ai' }, S.finaleText));
        else {
          const b = h('button', { class: 'btn primary', onclick: async () => { b.disabled = true; b.textContent = 'みんなの言葉を紡いでいます…'; try { await apiPost('aiFinale'); await sync(); shown = null; update(); } catch (e) { toast(e.message); b.disabled = false; b.textContent = 'もう一度'; } } }, 'みんなの言葉から、終章の語りを紡ぐ（AI）');
          el.append(h('div', { class: 'fin-line', style: { opacity: 1 } }, 'みんなの言葉から'), h('p', { class: 'mute' }, '一人ひとりの「〇〇史」と問い、置かれた答えだけを材料に、AIが短い語りを紡ぎます。'), b);
        }
      } else if (id === 'end') {
        const bg = h('div', { class: 'fin-bg' }), w = h('div', { class: 'scroll-wrap' }); bg.append(w);
        requestAnimationFrame(() => renderScroll(w, { fit: true, height: innerHeight * 0.3, allDone: true }));
        el.append(bg, h('div', { class: 'fin-line', style: { animationDelay: '.4s' } }, `${CFG.APP_TITLE}は、ここから続く。`),
          h('div', { class: 'fin-line', style: { animationDelay: '2.4s', fontStyle: 'italic', color: 'var(--ember2)', fontWeight: 800, fontSize: 'clamp(30px,4.4vw,84px)' } }, 'Doing History'),
          h('div', { class: 'fin-cap' }, 'このアプリは、授業が終わってもひらいています。', h('br'), location.href.split(/[?#]/)[0]));
      }
      return el;
    }
    function fillAnswers(el, initial) {
      if (!el || !el._ans) return;
      const list = activeAnswers(el._ans.q);
      let k = 0;
      list.forEach(a => {
        if (ansSeen.has(a.id)) return; ansSeen.add(a.id);
        const d = h('div', { class: 'a' + (initial ? '' : ' new'), style: { animationDelay: initial ? (1.6 + (k++) * 0.35).toFixed(2) + 's' : '0s' } }, a.body);
        el._ans.box.prepend(d);
      });
    }
    function renderCtrl() {
      if (ctrl.contains(document.activeElement)) return;
      ctrl.innerHTML = '';
      if (!inFinale()) { ctrl.append(h('button', { class: 'btn primary', onclick: start }, '終章をはじめる ▶')); return; }
      const i = S.state.finaleStep || 0;
      ctrl.append(h('span', { class: 'small mute' }, `${i + 1} / ${FIN_STEPS.length}`),
        h('button', { class: 'btn', onclick: () => go2(i - 1) }, '◀'),
        h('button', { class: 'btn primary', onclick: () => go2(i + 1) }, '▶'),
        h('span', { class: 'sep' }),
        h('button', { class: 'btn', onclick: () => BGM.toggle() }, '♪ BGM'),
        h('button', { class: 'btn', onclick: toggleFS }, '全画面'),
        h('button', { class: 'btn ghost', onclick: async () => { if (!await ask('終章を閉じて待機に戻します')) return; BGM.stop(); stageAct({ stage: 'idle', finaleStep: 0 }); } }, '終章を閉じる'));
    }
    function update() {
      const id = inFinale() ? stepId() : 'cover';
      const key = id + '|' + (id === 'ai' ? S.finaleText.length : '');
      if (key !== shown) {
        shown = key; clearTimers();
        const old = curEl; curEl = render(id); fin.append(curEl);
        requestAnimationFrame(() => requestAnimationFrame(() => curEl.classList.add('on')));
        if (old) { old.classList.remove('on'); setTimeout(() => old.remove(), 1700); }
      } else fillAnswers(curEl, false);
      renderCtrl();
    }
    function onKey(e) {
      if (S.modals.length) return;
      if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) return;
      const i = S.state.finaleStep || 0;
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); if (!inFinale()) start(); else go2(i + 1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { if (inFinale()) go2(i - 1); }
      else if (e.key === 'b' || e.key === 'B') BGM.toggle();
      else if (e.key === 'f' || e.key === 'F') toggleFS();
    }
    let peekT; const onMove = () => { ctrl.classList.add('peek'); clearTimeout(peekT); peekT = setTimeout(() => ctrl.classList.remove('peek'), 2200); };
    document.addEventListener('keydown', onKey); document.addEventListener('mousemove', onMove);
    return { update, unmount() { clearTimers(); document.removeEventListener('keydown', onKey); document.removeEventListener('mousemove', onMove); } };
  }
};

/* =====================================================================
   記録集（印刷・PDF）と書き出し
   ===================================================================== */
function printRecord() {
  const hs = sortedHistories();
  const e = esc;
  const sec = hs.map(x => {
    const cs = commentsFor(x.id, true).slice().reverse();
    const t = x.text || {};
    const pic = x.kind === 'image' ? `<img src="${e(x.imgUrl || x.thumb)}" class="sl">` : x.kind === 'text' ? `<div class="tx"><div class="era">${e(t.era || '')}</div><div>${(t.keywords || []).filter(Boolean).map(k => `<span class="kw">${e(k)}</span>`).join('')}</div><p>${e(t.body || '')}</p></div>` : '<p class="mute">（スライドなし）</p>';
    const q = x.question ? `<div class="qq"><span class="lb">みんなへの問い</span>${e(x.question)}</div>` : '';
    const qt = x.qText ? `<div class="qt">「${e(x.qText)}」—— ${e(x.qPerson)}${x.qSource ? '　' + e(x.qSource) : ''}</div>` : '';
    const li = cs.map(c => `<li>${c.linkTo ? `<span class="ty">〰 ${e((byId(c.historyId === x.id ? c.linkTo : c.historyId) || {}).title || '')}</span>` : ''}${e(c.body)}<span class="by">${e(c.author)}</span></li>`).join('');
    return `<section><div class="no">${e(histNo(x))}</div><h2>${e(x.title)}</h2>${x.subtitle ? `<p class="sub">${e(x.subtitle)}</p>` : ''}<p class="by2">語り手　${e(x.name)}</p>${pic}${q}${qt}<ul>${li || '<li class="mute">答えはありません</li>'}</ul></section>`;
  }).join('');
  const ans = BIG_QS.map((q, i) => `<section><h2>${e(q)}</h2><ul>${activeAnswers(i + 1).map(a => `<li>${e(a.body)}<span class="by">${e(a.author)}</span></li>`).join('') || '<li class="mute">答えはありません</li>'}</ul></section>`).join('');
  const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>記録集　${e(CFG.APP_TITLE)}</title><style>
  body{font-family:"Hiragino Mincho ProN","Yu Mincho",serif;color:#1a1714;margin:0;padding:24px 34px;line-height:1.75}
  .cover{text-align:center;padding:30vh 0 20vh;page-break-after:always}.cover h1{font-size:40px;letter-spacing:.14em;margin:0}.cover .s{font-size:18px;color:#b2452c;margin-top:10px;letter-spacing:.1em}.cover p{letter-spacing:.3em;color:#555}
  section{page-break-inside:avoid;border-top:1px solid #ccc;padding:14px 0 10px}h2{font-size:22px;margin:2px 0}.no{color:#9a7a45;letter-spacing:.3em;font-size:12px}.sub{margin:2px 0;color:#555}.by2{font-size:12px;color:#777;margin:2px 0 8px}
  .sl{max-width:420px;border:1px solid #ddd}.tx{border:1px solid #ddd;padding:10px 14px;max-width:560px;font-size:13px}.era{color:#9a7a45}.kw{border:1px solid #c9a46a;border-radius:4px;padding:0 6px;margin-right:6px;font-size:12px}
  .qq{font-weight:bold;font-size:16px;margin:10px 0 2px}.qq .lb{font-size:10px;border:1px solid #b2452c;color:#b2452c;border-radius:3px;padding:0 5px;margin-right:8px;vertical-align:middle}.qt{font-size:13px;color:#555;margin:2px 0 6px}
  ul{padding-left:18px;font-size:13px}li{margin:3px 0}.ty{font-size:11px;color:#5a7a95;margin-right:6px}.by{font-size:10px;color:#888;margin-left:8px}.mute{color:#999}
  .part{page-break-before:always;font-size:26px;letter-spacing:.2em;text-align:center;margin:20px 0}
  </style></head><body><div class="cover"><h1>${e(CFG.APP_TITLE)}</h1><div class="s">${e(CFG.APP_SUB)}</div><p style="margin-top:40px">${BIG_QS.map(e).join('<br>')}</p><p style="margin-top:30px;font-size:12px">${new Date().toLocaleDateString('ja-JP')}</p></div>${sec}<div class="part">三つの問い</div>${ans}<script>setTimeout(()=>print(),600)<\/script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) { toast('ポップアップがブロックされました。許可してからもう一度。'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}
function exportJSON() {
  const data = { exportedAt: new Date().toISOString(), histories: S.histories.map(x => Object.assign({}, x, { thumb: undefined })), comments: S.comments, answers: S.answers, state: S.state };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `watashitachi-no-rekishi-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
}

/* =====================================================================
   起動
   ===================================================================== */
async function boot() {
  document.title = CFG.APP_TITLE + CFG.APP_SUB;
  try {
    const r = await apiGet('init');
    S.roster = r.roster || []; S.needCode = !!r.needCode; S.aiEnabled = !!r.aiEnabled;
    S.state = Object.assign({}, DEFAULT_STATE, r.state || {});
    if (r.teacherName) CFG.TEACHER_NAME = r.teacherName;
  } catch (e) {
    $('#app').innerHTML = '';
    $('#app').append(h('div', { class: 'login' }, h('p', { class: 't2' }, CFG.APP_TITLE), h('section', { class: 'card' }, h('p', { class: 'err' }, 'サーバーにつながりませんでした。'), h('p', { class: 'small mute' }, String(e.message || e)), h('button', { class: 'btn', onclick: () => location.reload() }, 'もう一度'))));
    return;
  }
  const saved = SESS.get();
  if (saved && saved.token) { Object.assign(S, saved); enterApp(); }
  else renderLogin();
}
boot();
