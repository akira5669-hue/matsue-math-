// アバター作成パーツ v2（可愛さ・カッコよさを底上げ: 大きめの目+ハイライト、
// ほお赤らめ、耳、髪のツヤ、輪郭線、丸みのある襟付き服）
const AVATAR_HAIR = [
  {
    "id": "short",
    "name": "ショート",
    "d": "<path d=\"M22,38 Q22,10 50,10 Q78,10 78,38 Q78,24 50,24 Q22,24 22,38 Z\"/>"
  },
  {
    "id": "long",
    "name": "ロング",
    "d": "<path d=\"M20,42 Q18,10 50,10 Q82,10 80,42 L80,72 Q74,60 74,42 Q74,24 50,24 Q26,24 26,42 Q26,60 20,72 Z\"/>"
  },
  {
    "id": "twintails",
    "name": "ツインテール",
    "d": "<path d=\"M22,36 Q22,10 50,10 Q78,10 78,36 Q78,22 50,22 Q22,22 22,36 Z\"/><circle cx=\"18\" cy=\"46\" r=\"7\"/><circle cx=\"82\" cy=\"46\" r=\"7\"/>"
  },
  {
    "id": "curly",
    "name": "パーマ",
    "d": "<path d=\"M22,40 Q20,10 50,10 Q80,10 78,40 Q75,32 71,38 Q68,28 63,36 Q60,26 55,35 Q50,25 45,35 Q40,26 37,36 Q32,28 29,38 Q25,32 22,40 Z\"/>"
  },
  {
    "id": "buzz",
    "name": "ぼうず",
    "d": "<path d=\"M24,32 Q24,14 50,14 Q76,14 76,32 Q76,24 50,24 Q24,24 24,32 Z\"/>"
  },
  {
    "id": "bangs",
    "name": "ぱっつん",
    "d": "<path d=\"M22,36 Q22,10 50,10 Q78,10 78,36 Q78,22 50,22 Q22,22 22,36 Z\"/><path d=\"M24,34 L76,34 L76,42 Q50,38 24,42 Z\"/>"
  }
];

const AVATAR_FACE = [
  {
    "id": "smile",
    "name": "にっこり",
    "d": "<g><circle cx=\"39\" cy=\"40\" r=\"4.4\" fill=\"#2b2b2b\"/><circle cx=\"61\" cy=\"40\" r=\"4.4\" fill=\"#2b2b2b\"/><circle cx=\"40.8\" cy=\"38.2\" r=\"1.3\" fill=\"#fff\"/><circle cx=\"62.8\" cy=\"38.2\" r=\"1.3\" fill=\"#fff\"/><path d=\"M40,50 Q50,58 60,50\" stroke=\"#2b2b2b\" stroke-width=\"2.4\" stroke-linecap=\"round\" fill=\"none\"/></g>"
  },
  {
    "id": "surprised",
    "name": "びっくり",
    "d": "<g fill=\"#2b2b2b\"><circle cx=\"39\" cy=\"40\" r=\"4.6\"/><circle cx=\"61\" cy=\"40\" r=\"4.6\"/><circle cx=\"40.8\" cy=\"38.2\" r=\"1.3\" fill=\"#fff\"/><circle cx=\"62.8\" cy=\"38.2\" r=\"1.3\" fill=\"#fff\"/><ellipse cx=\"50\" cy=\"53\" rx=\"5\" ry=\"6.5\"/></g>"
  },
  {
    "id": "laughing",
    "name": "わらい",
    "d": "<g stroke=\"#2b2b2b\" stroke-width=\"2.4\" stroke-linecap=\"round\" fill=\"none\"><path d=\"M35,38 Q39,33 43,38\"/><path d=\"M57,38 Q61,33 65,38\"/></g><path d=\"M37,48 Q50,62 63,48 Q50,56 37,48 Z\" fill=\"#2b2b2b\"/><path d=\"M43,49 Q50,54 57,49 Q50,52.5 43,49 Z\" fill=\"#ff8f8f\" opacity=\"0.85\"/>"
  },
  {
    "id": "cool",
    "name": "クール",
    "d": "<g stroke=\"#2b2b2b\" stroke-width=\"2.6\" stroke-linecap=\"round\"><line x1=\"34\" y1=\"39\" x2=\"46\" y2=\"39\"/><line x1=\"54\" y1=\"39\" x2=\"66\" y2=\"39\"/><line x1=\"43\" y1=\"53\" x2=\"57\" y2=\"53\"/></g>"
  },
  {
    "id": "wink",
    "name": "ウインク",
    "d": "<path d=\"M35,40 Q39,34 43,40\" stroke=\"#2b2b2b\" stroke-width=\"2.4\" stroke-linecap=\"round\" fill=\"none\"/><circle cx=\"61\" cy=\"40\" r=\"4.4\" fill=\"#2b2b2b\"/><circle cx=\"62.8\" cy=\"38.2\" r=\"1.3\" fill=\"#fff\"/><path d=\"M40,50 Q50,58 60,50\" stroke=\"#2b2b2b\" stroke-width=\"2.4\" stroke-linecap=\"round\" fill=\"none\"/><path d=\"M67,35 L71,38 M70,33 L73,37.5 M72.5,32.5 L75,38\" stroke=\"#ffb3c6\" stroke-width=\"1.6\" stroke-linecap=\"round\"/>"
  },
  {
    "id": "sleepy",
    "name": "ねむい",
    "d": "<g stroke=\"#2b2b2b\" stroke-width=\"2.2\" stroke-linecap=\"round\"><path d=\"M34,41 Q39,37 44,41\" fill=\"none\"/><path d=\"M56,41 Q61,37 66,41\" fill=\"none\"/></g><line x1=\"45\" y1=\"53\" x2=\"55\" y2=\"53\" stroke=\"#2b2b2b\" stroke-width=\"2.2\" stroke-linecap=\"round\"/>"
  }
];

