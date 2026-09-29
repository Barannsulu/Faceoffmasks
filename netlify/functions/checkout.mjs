// Face Off Masks — creates a Stripe Checkout page with the faces the customer picked.
// Needs one environment variable in Netlify: STRIPE_SECRET_KEY (sk_test_... or sk_live_...).

const FACES = {
  stache:   { name: "Grandpa Stache", code: "?",       img: "img/stache.jpg" },
  gus:      { name: "Grumpy Gus",     code: "Style-4", img: "img/gus.jpg" },
  cigar:    { name: "Cigar Carl",     code: "Style-9", img: "img/cigar.jpg" },
  granny:   { name: "Smokin' Granny", code: "Style-5", img: "img/granny.jpg" },
  tony:     { name: "Toothless Tony", code: "?",       img: "img/tony.jpg" },
  snaggle:  { name: "Snaggle Smile",  code: "Style-7", img: "img/snaggle.jpg" },
  bigmouth: { name: "Big Mouth",      code: "Style-3", img: "img/bigmouth.jpg" },
  tongue:   { name: "Tongue Out",     code: "Style-2", img: "img/tongue.jpg" },
};

const PACKS = {
  1: { label: "Single", amount: 1999, shipping: { amount: 499, name: "Standard Shipping" } },
  2: { label: "Duo Pack", amount: 2999, shipping: { amount: 0, name: "Free Shipping" } },
};

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export function buildParams({ pack, faces }, site) {
  const p = PACKS[pack];
  if (!p) throw new Error("Pick a pack.");
  if (!Array.isArray(faces) || faces.length !== Number(pack) || !faces.every((f) => FACES[f]))
    throw new Error(pack == 2 ? "Pick 2 faces." : "Pick a face.");

  const names = faces.map((f) => FACES[f].name);
  const codes = faces.map((f) => FACES[f].code);
  const title = `Face Off ${p.label} – ${names.join(" + ")}`;
  const images = [...new Set(faces)].map((f) => `${site}/${FACES[f].img}`);

  const f = new URLSearchParams();
  f.append("mode", "payment");
  f.append("success_url", `${site}/thanks.html`);
  f.append("cancel_url", `${site}/#order`);
  f.append("line_items[0][price_data][currency]", "usd");
  f.append("line_items[0][price_data][unit_amount]", String(p.amount));
  f.append("line_items[0][price_data][product_data][name]", title);
  f.append("line_items[0][price_data][product_data][description]",
    "Full head and neck coverage, one size fits most adults. Extra packs ship with the same faces.");
  images.forEach((u, i) => f.append(`line_items[0][price_data][product_data][images][${i}]`, u));
  f.append("line_items[0][quantity]", "1");
  f.append("line_items[0][adjustable_quantity][enabled]", "true");
  f.append("line_items[0][adjustable_quantity][minimum]", "1");
  f.append("line_items[0][adjustable_quantity][maximum]", "10");
  f.append("shipping_address_collection[allowed_countries][0]", "US");
  f.append("shipping_options[0][shipping_rate_data][type]", "fixed_amount");
  f.append("shipping_options[0][shipping_rate_data][display_name]", p.shipping.name);
  f.append("shipping_options[0][shipping_rate_data][fixed_amount][amount]", String(p.shipping.amount));
  f.append("shipping_options[0][shipping_rate_data][fixed_amount][currency]", "usd");
  f.append("shipping_options[0][shipping_rate_data][delivery_estimate][minimum][unit]", "business_day");
  f.append("shipping_options[0][shipping_rate_data][delivery_estimate][minimum][value]", "2");
  f.append("shipping_options[0][shipping_rate_data][delivery_estimate][maximum][unit]", "business_day");
  f.append("shipping_options[0][shipping_rate_data][delivery_estimate][maximum][value]", "5");
  f.append("phone_number_collection[enabled]", "true");
  // What shows up on the payment in the Stripe dashboard:
  f.append("payment_intent_data[description]", title);
  f.append("payment_intent_data[metadata][faces]", names.join(" + "));
  f.append("payment_intent_data[metadata][supplier_codes]", codes.join(" + "));
  f.append("payment_intent_data[metadata][pack]", p.label);
  f.append("metadata[faces]", names.join(" + "));
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
