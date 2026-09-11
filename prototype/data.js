// Product catalogue for the demo store (v3 — American-retro street looks on the city-casual model).
// Every garment and try-on is AI-generated and fictional. "Buy online" opens shop.html, a demo brand store page.
// Prices are demo prices.
window.STORE = { id: 'SG01', name: 'MIRRAI Store · Orchard' };

const shop = id => `shop.html?id=${id}`;
window.PRODUCTS = [
  { id: 'T7', cat: 'top', img: 'T7.webp', en: 'Belted Ribbed Cardigan', zh: '黑色腰带罗纹开衫', price: 45.9, rack: 'A-02', stock: 'in',
    url: shop('T7'), note: { zh: '修身罗纹针织，配银扣皮腰带，收出腰线。', en: 'Fitted rib knit with a silver-buckle leather belt that marks the waist.' } },
  { id: 'T8', cat: 'top', img: 'T8.webp', en: 'Lace Halter Crop Top', zh: '白色蕾丝挂脖短上衣', price: 35.9, rack: 'A-05', stock: 'in',
    url: shop('T8'), note: { zh: '挂脖设计，蕾丝拼接，收腰短款。', en: 'Halter neck with lace panels and a cropped, fitted waist.' } },
  { id: 'T9', cat: 'top', img: 'T9.webp', en: 'Cable-Knit Halter Top', zh: '灰色麻花针织挂脖背心', price: 32.9, rack: 'A-08', stock: 'in',
    url: shop('T9'), note: { zh: '麻花针织，挂脖无袖，短款利落。', en: 'Cable knit, halter neck, cropped and clean.' } },
  { id: 'T10', cat: 'top', img: 'T10.webp', en: 'Puff-Sleeve Tie Blouse', zh: '米白泡泡袖系带短衫', price: 39.9, rack: 'A-11', stock: 'in',
    url: shop('T10'), note: { zh: '泡泡短袖，前襟系带，复古又轻盈。', en: 'Short puff sleeves and a front tie — light and retro.' } },
  { id: 'T11', cat: 'top', img: 'T11.webp', en: 'Leopard Off-Shoulder Top', zh: '豹纹一字肩短袖', price: 29.9, rack: 'A-14', stock: 'in',
    url: shop('T11'), note: { zh: '棕色豹纹，一字肩修身短袖。', en: 'Brown leopard print, fitted, off the shoulder.' } },
  { id: 'T12', cat: 'top', img: 'T12.webp', en: 'Stripe Off-Shoulder Knit', zh: '黑白条纹一字肩针织衫', price: 42.9, rack: 'A-17', stock: 'in',
    url: shop('T12'), note: { zh: '细条纹针织，一字肩长袖，可与条纹短裤成套。', en: 'Thin-stripe knit with long sleeves; pairs with the matching shorts.' } },

  { id: 'B9', cat: 'bottom', img: 'B9.webp', en: 'Pleated Mini Skirt', zh: '黑色细褶短裙', price: 39.9, rack: 'B-03', stock: 'in',
    url: shop('B9'), note: { zh: '细密压褶，短款 A 字，配长靴更利落。', en: 'Fine pleats in a short A-line; sharp with tall boots.' } },
  { id: 'B10', cat: 'bottom', img: 'B10.webp', en: 'Low-Rise Flare Jeans', zh: '深蓝微喇牛仔裤', price: 55.9, rack: 'B-06', stock: 'in',
    url: shop('B10'), note: { zh: '深蓝原色，低腰微喇，附红色细腰带。', en: 'Dark indigo, low-rise flare, with a slim red belt.' } },
  { id: 'B11', cat: 'bottom', img: 'B11.webp', en: 'Fold-Over Flare Knit Pants', zh: '深灰翻边微喇针织裤', price: 49.9, rack: 'B-09', stock: 'in',
    url: shop('B11'), note: { zh: '翻边腰头，垂坠微喇，舒适又显腿长。', en: 'Fold-over waistband and a fluid flare that lengthens the leg.' } },
  { id: 'B12', cat: 'bottom', img: 'B12.webp', en: 'Gingham Straight Trousers', zh: '黑白格纹直筒裤', price: 45.9, rack: 'B-12', stock: 'in',
    url: shop('B12'), note: { zh: '小格纹直筒，复古学院感。', en: 'Small gingham check in a straight leg — retro and neat.' } },
  { id: 'B13', cat: 'bottom', img: 'B13.webp', en: 'Washed Denim Shorts', zh: '做旧牛仔短裤', price: 39.9, rack: 'B-15', stock: 'in',
    url: shop('B13'), note: { zh: '复古水洗做旧，附红色皮腰带。', en: 'Vintage washed and lightly distressed, with a red belt.' } },
  { id: 'B14', cat: 'bottom', img: 'B14.webp', en: 'Stripe Knit Shorts', zh: '黑白条纹针织短裤', price: 32.9, rack: 'B-18', stock: 'in',
    url: shop('B14'), note: { zh: '抽绳腰头，与条纹上衣成套。', en: 'Drawstring waist; matches the stripe knit top.' } },

  { id: 'F7', cat: 'full', img: 'F7.webp', en: 'Pinstripe Babydoll Dress', zh: '黑色细条纹翻领娃娃裙', price: 59.9, rack: 'C-02', stock: 'in',
    url: shop('F7'), note: { zh: '圆翻领、泡泡短袖，低腰百褶，复古学院感。', en: 'Peter Pan collar, puff sleeves and a dropped, pleated waist.' } },
  { id: 'F8', cat: 'full', img: 'F8.webp', en: 'Polka Dot Midi Dress', zh: '灰色波点修身中长裙', price: 49.9, rack: 'C-05', stock: 'in',
    url: shop('F8'), note: { zh: '无袖圆领，修身收腰，小波点不张扬。', en: 'Sleeveless, round neck, fitted through the waist with small dots.' } },
  { id: 'F9', cat: 'full', img: 'F9.webp', en: 'Ditsy Floral Cami Dress', zh: '黑色碎花吊带中长裙', price: 55.9, rack: 'C-08', stock: 'online',
    url: shop('F9'), note: { zh: '细肩带，碎花印花，胸口蕾丝边。', en: 'Thin straps, ditsy floral print and a lace-trimmed neckline.' } },
  { id: 'F10', cat: 'full', img: 'F10.webp', en: 'Ribbed Henley Maxi Dress', zh: '棕色罗纹亨利领长裙', price: 65.9, rack: 'C-11', stock: 'in',
    url: shop('F10'), note: { zh: '罗纹针织，亨利领长袖，修身长款。', en: 'Rib knit, henley neck and long sleeves in a fitted maxi.' } }
];

