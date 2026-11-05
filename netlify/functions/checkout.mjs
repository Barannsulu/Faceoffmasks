// Face Off Masks — creates a Stripe Checkout page with the faces the customer picked.
// Needs one environment variable in Netlify: STRIPE_SECRET_KEY (sk_test_... or sk_live_...).

const FACES = {
  granny:   { name: "Smokin' Sam",    code: "001",     img: "img/sam.jpg" },
  tony:     { name: "Toothless Tony", code: "002",     img: "img/tony.jpg" },
  gus:      { name: "Grumpy Gus",     code: "003",     img: "img/gus.jpg" },
  bigmouth: { name: "Big Mouth",      code: "005",     img: "img/bigmouth.jpg" },
  snaggle:  { name: "Snaggle Smile",  code: "006",     img: "img/snaggle.jpg" },
  pearly:   { name: "Pearly Grin",    code: "007",     img: "img/pearly.jpg" },
  glamma:   { name: "Glamma",         code: "008",     img: "img/glamma.jpg" },
  ruby:     { name: "Rowdy Ruby",     code: "009",     img: "img/ruby.jpg" },
  willie:   { name: "Wild Willie",    code: "011",     img: "img/willie.jpg" },
  bucky:    { name: "Buck Tooth Bob", code: "014",     img: "img/bucky.jpg" },
  stache:   { name: "Grandpa Stache", code: "?",       img: "img/stache.jpg" },
  cigar:    { name: "Cigar Carl",     code: "Style-9", img: "img/cigar.jpg" },
  tongue:   { name: "Tongue Out",     code: "Style-2", img: "img/tongue.jpg" },
};

const MAX_MASKS = 20;
const STOCK = { ruby: 4 }; // faces with limited stock

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Pricing: every 2 masks = $29.99, a leftover single = $19.99.
// Shipping is free on 2+ masks, $4.99 for a single mask.
export function buildParams({ faces }, site) {
  if (!Array.isArray(faces) || faces.length < 1 || !faces.every((x) => FACES[x]))
    throw new Error("Pick at least one face.");
  if (faces.length > MAX_MASKS) throw new Error(`For more than ${MAX_MASKS} masks, please email us.`);

  for (const [x, left] of Object.entries(STOCK))
    if (faces.filter((y) => y === x).length > left) throw new Error(`Only ${left} ${FACES[x].name} masks left.`);

  const n = faces.length, duos = Math.floor(n / 2), single = n % 2;
  const tally = {};
  faces.forEach((x) => (tally[x] = (tally[x] || 0) + 1));
  const summary = Object.entries(tally).map(([x, k]) => FACES[x].name + (k > 1 ? ` x${k}` : "")).join(" + ");
  const codes = Object.entries(tally).map(([x, k]) => FACES[x].code + (k > 1 ? ` x${k}` : "")).join(" + ");
  const images = Object.keys(tally).slice(0, 8).map((x) => `${site}/${FACES[x].img}`);
  const ship = n === 1 ? { amount: 499, name: "Standard Shipping" } : { amount: 0, name: "Free Shipping" };

  const f = new URLSearchParams();
  f.append("mode", "payment");
  f.append("success_url", `${site}/thanks.html`);
  f.append("cancel_url", `${site}/#order`);
  let i = 0;
  const addLine = (name, amount, qty) => {
    f.append(`line_items[${i}][price_data][currency]`, "usd");
    f.append(`line_items[${i}][price_data][unit_amount]`, String(amount));
    f.append(`line_items[${i}][price_data][product_data][name]`, name);
    f.append(`line_items[${i}][price_data][product_data][description]`, `Faces: ${summary}`.slice(0, 480));
    images.forEach((u, j) => f.append(`line_items[${i}][price_data][product_data][images][${j}]`, u));
    f.append(`line_items[${i}][quantity]`, String(qty));
    i++;
  };
  if (duos) addLine("Face Off Duo Pack (2 masks)", 2999, duos);
  if (single) addLine("Face Off Single Mask", 1999, 1);

  f.append("shipping_address_collection[allowed_countries][0]", "US");
  f.append("shipping_options[0][shipping_rate_data][type]", "fixed_amount");
  f.append("shipping_options[0][shipping_rate_data][display_name]", ship.name);
  f.append("shipping_options[0][shipping_rate_data][fixed_amount][amount]", String(ship.amount));
  f.append("shipping_options[0][shipping_rate_data][fixed_amount][currency]", "usd");
  f.append("shipping_options[0][shipping_rate_data][delivery_estimate][minimum][unit]", "business_day");
  f.append("shipping_options[0][shipping_rate_data][delivery_estimate][minimum][value]", "2");
  f.append("shipping_options[0][shipping_rate_data][delivery_estimate][maximum][unit]", "business_day");
  f.append("shipping_options[0][shipping_rate_data][delivery_estimate][maximum][value]", "5");
  f.append("phone_number_collection[enabled]", "true");
  // What shows up on the payment in the Stripe dashboard:
  const title = `Face Off – ${n} mask${n > 1 ? "s" : ""}: ${summary}`.slice(0, 480);
  f.append("payment_intent_data[description]", title);
  f.append("payment_intent_data[metadata][faces]", summary.slice(0, 480));
  f.append("payment_intent_data[metadata][supplier_codes]", codes.slice(0, 480));
  f.append("payment_intent_data[metadata][mask_count]", String(n));
  f.append("metadata[faces]", summary.slice(0, 480));
  return f;
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return json(500, { error: "Checkout isn't set up yet." });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: "Bad request." }); }

  const site = (process.env.URL || new URL(req.url).origin).replace(/\/$/, "");
  let params;
  try { params = buildParams(body, site); } catch (e) { return json(400, { error: e.message }); }

  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const d = await r.json();
  if (!r.ok) {
    console.error("Stripe error:", d.error?.message);
    return json(502, { error: "Checkout is unavailable right now." });
  }
  return json(200, { url: d.url });
};
