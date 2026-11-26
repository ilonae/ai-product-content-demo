# Gallery samples

Put 4–8 product photos here, then run `npm run gallery:build`.

- **SFW and generic only**: mug, sneaker, bottle, backpack, lamp, headphones.
- Use photos you took yourself or ones whose licence allows reuse (e.g. the Unsplash licence). Keep a note of the source.
- Mix the hard cases, because they make the gallery convincing: a dark product (tests the upscale path), a white product on a light background, a cluttered table shot.
- Optional sidecar `name.json` next to `name.jpg`:

```json
{ "brand": "kaffeewerk", "meta": { "category": "pour-over kettle", "material": "stainless steel", "notes": "1 l · gooseneck spout · induction-ready" } }
```

Commit the generated `public/gallery/` files and `data/gallery.json`. The photos in `samples/` are inputs only.