// Eight looks with pre-rendered try-on images (assets/tryon/{id}_{M|XL}.webp).
window.LOOKS = [
  { id: 'L1', items: ['T7', 'B9'], name: { zh: '腰带开衫 + 细褶短裙', en: 'Belted cardigan + pleated mini' } },
  { id: 'L2', items: ['T8', 'B10'], name: { zh: '蕾丝挂脖 + 微喇牛仔', en: 'Lace halter + flare jeans' } },
  { id: 'L3', items: ['T9', 'B11'], name: { zh: '麻花挂脖 + 翻边针织裤', en: 'Cable halter + knit flares' } },
  { id: 'L4', items: ['T10', 'B12'], name: { zh: '泡泡袖短衫 + 格纹直筒裤', en: 'Puff-sleeve blouse + gingham trousers' } },
  { id: 'L5', items: ['T11', 'B13'], name: { zh: '豹纹一字肩 + 牛仔短裤', en: 'Leopard top + denim shorts' } },
  { id: 'L6', items: ['T12', 'B14'], name: { zh: '条纹针织套装', en: 'Stripe knit set' } },
  { id: 'L7', items: ['F7'], name: { zh: '细条纹翻领娃娃裙', en: 'Pinstripe babydoll dress' } },
  { id: 'L8', items: ['F9'], name: { zh: '碎花吊带中长裙', en: 'Ditsy floral cami dress' } }
];

window.findLook = items => {
  const key = [...items].sort().join('+');
  return window.LOOKS.find(l => [...l.items].sort().join('+') === key) || null;
};
// Demo assets exist for two body sizes; every chosen size maps to the nearest one.
window.sizeGroup = size => (['XS', 'S', 'M'].includes(size) ? 'M' : 'XL');
window.money = n => '$' + n.toFixed(2);
