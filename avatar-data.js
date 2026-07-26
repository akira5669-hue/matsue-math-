// アバター作成パーツ（小さなSVG断片 + カラースウォッチのみで構成し、
// 画像アセットを増やさず軽量に多くの組み合わせを実現している）
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
    "d": "<g stroke=\"#2b2b2b\" stroke-width=\"2.2\" stroke-linecap=\"round\" fill=\"none\"><path d=\"M38,40 Q40,36 42,40\"/><path d=\"M58,40 Q60,36 62,40\"/><path d=\"M40,50 Q50,58 60,50\"/></g>"
  },
  {
    "id": "surprised",
    "name": "びっくり",
    "d": "<g fill=\"#2b2b2b\"><circle cx=\"40\" cy=\"40\" r=\"3.2\"/><circle cx=\"60\" cy=\"40\" r=\"3.2\"/><ellipse cx=\"50\" cy=\"52\" rx=\"5\" ry=\"6\"/></g>"
  },
  {
    "id": "laughing",
    "name": "わらい",
    "d": "<g stroke=\"#2b2b2b\" stroke-width=\"2.2\" stroke-linecap=\"round\" fill=\"none\"><path d=\"M36,38 Q40,34 44,38\"/><path d=\"M56,38 Q60,34 64,38\"/></g><path d=\"M38,48 Q50,60 62,48 Q50,55 38,48 Z\" fill=\"#2b2b2b\"/>"
  },
  {
    "id": "cool",
    "name": "クール",
    "d": "<g stroke=\"#2b2b2b\" stroke-width=\"2.4\" stroke-linecap=\"round\"><line x1=\"36\" y1=\"39\" x2=\"45\" y2=\"39\"/><line x1=\"55\" y1=\"39\" x2=\"64\" y2=\"39\"/><line x1=\"44\" y1=\"52\" x2=\"56\" y2=\"52\"/></g>"
  },
  {
    "id": "wink",
    "name": "ウインク",
    "d": "<path d=\"M36,40 Q40,36 44,40\" stroke=\"#2b2b2b\" stroke-width=\"2.2\" stroke-linecap=\"round\" fill=\"none\"/><circle cx=\"60\" cy=\"40\" r=\"3\" fill=\"#2b2b2b\"/><path d=\"M40,50 Q50,57 60,50\" stroke=\"#2b2b2b\" stroke-width=\"2.2\" stroke-linecap=\"round\" fill=\"none\"/>"
  },
  {
    "id": "sleepy",
    "name": "ねむい",
    "d": "<g stroke=\"#2b2b2b\" stroke-width=\"2\" stroke-linecap=\"round\"><line x1=\"36\" y1=\"40\" x2=\"44\" y2=\"40\"/><line x1=\"56\" y1=\"40\" x2=\"64\" y2=\"40\"/></g><line x1=\"46\" y1=\"52\" x2=\"54\" y2=\"52\" stroke=\"#2b2b2b\" stroke-width=\"2\" stroke-linecap=\"round\"/>"
  }
];

const AVATAR_SKIN_COLORS = [
  {
    "id": "skin1",
    "name": "ライト",
    "hex": "#ffe0bd"
  },
  {
    "id": "skin2",
    "name": "ベージュ",
    "hex": "#f1c27d"
  },
  {
    "id": "skin3",
    "name": "ブラウン",
    "hex": "#c68642"
  },
  {
    "id": "skin4",
    "name": "ダークブラウン",
    "hex": "#8d5524"
  }
];

const AVATAR_HAIR_COLORS = [
  {
    "id": "hc1",
    "name": "ブラック",
    "hex": "#2b2b2b"
  },
  {
    "id": "hc2",
    "name": "ブラウン",
    "hex": "#7a4a2b"
  },
  {
    "id": "hc3",
    "name": "ゴールド",
    "hex": "#e0b84a"
  },
  {
    "id": "hc4",
    "name": "レッド",
    "hex": "#c0392b"
  },
  {
    "id": "hc5",
    "name": "ブルー",
    "hex": "#3d5a9e"
  },
  {
    "id": "hc6",
    "name": "ピンク",
    "hex": "#e0729e"
  }
];

const AVATAR_OUTFIT_COLORS = [
  {
    "id": "oc1",
    "name": "レッド",
    "hex": "#e05a4e"
  },
  {
    "id": "oc2",
    "name": "ブルー",
    "hex": "#4a7fc9"
  },
  {
    "id": "oc3",
    "name": "グリーン",
    "hex": "#4caf7d"
  },
  {
    "id": "oc4",
    "name": "イエロー",
    "hex": "#e0c23e"
  },
  {
    "id": "oc5",
    "name": "パープル",
    "hex": "#9b6fc9"
  },
  {
    "id": "oc6",
    "name": "ピンク",
    "hex": "#e07ba8"
  }
];

function buildAvatarSvg(sel) {
  var hair = AVATAR_HAIR.find(function (h) { return h.id === sel.hair; }) || AVATAR_HAIR[0];
  var face = AVATAR_FACE.find(function (f) { return f.id === sel.face; }) || AVATAR_FACE[0];
  var skin = AVATAR_SKIN_COLORS.find(function (c) { return c.id === sel.skin; }) || AVATAR_SKIN_COLORS[0];
  var hairColor = AVATAR_HAIR_COLORS.find(function (c) { return c.id === sel.hairColor; }) || AVATAR_HAIR_COLORS[0];
  var outfitColor = AVATAR_OUTFIT_COLORS.find(function (c) { return c.id === sel.outfitColor; }) || AVATAR_OUTFIT_COLORS[0];
  var hairSvg = hair.d.replace(/<(path|circle)(?![^>]*fill)/g, '<$1 fill="' + hairColor.hex + '"');
  return '<svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M14,118 Q14,88 50,88 Q86,88 86,118 Z" fill="' + outfitColor.hex + '"/>'
    + '<circle cx="50" cy="42" r="26" fill="' + skin.hex + '"/>'
    + face.d
    + hairSvg
    + '</svg>';
}