const AVATAR_SKIN_COLORS = [
  { "id": "skin1", "name": "ライト", "hex": "#ffe0bd" },
  { "id": "skin2", "name": "ベージュ", "hex": "#f1c27d" },
  { "id": "skin3", "name": "ブラウン", "hex": "#c68642" },
  { "id": "skin4", "name": "ダークブラウン", "hex": "#8d5524" }
];

const AVATAR_HAIR_COLORS = [
  { "id": "hc1", "name": "ブラック", "hex": "#2b2b2b" },
  { "id": "hc2", "name": "ブラウン", "hex": "#7a4a2b" },
  { "id": "hc3", "name": "ゴールド", "hex": "#e0b84a" },
  { "id": "hc4", "name": "レッド", "hex": "#c0392b" },
  { "id": "hc5", "name": "ブルー", "hex": "#3d5a9e" },
  { "id": "hc6", "name": "ピンク", "hex": "#e0729e" }
];

const AVATAR_OUTFIT_COLORS = [
  { "id": "oc1", "name": "レッド", "hex": "#e05a4e" },
  { "id": "oc2", "name": "ブルー", "hex": "#4a7fc9" },
  { "id": "oc3", "name": "グリーン", "hex": "#4caf7d" },
  { "id": "oc4", "name": "イエロー", "hex": "#e0c23e" },
  { "id": "oc5", "name": "パープル", "hex": "#9b6fc9" },
  { "id": "oc6", "name": "ピンク", "hex": "#e07ba8" }
];

function avatarClampHex_(v) { return Math.max(0, Math.min(255, Math.round(v))); }
function avatarHexToRgb_(hex) {
  var c = hex.replace('#', '');
  return [parseInt(c.substring(0, 2), 16), parseInt(c.substring(2, 4), 16), parseInt(c.substring(4, 6), 16)];
}
function avatarRgbToHex_(r, g, b) {
  return '#' + [r, g, b].map(function (v) { return avatarClampHex_(v).toString(16).padStart(2, '0'); }).join('');
}
function avatarLighten(hex, amt) {
  var rgb = avatarHexToRgb_(hex);
  return avatarRgbToHex_(rgb[0] + (255 - rgb[0]) * amt, rgb[1] + (255 - rgb[1]) * amt, rgb[2] + (255 - rgb[2]) * amt);
}
function avatarDarken(hex, amt) {
  var rgb = avatarHexToRgb_(hex);
  return avatarRgbToHex_(rgb[0] * (1 - amt), rgb[1] * (1 - amt), rgb[2] * (1 - amt));
}

function buildAvatarSvg(sel) {
  var hair = AVATAR_HAIR.find(function (h) { return h.id === sel.hair; }) || AVATAR_HAIR[0];
  var face = AVATAR_FACE.find(function (f) { return f.id === sel.face; }) || AVATAR_FACE[0];
  var skin = AVATAR_SKIN_COLORS.find(function (c) { return c.id === sel.skin; }) || AVATAR_SKIN_COLORS[0];
  var hairColor = AVATAR_HAIR_COLORS.find(function (c) { return c.id === sel.hairColor; }) || AVATAR_HAIR_COLORS[0];
  var outfitColor = AVATAR_OUTFIT_COLORS.find(function (c) { return c.id === sel.outfitColor; }) || AVATAR_OUTFIT_COLORS[0];

  var hairOutline = avatarDarken(hairColor.hex, 0.35);
  var hairShine = avatarLighten(hairColor.hex, 0.5);
  var skinOutline = avatarDarken(skin.hex, 0.25);
  var outfitOutline = avatarDarken(outfitColor.hex, 0.3);
  var collarShade = avatarLighten(outfitColor.hex, 0.35);

  var hairSvg = hair.d.replace(/<(path|circle)(?![^>]*fill)/g, '<$1 fill="' + hairColor.hex + '" stroke="' + hairOutline + '" stroke-width="1.4" stroke-linejoin="round"');
  var hairShineSvg = '<path d="M31,19 Q50,9 69,19" stroke="' + hairShine + '" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.6"/>';

  var earsSvg = '<ellipse cx="21" cy="45" rx="5" ry="7" fill="' + skin.hex + '" stroke="' + skinOutline + '" stroke-width="1.4"/>'
    + '<ellipse cx="79" cy="45" rx="5" ry="7" fill="' + skin.hex + '" stroke="' + skinOutline + '" stroke-width="1.4"/>';

  var blushSvg = '<ellipse cx="33" cy="48" rx="6" ry="3.6" fill="#ff9d9d" opacity="0.45"/>'
    + '<ellipse cx="67" cy="48" rx="6" ry="3.6" fill="#ff9d9d" opacity="0.45"/>';

  var bodySvg = '<path d="M14,120 Q13,86 32,82 Q41,90 50,90 Q59,90 68,82 Q87,86 86,120 Z" fill="' + outfitColor.hex + '" stroke="' + outfitOutline + '" stroke-width="1.6" stroke-linejoin="round"/>'
    + '<path d="M42,84 Q50,92 58,84 L54,80 Q50,84 46,80 Z" fill="' + collarShade + '"/>';

  return '<svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg">'
    + bodySvg
    + '<circle cx="50" cy="42" r="26" fill="' + skin.hex + '" stroke="' + skinOutline + '" stroke-width="1.6"/>'
    + earsSvg
    + blushSvg
    + face.d
    + hairSvg
    + hairShineSvg
    + '</svg>';
}
